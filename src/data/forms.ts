import { GameState } from '../state/GameState';
import { Codex } from '../state/Codex';
import type { TraitId } from './traits';

/**
 * Secret forms. Each has a hidden condition; meeting it once discovers the form for good, after
 * which its mutation card can turn up on the evolution screen in the stage before it, with odds
 * like a trait's (MUTATION_WEIGHT). Picking the mutation makes your next metamorphosis that form
 * instead of the default one.
 */
export interface FormUnlock {
  /** The branch stage this unlocks (see BRANCH_STAGES). */
  stageId: string;
  /** Stage index the form replaces. The mutation is offered one stage earlier. */
  index: number;
  /** Mutation card name and flavour. */
  mutation: string;
  blurb: string;
  /** How it was discovered (only ever shown once it has been). */
  how: string;
  /** Hints you can buy in the Gene Bank before finding it: a vague one, then a near giveaway. */
  hints: [string, string];
  /** The hidden condition, checked after every meal. */
  met(): boolean;
  /** Traits the condition needs, and the stages in which they get offered more often. */
  needs: TraitId[];
  boostStages: number[];
}

/** How much more often a secret form's missing traits are offered while you can still find it. */
const SECRET_TRAIT_BOOST = 3.5;
/**
 * Offer weight of a discovered form's mutation card, drawn alongside traits (a fresh trait weighs 1).
 * With ~24 traits in the pool that is roughly a 1 in 7 chance per evolution screen.
 */
export const MUTATION_WEIGHT = 1.5;
/** MUTATION_WEIGHT in words, for the Bestiary. */
export const MUTATION_ODDS = 'about 1 in 6 evolution screens';

export const FORM_UNLOCKS: FormUnlock[] = [
  {
    stageId: 'meadow',
    index: 1,
    mutation: 'Royal Jelly',
    blurb: 'Someone fed you the good stuff. You feel... regal. And stripy.',
    how: 'A Mosquito with Pheromones draining 4 animals dry.',
    hints: [
      'Starts in the swamp, with a sweet smell and a big thirst.',
      'As a Mosquito with Pheromones, drink a few animals completely dry.',
    ],
    met: () => GameState.stageIndex === 0 && GameState.rank('pheromones') >= 1 && GameState.stageCounters.hostsDrained >= 4,
    needs: ['pheromones'],
    boostStages: [0],
  },
  {
    stageId: 'canopy',
    index: 2,
    mutation: 'Hollow Bones',
    blurb: 'Your bones are mostly air now. So is your common sense.',
    how: 'A Dragonfly with Wings eating 15 things mid-dash.',
    hints: [
      'A Dragonfly that eats without ever slowing down.',
      'As a Dragonfly with Wings, eat a lot of things in the middle of a dash.',
    ],
    met: () => GameState.stageIndex === 1 && GameState.rank('wings') >= 1 && GameState.stageCounters.burstEats >= 15,
    needs: ['wings'],
    boostStages: [0, 1],
  },
  {
    stageId: 'delta',
    index: 3,
    mutation: 'Ancient Scales',
    blurb: 'Somewhere deep in your DNA, a dinosaur is grinning.',
    how: 'A Lizard or Swift with Armor and Camo eating 15 unaware prey.',
    hints: [
      'Something old and patient, for a hunter that is never seen.',
      'As a Lizard or Swift with Armor and Camo, eat plenty of prey that never noticed you.',
    ],
    met: () =>
      GameState.stageIndex === 2 && GameState.rank('armor') >= 1 && GameState.rank('camo') >= 1 && GameState.stageCounters.ambushEats >= 15,
    needs: ['armor', 'camo'],
    boostStages: [1, 2],
  },
];

export const formUnlock = (stageId: string): FormUnlock | undefined => FORM_UNLOCKS.find((f) => f.stageId === stageId);

/**
 * Offer weights for traits an undiscovered secret form needs, while it can still be found: once
 * you own one of its traits, the rest come up much more often (so it never hinges on pure luck).
 */
export function secretTraitBoosts(): Partial<Record<TraitId, number>> {
  const out: Partial<Record<TraitId, number>> = {};
  for (const f of FORM_UNLOCKS) {
    if (Codex.hasForm(f.stageId) || !f.boostStages.includes(GameState.stageIndex)) continue;
    const started = f.needs.length === 1 || f.needs.some((id) => GameState.rank(id) > 0);
    if (!started) continue;
    for (const id of f.needs) if (GameState.rank(id) === 0) out[id] = SECRET_TRAIT_BOOST;
  }
  return out;
}

/** How much more often your current form's favoured traits (its affinity) are offered. */
export const AFFINITY_WEIGHT = 1.5;

/** Offer weights for this stage's favoured traits, multiplied into any secret form boosts. */
export function traitBoosts(): Partial<Record<TraitId, number>> {
  const out = secretTraitBoosts();
  for (const id of GameState.stageDef().affinity ?? []) out[id] = (out[id] ?? 1) * AFFINITY_WEIGHT;
  return out;
}

/** The mutation card to offer right now, if a discovered secret form branches off next. */
export function availableMutation(): FormUnlock | null {
  // branching happens once: a secret line runs to its own ending, so it never offers another
  if (Object.keys(GameState.forms).length > 0) return null;
  return FORM_UNLOCKS.find((f) => Codex.hasForm(f.stageId) && GameState.stageIndex === f.index - 1) ?? null;
}
