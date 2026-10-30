import Phaser from 'phaser';
import { Settings, type Action } from '../state/Settings';

/** Standard-mapping gamepad buttons (Xbox names; PlayStation is the same layout). */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

const PAD_BUTTONS: Record<Action, number[]> = {
  up: [PAD.UP],
  down: [PAD.DOWN],
  left: [PAD.LEFT],
  right: [PAD.RIGHT],
  primary: [PAD.A, PAD.RT],
  dash: [PAD.B, PAD.RB],
  signature: [PAD.X, PAD.LB],
};
/** Arrow keys always move as well as the bound keys. */
const ARROWS: Partial<Record<Action, string>> = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' };
const STICK_DEAD = 0.25;

/** How the gamepad maps, for the Options screen. */
export const PAD_HELP = 'Left stick / d-pad: move  ·  A / RT: venom / main power  ·  B / RB: dash  ·  X / LB: signature  ·  Right stick: aim  ·  Start: pause';

/** A key's display name ("SPACE", "E", "SHIFT"). */
export const keyLabel = (action: Action): string => Settings.key(action).replace('_', ' ');

/** The four movement keys as one label: "WASD", or "I/J/K/L" when they aren't single letters. */
export function moveLabel(): string {
  const keys = (['up', 'left', 'down', 'right'] as Action[]).map(keyLabel);
  return keys.every((k) => k.length === 1) ? keys.join('') : keys.join('/');
}

/** What each indicator ring colour means, in the current palette. */
export const ringLegend = (): string =>
  Settings.colorBlind ? 'blue = food · vermillion = danger · yellow = fight' : 'green = food · red = danger · orange = fight';

/**
 * One scene's game input: the rebindable keys (Settings), arrow keys and the first gamepad.
 * Call update() at the top of the scene's update, then read actions.
 */
export class Controls {
  private keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private padNow = new Set<number>();
  private padBefore = new Set<number>();

  constructor(private scene: Phaser.Scene) {}

  get pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const gp = this.scene.input.gamepad;
    if (!gp || gp.total === 0) return undefined;
    return gp.getAll().find((p) => p?.connected);
  }

  update(): void {
    this.padBefore = this.padNow;
    this.padNow = new Set();
    this.pad?.buttons.forEach((b, i) => {
      if (b.pressed) this.padNow.add(i);
    });
  }

  private key(name: string): Phaser.Input.Keyboard.Key {
    let k = this.keys.get(name);
    if (!k) {
      k = this.scene.input.keyboard!.addKey(name);
      this.keys.set(name, k);
    }
    return k;
  }

  private keysFor(action: Action): Phaser.Input.Keyboard.Key[] {
    const arrow = ARROWS[action];
    return arrow ? [this.key(Settings.key(action)), this.key(arrow)] : [this.key(Settings.key(action))];
  }

  padDown(button: number): boolean {
    return this.padNow.has(button);
  }

  padPressed(button: number): boolean {
    return this.padNow.has(button) && !this.padBefore.has(button);
  }

  down(action: Action): boolean {
    return this.keysFor(action).some((k) => k.isDown) || PAD_BUTTONS[action].some((b) => this.padDown(b));
  }

  /** Pressed this frame (each key press is reported once). */
  pressed(action: Action): boolean {
    let hit = false;
    for (const k of this.keysFor(action)) if (Phaser.Input.Keyboard.JustDown(k)) hit = true;
    return hit || PAD_BUTTONS[action].some((b) => this.padPressed(b));
  }

  /** Movement from keys, d-pad or the left stick; length up to 1 (the stick is analog). */
  move(): { x: number; y: number } {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    let y = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0);
    if (x || y) {
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    }
    const stick = this.pad?.leftStick;
    if (stick) {
      const len = Math.hypot(stick.x, stick.y);
      if (len > STICK_DEAD) {
        const mag = Math.min(1, (len - STICK_DEAD) / (1 - STICK_DEAD));
        x = (stick.x / len) * mag;
        y = (stick.y / len) * mag;
      }
    }
    return { x, y };
  }

  /** Right-stick aim, or null when it is centred. */
  aim(): number | null {
    const s = this.pad?.rightStick;
    if (!s || Math.hypot(s.x, s.y) < 0.4) return null;
    return Math.atan2(s.y, s.x);
  }

  /** How many movement presses happened this frame (for mashing free of a grab). */
  movePresses(): number {
    return (['up', 'down', 'left', 'right'] as Action[]).filter((a) => this.pressed(a)).length;
  }

  /** Releases held keys (after a pause, keys let go meanwhile would otherwise stay down). */
  reset(): void {
    this.keys.forEach((k) => k.reset());
    this.padNow.clear();
    this.padBefore.clear();
  }
}

/** Calls `fn` with the button index whenever a gamepad button goes down in this scene. */
export function onPadButton(scene: Phaser.Scene, fn: (button: number) => void): void {
  scene.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => fn(button.index));
}
