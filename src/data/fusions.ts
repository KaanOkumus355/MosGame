import { TRAITS, openTraits, shuffle, type TraitId, type TraitRanks } from './traits';

/**
 * Fusions combine two traits that are both at max rank into one hybrid. Fusing adds the fusion's own
 * effect on top of the parents (which merge into the fusion on the HUD) and does not change their ranks;
 * implemented in the stage systems via GameState.hasFusion().
 */
export type FusionId =
  | 'slipstream' | 'plague' | 'blackhole' | 'sonic' | 'juggernaut' | 'phantom'
  | 'instinct' | 'undying' | 'butcher' | 'golden' | 'storm';

export interface FusionDef {
  id: FusionId;
  name: string;
  parents: [TraitId, TraitId];
  blurb: string;
  effect: string;
}

export const FUSIONS: Record<FusionId, FusionDef> = {
  slipstream: {
    id: 'slipstream', name: 'Toxic Slipstream', parents: ['venom', 'wings'],
    blurb: 'You are now a crop duster. The crops are your enemies.',
    effect: 'Dashing leaves a trail of toxic gas that stuns anything passing through',
  },
  plague: {
    id: 'plague', name: 'Plague Aura', parents: ['venom', 'thorns'],
    blurb: 'Personal space, enforced chemically.',
    effect: 'Fighters near you take 8 damage per second',
  },
  blackhole: {
    id: 'blackhole', name: 'Black Hole Belly', parents: ['magnet', 'glutton'],
    blurb: 'Light cannot escape your stomach. Neither can lunch.',
    effect: 'Pull range +30%, pull speed +50%, combo window +1s',
  },
  sonic: {
    id: 'sonic', name: 'Sonic Boom', parents: ['speed', 'nimble'],
    blurb: 'You broke the sound barrier and three nearby frogs.',
    effect: 'Grants a dash (SHIFT) if you have none. Ending a dash creates a boom: knocks everything back and deals 15 to fighters',
  },
  juggernaut: {
    id: 'juggernaut', name: 'Juggernaut', parents: ['armor', 'size'],
    blurb: 'Doors are a suggestion. So are walls. So are bears.',
    effect: '+10% damage reduction, and predators that touch you are knocked away and dazed',
  },
  phantom: {
    id: 'phantom', name: 'Phantom', parents: ['camo', 'silent'],
    blurb: 'Technically you are still there. Practically, no.',
    effect: 'Invisible whenever you move slowly; meals and bites from invisibility deal triple',
  },
  instinct: {
    id: 'instinct', name: 'Predator Instinct', parents: ['eyes', 'intelligence'],
    blurb: 'Your brain now runs at 120 fps.',
    effect: 'When a nearby predator winds up an attack, time slows for a moment',
  },
  undying: {
    id: 'undying', name: 'Undying Hunger', parents: ['bloodlust', 'secondwind'],
    blurb: 'You cannot die on an empty stomach. Or a full one.',
    effect: 'Double healing from meals; every 30 meals restores a Second Wind',
  },
  butcher: {
    id: 'butcher', name: 'Butcher', parents: ['claws', 'jaw'],
    blurb: 'Nose-to-tail eating, aggressively.',
    effect: 'Carcasses give 2.5x DNA, bites +30%',
  },
  golden: {
    id: 'golden', name: 'Golden Feast', parents: ['pheromones', 'lucky'],
    blurb: 'Somewhere, a golden snack is waiting just for you.',
    effect: 'A glowing golden prey worth 6x DNA appears near you every 20s',
  },
  storm: {
    id: 'storm', name: 'Thunder Quills', parents: ['quills', 'shock'],
    blurb: 'Electrified, spiky, and frankly unpleasant.',
    effect: 'Quills fire twice as often and every quill stuns',
  },
};

/** A trait rank, a double rank (Trophy), a fusion, or a secret form's mutation (id = its stage id). */
export type Choice =
  | { kind: 'trait'; id: TraitId }
  | { kind: 'double'; id: TraitId }
  | { kind: 'fusion'; id: FusionId }
  | { kind: 'form'; id: string };

/** A fusion is only offered once both parents are at their max rank. */
export function availableFusions(ranks: TraitRanks, owned: FusionId[]): FusionId[] {
  return (Object.keys(FUSIONS) as FusionId[]).filter(
    (id) => !owned.includes(id) && FUSIONS[id].parents.every((p) => (ranks[p] ?? 0) >= TRAITS[p].maxRank),
  );
}

/** Fusions this trait can be part of (for hints on trait cards). */
export function fusionsWith(id: TraitId, owned: FusionId[]): FusionDef[] {
  return Object.values(FUSIONS).filter((f) => !owned.includes(f.id) && f.parents.includes(id));
}

/** An extra card drawn from the same weighted pool as traits (a secret form's mutation). */
export interface ExtraChoice {
  choice: Choice;
  w: number;
}

/**
 * Builds an evolution offer: traits, after up to `fusionSlots` fusion cards (only a boss's Trophy
 * screen has any, so an ordinary screen never fuses). `boosts` multiplies the offer weight of specific traits (secret forms in reach); `extras` compete
 * for the same slots with their own weight.
 */
export function pickChoices(
  ranks: TraitRanks,
  owned: FusionId[],
  n: number,
  boosts: Partial<Record<TraitId, number>> = {},
  extras: ExtraChoice[] = [],
  fusionSlots = 0,
): Choice[] {
  const out: Choice[] = shuffle(availableFusions(ranks, owned))
    .slice(0, fusionSlots)
    .map((id) => ({ kind: 'fusion', id }));
  // Weighted draw: traits you already own come up more often (and fusion partners even more),
  // so building toward a fusion is a plan rather than pure luck. Fusion parents are already
  // maxed, so openTraits skips them.
  const pool: ExtraChoice[] = openTraits(ranks).map((id) => ({
    choice: { kind: 'trait', id },
    w: offerWeight(id, ranks, owned) * (boosts[id] ?? 1),
  }));
  pool.push(...extras);
  while (out.length < n && pool.length) {
    let roll = Math.random() * pool.reduce((sum, p) => sum + p.w, 0);
    const i = Math.max(0, pool.findIndex((p) => (roll -= p.w) < 0));
    out.push(pool[i].choice);
    pool.splice(i, 1);
  }
  return out;
}

const OWNED_WEIGHT = 1.6;
const FUSION_PARTNER_WEIGHT = 2.2;

function offerWeight(id: TraitId, ranks: TraitRanks, owned: FusionId[]): number {
  if (!(ranks[id] ?? 0)) return 1;
  const partnerOwned = Object.values(FUSIONS).some(
    (f) => !owned.includes(f.id) && f.parents.includes(id) && f.parents.every((p) => (ranks[p] ?? 0) > 0),
  );
  return partnerOwned ? FUSION_PARTNER_WEIGHT : OWNED_WEIGHT;
}
