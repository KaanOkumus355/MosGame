/**
 * AI behaviours:
 *  wander - drifts around; flees when the player could eat it
 *  chase  - chases the player when it is big enough to hurt them, tires out after `stamina` s
 *  tongue - sits/hops; winds up and snaps a tongue at the player in `tongueRange`
 *  host   - big harmless animal you can drink blood from; swats you if you linger
 *  charge - (optionally stalks you, then) winds up and lunges in a straight line
 *  rival  - predator that picks fights with you even when a bit smaller (needs `hp`)
 *  ranged - keeps its distance and throws projectiles (humans)
 *
 * Any creature with `hp` can be fought: touching it bites it, and at 0 hp it becomes an
 * edible carcass regardless of size.
 */
export type Behavior = 'wander' | 'chase' | 'tongue' | 'host' | 'charge' | 'rival' | 'ranged';

/** spear: damage. web: slows and leaves a sticky patch. net: nearly roots you. */
export type ProjectileKind = 'spear' | 'web' | 'net';

export interface CreatureDef {
  key: string;
  name: string;
  texture: string;
  /** Colour variant of a shared texture. */
  tint?: number;
  /** Random size (collision radius in world px) picked in this range. */
  size: [number, number];
  speed: number;
  fleeSpeed?: number;
  chaseSpeed?: number;
  /** How close the player must be before it reacts. */
  sense: number;
  behavior: Behavior;
  /** Contact / attack damage. 0 = harmless. */
  damage: number;
  /** Steering responsiveness (higher = turns faster). */
  accel?: number;
  flying?: boolean;
  /** 0..1, how jittery its path is. */
  erratic?: number;
  hopper?: boolean;
  stamina?: number;
  tongueRange?: number;
  /** Host only: DNA worth of blood it holds. */
  blood?: number;
  swatDamage?: number;
  /** Override DNA given when eaten (default: its size). */
  dnaValue?: number;
  // charge behaviour (sense = distance at which it winds up)
  windup?: number;
  chargeSpeed?: number;
  chargeTime?: number;
  chargeCooldown?: number;
  /** Creeps toward the player at this speed while within stalkRange (0 = no stalking). */
  stalkSpeed?: number;
  stalkRange?: number;
  /** Smells you out even when you hide (camouflage, kelp, water). */
  keenNose?: boolean;
  /** Makes it fightable. */
  hp?: number;
  // ranged behaviour
  range?: number;
  shootCooldown?: number;
  projectileSpeed?: number;
  projectileDamage?: number;
  /** Shows the "first humans" message when first seen. */
  human?: boolean;
  /**
   * A big new threat that gets an introduction: it won't hunt you until one has been on screen
   * and this warning has shown (once per stage), and then only after a short grace period.
   */
  warning?: string;
  /** What a ranged creature throws (default spear). */
  projectile?: ProjectileKind;

  // ---- special moves (any behaviour can have these)
  /** Secondary ranged attack, e.g. a spider's web. */
  spit?: { kind: ProjectileKind; range: number; cooldown: number; speed: number; damage: number };
  /** Body hits also poison you. */
  poison?: { dps: number; time: number };
  /** Howls to rally nearby pack members and flanks with them. */
  pack?: boolean;
  /** Area slam around itself when you get close. `range` and `radius` are in its own body radii. */
  slam?: { range: number; radius: number; windup: number; damage: number; cooldown: number; knock: number; slow?: number; shout: string };
  /** Leaps at you from mid range (in body radii). Uses windup/chargeSpeed/chargeTime/chargeCooldown. */
  leap?: { min: number; max: number };
}

