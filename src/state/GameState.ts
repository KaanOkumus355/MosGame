import { computeStats, traitName, type TraitId, type TraitRanks } from '../data/traits';
import { FUSIONS, type FusionId } from '../data/fusions';
import { DIFFICULTIES, DNA_PACE, GROWTH_PACE, loadDifficulty, type Difficulty, type DifficultyDef } from '../data/difficulty';
import { TOTAL_STAGES, stageById, stageInfo, type StageDef } from '../data/stages';
import { Codex } from './Codex';
import { Achievements } from './Achievements';
import { type PlayerStats } from './stats';
import { GeneBank, MUTATORS, geneParts, genePayout, type GeneParts, type MutatorId } from './GeneBank';
import type { SaveResult } from './RunHistory';

export type { PlayerStats } from './stats';

/** Max health gained from every trait pick. */
export const HP_PER_PICK = 3;
/** Max health gained from every metamorphosis into a new stage. */
export const HP_PER_STAGE = 20;

/** One line of the trait list: a trait, or a fusion that absorbed two traits. */
export interface TraitEntry {
  name: string;
  icons: string[];
  fusion: boolean;
}

/** Live status of the player, written by the stage each frame and read by the HUD. */
export interface PlayerStatus {
  slowed: number;
  poisoned: number;
  shield: number;
  hidden: boolean;
  frenzy: number;
  adrenaline: boolean;
  dashCharges: number;
  /** Active zone event label, '' when none. */
  event: string;
  /** The zone boss while it is alive. */
  boss: { name: string; hp: number; max: number } | null;
  /** Out of combat long enough to recover health quickly. */
  recovering: boolean;
  /** 0 = fine, 1 = low health, 2 = critical (heartbeat and red screen edge). */
  lowHealth: number;
}

/** Per-stage tallies used by secret form conditions (reset when a stage starts). */
export interface StageCounters {
  /** Meals eaten while dashing or snatching. */
  burstEats: number;
  /** Prey eaten that never noticed you. */
  ambushEats: number;
  /** Hosts drunk completely dry. */
  hostsDrained: number;
}

export const emptyCounters = (): StageCounters => ({ burstEats: 0, ambushEats: 0, hostsDrained: 0 });

/** A boss beaten this run, for the run report. */
export interface BossKill {
  name: string;
  stage: number;
  /** Seconds into that stage. */
  at: number;
}

/** Groups "a Frog's tongue" and "a Frog" under "Frog" for the run report. */
export const damageKey = (source: string): string =>
  source
    // a hunter's spear counts as the hunter
    .replace(/^.* (thrown|spat) by /, '')
    .replace(/^(an annoyed|a|an|the) /i, '')
    // an Alpha counts with the rest of its kind
    .replace(/^Alpha /, '')
    .split("'s ")[0]
    .replace(/ venom$/, '');

/** Everything a mid-run save needs; stats are rebuilt from traits on load (state/RunSave.ts). */
export interface RunSnapshot {
  difficulty: Difficulty;
  stageIndex: number;
  forms: Record<number, string>;
  trophies: number;
  bossesBeaten: number;
  traitRanks: TraitRanks;
  traitOrder: TraitId[];
  fusions: FusionId[];
  bonusMaxHp: number;
  dna: number;
  dnaToNext: number;
  pendingEvolutions: number;
  evolutionsEarned: number;
  dnaTotal: number;
  eaten: number;
  timeAlive: number;
  hp: number;
  stageTimes: number[];
  stageEaten: number[];
  damageBy: Record<string, number>;
  lossesBy: Record<string, number>;
  bossKills: BossKill[];
  mutators: MutatorId[];
  spareRerolls: number;
  firstPickBonus: number;
  /** Progress inside the current stage (saves made mid-stage). */
  size: number;
  stageCounters: StageCounters;
  secondWindsLeft: number;
  zoneEventDone: boolean;
  gateWaited: number;
}

const emptyStatus = (): PlayerStatus => ({ slowed: 0, poisoned: 0, shield: 0, hidden: false, frenzy: 0, adrenaline: false, dashCharges: 0, event: '', boss: null, recovering: false, lowHealth: 0 });

/** Everything about the current run. Lives outside scenes so it survives stage changes. */
class RunState {
  /** Chosen on the title screen; survives resets. */
  difficulty: Difficulty = loadDifficulty();
  stageIndex = 0;
  /** Secret form (stage id) chosen via a mutation, per stage index. */
  forms: Record<number, string> = {};
  stageCounters: StageCounters = emptyCounters();
  /** Trophy evolutions waiting (earned by beating zone bosses). */
  trophies = 0;
  bossesBeaten = 0;
  traitRanks: TraitRanks = {};
  /** Trait ids in the order they were first picked. */
  traitOrder: TraitId[] = [];
  fusions: FusionId[] = [];
  stats: PlayerStats = computeStats({});
  /** Max health earned by evolving (trait picks and metamorphoses), on top of trait stats. */
  bonusMaxHp = 0;

