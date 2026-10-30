const STORAGE_KEY = 'swarm-to-sovereign-achievements';

/** Groups for the Bestiary, each with its own badge. */
export type AchievementCategory = 'ending' | 'evolution' | 'combat' | 'appetite' | 'collection' | 'challenge';

export const CATEGORIES: { id: AchievementCategory; name: string; color: number }[] = [
  { id: 'ending', name: 'Endings', color: 0xffd54f },
  { id: 'evolution', name: 'Evolution', color: 0x64ffda },
  { id: 'combat', name: 'Combat', color: 0xff8a65 },
  { id: 'appetite', name: 'Appetite', color: 0x9dff6a },
  { id: 'collection', name: 'Collection', color: 0x8be9fd },
  { id: 'challenge', name: 'Challenges', color: 0xff5252 },
];

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  /** Hidden in the Bestiary (name and description show as ???) until unlocked. */
  secret?: boolean;
}

/** Reaching any ending faster than this unlocks Fast Food Chain (seconds). */
export const SPEEDRUN_TIME = 15 * 60;
/** Bone-Crush Bite kills in one run for Bone Collector, and Blood Scent kills for Blood in the Water. */
export const CRUSH_KILLS = 10;
export const SCENT_KILLS = 5;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'normal_ending', category: 'ending', name: 'Hive Mind', description: 'Reach the Normal Ending: conquer the world as the Overlord.' },
  { id: 'aerial_ending', category: 'ending', name: 'Lord of the Skies', description: 'Reach the Aerial Ending: darken every sky as the Storm Sovereign.', secret: true },
  { id: 'abyssal_ending', category: 'ending', name: 'Lord of the Deep', description: 'Reach the Abyssal Ending: drown every human city as the Leviathan.', secret: true },
  { id: 'hive_ending', category: 'ending', name: 'Long Live the Queen', description: 'Reach the Hive Ending: take every city with your swarm.', secret: true },
  { id: 'secret_wasp', category: 'evolution', name: 'Royal Jelly', description: 'Discover the Wasp.', secret: true },
  { id: 'secret_swift', category: 'evolution', name: 'Hollow Bones', description: 'Discover the Swift.', secret: true },
  { id: 'secret_croc', category: 'evolution', name: 'Cold Blooded', description: 'Discover the Crocodile.', secret: true },
  { id: 'all_forms', category: 'evolution', name: 'Every Shape', description: 'Become every form at least once.' },
  { id: 'first_fusion', category: 'evolution', name: 'Fusion Cuisine', description: 'Make your first fusion.' },
  { id: 'three_fusions', category: 'evolution', name: 'Mad Scientist', description: 'Make 3 fusions in one run.' },
  { id: 'maxed', category: 'evolution', name: 'Fully Evolved', description: 'Raise any trait to rank III.' },
  { id: 'boss_slayer', category: 'combat', name: 'Peak Predator', description: 'Defeat a zone boss.' },
  { id: 'boss_hunter', category: 'combat', name: 'Trophy Room', description: 'Defeat 3 zone bosses in one run.' },
  { id: 'clean_sweep', category: 'combat', name: 'Clean Sweep', description: 'Defeat every zone boss in a single run.' },
  { id: 'big_game', category: 'combat', name: 'Big Game', description: 'Defeat Old Thunderhoof, the Mantis Matriarch, the Condor Matriarch or the Pale Hunter.' },
  { id: 'giant_slayer', category: 'combat', name: 'Giant Slayer', description: 'Defeat something at least twice your size.' },
  { id: 'bone_collector', category: 'combat', name: 'Bone Collector', description: `Kill ${CRUSH_KILLS} things with Bone-Crush Bite in one run.` },
  { id: 'air_mail', category: 'combat', name: 'Air Mail', description: 'As a Roc, drop something you carried off onto another creature.' },
  { id: 'chain_of_command', category: 'combat', name: 'Chain of Command', description: 'Let your Rally drones finish off something bigger than you.' },
  { id: 'blood_in_water', category: 'combat', name: 'Blood in the Water', description: `Make ${SCENT_KILLS} kills during a single Blood Scent.` },
  { id: 'big_mouth', category: 'appetite', name: 'Eyes Bigger Than Stomach', description: 'Eat something bigger than you.' },
  { id: 'combo', category: 'appetite', name: 'Combo Chomper', description: 'Reach a x10 eating combo.' },
  { id: 'hungry', category: 'appetite', name: 'Bottomless', description: 'Eat 500 things in one run.' },
  { id: 'revenge', category: 'appetite', name: 'Served Cold', description: 'Eat a Frog after you stop being a Mosquito.' },
  { id: 'collector', category: 'collection', name: 'Naturalist', description: 'Discover 30 creatures in the Bestiary.' },
  { id: 'encyclopaedia', category: 'collection', name: 'Encyclopaedia', description: 'Discover every creature in the Bestiary.' },
  { id: 'hard_win', category: 'challenge', name: 'Natural Selection', description: 'Reach any ending on Hard.' },
  { id: 'speedrun', category: 'challenge', name: 'Fast Food Chain', description: `Reach any ending in under ${SPEEDRUN_TIME / 60} minutes.` },
  { id: 'glass_win', category: 'challenge', name: 'Handle With Care', description: 'Reach any ending with the Glass Body mutator on.' },
  { id: 'senses_win', category: 'challenge', name: 'Saw It Coming', description: 'Reach any ending with the Sharp Senses mutator on.' },
  { id: 'famine_win', category: 'challenge', name: 'Lean Times', description: 'Reach any ending with the Famine mutator on.' },
  { id: 'all_mutators', category: 'challenge', name: 'Against All Odds', description: 'Reach any ending with all three mutators on.' },
  { id: 'nightmare_win', category: 'challenge', name: 'Sweet Dreams', description: 'Reach any ending on Nightmare.' },
  { id: 'nightmare_all', category: 'challenge', name: 'Insomniac', description: 'Reach all four endings on Nightmare.' },
  { id: 'nightmare_nowind', category: 'challenge', name: 'Sleepwalker', description: 'Reach any ending on Nightmare without a Second Wind saving you.' },
  { id: 'nightmare_mutators', category: 'challenge', name: 'Waking Nightmare', description: 'Reach any ending on Nightmare with all three mutators on.' },
  { id: 'brought_low', category: 'challenge', name: 'Brought Low', description: 'Get killed by something smaller than you.', secret: true },
];

