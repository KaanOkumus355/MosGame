import { defaultStats, type PlayerStats } from '../state/stats';

export type TraitId =
  | 'speed' | 'size' | 'armor' | 'venom' | 'wings' | 'intelligence' | 'camo' | 'bloodlust' | 'magnet'
  | 'thorns' | 'eyes' | 'glutton' | 'nimble' | 'lucky' | 'secondwind' | 'silent' | 'pheromones' | 'jaw' | 'claws'
  | 'adrenaline' | 'quills' | 'shock' | 'tailwhip';
export type TraitRanks = Partial<Record<TraitId, number>>;

export interface TraitDef {
  id: TraitId;
  color: number;
  maxRank: number;
  /**
   * Name of the trait in each stage (index = stage). Traits carry forward and change form as
   * you evolve, e.g. the mosquito's venom becomes the apex beast's toxic breath.
   */
  forms: string[];
  /** Funny flavour text for the choice card. */
  blurb: string;
  /** What the trait does at the given rank in the given stage (shown on the card). */
  effect(rank: number, stage: number): string;
  /**
   * New behaviour unlocked on reaching this rank (not just bigger numbers), or null. Shown on the
   * card. The behaviour itself lives in the stage systems, keyed on GameState.rank().
   */
  unlock?(rank: number, stage: number): string | null;
  apply(stats: PlayerStats, rank: number): void;
}

// ---------------------------------------------------------------- ability tuning

export const venomStunTime = (rank: number) => 1.2 + 0.4 * rank;
/** While stunned, prey up to this fraction of your size counts as edible. */
export const venomEdibleRatio = (rank: number) => 1 + 0.1 * rank;
export const venomCooldown = (rank: number) => 4 - 0.5 * rank;
export const dashCooldown = (rank: number, nimbleRank = 0) => (3.1 - 0.5 * rank) * (nimbleRank >= 2 ? 0.7 : nimbleRank >= 1 ? 0.85 : 1);
export const swarmInterval = (rank: number) => (rank >= 2 ? 16 : 25);
export const breathDamage = (rank: number) => 18 * rank;
export const quillInterval = (rank: number) => 5 - rank;
export const quillCount = (rank: number) => 6 + 2 * rank;
export const quillDamage = (rank: number) => 6 * rank;
export const shockRadius = (rank: number) => 3 + rank;
export const shockStun = (rank: number) => 0.5 + 0.3 * rank;
export const WHIP_INTERVAL = 3;
export const whipRadius = (rank: number) => (rank >= 2 ? 2.8 : 2.2);
export const whipDamage = (rank: number) => 8 * rank;
/** Adrenaline's Last Stand goes off when you drop below this fraction of max health. */
export const ADRENALINE_THRESHOLD = 0.35;
/** Adrenaline: seconds of extra speed after you eat or dash. */
export const RUSH_TIME = 2;

