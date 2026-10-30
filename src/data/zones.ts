/**
 * Each arena zone has a peak: events along the way (ZONE_EVENT_MARKS) and a boss guarding its
 * lair, a marked area packed with extra prey. The boss only hunts you inside the lair.
 * Behaviour lives in systems/ZoneEvents.ts.
 */
export type ZoneEventKind = 'flood' | 'drought' | 'night' | 'storm' | 'migration' | 'eruption' | 'thermals' | 'pesticide';
/** Each boss's signature move (systems/BossMoves.ts). */
export type BossMoveId =
  | 'frenzy' | 'dive' | 'constrict' | 'feathers' | 'roar' | 'wallow' | 'gale' | 'quake' | 'lightning' | 'ink'
  | 'stampede' | 'updraft' | 'ambush' | 'lure';

export interface ZoneBossDef {
  /** Creature it is a giant version of. */
  base: string;
  name: string;
  /** Short title for the warning ("Lord of the Pond"). */
  title: string;
  hp: number;
  tint: number;
  move: BossMoveId;
  moveName: string;
  /** A second move it starts using once enraged, taking turns with the first. */
  phase2: BossMoveId;
  phase2Name: string;
}

export interface ZonePeak {
  boss: ZoneBossDef;
  event: { kind: ZoneEventKind; name: string; text: string };
}

/** Growth (0..1 through the stage) at which each event starts, and Nightmare's three. */
export const ZONE_EVENT_MARKS = [0.35, 0.7];
export const ZONE_EVENT_MARKS_EXTRA = [0.25, 0.5, 0.75];
/** Fully grown with the boss still alive: seconds until you evolve anyway, so nobody gets stuck. */
export const BOSS_GATE_TIME = 120;
/** Seconds of golden feast you get after beating the boss fully grown, before you evolve. */
export const BOSS_FEAST_TIME = 10;
export const ZONE_EVENT_TIME = 25;
/** Boss size relative to the size you evolve at, so it stays bigger than you all stage. */
export const BOSS_SIZE = 1.25;
/** Lair radius as a share of the map width, and how much extra prey lives there. */
export const LAIR_SIZE = 0.11;
export const LAIR_PREY = 18;
export const LAIR_PREY_MIN = 12;
/** Boss hit strength vs. the creature it is based on: gentle early, harder each stage. */
export const BOSS_DAMAGE_BASE = 0.6;
export const BOSS_DAMAGE_PER_STAGE = 0.15;
/** A boss loses at most this share of its health per second (plus a small burst), so every fight lasts. */
export const BOSS_MAX_DPS_SHARE = 1 / 16;
export const BOSS_BURST_SHARE = 0.15;

