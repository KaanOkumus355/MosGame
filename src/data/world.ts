import { TRAITS, type TraitId } from './traits';
import { GameState } from '../state/GameState';

export type Terrain = 'ice' | 'forest' | 'plains' | 'desert' | 'jungle';
export type Owner = 'you' | 'humans' | 'wild';

export interface RegionDef {
  id: string;
  name: string;
  /** Centre and blob radii on the 1280x720 map. */
  x: number;
  y: number;
  rx: number;
  ry: number;
  terrain: Terrain;
  owner: Owner;
  /** Human city size 1-3 (0 for wild regions). */
  level: number;
}

/** A stylised world: Africa is home, humans hold the cities, the rest is wilderness. */
export const REGIONS: RegionDef[] = [
  { id: 'alaska', name: 'Alaska', x: 110, y: 160, rx: 55, ry: 42, terrain: 'ice', owner: 'wild', level: 0 },
  { id: 'canada', name: 'Canada', x: 255, y: 150, rx: 88, ry: 48, terrain: 'forest', owner: 'humans', level: 1 },
  { id: 'usa', name: 'United States', x: 245, y: 255, rx: 85, ry: 52, terrain: 'plains', owner: 'humans', level: 3 },
  { id: 'mexico', name: 'Mexico', x: 235, y: 350, rx: 50, ry: 38, terrain: 'desert', owner: 'humans', level: 1 },
  { id: 'amazon', name: 'Amazon', x: 345, y: 448, rx: 70, ry: 58, terrain: 'jungle', owner: 'wild', level: 0 },
  { id: 'patagonia', name: 'Patagonia', x: 335, y: 568, rx: 40, ry: 52, terrain: 'plains', owner: 'humans', level: 1 },
  { id: 'greenland', name: 'Greenland', x: 435, y: 115, rx: 46, ry: 34, terrain: 'ice', owner: 'wild', level: 0 },
  { id: 'scandinavia', name: 'Scandinavia', x: 600, y: 125, rx: 42, ry: 44, terrain: 'forest', owner: 'humans', level: 2 },
  { id: 'europe', name: 'Europe', x: 590, y: 220, rx: 60, ry: 42, terrain: 'plains', owner: 'humans', level: 3 },
  { id: 'sahara', name: 'Sahara', x: 610, y: 335, rx: 80, ry: 48, terrain: 'desert', owner: 'wild', level: 0 },
  { id: 'congo', name: 'Congo', x: 650, y: 445, rx: 55, ry: 48, terrain: 'jungle', owner: 'wild', level: 0 },
  { id: 'savanna', name: 'Savanna', x: 690, y: 555, rx: 56, ry: 48, terrain: 'plains', owner: 'you', level: 0 },
  { id: 'mideast', name: 'Middle East', x: 740, y: 280, rx: 50, ry: 40, terrain: 'desert', owner: 'humans', level: 2 },
  { id: 'siberia', name: 'Siberia', x: 880, y: 120, rx: 130, ry: 48, terrain: 'ice', owner: 'wild', level: 0 },
  { id: 'steppe', name: 'Steppe', x: 835, y: 215, rx: 70, ry: 38, terrain: 'plains', owner: 'humans', level: 1 },
  { id: 'india', name: 'India', x: 845, y: 340, rx: 45, ry: 50, terrain: 'jungle', owner: 'humans', level: 3 },
  { id: 'china', name: 'China', x: 965, y: 255, rx: 75, ry: 55, terrain: 'plains', owner: 'humans', level: 3 },
  { id: 'japan', name: 'Japan', x: 1100, y: 225, rx: 24, ry: 42, terrain: 'forest', owner: 'humans', level: 2 },
  { id: 'indonesia', name: 'Indonesia', x: 1015, y: 425, rx: 72, ry: 30, terrain: 'jungle', owner: 'wild', level: 0 },
  { id: 'australia', name: 'Australia', x: 1110, y: 548, rx: 80, ry: 52, terrain: 'desert', owner: 'humans', level: 2 },
];

/** [a, b, sea crossing?] */
export const LINKS: [string, string, boolean][] = [
  ['alaska', 'canada', false], ['alaska', 'siberia', true], ['canada', 'usa', false], ['canada', 'greenland', true],
  ['usa', 'mexico', false], ['mexico', 'amazon', false], ['amazon', 'patagonia', false], ['amazon', 'sahara', true],
  ['greenland', 'scandinavia', true], ['scandinavia', 'europe', false], ['scandinavia', 'siberia', false],
  ['europe', 'sahara', true], ['europe', 'steppe', false], ['europe', 'mideast', false], ['sahara', 'congo', false],
  ['sahara', 'mideast', false], ['congo', 'savanna', false], ['mideast', 'steppe', false], ['mideast', 'india', false],
  ['steppe', 'siberia', false], ['steppe', 'china', false], ['india', 'china', false], ['china', 'siberia', false],
  ['china', 'japan', true], ['japan', 'siberia', true], ['india', 'indonesia', true], ['china', 'indonesia', true],
  ['indonesia', 'australia', true], ['savanna', 'patagonia', true],
];

export const TERRAIN_COLOR: Record<Terrain, number> = {
  ice: 0xcfd8dc,
  forest: 0x2e7d32,
  plains: 0x9ccc65,
  desert: 0xd7b98e,
  jungle: 0x1b5e20,
};