/** Stage indexes where traits change how they work, not just their name. */
export const FANGS_STAGE = 3; // venom: bites stun
export const BREATH_STAGE = 4; // venom: spit becomes a toxic breath cone
export const POUNCE_STAGE = 3; // wings: dash bites deal double damage
export const CHARGE_STAGE = 4; // wings: dash ends in a shockwave

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const TRAITS: Record<TraitId, TraitDef> = {
  speed: {
    id: 'speed',
    color: 0xffd54f,
    maxRank: 3,
    forms: ['Twitchy Legs', 'Turbo Thorax', 'Sprinter Tail', 'Runner Legs', 'Thundering Gallop', 'Rapid Logistics'],
    blurb: 'Your legs now vibrate at frequencies previously reserved for blenders.',
    effect: (r) => `+${pct(0.12 * r)} movement speed`,
    unlock: (r) =>
      r === 1 ? 'Momentum: keep moving for 1.5s to go 20% faster (wind streaks)'
        : r === 2 ? 'Slipstream: at full speed, 20% of attacks miss you'
        : r === 3 ? 'Stampede: at full speed you bowl over and stun anything you run into' : null,
    apply: (s, r) => { s.speedMul += 0.12 * r; },
  },
  size: {
    id: 'size',
    color: 0xff9f43,
    maxRank: 3,
    forms: ['Big Boned', 'Chonk Gene', 'Thick Tail', 'Heavy Frame', 'Colossal Mass', 'Population Boom'],
    blurb: "It's not fat, it's evolutionary potential.",
    effect: (r) => `+${20 * r} max health, grow ${pct(0.1 * r)} faster`,
    unlock: (r) =>
      r === 1 ? 'Body Slam: bite twice as often when fighting'
        : r === 2 ? 'Intimidating: rivals smaller than you flee instead of fighting'
        : r === 3 ? 'Quake Step: while moving, every 4s you stun smaller creatures around you' : null,
    apply: (s, r) => {
      s.maxHp += 20 * r;
      s.growthMul += 0.1 * r;
    },
  },
  armor: {
    id: 'armor',
    color: 0x90a4ae,
    maxRank: 3,
    forms: ['Chitin Plating', 'Hardened Shell', 'Scaled Hide', 'Bony Plates', 'Living Fortress', 'Fortified Cities'],
    blurb: 'Frogs report a crunchy, deeply disappointing mouthfeel.',
    effect: (r) => `Take ${pct(0.12 * r)} less damage`,
    unlock: (r) =>
      r === 1 ? 'Immovable: hits no longer knock you back'
        : r === 2 ? 'Shell: a bubble blocks one hit every 15s'
        : r === 3 ? 'Quick Shell: the bubble returns every 8s' : null,
    apply: (s, r) => { s.armor += 0.12 * r; },
  },
  venom: {
    id: 'venom',
    color: 0x9b59ff,
    maxRank: 3,
    forms: ['Venomous Proboscis', 'Venom Spit', 'Venom Spit', 'Venom Fangs', 'Toxic Breath', 'Bioweapons'],
    blurb: 'Your saliva is now legally classified as a controlled substance.',
    effect: (r, stage) =>
      stage >= BREATH_STAGE
        ? `SPACE: Toxic Breath cone. Stuns everything in it ${venomStunTime(r).toFixed(1)}s and burns fighters for ${breathDamage(r)}`
        : `SPACE / right-click: spit venom. Stuns ${venomStunTime(r).toFixed(1)}s. Stunned foes up to ${pct(venomEdibleRatio(r))} your size are edible` +
          (stage >= FANGS_STAGE ? '. Your bites also stun' : ''),
    unlock: (r, stage) => {
      if (stage >= BREATH_STAGE) return r === 2 ? 'Wider, longer breath cone' : r === 3 ? 'Breath leaves a lingering toxic cloud' : null;
      return r === 2 ? 'Piercing: globs pass through up to 3 targets' : r === 3 ? 'Triple spit: fires 3 globs in a spread' : null;
    },
    apply: (s, r) => { s.venomRank = r; },
  },
  wings: {
    id: 'wings',
    color: 0x81d4fa,
    maxRank: 3,
    forms: ['Afterburner Wings', 'Afterburner Wings', 'Sprint Lunge', 'Pounce', 'Earthshaking Charge', 'Air Force'],
    blurb: 'Zero to rude in 0.2 seconds.',
    effect: (r, stage) =>
      `SHIFT: invulnerable dash (cooldown ${dashCooldown(r).toFixed(1)}s)` +
      (stage >= CHARGE_STAGE ? '. Landing sends out a stunning shockwave' : stage >= POUNCE_STAGE ? '. Bites during a pounce deal double damage' : ''),
    unlock: (r) => (r === 2 ? 'Double dash: store 2 charges' : r === 3 ? 'Dashing through creatures stuns them' : null),
    apply: (s, r) => { s.dashRank = r; },
  },
  intelligence: {
    id: 'intelligence',
    color: 0xf48fb1,
    maxRank: 3,
    forms: ['Tiny Brain Upgrade', 'Compound Brain', 'Lizard Logic', 'Pack Tactics', 'Strategic Mind', 'Global Network'],
    blurb: 'You can now count to four. Five on a good day.',
    effect: (r) => `+${pct(0.15 * r)} DNA from everything`,
    unlock: (r) =>
      r === 1 ? 'Rethink: a free reroll (R) on every evolution screen'
        : r === 2 ? 'Big Brain: one extra evolution card'
        : r === 3 ? 'Second Thoughts: two rerolls per evolution screen' : null,
    apply: (s, r) => {
      s.dnaMul += 0.15 * r;
      if (r >= 2) s.extraChoices += 1;
    },
  },
  camo: {
    id: 'camo',
    color: 0x66bb6a,
    maxRank: 3,
    forms: ['Swamp Camo', 'Mirror Wings', 'Chameleon Skin', 'Shadow Pelt', 'Unseen Titan', 'Propaganda'],
    blurb: "You look exactly like a small, unremarkable leaf. Predators hate this one trick.",
    effect: (r) => `Predators notice you ${pct(0.18 * r)} later`,
    unlock: (r) =>
      r === 1 ? 'Hide: stand still for 1s to vanish from predators'
        : r === 2 ? 'Vanish: getting hit makes you invisible for 2s'
        : r === 3 ? 'Ambush: bites and meals from hiding deal triple' : null,
    apply: (s, r) => { s.senseMul -= 0.18 * r; },
  },
  bloodlust: {
    id: 'bloodlust',
    color: 0xe53935,
    maxRank: 3,
    forms: ['Bloodlust', 'Feeding Frenzy', 'Cold-Blooded Hunger', 'Blood Frenzy', 'Insatiable Maw', 'Rally the Masses'],
    blurb: 'Snacking is self-care.',
    effect: (r) => `Heal ${3 * r} per meal, +${r} health regen`,
    unlock: (r) =>
      r === 1 ? 'Overheal: healing past full becomes a shield (up to 25% max health)'
        : r === 2 ? 'Lifesteal: bites heal 30% of their damage'
        : r === 3 ? 'Blood Rage: below half health, bites hit 50% harder, and healing and regen double' : null,
    apply: (s, r) => {
      s.healOnEat += 3 * r;
      s.regen += r;
    },
  },
  magnet: {
    id: 'magnet',
    color: 0xef5350,
    maxRank: 3,
    forms: ['Vacuum Proboscis', 'Mandible Reach', 'Sticky Tongue', 'Jaws of Reach', 'Gravitational Appetite', 'Cultural Pull'],
    blurb: 'Suck. Literally. Small prey drifts into your face against its will.',
    effect: (r) => `Pull small prey from ${(2.5 + 1.5 * r).toFixed(1)} body-lengths away`,
    unlock: (r) => (r === 2 ? 'Vortex: pulls 50% faster (swirling particles)' : r === 3 ? 'Also pulls carcasses and stunned foes' : null),
    apply: (s, r) => { s.magnetRange = 2.5 + 1.5 * r; },
  },
  thorns: {
    id: 'thorns',
    color: 0x9ccc65,
    maxRank: 3,
    forms: ['Toxic Blood', 'Acid Hemolymph', 'Poison Skin', 'Venom Quills', 'Plague Spines', 'Biohazard Zones'],
    blurb: 'Bite me and find out. Literally. Please bite me.',
    effect: (r) => `Anything that hits you is stunned for ${(0.8 * r + 0.4).toFixed(1)}s`,
    unlock: (r) => (r === 2 ? 'Burst: getting hit also stuns everything near you' : r === 3 ? 'Barbs: attackers take 30 damage' : null),
    apply: (s, r) => { s.thornsStun = 0.8 * r + 0.4; },
  },
  eyes: {
    id: 'eyes',
    color: 0x4dd0e1,
    maxRank: 3,
    forms: ['Compound Eyes', 'Panoramic Eyes', 'Third Eye', 'Eagle Sight', 'All-Seeing Gaze', 'Spy Satellites'],
    blurb: 'You can now see in 360 degrees, which is mostly just more things that want to eat you.',
    effect: (r) => `See ${Math.round(12 * r)}% more of the world`,
    unlock: (r) =>
      r === 1 ? 'Arrows point to predators off-screen'
        : r === 2 ? '...and to the juiciest prey'
        : r === 3 ? 'Weak Spots: +15% chance for bites to crit (double damage)' : null,
    apply: (s, r) => { s.viewMul = 1 + 0.12 * r; },
  },
  glutton: {
    id: 'glutton',
    color: 0xffb74d,
    maxRank: 3,
    forms: ['Glutton', 'Hunting Spree', 'Bug Buffet', 'Killing Spree', 'All-You-Can-Eat', 'Industrial Farming'],
    blurb: 'Why have one snack when you could have nine in a row?',
    effect: (r) => `Eat quickly in a row: +${5 * r}% DNA per combo step (max x10)`,
    unlock: (r) => (r === 2 ? 'Longer combo window' : r === 3 ? 'A x10 combo triggers a Feeding Frenzy: +30% speed for 4s' : null),
    apply: (s, r) => { s.comboRank = r; },
  },
  nimble: {
    id: 'nimble',
    color: 0xaed581,
    maxRank: 3,
    forms: ['Nimble Wings', 'Hover Control', 'Wall Grip', 'Agile Frame', 'Nimble Titan', 'Rapid Response'],
    blurb: 'Turning on a dime. Unfortunately you cannot afford dimes.',
    effect: (r) => `Accelerate and turn ${Math.round(40 * r)}% faster`,
    unlock: (r) =>
      r === 1 ? 'Sidestep: SHIFT hops a short way (a full dash if you have Wings), cooldown -15%'
        : r === 2 ? 'Quick Recovery: dash cooldown -30%'
        : r === 3 ? 'Decoy: every dash leaves an afterimage that predators chase' : null,
    apply: (s, r) => { s.accelMul = 1 + 0.4 * r; },
  },
  lucky: {
    id: 'lucky',
    color: 0x66bb6a,
    maxRank: 1,
    forms: ['Lucky Mutation', 'Lucky Mutation', 'Lucky Mutation', 'Lucky Mutation', 'Lucky Mutation', 'Lucky Mutation'],
    blurb: 'Your DNA found a four-leaf clover. Somewhere in the junk sequences.',
    effect: () => 'Evolution offers one extra choice',
    apply: (s) => { s.extraChoices += 1; },
  },
  secondwind: {
    id: 'secondwind',
    color: 0xef9a9a,
    maxRank: 2,
    forms: ['Spare Heart', 'Second Wind', 'Tail Drop', 'Playing Dead', 'Nine Lives', 'Backup Bunkers'],
    blurb: 'Death is more of a suggestion, really.',
    effect: (r) => `Survive ${r === 1 ? 'one deadly hit' : `${r} deadly hits`} per stage`,
    unlock: (r) => (r === 2 ? 'Rebirth Blast: surviving stuns everything around you' : null),
    apply: (s, r) => { s.secondWinds = r; },
  },
  silent: {
    id: 'silent',
    color: 0x9575cd,
    maxRank: 3,
    forms: ['Silent Buzz', 'Silent Wings', 'Soft Step', 'Silent Stalker', 'Ghost Titan', 'Sleeper Agents'],
    blurb: 'You have learned to buzz in a polite, inaudible way.',
    effect: (r) => `Prey notices you ${Math.round(20 * r)}% later`,
    unlock: (r) =>
      r === 1 ? 'Ambush: eating prey that never saw you coming gives +50% DNA'
        : r === 2 ? 'Startle: prey you sneak up on freezes for a moment'
        : r === 3 ? 'Perfect Ambush: unaware prey gives double DNA' : null,
    apply: (s, r) => { s.preySenseMul = 1 - 0.2 * r; },
  },
  pheromones: {
    id: 'pheromones',
    color: 0xf06292,
    maxRank: 3,
    forms: ['Irresistible Musk', 'Mating Dance', 'Pheromone Trail', 'Bait Scent', 'Aura of Snacks', 'Fast Food Chains'],
    blurb: 'You smell like a buffet. In a good way. For you.',
    effect: (r) => `${Math.round(10 * r)}% more prey around`,
    unlock: (r) =>
      r === 1 ? 'Swarm Call: a cluster of prey appears near you every 25s'
        : r === 2 ? 'Swarm calls come every 16s'
        : r === 3 ? 'Every swarm brings a golden snack (6x DNA)' : null,
    apply: (s, r) => { s.preyMul = 1 + 0.1 * r; },
  },
  claws: {
    id: 'claws',
    color: 0xeceff1,
    maxRank: 3,
    forms: ['Barbed Legs', 'Grasping Legs', 'Hooked Claws', 'Killing Claws', 'Titan Talons', 'Military Might'],
    blurb: 'Manicures are for the weak.',
    effect: (r) => `+${25 * r}% bite damage when fighting (any predator can be fought)`,
    unlock: (r) =>
      r === 1 ? 'Bleed: bitten creatures lose 4 health/s for 4s'
        : r === 2 ? 'Critical: 25% of bites deal double damage'
        : r === 3 ? 'Rend: bleeding stacks up to 3 times' : null,
    apply: (s, r) => { s.biteMul += 0.25 * r; },
  },
  jaw: {
    id: 'jaw',
    color: 0xffe082,
    maxRank: 3,
    forms: ['Stretchy Proboscis', 'Crushing Mandibles', 'Unhinged Jaw', 'Bone Crusher Jaws', 'Bottomless Maw', 'Hostile Takeovers'],
    blurb: 'Your mouth is now larger than your opinions.',
    effect: (r) => `Eat prey up to ${90 + 3 * r}% of your size (was 90%)`,
    unlock: (r) =>
      r === 1 ? 'Devour: eating a carcass heals 25% max health'
        : r === 2 ? 'Marrow: carcasses give 50% more DNA'
        : r === 3 ? 'Crushing Jaws: bites deal +30% to anything below half health' : null,
    apply: (s, r) => { s.edibleBonus = 0.03 * r; },
  },
  adrenaline: {
    id: 'adrenaline',
    color: 0xff7043,
    maxRank: 3,
    forms: ['Panic Buzz', 'Fight or Flight', 'Cold Sweat', 'Adrenaline Rush', 'Berserker Blood', 'State of Emergency'],
    blurb: 'Your heart has two settings: fast and faster.',
    effect: (r) => `Rush: after you eat or dash, +${15 * r}% speed for ${RUSH_TIME}s`,
    unlock: (r) =>
      r === 2 ? 'Second Breath: every kill takes 1s off your dash cooldown'
        : r === 3 ? `Last Stand: dropping below ${pct(ADRENALINE_THRESHOLD)} health stuns everything nearby (every 20s)` : null,
    apply: () => {},
  },
  quills: {
    id: 'quills',
    color: 0xbcaaa4,
    maxRank: 3,
    forms: ['Prickly Hairs', 'Barbed Wings', 'Spiky Scales', 'Quill Feathers', 'Spine Volley', 'Missile Silos'],
    blurb: 'Hugs are now strictly forbidden.',
    effect: (r) => `Every ${quillInterval(r)}s, shoot ${quillCount(r)} quills: they skewer small prey for you, hit fighters for ${quillDamage(r)} and stun the rest`,
    unlock: (r) => (r === 3 ? 'Piercing quills fly through everything in their path' : null),
    apply: () => {},
  },
  shock: {
    id: 'shock',
    color: 0xffee58,
    maxRank: 3,
    forms: ['Static Buzz', 'Charged Wings', 'Electric Skin', 'Shock Organ', 'Thunder Hide', 'Power Grid'],
    blurb: 'Your digestive system now doubles as a power plant.',
    effect: (r) => `Every meal releases a pulse: everything within ${shockRadius(r)} body-lengths is stunned ${shockStun(r).toFixed(1)}s (easy follow-up meals)`,
    unlock: (r) => (r === 3 ? 'Chain Lightning: pulses also deal 15 damage to fighters' : null),
    apply: () => {},
  },
  tailwhip: {
    id: 'tailwhip',
    color: 0xa1887f,
    maxRank: 3,
    forms: ['Wiggle Abdomen', 'Tail Flick', 'Tail Whip', 'Spiked Tail', 'Wrecking Tail', 'Iron Fist'],
    blurb: "It's not a tail, it's a lifestyle.",
    effect: (r) => `Every ${WHIP_INTERVAL}s, sweep around you: small prey is flicked into your mouth, fighters take ${whipDamage(r)}, the rest is knocked back`,
    unlock: (r) => (r === 2 ? 'Wider sweep' : r === 3 ? 'Concussive: the sweep stuns' : null),
    apply: () => {},
  },
};