  dna = 0;
  dnaToNext = 30;
  /** DNA bars filled but not yet spent on a trait. */
  pendingEvolutions = 0;
  evolutionsEarned = 0;
  dnaTotal = 0;
  eaten = 0;
  timeAlive = 0;
  /** Run report: seconds and meals in each stage index (the last is the finale). */
  stageTimes: number[] = [];
  stageEaten: number[] = [];
  /** Run report: health lost, by who or what did it. */
  damageBy: Record<string, number> = {};
  /** Run report: finale units lost (drones, armies), by cause. */
  lossesBy: Record<string, number> = {};
  bossKills: BossKill[] = [];
  /** Gene Bank mutators this run was started with (fold into `diff`). */
  mutators: MutatorId[] = [];
  /** Gene Bank rerolls left this run, on top of each screen's own. */
  spareRerolls = 0;
  /** Extra cards on the next evolution screen (Wider Gene Pool: the first screen of each stage). */
  firstPickBonus = 0;
  /** The stage's zone event has already happened (kept so a continued stage doesn't repeat it). */
  zoneEventDone = false;
  /** Seconds spent fully grown with the boss alive (kept so Continue doesn't restart the wait). */
  gateWaited = 0;
  /** Set by restore(): the next stage picks up where the save left off instead of starting fresh. */
  resuming = false;
  /** Set once the finished run is in the history, so an end screen can't save it twice. */
  historySaved: SaveResult | null = null;
  /** Bone-Crush Bite kills this run (Bone Collector). */
  crushKills = 0;
  /** Second Winds that saved you this run (Sleepwalker). */
  secondWindsUsed = 0;
  /** Set once the run's genes are banked, so an end screen can't pay twice. */
  genesBanked = 0;
  /** What the banked genes were made of, and the mutator bonus on top (0.25 = +25%). */
  geneBreakdown: { parts: GeneParts; mutatorBonus: number; difficultyMul: number } | null = null;

  hp = 100;
  size = 0;
  killedBy = '';

  /** Second Wind charges left in the current stage. */
  secondWindsLeft = 0;

  /** Seconds left on each ability cooldown (read by the HUD). */
  cooldowns = { venom: 0, dash: 0, signature: 0 };
  status: PlayerStatus = emptyStatus();

  reset(): void {
    Achievements.markRun();
    this.crushKills = 0;
    this.secondWindsUsed = 0;
    this.stageIndex = 0;
    this.forms = {};
    this.stageCounters = emptyCounters();
    this.trophies = 0;
    this.bossesBeaten = 0;
    this.traitRanks = {};
    this.traitOrder = [];
    this.fusions = [];
    this.bonusMaxHp = 0;
    this.stats = this.buildStats();
    this.dna = 0;
    this.dnaToNext = 30;
    this.pendingEvolutions = 0;
    this.evolutionsEarned = 0;
    this.dnaTotal = 0;
    this.eaten = 0;
    this.timeAlive = 0;
    this.stageTimes = [];
    this.stageEaten = [];
    this.damageBy = {};
    this.lossesBy = {};
    this.bossKills = [];
    this.genesBanked = 0;
    this.geneBreakdown = null;
    this.historySaved = null;
    this.zoneEventDone = false;
    this.gateWaited = 0;
    this.resuming = false;
    this.hp = this.stats.maxHp;
    this.size = 0;
    this.killedBy = '';
    this.secondWindsLeft = 0;
    this.cooldowns = { venom: 0, dash: 0, signature: 0 };
    this.status = emptyStatus();
    this.applyGeneBank();
  }

  /** Adds DNA (after multipliers) and returns the amount actually gained. */
  addDna(amount: number): number {
    const gained = amount * this.stats.dnaMul;
    this.dna += gained;
    this.dnaTotal += gained;
    return gained;
  }

  /** Gene Bank perks and mutators for a fresh run. */
  private applyGeneBank(): void {
    const g = GeneBank;
    this.mutators = g.activeMutators;
    this.spareRerolls = g.level('spareReroll');
    this.firstPickBonus = g.level('widerPool');
    this.bonusMaxHp += 10 * g.level('thickSkin');
    const inherit = g.inherit;
    if (inherit && Codex.rank(inherit) > 0) {
      this.traitRanks[inherit] = 1;
      this.traitOrder.push(inherit);
    }
    this.stats = this.buildStats();
    this.hp = this.stats.maxHp;
    this.secondWindsLeft = this.stats.secondWinds;
    // Head Start and Wider Gene Pool are applied as each stage starts (StageScene)
  }

