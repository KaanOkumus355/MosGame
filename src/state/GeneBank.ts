import type { TraitId } from '../data/traits';

const STORAGE_KEY = 'swarm-to-sovereign-genes';

export type PerkId = 'thickSkin' | 'headStart' | 'spareReroll' | 'widerPool' | 'inherit' | 'mutators';
export type MutatorId = 'glass' | 'senses' | 'famine';

export interface PerkDef {
  id: PerkId;
  name: string;
  /** What each level does. */
  effect: (level: number) => string;
  /** Cost of each level, in order. */
  costs: number[];
}

/** Permanent unlocks bought with genes. Small on purpose: a head start, never a different game. */
export const PERKS: PerkDef[] = [
  { id: 'thickSkin', name: 'Thick Skin', effect: (l) => `Start every run with +${10 * l} max health`, costs: [40, 80, 140] },
  { id: 'headStart', name: 'Head Start', effect: () => 'Every stage, your first DNA bar starts half full', costs: [120] },
  { id: 'spareReroll', name: 'Spare Reroll', effect: (l) => `${l} spare reroll${l > 1 ? 's' : ''} per run, on any evolution screen`, costs: [50, 120] },
  { id: 'widerPool', name: 'Wider Gene Pool', effect: () => 'One extra card on the first evolution screen of every stage', costs: [90] },
  { id: 'inherit', name: 'Inherited Trait', effect: () => 'Start every run with rank 1 of a trait you have discovered', costs: [150] },
  { id: 'mutators', name: 'Mutators', effect: () => 'Unlock run modifiers: harder runs that bank more genes', costs: [100] },
];

export interface MutatorDef {
  id: MutatorId;
  name: string;
  blurb: string;
  /** Extra gene payout while active (adds up). */
  genes: number;
}

export const MUTATORS: MutatorDef[] = [
  { id: 'glass', name: 'Glass Body', blurb: 'You take 50% more damage.', genes: 0.4 },
  { id: 'senses', name: 'Sharp Senses', blurb: 'Predators notice you 30% further away; humans are 20% stronger.', genes: 0.25 },
  { id: 'famine', name: 'Famine', blurb: '20% less DNA from everything.', genes: 0.4 },
];

/** Secret form hints: the first is a vague nudge, the second all but gives it away. */
export const HINT_COSTS = [40, 90];
/** Every perk level or hint you own makes everything else this much dearer (compounding). */
export const PRICE_RISE = 1.2;
/** How long the refund-everything button rests between uses. */
export const REFUND_COOLDOWN = 6 * 60 * 60 * 1000;

interface BankData {
  genes: number;
  /** Lifetime genes earned, for the menu. */
  earned: number;
  perks: Partial<Record<PerkId, number>>;
  inherit: TraitId | null;
  mutators: MutatorId[];
  /** Hints bought per secret form (stage id), 0..HINT_COSTS.length. */
  hints: Partial<Record<string, number>>;
  /** Genes spent since the last refund: what a refund gives back. */
  spent: number;
  /** When the last refund happened (ms since epoch), 0 if never. */
  lastRefund: number;
}

const empty = (): BankData => ({ genes: 0, earned: 0, perks: {}, inherit: null, mutators: [], hints: {}, spent: 0, lastRefund: 0 });

/** What a save from before rising prices paid: everything it owns at the base price. */
const paidAtBase = (d: BankData): number => {
  const sum = (costs: number[], level: number) => costs.slice(0, level).reduce((n, c) => n + c, 0);
  const perks = PERKS.reduce((n, p) => n + sum(p.costs, d.perks[p.id] ?? 0), 0);
  return perks + Object.values(d.hints).reduce<number>((n, l) => n + sum(HINT_COSTS, l ?? 0), 0);
};

export interface GeneParts {
  dna: number;
  stages: number;
  bosses: number;
  win: number;
}

/** What a finished run's genes are made of (before mutators), for the end screens. */
export function geneParts(r: { dnaTotal: number; stageIndex: number; bossesBeaten: number; won: boolean }): GeneParts {
  return { dna: Math.round(r.dnaTotal / 400), stages: 5 * r.stageIndex, bosses: 10 * r.bossesBeaten, win: r.won ? 30 : 0 };
}