export function computeStats(ranks: TraitRanks): PlayerStats {
  const s = defaultStats();
  for (const [id, rank] of Object.entries(ranks) as [TraitId, number][]) {
    if (rank > 0) TRAITS[id].apply(s, rank);
  }
  // bigger and toothier bodies bite harder
  s.biteMul += 0.1 * (ranks.size ?? 0) + 0.15 * (ranks.jaw ?? 0);
  s.armor = Math.min(s.armor, 0.8);
  s.senseMul = Math.max(s.senseMul, 0.3);
  return s;
}

/** Traits that can still be ranked up, shuffled. */
export function openTraits(ranks: TraitRanks): TraitId[] {
  const open = (Object.keys(TRAITS) as TraitId[]).filter((id) => (ranks[id] ?? 0) < TRAITS[id].maxRank);
  return shuffle(open);
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** What a trait is for, for the Bestiary's groups and filters. */
export type TraitRole = 'survival' | 'hunting' | 'mobility' | 'economy' | 'auto';

export const TRAIT_ROLES: { id: TraitRole; name: string; color: number; traits: TraitId[] }[] = [
  { id: 'survival', name: 'Survival', color: 0xef9a9a, traits: ['armor', 'size', 'bloodlust', 'secondwind', 'thorns'] },
  { id: 'hunting', name: 'Hunting', color: 0xffab40, traits: ['venom', 'claws', 'jaw', 'camo', 'silent', 'eyes'] },
  { id: 'mobility', name: 'Mobility', color: 0x81d4fa, traits: ['speed', 'wings', 'nimble', 'adrenaline'] },
  { id: 'economy', name: 'Economy', color: 0xd4ff7a, traits: ['intelligence', 'glutton', 'pheromones', 'magnet', 'lucky'] },
  { id: 'auto', name: 'Auto-attack', color: 0xce93d8, traits: ['quills', 'shock', 'tailwhip'] },
];

export const traitRole = (id: TraitId) => TRAIT_ROLES.find((r) => r.traits.includes(id))!;

const ROMAN = ['', '', ' II', ' III', ' IV'];

/**
 * Which of a trait's `forms` names each stage index uses. The names were written for six stages;
 * the Tyrant's stage (index 4) reuses the Raptor's, and its own traitForms rename the rest.
 */
const FORM_SLOT = [0, 1, 2, 3, 3, 4, 5];

/** `form` overrides the default name for this stage (branch forms rename some traits). */
export function traitName(id: TraitId, rank: number, stageIndex: number, form?: string): string {
  const t = TRAITS[id];
  const slot = FORM_SLOT[Math.min(stageIndex, FORM_SLOT.length - 1)];
  return `${form ?? t.forms[Math.min(slot, t.forms.length - 1)]}${ROMAN[rank] ?? ''}`;
}