  /** Banks this run's genes (once) and returns how many. */
  bankGenes(won: boolean): number {
    if (this.genesBanked) return this.genesBanked;
    const mutatorBonus = MUTATORS.filter((m) => this.mutators.includes(m.id)).reduce((n, m) => n + m.genes, 0);
    const run = { dnaTotal: this.dnaTotal, stageIndex: this.stageIndex, bossesBeaten: this.bossesBeaten, won };
    // harder difficulties pay more
    const difficultyMul = DIFFICULTIES[this.difficulty].genes;
    this.geneBreakdown = { parts: geneParts(run), mutatorBonus, difficultyMul };
    this.genesBanked = Math.round(genePayout(run) * (1 + mutatorBonus) * difficultyMul);
    GeneBank.deposit(this.genesBanked);
    return this.genesBanked;
  }

  /** The run as plain data, for the mid-run save. */
  snapshot(): RunSnapshot {
    return structuredClone({
      difficulty: this.difficulty,
      stageIndex: this.stageIndex,
      forms: this.forms,
      trophies: this.trophies,
      bossesBeaten: this.bossesBeaten,
      traitRanks: this.traitRanks,
      traitOrder: this.traitOrder,
      fusions: this.fusions,
      bonusMaxHp: this.bonusMaxHp,
      dna: this.dna,
      dnaToNext: this.dnaToNext,
      pendingEvolutions: this.pendingEvolutions,
      evolutionsEarned: this.evolutionsEarned,
      dnaTotal: this.dnaTotal,
      eaten: this.eaten,
      timeAlive: this.timeAlive,
      hp: this.hp,
      stageTimes: this.stageTimes,
      stageEaten: this.stageEaten,
      damageBy: this.damageBy,
      lossesBy: this.lossesBy,
      bossKills: this.bossKills,
      mutators: this.mutators,
      spareRerolls: this.spareRerolls,
      firstPickBonus: this.firstPickBonus,
      size: this.size,
      stageCounters: this.stageCounters,
      secondWindsLeft: this.secondWindsLeft,
      zoneEventDone: this.zoneEventDone,
      gateWaited: this.gateWaited,
    });
  }

  /** Starts a fresh run and loads a saved one into it. */
  restore(r: RunSnapshot): void {
    this.reset();
    Object.assign(this, structuredClone(r));
    this.stats = this.buildStats();
    // saves from before mid-stage saving have no size: those start their stage fresh
    this.resuming = typeof r.size === 'number' && r.size > 0;
    if (!this.resuming) this.secondWindsLeft = this.stats.secondWinds;
  }

  /** Advances the run clock (total and current stage). */
  tick(dt: number): void {
    this.timeAlive += dt;
    this.stageTimes[this.stageIndex] = (this.stageTimes[this.stageIndex] ?? 0) + dt;
  }

  /** A meal, counted for the run total and the current stage. */
  countMeal(): void {
    this.eaten++;
    this.stageEaten[this.stageIndex] = (this.stageEaten[this.stageIndex] ?? 0) + 1;
  }

  /** Health lost to a source, for the run report. */
  logDamage(source: string, amount: number): void {
    if (amount <= 0) return;
    const k = damageKey(source);
    this.damageBy[k] = (this.damageBy[k] ?? 0) + amount;
  }