/** Gene payout for a finished run (before mutators). */
export function genePayout(r: { dnaTotal: number; stageIndex: number; bossesBeaten: number; won: boolean }): number {
  const p = geneParts(r);
  return Math.max(1, p.dna + p.stages + p.bosses + p.win);
}

/**
 * Meta-progression: a share of every run banks as genes, spent on small permanent perks and
 * optional mutators. Saved in localStorage; perks apply when a run starts (GameState.reset).
 */
class GeneBankStore {
  private data: BankData = this.load();

  get genes(): number {
    return this.data.genes;
  }

  /** Every gene ever banked, spent or not. */
  get earned(): number {
    return this.data.earned;
  }

  level(id: PerkId): number {
    return this.data.perks[id] ?? 0;
  }

  /** Cost of the next level, or null when maxed. */
  nextCost(id: PerkId): number | null {
    const def = PERKS.find((p) => p.id === id)!;
    const base = def.costs[this.level(id)];
    return base === undefined ? null : this.price(base);
  }

  buy(id: PerkId): boolean {
    const cost = this.nextCost(id);
    if (cost === null || cost > this.data.genes) return false;
    this.data.genes -= cost;
    this.data.spent += cost;
    this.data.perks[id] = this.level(id) + 1;
    this.save();
    return true;
  }

  deposit(genes: number): void {
    this.data.genes += genes;
    this.data.earned += genes;
    this.save();
  }

  /** How many hints you have bought for this secret form. */
  hintLevel(stageId: string): number {
    return this.data.hints[stageId] ?? 0;
  }

  /** Cost of the next hint for this form, or null when you have them all. */
  nextHintCost(stageId: string): number | null {
    const base = HINT_COSTS[this.hintLevel(stageId)];
    return base === undefined ? null : this.price(base);
  }

  buyHint(stageId: string): boolean {
    const cost = this.nextHintCost(stageId);
    if (cost === null || cost > this.data.genes) return false;
    this.data.genes -= cost;
    this.data.spent += cost;
    this.data.hints[stageId] = this.hintLevel(stageId) + 1;
    this.save();
    return true;
  }

  /** Perk levels and hints owned: what drives the price rise. */
  get owned(): number {
    const levels = [...Object.values(this.data.perks), ...Object.values(this.data.hints)];
    return levels.reduce<number>((n, l) => n + (l ?? 0), 0);
  }

  /** The multiplier on every base price right now. */
  get priceFactor(): number {
    return PRICE_RISE ** this.owned;
  }

  /** A base price after the rise, rounded to a tidy number. */
  private price(base: number): number {
    return Math.round((base * this.priceFactor) / 5) * 5;
  }

  /** Genes a refund would give back. */
  get spent(): number {
    return this.data.spent;
  }

  /** Milliseconds until the refund can be used again (0 when it's ready). */
  refundWait(): number {
    return Math.max(0, this.data.lastRefund + REFUND_COOLDOWN - Date.now());
  }

  /** Sells everything back at what you paid and resets prices. Returns the genes returned. */
  refundAll(): number {
    const back = this.data.spent;
    if (back <= 0 || this.refundWait() > 0) return 0;
    this.data = { ...empty(), genes: this.data.genes + back, earned: this.data.earned, lastRefund: Date.now() };
    this.save();
    return back;
  }

  get inherit(): TraitId | null {
    return this.level('inherit') > 0 ? this.data.inherit : null;
  }

  setInherit(id: TraitId | null): void {
    this.data.inherit = id;
    this.save();
  }

  /** Mutators switched on for the next run (only once unlocked). */
  get activeMutators(): MutatorId[] {
    return this.level('mutators') > 0 ? [...this.data.mutators] : [];
  }

  toggleMutator(id: MutatorId): void {
    const on = this.data.mutators.includes(id);
    this.data.mutators = on ? this.data.mutators.filter((m) => m !== id) : [...this.data.mutators, id];
    this.save();
  }

  private load(): BankData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return empty();
      const saved = JSON.parse(raw) as Partial<BankData>;
      const data = { ...empty(), ...saved };
      if (saved.spent === undefined) data.spent = paidAtBase(data);
      return data;
    } catch {
      return empty();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage blocked: progress lasts this session only
    }
  }
}

export const GeneBank = new GeneBankStore();
