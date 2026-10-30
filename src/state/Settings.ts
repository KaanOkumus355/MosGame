const STORAGE_KEY = 'swarm-to-sovereign-settings';

/** Rebindable actions. Arrow keys always move too, and ESC / P always pause. */
export type Action = 'up' | 'down' | 'left' | 'right' | 'primary' | 'dash' | 'signature';

export const ACTIONS: { id: Action; name: string }[] = [
  { id: 'up', name: 'Move up' },
  { id: 'down', name: 'Move down' },
  { id: 'left', name: 'Move left' },
  { id: 'right', name: 'Move right' },
  { id: 'primary', name: 'Venom / main power' },
  { id: 'dash', name: 'Dash' },
  { id: 'signature', name: 'Signature ability' },
];

/** Phaser key names (Phaser.Input.Keyboard.KeyCodes). */
export const DEFAULT_BINDINGS: Record<Action, string> = {
  up: 'W',
  down: 'S',
  left: 'A',
  right: 'D',
  primary: 'SPACE',
  dash: 'SHIFT',
  signature: 'E',
};

/** Keys that keep a fixed job and can't be bound. */
export const RESERVED_KEYS = ['ESC', 'P', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

/** Ring colours for the normal and colour-blind palettes (Okabe–Ito: blue / vermillion / yellow). */
export const PALETTES = {
  normal: { edible: 0x9dff6a, danger: 0xff4040, fight: 0xffa726, host: 0xff77b0 },
  colorBlind: { edible: 0x56b4e9, danger: 0xd55e00, fight: 0xf0e442, host: 0xcc79a7 },
};

/** Comfort toggles: effects some players find uncomfortable. All on by default. */
export type ComfortId = 'shake' | 'hitStop' | 'flashes';

export const COMFORT: { id: ComfortId; name: string; blurb: string }[] = [
  { id: 'shake', name: 'Screen shake', blurb: 'Hits, roars and quakes' },
  { id: 'hitStop', name: 'Hit-stop & slow motion', blurb: 'Big-hit freezes, boss-kill slow-mo' },
  { id: 'flashes', name: 'Screen flashes', blurb: 'Lightning, evolving, Second Wind' },
];

/** On/off preferences beyond comfort. */
export type FlagId = 'showNumbers' | 'mouseMove' | 'pauseOnBlur' | 'reducedParticles';

export const FLAGS: { id: FlagId; name: string; blurb: string; on: boolean }[] = [
  { id: 'showNumbers', name: 'Damage numbers', blurb: 'The numbers that pop up when things get hurt', on: true },
  { id: 'mouseMove', name: 'Hold mouse to move', blurb: 'Off: the mouse only aims, it never moves you', on: true },
  { id: 'pauseOnBlur', name: 'Pause when the window loses focus', blurb: 'Click away or switch windows and the game waits', on: true },
  { id: 'reducedParticles', name: 'Fewer particles', blurb: 'Smaller bursts and less drifting dust, for slower machines', on: false },
];

/** HUD scales to choose from (1 = as designed). */
export const HUD_SCALES = [0.9, 1, 1.15, 1.3];

interface SettingsData {
  bindings: Record<Action, string>;
  colorBlind: boolean;
  comfort: Record<ComfortId, boolean>;
  flags: Record<FlagId, boolean>;
  hudScale: number;
}

/** Player options that aren't sound (Sfx keeps its own volumes). Saved in localStorage. */
class SettingsStore {
  private data: SettingsData = this.load();
  private listeners: (() => void)[] = [];

  key(action: Action): string {
    return this.data.bindings[action];
  }

  /** Binds a key; if another action had it, the two swap. */
  bind(action: Action, key: string): void {
    const other = ACTIONS.find((a) => a.id !== action && this.data.bindings[a.id] === key);
    if (other) this.data.bindings[other.id] = this.data.bindings[action];
    this.data.bindings[action] = key;
    this.save();
  }

  resetBindings(): void {
    this.data.bindings = { ...DEFAULT_BINDINGS };
    this.save();
  }

  /** Whether a comfort effect is on. */
  effect(id: ComfortId): boolean {
    return this.data.comfort[id];
  }

  setEffect(id: ComfortId, on: boolean): void {
    this.data.comfort[id] = on;
    this.save();
  }

  flag(id: FlagId): boolean {
    return this.data.flags[id];
  }

  setFlag(id: FlagId, on: boolean): void {
    this.data.flags[id] = on;
    this.save();
  }

  /** Size of the in-game HUD (HUD_SCALES); applies from the next stage. */
  get hudScale(): number {
    return this.data.hudScale;
  }

  set hudScale(v: number) {
    this.data.hudScale = v;
    this.save();
  }

  get colorBlind(): boolean {
    return this.data.colorBlind;
  }

  set colorBlind(on: boolean) {
    this.data.colorBlind = on;
    this.save();
  }

  /** Called after any change (used to repaint the indicator colours). */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
    fn();
  }

  private load(): SettingsData {
    const flags = Object.fromEntries(FLAGS.map((f) => [f.id, f.on])) as Record<FlagId, boolean>;
    const base: SettingsData = { bindings: { ...DEFAULT_BINDINGS }, colorBlind: false, comfort: { shake: true, hitStop: true, flashes: true }, flags, hudScale: 1 };
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SettingsData>;
      return {
        ...base,
        ...raw,
        bindings: { ...base.bindings, ...(raw.bindings ?? {}) },
        comfort: { ...base.comfort, ...(raw.comfort ?? {}) },
        flags: { ...base.flags, ...(raw.flags ?? {}) },
        hudScale: HUD_SCALES.includes(raw.hudScale ?? 1) ? raw.hudScale ?? 1 : 1,
      };
    } catch {
      return base;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage blocked: settings last this session only
    }
    this.listeners.forEach((fn) => fn());
  }
}

export const Settings = new SettingsStore();
