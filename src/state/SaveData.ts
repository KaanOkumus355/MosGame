/**
 * Everything the game keeps lives in localStorage under one prefix. This exports it to a file,
 * imports it back, or wipes the progress part (keeping settings), from the Options screen.
 */
const PREFIX = 'swarm-to-sovereign-';
/** Progress, as opposed to preferences: what "Reset progress" clears. */
const PROGRESS_KEYS = ['codex', 'genes', 'achievements', 'history', 'run', 'tutorial'].map((k) => PREFIX + k);
const FILE_TAG = 'swarm-to-sovereign-save';

interface SaveFile {
  app: typeof FILE_TAG;
  version: 1;
  exported: string;
  data: Record<string, string>;
}

const ourKeys = (): string[] => Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));

export const SaveData = {
  /** Downloads every saved key as one JSON file. Returns false if storage can't be read. */
  export(): boolean {
    try {
      const data = Object.fromEntries(ourKeys().map((k) => [k, localStorage.getItem(k) ?? '']));
      const file: SaveFile = { app: FILE_TAG, version: 1, exported: new Date().toISOString(), data };
      const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `swarm-to-sovereign-save-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Asks for a save file and, if it is one of ours, replaces everything with it and reloads.
   * `done` reports a problem (the page reloads on success).
   */
  import(done: (error: string) => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      f.text()
        .then((text) => {
          const file = JSON.parse(text) as Partial<SaveFile>;
          if (file.app !== FILE_TAG || !file.data || typeof file.data !== 'object') return done("That file isn't a Swarm to Sovereign save.");
          const entries = Object.entries(file.data).filter(([k, v]) => k.startsWith(PREFIX) && typeof v === 'string');
          if (!entries.length) return done('That save file is empty.');
          for (const k of ourKeys()) localStorage.removeItem(k);
          for (const [k, v] of entries) localStorage.setItem(k, v);
          location.reload();
        })
        .catch(() => done("That file couldn't be read."));
    };
    input.click();
  },

  /** Wipes the Bestiary, Gene Bank, achievements, records, saved run and tips; keeps settings. Reloads. */
  resetProgress(): void {
    for (const k of PROGRESS_KEYS) localStorage.removeItem(k);
    location.reload();
  },
};
