import type { TraitId } from '../data/traits';
import type { FusionId } from '../data/fusions';
import { BRANCH_STAGES, OVERLORDS, STAGES } from '../data/stages';
import { Achievements } from './Achievements';
import { creatureGroups } from '../data/creatureGroups';

/** Arena forms plus the overlords. */
export const FORM_COUNT = STAGES.length + BRANCH_STAGES.length + OVERLORDS.length;
export const COLLECTOR_COUNT = 30;

const STORAGE_KEY = 'swarm-to-sovereign-codex';

interface CodexData {
  /** Stage ids of forms you have discovered (reached, or a secret form's condition met). */
  forms: string[];
  /** Stage ids of forms you have actually played as. */
  became: string[];
  /** Creature keys you have eaten or defeated. */
  creatures: string[];
  /** Highest rank ever reached per trait. */
  ranks: Partial<Record<TraitId, number>>;
  fusions: FusionId[];
}

const empty = (): CodexData => ({ forms: [], became: [], creatures: [], ranks: {}, fusions: [] });

/**
 * Everything discovered across all runs (the Bestiary). Undiscovered forms, creatures, trait
 * ranks and fusions are shown as "???" until you find them once. Saved in localStorage.
 */
class CodexStore {
  private data: CodexData = this.load();

  hasForm(stageId: string): boolean {
    return this.data.forms.includes(stageId);
  }

  /** Returns true the first time. */
  discoverForm(stageId: string): boolean {
    if (this.hasForm(stageId)) return false;
    this.data.forms.push(stageId);
    this.save();
    return true;
  }

  /** You are this form now (also discovers it). */
  becomeForm(stageId: string): void {
    this.discoverForm(stageId);
    if (this.data.became.includes(stageId)) return;
    this.data.became.push(stageId);
    this.save();
    if (this.data.became.length >= FORM_COUNT) Achievements.unlock('all_forms');
  }

  /** You have played as this form at least once. */
  hasBecome(stageId: string): boolean {
    return this.data.became.includes(stageId);
  }

  hasCreature(key: string): boolean {
    return this.data.creatures.includes(key);
  }

  seeCreature(key: string): void {
    // zone bosses are giant versions of normal creatures, not entries of their own
    if (key.startsWith('boss_') || this.hasCreature(key)) return;
    this.data.creatures.push(key);
    this.save();
    const seen = this.creatureGroupsSeen;
    if (seen >= COLLECTOR_COUNT) Achievements.unlock('collector');
    if (seen >= creatureGroups().length) Achievements.unlock('encyclopaedia');
  }

  /** Bestiary entries discovered (creatures grouped by name, as the Bestiary lists them). */
  get creatureGroupsSeen(): number {
    return creatureGroups().filter((g) => g.keys.some((k) => this.hasCreature(k))).length;
  }

  /** Forms you have played as, out of FORM_COUNT. */
  get formsBecome(): number {
    return this.data.became.length;
  }

  /** Highest rank of this trait ever reached (0 = never picked). */
  rank(id: TraitId): number {
    return this.data.ranks[id] ?? 0;
  }

  seeRank(id: TraitId, rank: number): void {
    if (this.rank(id) >= rank) return;
    this.data.ranks[id] = rank;
    this.save();
  }

  hasFusion(id: FusionId): boolean {
    return this.data.fusions.includes(id);
  }

  seeFusion(id: FusionId): void {
    if (this.hasFusion(id)) return;
    this.data.fusions.push(id);
    this.save();
  }

  private load(): CodexData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...empty(), ...JSON.parse(raw) };
    } catch {
      // storage unavailable or corrupt: start fresh
    }
    return empty();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage unavailable: discoveries last for this session only
    }
  }
}

export const Codex = new CodexStore();