export const CREATURES: Record<string, CreatureDef> = {
  gnat: {
    key: 'gnat', name: 'Gnat', texture: 'gnat',
    size: [3, 5], speed: 40, fleeSpeed: 110, sense: 90,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.8, accel: 4,
  },
  aphid: {
    key: 'aphid', name: 'Aphid', texture: 'aphid',
    size: [4, 6.5], speed: 15, fleeSpeed: 45, sense: 60,
    behavior: 'wander', damage: 0, accel: 3,
  },
  fly: {
    key: 'fly', name: 'Fly', texture: 'fly',
    size: [6, 11], speed: 70, fleeSpeed: 175, sense: 140,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.6, accel: 5,
  },
  dragonfly: {
    key: 'dragonfly', name: 'Dragonfly', texture: 'dragonfly',
    size: [17, 24], speed: 70, chaseSpeed: 185, fleeSpeed: 200, sense: 230,
    behavior: 'chase', damage: 20, flying: true, stamina: 2.2, accel: 3, hp: 90,
  },
  frog: {
    key: 'frog', name: 'Frog', texture: 'frog',
    size: [24, 34], speed: 160, sense: 0,
    behavior: 'tongue', damage: 28, hopper: true, tongueRange: 165, accel: 6, hp: 120,
  },
  rat: {
    key: 'rat', name: 'Swamp Rat', texture: 'rat',
    size: [24, 30], speed: 30, sense: 0,
    behavior: 'host', damage: 0, blood: 40, swatDamage: 15, accel: 2,
  },
  capybara: {
    key: 'capybara', name: 'Capybara', texture: 'capybara',
    size: [40, 48], speed: 18, sense: 0,
    behavior: 'host', damage: 0, blood: 80, swatDamage: 22, accel: 1.5,
  },

  // ------------------------------------------------ stage 2: pond
  mosquito: {
    key: 'mosquito', name: 'Mosquito', texture: 'mosquito',
    size: [5, 8], speed: 60, fleeSpeed: 150, sense: 120,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.7, accel: 5,
  },
  strider: {
    key: 'strider', name: 'Water Strider', texture: 'strider',
    size: [8, 13], speed: 80, fleeSpeed: 235, sense: 170,
    behavior: 'wander', damage: 0, erratic: 0.9, accel: 7, dnaValue: 16,
  },
  moth: {
    key: 'moth', name: 'Moth', texture: 'moth',
    size: [12, 18], speed: 45, fleeSpeed: 120, sense: 160,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.5, accel: 3,
  },
  bullfrog: {
    key: 'bullfrog', name: 'Bullfrog', texture: 'frog', tint: 0xb5c46a,
    size: [36, 46], speed: 200, sense: 0,
    behavior: 'tongue', damage: 34, hopper: true, tongueRange: 185, accel: 6, hp: 220,
    slam: { range: 2.4, radius: 3, windup: 0.5, damage: 8, cooldown: 4.5, knock: 700, shout: 'CROAK!' },
  },
  kingfisher: {
    key: 'kingfisher', name: 'Kingfisher', texture: 'bird',
    size: [46, 58], speed: 130, sense: 300,
    behavior: 'charge', damage: 40, flying: true, accel: 2, hp: 240,
    windup: 0.7, chargeSpeed: 560, chargeTime: 0.55, chargeCooldown: 2.6,
    // plunges at you from mid range
    leap: { min: 2, max: 5 },
  },

  // ------------------------------------------------ stage 3: jungle floor
  ant: {
    key: 'ant', name: 'Ant', texture: 'ant',
    size: [4, 7], speed: 35, fleeSpeed: 75, sense: 80,
    behavior: 'wander', damage: 0, erratic: 0.4, accel: 6,
  },
  cricket: {
    key: 'cricket', name: 'Cricket', texture: 'cricket',
    size: [9, 14], speed: 220, fleeSpeed: 210, sense: 170,
    behavior: 'wander', damage: 0, hopper: true, accel: 6,
  },
  caterpillar: {
    key: 'caterpillar', name: 'Caterpillar', texture: 'caterpillar',
    size: [11, 17], speed: 12, fleeSpeed: 25, sense: 60,
    behavior: 'wander', damage: 0, accel: 2,
  },
  beetle: {
    key: 'beetle', name: 'Beetle', texture: 'beetle',
    size: [14, 20], speed: 30, fleeSpeed: 60, sense: 90,
    behavior: 'wander', damage: 0, accel: 3, dnaValue: 30,
  },
  jungle_dragonfly: {
    key: 'jungle_dragonfly', name: 'Dragonfly', texture: 'dragonfly', tint: 0xffcc80,
    size: [17, 25], speed: 80, chaseSpeed: 200, fleeSpeed: 230, sense: 220,
    behavior: 'chase', damage: 22, flying: true, stamina: 1.8, accel: 3, hp: 110,
  },
  tarantula: {
    key: 'tarantula', name: 'Tarantula', texture: 'spider',
    size: [30, 42], speed: 55, chaseSpeed: 245, fleeSpeed: 200, sense: 240,
    behavior: 'chase', damage: 32, stamina: 2.4, accel: 4, hp: 170,
    spit: { kind: 'web', range: 300, cooldown: 3.5, speed: 430, damage: 6 },
  },
  // a rival that hunts you down and leaps to cut you off: the first thing that can't just be avoided,
  // and a fightable warm-up for the forest's wolves and raptors
  monitor: {
    key: 'monitor', name: 'Monitor Lizard', texture: 'lizard', tint: 0x8d6e63,
    size: [20, 28], speed: 60, chaseSpeed: 245, fleeSpeed: 240, sense: 300,
    behavior: 'rival', damage: 20, stamina: 2.5, accel: 4, hp: 90,
    leap: { min: 2.5, max: 5 }, windup: 0.45, chargeSpeed: 560, chargeTime: 0.3, chargeCooldown: 3.5,
  },
  snake: {
    key: 'snake', name: 'Snake', texture: 'snake',
    size: [52, 66], speed: 40, sense: 170,
    behavior: 'charge', damage: 48, accel: 3, hp: 320,
    windup: 0.42, chargeSpeed: 680, chargeTime: 0.24, chargeCooldown: 1.8,
    stalkSpeed: 85, stalkRange: 380, poison: { dps: 5, time: 4 },
  },

  // ------------------------------------------------ stage 4: forest
  mouse: {
    key: 'mouse', name: 'Mouse', texture: 'mouse',
    size: [6, 9], speed: 60, fleeSpeed: 200, sense: 140,
    behavior: 'wander', damage: 0, erratic: 0.7, accel: 7,
  },
  rabbit: {
    key: 'rabbit', name: 'Rabbit', texture: 'rabbit',
    size: [11, 15], speed: 260, fleeSpeed: 250, sense: 200,
    behavior: 'wander', damage: 0, hopper: true, accel: 7,
  },
  squirrel: {
    key: 'squirrel', name: 'Squirrel', texture: 'squirrel',
    size: [9, 13], speed: 70, fleeSpeed: 230, sense: 170,
    behavior: 'wander', damage: 0, erratic: 0.9, accel: 8,
  },
  deer: {
    key: 'deer', name: 'Deer', texture: 'deer',
    size: [30, 40], speed: 60, fleeSpeed: 300, sense: 300,
    behavior: 'wander', damage: 0, accel: 3, dnaValue: 60,
  },
  boar: {
    key: 'boar', name: 'Boar', texture: 'boar',
    size: [32, 42], speed: 50, sense: 200,
    behavior: 'charge', damage: 32, accel: 3, hp: 70,
    windup: 0.5, chargeSpeed: 520, chargeTime: 0.45, chargeCooldown: 2.4,
  },
  wolf: {
    key: 'wolf', name: 'Wolf', texture: 'wolf',
    size: [24, 32], speed: 90, chaseSpeed: 270, fleeSpeed: 280, sense: 330,
    behavior: 'rival', damage: 22, stamina: 3, accel: 4, hp: 50, pack: true,
  },
  rival_raptor: {
    key: 'rival_raptor', name: 'Rival Raptor', texture: 'raptor', tint: 0x80cbc4,
    size: [28, 38], speed: 80, chaseSpeed: 290, fleeSpeed: 290, sense: 360,
    behavior: 'rival', damage: 30, stamina: 3.5, accel: 4, hp: 85,
    leap: { min: 2.5, max: 6 }, windup: 0.35, chargeSpeed: 640, chargeTime: 0.28, chargeCooldown: 3,
  },
  bear: {
    key: 'bear', name: 'Bear', texture: 'bear',
    size: [72, 90], speed: 45, sense: 260,
    behavior: 'charge', damage: 55, accel: 2, hp: 320,
    windup: 0.65, chargeSpeed: 560, chargeTime: 0.5, chargeCooldown: 2.6,
    stalkSpeed: 70, stalkRange: 420,
    slam: { range: 1.8, radius: 2.2, windup: 0.75, damage: 40, cooldown: 3.5, knock: 600, shout: 'SLAM!' },
    warning: 'A BEAR! It stalks you from far off, then charges. When it stops to wind up, dash sideways.',
  },

  // ------------------------------------------------ stage 2: pond (fightable mid-sized hunter)
  diving_beetle: {
    key: 'diving_beetle', name: 'Diving Beetle', texture: 'beetle', tint: 0x4dd0e1,
    size: [18, 24], speed: 50, chaseSpeed: 190, fleeSpeed: 190, sense: 220,
    behavior: 'chase', damage: 18, stamina: 2, accel: 4, hp: 55,
  },

  // ------------------------------------------------ the hive line (meadow, orchard, woodland, great hive)
  bee: {
    key: 'bee', name: 'Honeybee', texture: 'bee',
    size: [8, 12], speed: 60, fleeSpeed: 190, sense: 160,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.6, accel: 4,
  },
  ladybug: {
    key: 'ladybug', name: 'Ladybug', texture: 'ladybug',
    size: [9, 13], speed: 35, fleeSpeed: 110, sense: 130,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.4, accel: 3,
  },
  garden_spider: {
    key: 'garden_spider', name: 'Garden Spider', texture: 'spider', tint: 0xffca28,
    size: [22, 30], speed: 45, chaseSpeed: 210, fleeSpeed: 180, sense: 220,
    behavior: 'chase', damage: 24, stamina: 2.2, accel: 4, hp: 80,
    spit: { kind: 'web', range: 260, cooldown: 4, speed: 400, damage: 4 },
  },
  robin: {
    key: 'robin', name: 'Robin', texture: 'bird', tint: 0xff7043,
    size: [40, 50], speed: 120, sense: 300,
    behavior: 'charge', damage: 34, flying: true, accel: 2, hp: 200,
    windup: 0.65, chargeSpeed: 560, chargeTime: 0.5, chargeCooldown: 2.6,
    // one robin that spots you calls the rest of the flock
    pack: true,
  },
  rival_wasp: {
    key: 'rival_wasp', name: 'Rival Wasp', texture: 'wasp', tint: 0xff8a65,
    size: [20, 28], speed: 90, chaseSpeed: 260, fleeSpeed: 260, sense: 320,
    behavior: 'rival', damage: 20, flying: true, stamina: 3, accel: 5, hp: 70,
  },
  woodpecker: {
    key: 'woodpecker', name: 'Woodpecker', texture: 'bird', tint: 0xe53935,
    size: [52, 62], speed: 110, sense: 330,
    behavior: 'charge', damage: 40, flying: true, accel: 2, hp: 260,
    windup: 0.5, chargeSpeed: 620, chargeTime: 0.45, chargeCooldown: 2.2,
    slam: { range: 1.5, radius: 1.6, windup: 0.45, damage: 30, cooldown: 3, knock: 300, shout: 'DRILL!' },
  },
  rival_hornet: {
    key: 'rival_hornet', name: 'Rival Hornet', texture: 'hornet', tint: 0xb39ddb,
    size: [28, 38], speed: 90, chaseSpeed: 280, fleeSpeed: 280, sense: 360,
    behavior: 'rival', damage: 28, flying: true, stamina: 3, accel: 4, hp: 95,
  },
  honey_badger: {
    key: 'honey_badger', name: 'Honey Badger', texture: 'boar', tint: 0x9e9e9e,
    size: [40, 50], speed: 60, sense: 260,
    behavior: 'charge', damage: 40, accel: 3, hp: 200, keenNose: true,
    windup: 0.45, chargeSpeed: 560, chargeTime: 0.45, chargeCooldown: 2.2,
  },
  beekeeper: {
    key: 'beekeeper', name: 'Beekeeper', texture: 'hunter', tint: 0xfafafa,
    size: [14, 18], speed: 90, fleeSpeed: 190, sense: 520,
    behavior: 'ranged', damage: 0, accel: 5, dnaValue: 45, human: true,
    range: 340, shootCooldown: 2.6, projectileSpeed: 430, projectileDamage: 22, projectile: 'net',
  },
  rival_queen: {
    key: 'rival_queen', name: 'Rival Queen', texture: 'broodmother', tint: 0xef9a9a,
    size: [84, 104], speed: 60, chaseSpeed: 290, fleeSpeed: 290, sense: 460,
    behavior: 'rival', damage: 50, flying: true, stamina: 4, accel: 3, hp: 480, dnaValue: 250,
  },

  // ------------------------------------------------ stage 3 (branch): canopy
  butterfly: {
    key: 'butterfly', name: 'Butterfly', texture: 'butterfly',
    size: [8, 13], speed: 50, fleeSpeed: 150, sense: 150,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.8, accel: 3,
  },
  monkey: {
    key: 'monkey', name: 'Monkey', texture: 'monkey',
    size: [22, 30], speed: 80, chaseSpeed: 250, fleeSpeed: 260, sense: 300,
    behavior: 'rival', damage: 18, stamina: 2.5, accel: 5, hp: 60, pack: true,
  },
  tree_snake: {
    key: 'tree_snake', name: 'Tree Snake', texture: 'snake', tint: 0x9ccc65,
    size: [44, 56], speed: 40, sense: 180,
    behavior: 'charge', damage: 38, accel: 3, hp: 180,
    windup: 0.45, chargeSpeed: 650, chargeTime: 0.24, chargeCooldown: 2,
    stalkSpeed: 80, stalkRange: 360, poison: { dps: 4, time: 4 },
  },
  hawk: {
    key: 'hawk', name: 'Hawk', texture: 'bird', tint: 0xa1887f,
    size: [62, 78], speed: 140, sense: 380,
    behavior: 'charge', damage: 48, flying: true, accel: 2, hp: 280,
    windup: 0.65, chargeSpeed: 680, chargeTime: 0.55, chargeCooldown: 2.4,
    // circles you from far off before it strikes
    stalkSpeed: 110, stalkRange: 520,
  },

  // ------------------------------------------------ stage 4 (flying line): cliffs
  pigeon: {
    key: 'pigeon', name: 'Pigeon', texture: 'pigeon',
    size: [9, 14], speed: 60, fleeSpeed: 210, sense: 170,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.5, accel: 4,
  },
  falcon: {
    key: 'falcon', name: 'Falcon', texture: 'bird', tint: 0x90a4ae,
    size: [24, 32], speed: 120, sense: 340,
    behavior: 'charge', damage: 26, flying: true, accel: 3, hp: 70,
    // a short wind-up and the fastest dive of anything that flies, from a long way off
    windup: 0.3, chargeSpeed: 880, chargeTime: 0.32, chargeCooldown: 2.4,
    leap: { min: 3, max: 9 },
  },
  rival_eagle: {
    key: 'rival_eagle', name: 'Rival Eagle', texture: 'eagle', tint: 0xbcaaa4,
    size: [30, 40], speed: 90, chaseSpeed: 280, fleeSpeed: 280, sense: 360,
    behavior: 'rival', damage: 30, flying: true, stamina: 3, accel: 3, hp: 90,
    leap: { min: 2.5, max: 6 }, windup: 0.35, chargeSpeed: 650, chargeTime: 0.3, chargeCooldown: 3,
  },

  // ------------------------------------------------ stage 5 (flying line): storm peaks
  goose: {
    key: 'goose', name: 'Goose', texture: 'goose',
    size: [14, 20], speed: 70, fleeSpeed: 240, sense: 220,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.3, accel: 3,
  },
  rival_thunderbird: {
    key: 'rival_thunderbird', name: 'Rival Thunderbird', texture: 'thunderbird', tint: 0xb39ddb,
    size: [84, 104], speed: 70, chaseSpeed: 300, fleeSpeed: 300, sense: 480,
    behavior: 'rival', damage: 50, flying: true, stamina: 4, accel: 3, hp: 500, dnaValue: 260,
    slam: { range: 2.2, radius: 2.8, windup: 0.8, damage: 30, cooldown: 4, knock: 500, slow: 2, shout: 'KRA-KOOM!' },
  },

  // ------------------------------------------------ stage 5 (water line): coral reef
  sardine: {
    key: 'sardine', name: 'Sardine', texture: 'fish', tint: 0xcfd8dc,
    size: [10, 14], speed: 80, fleeSpeed: 260, sense: 200,
    behavior: 'wander', damage: 0, erratic: 0.4, accel: 5,
  },
  turtle: {
    key: 'turtle', name: 'Sea Turtle', texture: 'turtle',
    size: [26, 34], speed: 40, fleeSpeed: 120, sense: 160,
    behavior: 'wander', damage: 0, accel: 2, dnaValue: 50,
  },
  seal: {
    key: 'seal', name: 'Seal', texture: 'seal',
    size: [32, 42], speed: 70, fleeSpeed: 280, sense: 260,
    behavior: 'wander', damage: 0, accel: 4, dnaValue: 70,
  },
  shark: {
    key: 'shark', name: 'Shark', texture: 'shark',
    size: [56, 72], speed: 90, chaseSpeed: 300, sense: 340,
    behavior: 'chase', damage: 45, stamina: 3, accel: 3, hp: 260, keenNose: true,
  },
  orca: {
    key: 'orca', name: 'Orca', texture: 'orca',
    size: [64, 80], speed: 80, chaseSpeed: 300, fleeSpeed: 300, sense: 420,
    behavior: 'rival', damage: 40, stamina: 3.5, accel: 3, hp: 300, pack: true, keenNose: true,
  },
  giant_squid: {
    key: 'giant_squid', name: 'Giant Squid', texture: 'squid',
    size: [96, 116], speed: 40, sense: 260,
    behavior: 'charge', damage: 60, accel: 2, hp: 520, dnaValue: 260,
    windup: 0.7, chargeSpeed: 520, chargeTime: 0.5, chargeCooldown: 2.8,
    slam: { range: 2, radius: 2.6, windup: 0.8, damage: 35, cooldown: 4, knock: 550, slow: 2, shout: 'SPLOOSH!' },
  },
  harpooner: {
    key: 'harpooner', name: 'Harpooner', texture: 'hunter', tint: 0x80deea,
    size: [14, 18], speed: 90, fleeSpeed: 190, sense: 520,
    behavior: 'ranged', damage: 0, accel: 5, dnaValue: 45, human: true,
    range: 360, shootCooldown: 3, projectileSpeed: 460, projectileDamage: 24,
  },

  // ------------------------------------------------ stage 4 (branch): river delta
  mudskipper: {
    key: 'mudskipper', name: 'Mudskipper', texture: 'mudskipper',
    size: [9, 13], speed: 70, fleeSpeed: 220, sense: 170,
    behavior: 'wander', damage: 0, erratic: 0.6, hopper: true, accel: 6,
  },
  heron: {
    key: 'heron', name: 'Heron', texture: 'bird', tint: 0xcfd8dc,
    size: [40, 50], speed: 110, sense: 320,
    behavior: 'charge', damage: 30, flying: true, accel: 2, hp: 110,
    windup: 0.6, chargeSpeed: 600, chargeTime: 0.5, chargeCooldown: 2.4,
    // stabs at you with its beak from just out of reach
    spit: { kind: 'spear', range: 200, cooldown: 3.5, speed: 520, damage: 18 },
  },
  rival_croc: {
    key: 'rival_croc', name: 'Rival Croc', texture: 'croc', tint: 0xbcaaa4,
    size: [30, 40], speed: 50, chaseSpeed: 230, fleeSpeed: 230, sense: 300,
    behavior: 'rival', damage: 34, stamina: 2.5, accel: 3, hp: 110,
    leap: { min: 2, max: 4.5 }, windup: 0.4, chargeSpeed: 600, chargeTime: 0.3, chargeCooldown: 3.2,
  },
  hippo: {
    key: 'hippo', name: 'Hippo', texture: 'hippo',
    size: [74, 92], speed: 40, sense: 240,
    behavior: 'charge', damage: 60, accel: 2, hp: 360,
    windup: 0.55, chargeSpeed: 620, chargeTime: 0.5, chargeCooldown: 2.6,
    stalkSpeed: 60, stalkRange: 380,
    slam: { range: 1.8, radius: 2.2, windup: 0.7, damage: 40, cooldown: 3.5, knock: 600, shout: 'HRRUMPH!' },
  },

  // ------------------------------------------------ stage 5: continent
  plains_rabbit: {
    key: 'plains_rabbit', name: 'Rabbit', texture: 'rabbit', tint: 0xffe0b2,
    size: [11, 15], speed: 260, fleeSpeed: 250, sense: 200,
    behavior: 'wander', damage: 0, hopper: true, accel: 7,
  },
  plains_deer: {
    key: 'plains_deer', name: 'Deer', texture: 'deer',
    size: [30, 40], speed: 60, fleeSpeed: 310, sense: 320,
    behavior: 'wander', damage: 0, accel: 3, dnaValue: 60,
  },
  horse: {
    key: 'horse', name: 'Wild Horse', texture: 'horse',
    size: [40, 50], speed: 80, fleeSpeed: 340, sense: 360,
    behavior: 'wander', damage: 0, accel: 3, dnaValue: 80,
  },
  bison: {
    key: 'bison', name: 'Bison', texture: 'bison',
    size: [52, 66], speed: 35, sense: 220,
    behavior: 'charge', damage: 40, accel: 2, hp: 160, dnaValue: 120,
    windup: 0.6, chargeSpeed: 480, chargeTime: 0.5, chargeCooldown: 3,
  },
  hunter: {
    key: 'hunter', name: 'Human Hunter', texture: 'hunter',
    size: [14, 18], speed: 90, fleeSpeed: 190, sense: 520,
    behavior: 'ranged', damage: 0, accel: 5, dnaValue: 45, human: true,
    range: 330, shootCooldown: 2.4, projectileSpeed: 460, projectileDamage: 24,
  },
  lion: {
    key: 'lion', name: 'Lion', texture: 'lion',
    size: [46, 58], speed: 70, chaseSpeed: 320, fleeSpeed: 300, sense: 400,
    behavior: 'rival', damage: 38, stamina: 2.6, accel: 4, hp: 140,
    leap: { min: 2.5, max: 6 }, windup: 0.35, chargeSpeed: 700, chargeTime: 0.3, chargeCooldown: 2.6,
  },
  plains_bear: {
    key: 'plains_bear', name: 'Cave Bear', texture: 'bear', tint: 0xbcaaa4,
    size: [80, 98], speed: 45, sense: 280,
    behavior: 'charge', damage: 65, accel: 2, hp: 380,
    windup: 0.6, chargeSpeed: 600, chargeTime: 0.5, chargeCooldown: 2.4,
    stalkSpeed: 80, stalkRange: 460,
    slam: { range: 1.8, radius: 2.2, windup: 0.7, damage: 45, cooldown: 3.2, knock: 650, shout: 'SLAM!' },
  },
  rival_apex: {
    key: 'rival_apex', name: 'Rival Apex', texture: 'apex', tint: 0xef9a9a,
    size: [84, 104], speed: 60, chaseSpeed: 300, fleeSpeed: 300, sense: 480,
    behavior: 'rival', damage: 55, stamina: 4, accel: 3, hp: 520, dnaValue: 260,
    slam: { range: 2.2, radius: 2.8, windup: 0.8, damage: 30, cooldown: 4, knock: 500, slow: 2, shout: 'ROAR!' },
    leap: { min: 2.5, max: 5 }, windup: 0.45, chargeSpeed: 620, chargeTime: 0.4, chargeCooldown: 4,
  },
  // ------------------------------------------------ stage 5: ashlands (the Tyrant)
  lava_salamander: {
    key: 'lava_salamander', name: 'Lava Salamander', texture: 'lizard', tint: 0xff7043,
    size: [12, 18], speed: 60, fleeSpeed: 230, sense: 190,
    behavior: 'wander', damage: 0, erratic: 0.5, accel: 6,
  },
  duckbill: {
    key: 'duckbill', name: 'Duckbill', texture: 'duckbill',
    size: [38, 50], speed: 55, fleeSpeed: 300, sense: 330,
    behavior: 'wander', damage: 0, accel: 3, dnaValue: 85,
  },
  ash_grazer: {
    key: 'ash_grazer', name: 'Horned Grazer', texture: 'grazer',
    size: [54, 68], speed: 35, sense: 240,
    behavior: 'charge', damage: 42, accel: 2, hp: 180, dnaValue: 130,
    windup: 0.6, chargeSpeed: 500, chargeTime: 0.5, chargeCooldown: 3,
  },
  ash_vulture: {
    key: 'ash_vulture', name: 'Ash Vulture', texture: 'bird', tint: 0x6d5d55,
    size: [40, 50], speed: 120, sense: 360,
    behavior: 'charge', damage: 30, flying: true, accel: 2, hp: 130, keenNose: true,
    windup: 0.55, chargeSpeed: 620, chargeTime: 0.45, chargeCooldown: 2.4,
    // a carrion bite festers
    poison: { dps: 4, time: 4 },
  },
  rival_tyrant: {
    key: 'rival_tyrant', name: 'Rival Tyrant', texture: 'tyrant', tint: 0xb0bec5,
    size: [84, 104], speed: 55, chaseSpeed: 250, fleeSpeed: 260, sense: 400,
    behavior: 'rival', damage: 46, stamina: 2.4, accel: 3, hp: 500, dnaValue: 250,
    leap: { min: 2.5, max: 5 }, windup: 0.6, chargeSpeed: 600, chargeTime: 0.4, chargeCooldown: 4.5,
  },

  // ------------------------------------------------ stage 5 (hive line): outskirts
  field_mouse: {
    key: 'field_mouse', name: 'Field Mouse', texture: 'mouse', tint: 0xd7ccc8,
    size: [10, 15], speed: 60, fleeSpeed: 220, sense: 160,
    behavior: 'wander', damage: 0, erratic: 0.7, accel: 7,
  },
  sheep: {
    key: 'sheep', name: 'Sheep', texture: 'sheep',
    size: [36, 48], speed: 40, fleeSpeed: 250, sense: 260,
    behavior: 'wander', damage: 0, accel: 3, dnaValue: 80,
  },
  farm_cat: {
    key: 'farm_cat', name: 'Farm Cat', texture: 'cat',
    size: [40, 52], speed: 70, chaseSpeed: 300, fleeSpeed: 300, sense: 380,
    behavior: 'rival', damage: 32, stamina: 2.6, accel: 5, hp: 130,
    leap: { min: 2, max: 5 }, windup: 0.35, chargeSpeed: 680, chargeTime: 0.28, chargeCooldown: 2.8,
  },
  praying_mantis: {
    key: 'praying_mantis', name: 'Praying Mantis', texture: 'mantis',
    size: [56, 70], speed: 25, sense: 240,
    behavior: 'charge', damage: 48, accel: 3, hp: 260, dnaValue: 140,
    windup: 0.4, chargeSpeed: 720, chargeTime: 0.25, chargeCooldown: 2.4,
    stalkSpeed: 60, stalkRange: 380,
  },
  rival_general: {
    key: 'rival_general', name: 'Rival General', texture: 'general', tint: 0xef9a9a,
    size: [84, 104], speed: 60, chaseSpeed: 290, fleeSpeed: 290, sense: 460,
    behavior: 'rival', damage: 50, flying: true, stamina: 4, accel: 3, hp: 460, dnaValue: 240,
  },

  // ------------------------------------------------ stage 5 (flying line): thermal spires
  cliff_swallow: {
    key: 'cliff_swallow', name: 'Cliff Swallow', texture: 'swift', tint: 0xbcaaa4,
    size: [10, 15], speed: 80, fleeSpeed: 195, sense: 170,
    behavior: 'wander', damage: 0, flying: true, erratic: 0.5, accel: 4,
  },
  mountain_goat: {
    key: 'mountain_goat', name: 'Mountain Goat', texture: 'goat',
    size: [34, 46], speed: 60, fleeSpeed: 245, sense: 250,
    behavior: 'wander', damage: 0, hopper: true, accel: 4, dnaValue: 80,
  },
  condor: {
    key: 'condor', name: 'Condor', texture: 'bird', tint: 0x424242,
    size: [62, 78], speed: 130, sense: 470,
    behavior: 'charge', damage: 46, flying: true, accel: 2, hp: 300,
    windup: 0.65, chargeSpeed: 660, chargeTime: 0.55, chargeCooldown: 2.6,
    // a wing buffet that throws you back and slows you
    slam: { range: 2, radius: 2.6, windup: 0.8, damage: 18, cooldown: 4, knock: 700, slow: 1.5, shout: 'WHOOSH!' },
  },
  rival_roc: {
    key: 'rival_roc', name: 'Rival Roc', texture: 'roc', tint: 0xbcaaa4,
    size: [84, 104], speed: 70, chaseSpeed: 300, fleeSpeed: 300, sense: 480,
    behavior: 'rival', damage: 50, flying: true, stamina: 4, accel: 3, hp: 480, dnaValue: 250,
    leap: { min: 2.5, max: 6 }, windup: 0.4, chargeSpeed: 650, chargeTime: 0.35, chargeCooldown: 3.5,
  },

  // ------------------------------------------------ stage 6 (water line): twilight trench
  lanternfish: {
    key: 'lanternfish', name: 'Lanternfish', texture: 'fish', tint: 0x80deea,
    size: [10, 15], speed: 80, fleeSpeed: 250, sense: 190,
    behavior: 'wander', damage: 0, erratic: 0.4, accel: 5,
  },
  sunfish: {
    key: 'sunfish', name: 'Sunfish', texture: 'sunfish',
    size: [40, 54], speed: 30, fleeSpeed: 110, sense: 180,
    behavior: 'wander', damage: 0, accel: 2, dnaValue: 95,
  },
  gulper_eel: {
    key: 'gulper_eel', name: 'Gulper Eel', texture: 'snake', tint: 0x455a64,
    size: [44, 56], speed: 80, chaseSpeed: 280, sense: 320,
    behavior: 'chase', damage: 38, stamina: 2.6, accel: 4, hp: 180,
  },
  anglerfish: {
    key: 'anglerfish', name: 'Anglerfish', texture: 'anglerfish',
    size: [60, 76], speed: 20, sense: 260,
    behavior: 'charge', damage: 52, accel: 3, hp: 280, dnaValue: 150,
    windup: 0.35, chargeSpeed: 640, chargeTime: 0.3, chargeCooldown: 2.6,
    stalkSpeed: 40, stalkRange: 340,
  },
  colossal_squid: {
    key: 'colossal_squid', name: 'Colossal Squid', texture: 'squid', tint: 0x9575cd,
    size: [96, 116], speed: 40, sense: 280,
    behavior: 'charge', damage: 60, accel: 2, hp: 540, dnaValue: 270,
    windup: 0.7, chargeSpeed: 520, chargeTime: 0.5, chargeCooldown: 2.8,
    slam: { range: 2, radius: 2.6, windup: 0.8, damage: 35, cooldown: 4, knock: 550, slow: 2, shout: 'SPLOOSH!' },
  },
  rival_dreadjaw: {
    key: 'rival_dreadjaw', name: 'Rival Dreadjaw', texture: 'dreadjaw', tint: 0xb0bec5,
    size: [84, 104], speed: 70, chaseSpeed: 300, fleeSpeed: 300, sense: 460,
    behavior: 'rival', damage: 52, stamina: 4, accel: 3, hp: 500, dnaValue: 250, keenNose: true,
  },

  // ---- creatures that come back in later stages
  wild_lizard: {
    key: 'wild_lizard', name: 'Lizard', texture: 'lizard', tint: 0xc5e1a5,
    size: [18, 26], speed: 70, fleeSpeed: 230, sense: 200,
    behavior: 'wander', damage: 0, erratic: 0.6, accel: 6,
  },
  hunter_net: {
    key: 'hunter_net', name: 'Net Thrower', texture: 'hunter', tint: 0xb3e5fc,
    size: [14, 18], speed: 90, fleeSpeed: 190, sense: 480,
    behavior: 'ranged', damage: 0, accel: 5, dnaValue: 45, human: true,
    range: 280, shootCooldown: 3.4, projectileSpeed: 380, projectileDamage: 8, projectile: 'net',
  },
};