  /** Finale units lost to a cause, for the run report. */
  logLoss(cause: string, n = 1): void {
    this.lossesBy[cause] = (this.lossesBy[cause] ?? 0) + n;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  rank(id: TraitId): number {
    return this.traitRanks[id] ?? 0;
  }

  hasFusion(id: FusionId): boolean {
    return this.fusions.includes(id);
  }

  /** Ranks up a trait (every pick also adds max health) and recomputes stats. */
  addTrait(id: TraitId): void {
    if (!this.traitRanks[id]) this.traitOrder.push(id);
    this.traitRanks[id] = this.rank(id) + 1;
    Codex.seeRank(id, this.traitRanks[id]!);
    // single-rank traits (Lucky Mutation) don't count
    if (this.traitRanks[id]! >= 3) Achievements.unlock('maxed');
    this.bonusMaxHp += HP_PER_PICK;
    this.recomputeStats();
  }

  /** Fuses two maxed traits: adds the fusion's effect; the parents keep their ranks and merge into it on the HUD. */
  addFusion(id: FusionId): void {
    this.fusions.push(id);
    Codex.seeFusion(id);
    Achievements.unlock('first_fusion');
    if (this.fusions.length >= 3) Achievements.unlock('three_fusions');
    this.bonusMaxHp += HP_PER_PICK;
    this.recomputeStats();
  }

  /** The form (stage) you are, or will be, at this stage index, following your chosen path. */
  stageDef(index = this.stageIndex): StageDef {
    const chosen = this.forms[index];
    if (chosen) return stageById(chosen) ?? stageInfo(index);
    // a form's line continues (a Swift becomes an Eagle, not a Raptor)
    const prev = index > 0 ? this.stageDef(index - 1).next : undefined;
    return (prev && stageById(prev)) || stageInfo(index);
  }

  /** Display name of the form at this index (secret forms only once you've chosen one). */
  formName(index: number): string {
    return index >= TOTAL_STAGES ? 'World Domination' : this.stageDef(index).creatureName;
  }

  /** Picks a secret form's mutation: the next metamorphosis becomes that form. Counts as a pick. */
  chooseForm(index: number, stageId: string): void {
    this.forms[index] = stageId;
    this.bonusMaxHp += HP_PER_PICK;
    this.recomputeStats();
  }

  /** A trait's name in the form you take at this stage. */
  traitName(id: TraitId, rank: number, stageIndex = this.stageIndex): string {
    return traitName(id, rank, stageIndex, this.stageDef(stageIndex).traitForms?.[id]);
  }

  /** How hard the finales push back: grows with every trait you earned this run. */
  get threatLevel(): number {
    return 1 + 0.007 * this.evolutionsEarned;
  }

  /** Called on metamorphosis into the next stage. */
  addStageBonus(): void {
    this.bonusMaxHp += HP_PER_STAGE;
    this.recomputeStats();
  }

  /** Difficulty settings for this run, with its mutators folded in. */
  get diff(): DifficultyDef {
    const base = DIFFICULTIES[this.difficulty];
    if (!this.mutators.length) return base;
    const d = { ...base };
    if (this.mutators.includes('glass')) d.damageTaken *= 1.5;
    if (this.mutators.includes('senses')) {
      d.predatorSense *= 1.3;
      d.humanStrength *= 1.2;
    }
    if (this.mutators.includes('famine')) d.dnaMul *= 0.8;
    d.name = `${base.name} + ${MUTATORS.filter((m) => this.mutators.includes(m.id)).map((m) => m.name).join(', ')}`;
    return d;
  }

  /** Stats from traits, evolution bonuses and difficulty. */
  private buildStats(): PlayerStats {
    const s = computeStats(this.traitRanks);
    s.maxHp += this.bonusMaxHp;
    if (this.hasFusion('juggernaut')) s.armor = Math.min(0.85, s.armor + 0.1);
    // Sonic Boom needs a dash to trigger, so it grants one if Wings hasn't
    if (this.hasFusion('sonic')) s.dashRank = Math.max(s.dashRank, 1);
    // Nimble gives a short sidestep even without Wings
    if (this.rank('nimble') > 0) s.dashRank = Math.max(s.dashRank, 1);
    s.dnaMul *= this.diff.dnaMul * DNA_PACE;
    s.growthMul *= this.diff.growth * GROWTH_PACE;
    s.senseMul *= this.diff.predatorSense;
    // Nightmare: no resting, and your body heals slowly too
    if (this.diff.noRecovery) s.regen *= 0.5;
    // Easy: a free Second Wind every stage
    s.secondWinds += this.diff.extraSecondWinds;
    return s;
  }

  /** Rebuilds stats after a change. Extra max HP is granted immediately. */
  private recomputeStats(): void {
    const oldMax = this.stats.maxHp;
    const oldWinds = this.stats.secondWinds;
    this.stats = this.buildStats();
    // newly gained Second Wind charges are usable right away
    this.secondWindsLeft = Math.max(0, this.secondWindsLeft + this.stats.secondWinds - oldWinds);
    this.hp += this.stats.maxHp - oldMax;
  }

  /** Owned traits and fusions as display lines; traits absorbed by a fusion are listed under it. */
  traitEntries(stageIndex = this.stageIndex): TraitEntry[] {
    const merged = new Set(this.fusions.flatMap((f) => FUSIONS[f].parents));
    const out: TraitEntry[] = this.fusions.map((f) => ({
      name: FUSIONS[f].name,
      icons: FUSIONS[f].parents.map((p) => `icon_${p}`),
      fusion: true,
    }));
    for (const id of this.traitOrder) {
      if (merged.has(id)) continue;
      out.push({ name: this.traitName(id, this.rank(id), stageIndex), icons: [`icon_${id}`], fusion: false });
    }
    return out;
  }

  /** Display names for owned traits and fusions, in the form they take in the current stage. */
  traitNames(): string[] {
    return this.traitEntries().map((e) => e.name);
  }
}

export const GameState = new RunState();