/** Unlocked achievements (saved), plus a queue of fresh unlocks for the banner to announce. */
class AchievementStore {
  private unlocked: string[] = this.load();
  private queue: string[] = [];
  /** How many were unlocked when the current run started (see thisRun). */
  private runMark = this.unlocked.length;

  has(id: string): boolean {
    return this.unlocked.includes(id);
  }

  get count(): number {
    return this.unlocked.length;
  }

  /** Unlocks (once) and queues a banner. */
  unlock(id: string): void {
    if (this.has(id) || !ACHIEVEMENTS.some((a) => a.id === id)) return;
    this.unlocked.push(id);
    this.queue.push(id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.unlocked));
    } catch {
      // storage unavailable: lasts for this session only
    }
  }

  /** A run is starting: later unlocks count as this run's (for the end screens). */
  markRun(): void {
    this.runMark = this.unlocked.length;
  }

  /** Achievements unlocked since the current run started, oldest first. */
  thisRun(): AchievementDef[] {
    return this.unlocked.slice(this.runMark).map((id) => ACHIEVEMENTS.find((a) => a.id === id)!).filter(Boolean);
  }

  /** Next achievement waiting to be announced, if any. */
  takeQueued(): AchievementDef | null {
    const id = this.queue.shift();
    return id ? ACHIEVEMENTS.find((a) => a.id === id) ?? null : null;
  }

  private load(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // storage unavailable or corrupt
    }
    return [];
  }
}

export const Achievements = new AchievementStore();