export const ZONE_PEAKS: Record<string, ZonePeak> = {
  swamp: {
    boss: { base: 'dragonfly', name: 'Bloodwing', title: 'Terror of the Swamp', hp: 180, tint: 0xff5252, move: 'frenzy', moveName: 'Blood Frenzy', phase2: 'dive', phase2Name: 'Death Dive' },
    event: { kind: 'flood', name: 'Flash Flood', text: 'A flash flood! Everything is swept out of hiding.' },
  },
  pond: {
    boss: { base: 'kingfisher', name: 'The Kingfisher King', title: 'Lord of the Pond', hp: 380, tint: 0x4fc3f7, move: 'dive', moveName: 'Royal Dive', phase2: 'feathers', phase2Name: 'Splash Volley' },
    event: { kind: 'drought', name: 'Drought', text: 'The pond is drying up. Everything crowds around the last water.' },
  },
  jungle: {
    boss: { base: 'snake', name: 'Alpha Python', title: 'Coiled in the Undergrowth', hp: 520, tint: 0x9e9d24, move: 'constrict', moveName: 'Constrict', phase2: 'frenzy', phase2Name: 'Strike Frenzy' },
    event: { kind: 'night', name: 'Nightfall', text: 'Night falls on the jungle. Only Keen Eyes can spot predators in the dark.' },
  },
  canopy: {
    boss: { base: 'hawk', name: 'Sky Tyrant', title: 'Shadow over the Canopy', hp: 480, tint: 0x6d4c41, move: 'feathers', moveName: 'Feather Storm', phase2: 'dive', phase2Name: 'Talon Dive' },
    event: { kind: 'storm', name: 'Thunderstorm', text: 'A thunderstorm rolls over the trees. Watch for lightning!' },
  },
  forest: {
    boss: { base: 'bear', name: 'Old Scarface', title: 'King of the Forest', hp: 900, tint: 0x8d6e63, move: 'roar', moveName: 'Terrifying Roar', phase2: 'quake', phase2Name: 'Ground Pound' },
    event: { kind: 'night', name: 'Nightfall', text: 'Night falls on the forest. Only Keen Eyes can spot predators in the dark.' },
  },
  delta: {
    boss: { base: 'hippo', name: 'The River Queen', title: 'Ruler of the Delta', hp: 900, tint: 0xce93d8, move: 'wallow', moveName: 'Mud Wallow', phase2: 'stampede', phase2Name: 'Hippo Charge' },
    event: { kind: 'drought', name: 'Dry Season', text: 'The dry season! Every animal is heading for the last pool.' },
  },
  cliffs: {
    boss: { base: 'rival_eagle', name: 'Stormwing', title: 'Master of the Cliffs', hp: 850, tint: 0x90a4ae, move: 'gale', moveName: 'Gale Force', phase2: 'feathers', phase2Name: 'Razor Feathers' },
    event: { kind: 'storm', name: 'Mountain Storm', text: 'A storm breaks over the cliffs. Watch for lightning!' },
  },
  continent: {
    boss: { base: 'rival_apex', name: 'The Alpha', title: 'Challenger to the Crown', hp: 2400, tint: 0xff7043, move: 'quake', moveName: 'Earthquake', phase2: 'roar', phase2Name: 'Alpha Roar' },
    event: { kind: 'migration', name: 'The Great Migration', text: 'The Great Migration! A huge herd thunders across the plains.' },
  },
  peaks: {
    boss: { base: 'rival_thunderbird', name: 'Elder Thunderbird', title: 'Voice of the Storm', hp: 2200, tint: 0xffee58, move: 'lightning', moveName: 'Call Lightning', phase2: 'gale', phase2Name: 'Storm Gust' },
    event: { kind: 'storm', name: 'Supercell', text: 'A supercell forms over the peaks. Watch for lightning!' },
  },
  meadow: {
    boss: { base: 'robin', name: 'Big Red', title: 'Terror of the Meadow', hp: 380, tint: 0xd84315, move: 'dive', moveName: 'Swoop', phase2: 'frenzy', phase2Name: 'Peck Frenzy' },
    event: { kind: 'storm', name: 'Summer Storm', text: 'A summer storm sweeps the meadow. Watch for lightning!' },
  },
  orchard: {
    boss: { base: 'woodpecker', name: 'The Woodpecker King', title: 'Drummer of the Orchard', hp: 520, tint: 0xb71c1c, move: 'frenzy', moveName: 'Pecking Frenzy', phase2: 'feathers', phase2Name: 'Splinter Shower' },
    event: { kind: 'night', name: 'Dusk', text: 'Dusk falls over the orchard. Only Keen Eyes can spot predators in the dark.' },
  },
  woodland: {
    boss: { base: 'honey_badger', name: 'The Honey Badger', title: 'It Really Does Not Care', hp: 900, tint: 0x616161, move: 'roar', moveName: 'Fearless Snarl', phase2: 'frenzy', phase2Name: 'Berserk' },
    event: { kind: 'drought', name: 'Dry Spell', text: 'A dry spell! Every animal is heading for the last puddle.' },
  },
  greathive: {
    boss: { base: 'rival_queen', name: 'The Usurper Queen', title: 'Pretender to the Throne', hp: 2400, tint: 0xf06292, move: 'feathers', moveName: 'Stinger Volley', phase2: 'lightning', phase2Name: 'Stinger Rain' },
    event: { kind: 'migration', name: 'The Great Migration', text: 'A huge herd thunders across the fields!' },
  },
  ashlands: {
    boss: { base: 'ash_grazer', name: 'Old Thunderhoof', title: 'Bull of the Ashlands', hp: 1500, tint: 0x8d6e63, move: 'stampede', moveName: 'Stampede', phase2: 'quake', phase2Name: 'Earthshaker' },
    event: { kind: 'eruption', name: 'Eruption', text: 'The ground splits open! Stay off the glowing cracks. The herds are fleeing them.' },
  },
  outskirts: {
    boss: { base: 'praying_mantis', name: 'The Mantis Matriarch', title: 'Hidden in the Crops', hp: 1400, tint: 0x9ccc65, move: 'ambush', moveName: 'Scythe Ambush', phase2: 'frenzy', phase2Name: 'Scythe Flurry' },
    event: { kind: 'pesticide', name: 'Crop Spraying', text: 'The farmers are spraying! Keep out of the poison fog. It kills your drones.' },
  },
  spires: {
    boss: { base: 'condor', name: 'The Condor Matriarch', title: 'Queen of the Spires', hp: 1400, tint: 0xeeeeee, move: 'updraft', moveName: 'Updraft', phase2: 'dive', phase2Name: 'Plummet' },
    event: { kind: 'thermals', name: 'Thermals', text: 'Hot air is rising! Ride a thermal for speed, but it will throw you off course.' },
  },
  trench: {
    boss: { base: 'anglerfish', name: 'The Pale Hunter', title: 'Light in the Dark', hp: 2400, tint: 0xeceff1, move: 'lure', moveName: 'Lure', phase2: 'ink', phase2Name: 'Lights Out' },
    event: { kind: 'night', name: 'Blackout', text: 'The water goes pitch black. Only Keen Eyes can spot predators in the dark.' },
  },
  reef: {
    boss: { base: 'giant_squid', name: 'The Kraken', title: 'Terror of the Deep', hp: 1500, tint: 0x7b1fa2, move: 'ink', moveName: 'Ink Cloud', phase2: 'constrict', phase2Name: 'Crushing Grip' },
    event: { kind: 'flood', name: 'Riptide', text: 'A riptide tears through the reef! Everything is swept around.' },
  },
};
