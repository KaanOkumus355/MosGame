import type { TraitId } from './traits';

/**
 * Every creature form has one thing only it can do. Active signatures use the E key; the
 * mosquito's blood drinking is passive. Behaviour lives in the stage's ability system.
 */
export type SignatureId =
  | 'drink' | 'snatch' | 'tongue' | 'dive' | 'pack' | 'roll' | 'lift' | 'frenzy' | 'storm' | 'wave'
  | 'sting' | 'brood' | 'swarmcloud' | 'royal'
  | 'crush' | 'carry' | 'rally' | 'scent'
  | 'command' | 'skycommand' | 'deepcommand' | 'queencommand';

export interface SignatureDef {
  id: SignatureId;
  name: string;
  /** null = passive, no key. */
  key: 'E' | null;
  cooldown: number;
  /** Seconds each kill takes off the cooldown: long signatures charge up as you hunt. */
  killCharge?: number;
  icon: string;
  description: string;
  /** One-line version for the stage-start message. */
  short: string;
}

export const SIGNATURES: Record<SignatureId, SignatureDef> = {
  drink: {
    id: 'drink', name: 'Blood Drinker', key: null, cooldown: 0, icon: 'sig_drink',
    description: 'Land on pink-ringed animals to drink their blood. They will try to swat you.',
    short: 'land on pink-ringed animals to drink blood',
  },
  snatch: {
    id: 'snatch', name: 'Snatch', key: 'E', cooldown: 4, icon: 'sig_snatch',
    description: 'Zip to the nearest prey within reach and grab it out of the air.',
    short: 'zip to nearby prey and grab it',
  },
  tongue: {
    id: 'tongue', name: 'Tongue Lash', key: 'E', cooldown: 2.2, icon: 'sig_tongue',
    description: 'Lash your tongue (aims at the mouse): reels prey into your mouth, slaps predators silly. ' +
      'Passive Tail Drop: every 25s, a hit drops your tail instead and predators chase it.',
    short: 'lash prey into your mouth; your tail drops off to save you',
  },
  dive: {
    id: 'dive', name: 'Dive Bomb', key: 'E', cooldown: 9, icon: 'sig_dive',
    description: 'Climb out of reach for a moment (you can steer up there), then slam down: everything small under you is eaten, ' +
      'everything else is stunned and fighters take damage. Passive Aerial: your dash goes 50% farther.',
    short: 'climb out of reach, then slam down and eat everything below',
  },
  pack: {
    id: 'pack', name: 'Pack Call', key: 'E', cooldown: 25, killCharge: 1.5, icon: 'sig_pack',
    description: 'Shriek for 3 raptor packmates who hunt and fight alongside you for 14s. Every kill recharges it 1.5s faster.',
    short: 'summon 3 raptor packmates',
  },
  roll: {
    id: 'roll', name: 'Death Roll', key: 'E', cooldown: 6, icon: 'sig_roll',
    description: 'Clamp onto something next to you (up to 160% of your size) and spin. Animals without health are swallowed whole, ' +
      'fighters lose a third of their health. Nothing can hurt you mid-roll. Passive Submerge: in water nothing can see you and you swim 40% faster. Thirsty animals come to the water to drink.',
    short: 'grab and spin anything next to you; hide and swim fast in water',
  },
  lift: {
    id: 'lift', name: 'Talon Lift', key: 'E', cooldown: 6, icon: 'sig_lift',
    description: 'Grab the closest thing in reach (up to 130% of your size) and carry it into the sky; you can steer and nothing can touch you. ' +
      'Then drop it: animals without health are eaten, fighters take 40% of their health in fall damage, and everything where it lands is stunned. Passive Aerial: your dash goes 50% farther.',
    short: 'carry something up, then drop it on its friends',
  },
  storm: {
    id: 'storm', name: 'Thunderclap', key: 'E', cooldown: 15, killCharge: 1, icon: 'sig_storm',
    description: 'Lightning strikes the 4 nearest creatures: small ones are cooked and collected, the rest are stunned and fighters take heavy damage. Every kill recharges it 1s faster. Passive Aerial: your dash goes 50% farther.',
    short: 'lightning strikes the 4 nearest creatures',
  },
  wave: {
    id: 'wave', name: 'Tidal Wave', key: 'E', cooldown: 10, icon: 'sig_wave',
    description: 'A wave rolls out ahead of you: small prey is swept into your mouth, everything else is stunned and shoved away, and fighters take damage. ' +
      'Passive Submerge: in kelp forests nothing can see you and you swim 40% faster.',
    short: 'a wave sweeps prey into your mouth and shoves the rest away',
  },
  sting: {
    id: 'sting', name: 'Paralyzing Sting', key: 'E', cooldown: 4, icon: 'sig_sting',
    description: 'Lunge forward and sting the first thing you hit: it takes damage and is paralyzed for 2.5s. Paralyzed prey up to 150% of your size can be eaten. Passive Aerial: your dash goes 50% farther.',
    short: 'lunge and paralyze; paralyzed prey up to 150% your size is edible',
  },
  brood: {
    id: 'brood', name: 'Brood Call', key: 'E', cooldown: 20, killCharge: 1.2, icon: 'sig_brood',
    description: 'Four drones hatch around you and hunt for 14s: they share their kills with you and sting fighters. Every kill recharges it 1.2s faster. Passive Aerial: your dash goes 50% farther.',
    short: 'four drones hatch and hunt with you',
  },
  swarmcloud: {
    id: 'swarmcloud', name: 'Swarm Cloud', key: 'E', cooldown: 14, icon: 'sig_swarmcloud',
    description: 'For 5s a cloud of stinging sisters surrounds you: fighters inside take damage, everything else is stunned and small prey is dragged into your mouth. Passive Aerial: your dash goes 50% farther.',
    short: 'a stinging cloud that hurts fighters and drags prey to you',
  },
  royal: {
    id: 'royal', name: 'Royal Brood', key: 'E', cooldown: 24, killCharge: 1.5, icon: 'sig_royal',
    description: 'Six soldier drones hatch and fight for you for 20s. Every kill recharges it 1.5s faster. Passive Aerial: your dash goes 50% farther.',
    short: 'six soldier drones fight for you',
  },
  frenzy: {
    id: 'frenzy', name: 'Apex Frenzy', key: 'E', cooldown: 35, killCharge: 2, icon: 'sig_frenzy',
    description: 'For 6s, eat anything up to 135% of your size and move 30% faster. Every kill recharges it 2s faster.',
    short: 'eat anything up to 135% of your size for 6s',
  },
  crush: {
    id: 'crush', name: 'Bone-Crush Bite', key: 'E', cooldown: 6, icon: 'sig_crush',
    description: 'Lunge and bite the first thing you hit: anything up to your size dies in one crunch and is swallowed, anything bigger is stunned for 2s and loses a chunk of health.',
    short: 'a lunging bite that kills anything up to your size',
  },
  carry: {
    id: 'carry', name: 'Carry Off', key: 'E', cooldown: 9, icon: 'sig_carry',
    description: 'Grab something in reach (up to 180% of your size) and take off for 2s: nothing can touch you, and you scoop up two more as you fly past, each one slowing you. ' +
      'Press again to let go early. Animals without health die, fighters lose 45% of their health, and each one hits whatever it lands on. Passive Aerial: your dash goes 50% farther. Passive Heavy: nothing can knock you back.',
    short: 'scoop up three creatures and bomb them onto whatever is below',
  },
  rally: {
    id: 'rally', name: 'Rally', key: 'E', cooldown: 16, icon: 'sig_rally',
    description: 'Four soldier drones hatch and attack whatever you aim at (the creature nearest your mouse) for 9s, then anything nearby. Passive Aerial: your dash goes 50% farther.',
    short: 'four drones attack whatever you aim at',
  },
  scent: {
    id: 'scent', name: 'Blood Scent', key: 'E', cooldown: 16, icon: 'sig_scent',
    description: 'For 8s you smell every wounded creature and carcass on the map: they are marked, you swim 40% faster while heading for one, and your bites on them deal 50% more. ' +
      'Passive Submerge: in kelp forests nothing can see you and you swim 40% faster.',
    short: 'smell every wounded creature and rush in for the kill',
  },
  skycommand: {
    id: 'skycommand', name: 'Storm Command', key: null, cooldown: 0, icon: 'sig_storm',
    description: 'Sweep your storm across the world. Every sky you darken is yours. SPACE calls down lightning on jets and flak.',
    short: 'darken every sky on Earth',
  },
  deepcommand: {
    id: 'deepcommand', name: 'Rising Tide', key: null, cooldown: 0, icon: 'sig_wave',
    description: "Swim the world's oceans. Hold SPACE to raise a tidal wave and drown human cities; ram warships with SHIFT.",
    short: 'drown every human city',
  },
  queencommand: {
    id: 'queencommand', name: 'Swarm Command', key: null, cooldown: 0, icon: 'sig_royal',
    description: 'Lay eggs at your hive (SPACE), steer your swarm with the mouse or WASD and overwhelm every human city.',
    short: 'raise the swarm and take every city',
  },
  command: {
    id: 'command', name: 'Hive Command', key: null, cooldown: 0, icon: 'sig_command',
    description: 'Command your swarm across the world map. Conquer or convert every region before humanity strikes back.',
    short: 'conquer the world',
  },
};

