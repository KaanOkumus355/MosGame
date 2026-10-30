export type Difficulty = 'easy' | 'normal' | 'hard' | 'nightmare';

/** Base pace for every difficulty: how fast you grow, tuned for a run of about 20 minutes. */
export const GROWTH_PACE = 0.7;
/** DNA slows with growth, so a longer stage doesn't simply hand out more traits. */
export const DNA_PACE = 0.75;

export interface DifficultyDef {
  name: string;
  blurb: string;
  /** Multiplier on all damage the player takes (and poison). */
  damageTaken: number;
  /** Multiplier on DNA gained. */
  dnaMul: number;
  /** Multiplier on how fast meals make you grow: what sets the length of a stage. */
  growth: number;
  /** Multiplier on how far predators notice you. */
  predatorSense: number;
  /** Multiplier on how long humanity's research takes on the world map. */
  researchTime: number;
  /** Multiplier on human troops and regrowth on the world map. */
  humanStrength: number;
  /** Multiplier on genes banked at the end of a run (harder pays more). */
  genes: number;
  /** Free Second Winds every stage, on top of the trait's. */
  extraSecondWinds: number;
  /** Multipliers on how many predators and how much prey a zone holds. */
  predatorCount: number;
  preyCount: number;
  /** Multiplier on predators' speeds: what decides whether you can get away. */
  predatorSpeed: number;
  /** Bosses enrage below this share of their health (1 = enraged from the start). */
  bossEnrageAt: number;
  /** No out-of-combat health recovery, and natural regeneration is halved. */
  noRecovery: boolean;
  /** A third zone event in every stage. */
  extraEvent: boolean;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: {
    name: 'Easy',
    blurb: 'Softer hits, a free Second Wind every stage, more DNA. Humanity researches slowly.',
    damageTaken: 0.75, dnaMul: 1.1, growth: 1, predatorSense: 0.9, researchTime: 1.3, humanStrength: 0.9,
    genes: 1, extraSecondWinds: 1, predatorCount: 1, preyCount: 1, predatorSpeed: 1, bossEnrageAt: 0.5, noRecovery: false, extraEvent: false,
  },
  normal: {
    name: 'Normal',
    blurb: 'The food chain as nature intended.',
    damageTaken: 1, dnaMul: 1, growth: 0.85, predatorSense: 1, researchTime: 1, humanStrength: 1,
    genes: 1, extraSecondWinds: 0, predatorCount: 1, preyCount: 1, predatorSpeed: 1, bossEnrageAt: 0.5, noRecovery: false, extraEvent: false,
  },
  hard: {
    name: 'Hard',
    blurb: 'Harder hits, slower growth, less prey, bosses enrage sooner. Humanity is in a hurry. +25% genes.',
    damageTaken: 1.35, dnaMul: 0.9, growth: 0.7, predatorSense: 1.15, researchTime: 0.8, humanStrength: 1.2,
    genes: 1.25, extraSecondWinds: 0, predatorCount: 1, preyCount: 0.85, predatorSpeed: 1, bossEnrageAt: 0.65, noRecovery: false, extraEvent: false,
  },
  nightmare: {
    name: 'Nightmare',
    blurb: 'Brutal hits, the slowest growth, more and faster predators, enraged bosses, no resting, three events a stage. +60% genes.',
    damageTaken: 1.8, dnaMul: 0.75, growth: 0.6, predatorSense: 1.35, researchTime: 0.7, humanStrength: 1.35,
    genes: 1.6, extraSecondWinds: 0, predatorCount: 1.5, preyCount: 0.85, predatorSpeed: 1.12, bossEnrageAt: 1, noRecovery: true, extraEvent: true,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'nightmare'];

const STORAGE_KEY = 'swarm-to-sovereign-difficulty';

export function loadDifficulty(): Difficulty {
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    if (d === 'easy' || d === 'normal' || d === 'hard' || d === 'nightmare') return d;
  } catch {
    // storage unavailable
  }
  return 'normal';
}

export function saveDifficulty(d: Difficulty): void {
  try {
    localStorage.setItem(STORAGE_KEY, d);
  } catch {
    // ignore
  }
}
