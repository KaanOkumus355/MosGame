/** Stats that traits modify. Every stage reads these, so picks carry forward. */
export interface PlayerStats {
  speedMul: number;
  maxHp: number;
  /** Fraction of incoming damage ignored (0..0.8). */
  armor: number;
  dnaMul: number;
  /** HP per second once out of combat. */
  regen: number;
  /** Multiplier on size gained from eating/drinking. */
  growthMul: number;
  /** HP restored per thing eaten (and per second while drinking). */
  healOnEat: number;
  /** Multiplier on how far away predators notice you. */
  senseMul: number;
  /** Pull radius for small prey, in player body-radii. 0 = off. */
  magnetRange: number;
  /** Ability ranks (0 = not owned). */
  venomRank: number;
  dashRank: number;
  /** Multiplier on how much of the world you can see. */
  viewMul: number;
  /** Multiplier on acceleration/turning. */
  accelMul: number;
  /** Added to the edible size ratio (0.9 -> 0.9 + bonus). */
  edibleBonus: number;
  /** Multiplier on how far away prey notices you. */
  preySenseMul: number;
  /** Multiplier on prey population. */
  preyMul: number;
  /** Glutton: DNA bonus per combo step = 0.08 * rank. */
  comboRank: number;
  /** Toxic blood: seconds attackers get stunned for after hitting you. */
  thornsStun: number;
  /** Lethal hits survived per stage. */
  secondWinds: number;
  /** Extra cards on the evolution screen. */
  extraChoices: number;
  /** Multiplier on bite damage when fighting. */
  biteMul: number;
}

export const defaultStats = (): PlayerStats => ({
  speedMul: 1,
  maxHp: 100,
  armor: 0,
  dnaMul: 1,
  regen: 2,
  growthMul: 1,
  healOnEat: 0,
  senseMul: 1,
  magnetRange: 0,
  venomRank: 0,
  dashRank: 0,
  viewMul: 1,
  accelMul: 1,
  edibleBonus: 0,
  preySenseMul: 1,
  preyMul: 1,
  comboRank: 0,
  thornsStun: 0,
  secondWinds: 0,
  extraChoices: 0,
  biteMul: 1,
});