export const OWNER_COLOR: Record<Owner, number> = {
  you: 0x7c4dff,
  humans: 0x546e7a,
  wild: 0x000000,
};

// ---------------------------------------------------------------- empire bonuses from your evolution

/** How the run's traits shape the strategy layer. */
export interface EmpireStats {
  growthMul: number;
  attackMul: number;
  defenseMul: number;
  influenceMul: number;
  /** Flat influence per second on top of the base. */
  influenceFlat: number;
  /** Fraction knocked off conversion costs. */
  convertDiscount: number;
  travelMul: number;
  /** How many links away an attack can reach. */
  reach: number;
  /** See exact human troop counts and incoming-attack warnings. */
  intel: boolean;
  /** Research slowdown fraction. */
  researchSlow: number;
  /** Multiplier on power cooldowns. */
  cooldownMul: number;
  /** Extra troops kept when a region is captured. */
  rallyMul: number;
  /** Per-second drain on adjacent wild regions (they defect at 0). */
  wildPull: number;
  /** Per-second damage your regions do to adjacent human regions. */
  siloDps: number;
  /** Growth multiplier for regions under 20 troops. */
  emergencyGrowth: number;
  /** Attackers hitting your regions lose this much more. */
  biohazard: number;
  startTroops: number;
  startInfluence: number;
  hasBioweapons: boolean;
  bioweaponCooldown: number;
}

/** Map-layer description of each trait (shown on the briefing). */
export const TRAIT_EMPIRE_TEXT: Record<TraitId, (r: number) => string> = {
  speed: (r) => `Armies move ${12 * r}% faster`,
  size: (r) => `Swarm grows ${10 * r}% faster`,
  armor: (r) => `Your regions defend ${10 * r}% better`,
  venom: (r) => `Unlocks the Bioweapons power (cooldown ${40 - 5 * r}s)`,
  wings: (r) => (r >= 3 ? 'Attacks can strike regions two links away; armies move faster' : `Armies move ${8 * r}% faster`),
  intelligence: (r) => `+${35 * r}% influence`,
  camo: (r) => `Converting cities costs ${10 * r}% less`,
  bloodlust: (r) => `Captured regions keep ${15 * r}% more troops`,
  magnet: () => 'Neighbouring wild regions slowly defect to you',
  thorns: (r) => `Attackers on your regions lose ${10 * r}% extra`,
  eyes: (r) => `See exact human numbers and incoming attacks; research ${5 * r}% slower`,
  glutton: (r) => `Swarm grows ${6 * r}% faster`,
  nimble: (r) => `Power cooldowns ${6 * r}% shorter`,
  lucky: () => 'Start with +50 influence',
  secondwind: (r) => `Start with +${25 * r} troops`,
  silent: (r) => `Converting cities costs ${8 * r}% less`,
  pheromones: (r) => `Swarm grows ${6 * r}% faster`,
  claws: (r) => `Attacks ${8 * r}% stronger`,
  jaw: (r) => `Attacks ${6 * r}% stronger`,
  adrenaline: (r) => `Regions under 20 troops grow ${50 * r}% faster`,
  quills: (r) => `Your regions bombard human neighbours (${(0.25 * r).toFixed(2)} troops/s)`,
  shock: (r) => `+${(0.25 * r).toFixed(2)} influence per second`,
  tailwhip: (r) => `Your regions defend ${6 * r}% better`,
};

export function empireStats(): EmpireStats {
  const r = (id: TraitId) => GameState.rank(id);
  const fusions = GameState.fusions.length;
  return {
    growthMul: 1 + 0.1 * r('size') + 0.06 * (r('glutton') + r('pheromones')),
    attackMul: 1 + 0.08 * r('claws') + 0.06 * r('jaw') + 0.08 * fusions,
    defenseMul: 1 + 0.1 * r('armor') + 0.06 * r('tailwhip') + 0.08 * fusions,
    influenceMul: 1 + 0.35 * r('intelligence'),
    influenceFlat: 0.25 * r('shock'),
    convertDiscount: Math.min(0.5, 0.1 * r('camo') + 0.08 * r('silent')),
    travelMul: 1 + 0.12 * r('speed') + 0.08 * r('wings'),
    reach: r('wings') >= 3 ? 2 : 1,
    intel: r('eyes') > 0,
    researchSlow: 0.05 * r('eyes'),
    cooldownMul: 1 - 0.06 * r('nimble'),
    rallyMul: 1 + 0.15 * r('bloodlust'),
    wildPull: 0.4 * r('magnet'),
    siloDps: 0.25 * r('quills'),
    emergencyGrowth: 1 + 0.5 * r('adrenaline'),
    biohazard: 0.1 * r('thorns'),
    startTroops: 30 + 1.5 * GameState.evolutionsEarned + 25 * r('secondwind'),
    startInfluence: r('lucky') ? 50 : 0,
    hasBioweapons: r('venom') > 0,
    bioweaponCooldown: 40 - 5 * r('venom'),
  };
}

/** Briefing lines: each owned trait, under its Overlord-era name, and what it does here. */
export function empireBriefing(): string[] {
  const lines = GameState.traitOrder.map((id) => `${TRAITS[id].forms[5]}: ${TRAIT_EMPIRE_TEXT[id](GameState.rank(id))}`);
  if (GameState.fusions.length) lines.push(`${GameState.fusions.length} fusion(s): attacks and defence +${8 * GameState.fusions.length}%`);
  return lines;
}
