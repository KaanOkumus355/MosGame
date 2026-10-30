import { STAGES, stageById } from '../data/stages';
import { DIFFICULTIES } from '../data/difficulty';
import { GameState, type RunSnapshot } from './GameState';

const STORAGE_KEY = 'swarm-to-sovereign-run';
/**
 * Bump when RunSnapshot changes shape; older saves are then dropped instead of half-loaded.
 * 2: the run grew from 6 stages to 7, so stage indexes from 1 no longer line up.
 */
const VERSION = 2;

interface SaveFile {
  v: number;
  run: RunSnapshot;
  /** The form you were, for the menu's Continue button. */
  form: string;
}

/** What the menu shows about a saved run. */
export interface SaveInfo {
  form: string;
  stage: number;
  difficulty: string;
  time: number;
}

/** The scene a stage index plays in: an arena, or the finale your form line leads to. */
export function sceneForStage(index: number): string {
  if (index < STAGES.length) return 'Stage';
  return ({ sky: 'Sky', abyss: 'Deep', queen: 'Hive' } as Record<string, string>)[GameState.stageDef(index).id] ?? 'WorldMap';
}

/**
 * The mid-run save: a checkpoint taken as each stage or finale starts. Continuing replays that
 * stage from its start with everything you had going into it. Cleared when the run ends.
 */
export const RunSave = {
  checkpoint(): void {
    try {
      const file: SaveFile = { v: VERSION, run: GameState.snapshot(), form: GameState.stageDef().creatureName };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    } catch {
      // storage full or blocked: the run just isn't resumable
    }
  },

  /**
   * A run saved by an older version of the game that can't be continued. Clears it, so the menu
   * explains this once. Only the run is lost: the Bestiary, Gene Bank and achievements are separate.
   */
  takeOutdated(): boolean {
    try {
      const file = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SaveFile | null;
      if (!file || file.v === VERSION) return false;
      this.clear();
      return true;
    } catch {
      return false;
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clear
    }
  },

  /** Summary of the saved run for the menu, or null if there is none. */
  info(): SaveInfo | null {
    const file = this.read();
    if (!file) return null;
    const r = file.run;
    return { form: file.form, stage: r.stageIndex, difficulty: DIFFICULTIES[r.difficulty].name, time: r.timeAlive };
  },

  /** The saved run, if there is a usable one. */
  peek(): RunSnapshot | null {
    return this.read()?.run ?? null;
  },

  read(): SaveFile | null {
    try {
      const file = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SaveFile | null;
      if (!file || file.v !== VERSION || !file.run) return null;
      const r = file.run;
      const valid =
        Number.isInteger(r.stageIndex) &&
        r.stageIndex >= 0 &&
        r.stageIndex <= STAGES.length &&
        r.difficulty in DIFFICULTIES &&
        Object.values(r.forms).every((id) => !!stageById(id));
      return valid ? file : null;
    } catch {
      return null;
    }
  },

  /** Loads the saved run into GameState and returns the scene to start, or null if there is none. */
  resume(): string | null {
    const run = this.peek();
    if (!run) {
      this.clear();
      return null;
    }
    GameState.restore(run);
    return sceneForStage(GameState.stageIndex);
  },
};