/**
 * A trait at rank III that upgrades a signature: the new forms reward a build that fits them.
 * Shown on that trait's evolution card while you are the form, and in the Bestiary.
 */
export const SIGNATURE_UPGRADES: Partial<Record<SignatureId, { trait: TraitId; text: string }>> = {
  crush: { trait: 'venom', text: 'Bone-Crush Bite also poisons anything it does not kill (8 damage a second for 4s)' },
  carry: { trait: 'wings', text: 'Carry Off flies 40% faster and recharges 2s sooner' },
  rally: { trait: 'pheromones', text: 'Rally hatches a fifth drone' },
  scent: { trait: 'eyes', text: 'Blood Scent lasts 50% longer' },
};

/** True when your current trait ranks power up this signature. */
export const signatureUpgraded = (id: SignatureId, rank: (t: TraitId) => number): boolean => {
  const up = SIGNATURE_UPGRADES[id];
  return !!up && rank(up.trait) >= 3;
};

export const TAIL_DROP_COOLDOWN = 25;
export const PACK_DURATION = 14;
export const FRENZY_DURATION = 6;
/** Tidal Wave reach (body radii) and half-angle (radians). */
export const STING_TIME = 0.3;
export const PARALYZE_TIME = 2.5;
/** Paralyzed prey this much bigger than you can still be eaten. */
export const PARALYZE_EDIBLE = 1.5;
export const SWARM_CLOUD_TIME = 5;
export const WAVE_LENGTH = 6;
export const WAVE_HALF = 0.55;
export const LIFT_TIME = 1.3;
export const LIFT_MAX_RATIO = 1.3;
export const LIFT_HP_SHARE = 0.4;
export const STORM_TARGETS = 4;
export const DIVE_TIME = 0.9;
/** Dive Bomb blast radius in body radii, and damage to fighters (scaled by biteMul). */
export const DIVE_RADIUS = 2.5;
export const DIVE_DAMAGE = 25;
/** Swift: dash length multiplier. */
export const AERIAL_DASH = 1.5;
export const ROLL_TIME = 0.9;
/** Biggest thing you can Death Roll, relative to your size. */
export const ROLL_MAX_RATIO = 1.6;
/** Share of a fighter's max health one Death Roll takes (at least ROLL_MIN_DAMAGE). */
export const ROLL_HP_SHARE = 0.35;
export const ROLL_MIN_DAMAGE = 30;
export const SUBMERGE_SPEED = 1.4;
/** Bone-Crush Bite: lunge time, and the share of health anything too big to kill loses. */
export const CRUSH_TIME = 0.3;
export const CRUSH_HP_SHARE = 0.2;
/** Carry Off: a longer flight that hoards bigger prey, each landing hurting what is below. */
export const CARRY_MAX_RATIO = 1.8;
export const CARRY_MAX_PREY = 3;
export const CARRY_TIME = 2;
/** You can't let go before this, so a double tap doesn't waste the flight. */
export const CARRY_MIN_HOLD = 0.25;
/** Speed lost per creature held. */
export const CARRY_DRAG = 0.1;
export const CARRY_HP_SHARE = 0.45;
/** Share of health a landing takes from each fighter it hits. */
export const CARRY_SPLASH_SHARE = 0.1;
export const RALLY_DRONES = 4;
export const RALLY_TIME = 9;
export const SCENT_TIME = 8;
export const SCENT_SPEED = 1.4;
export const SCENT_BITE = 1.5;
