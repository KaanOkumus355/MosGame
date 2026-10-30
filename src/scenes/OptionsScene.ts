import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { ACTIONS, COMFORT, FLAGS, HUD_SCALES, RESERVED_KEYS, Settings, type Action, type FlagId } from '../state/Settings';
import { SaveData } from '../state/SaveData';
import { PAD, PAD_HELP, keyLabel, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';
import { Tutorial } from '../systems/Tutorial';

/** Opened over the menu or the pause menu; `from` is the scene to resume on close. */
export interface OptionsData {
  from: string;
}

type Tab = 'audio' | 'display' | 'access' | 'controls' | 'gameplay' | 'data';
const TABS: { id: Tab; name: string }[] = [
  { id: 'audio', name: 'Audio' },
  { id: 'display', name: 'Display' },
  { id: 'access', name: 'Accessibility' },
  { id: 'controls', name: 'Controls' },
  { id: 'gameplay', name: 'Gameplay' },
  { id: 'data', name: 'Data' },
];

const PANEL_X = 140;
const PANEL_W = GAME_WIDTH - 280;
const PANEL_TOP = 140;
const PANEL_H = 470;
const LABEL_X = PANEL_X + 40;
const CONTROL_X = PANEL_X + PANEL_W - 40;
const SLIDER_W = 280;

/** One focusable row: drawn every redraw, driven by mouse, keys or pad. */
interface Item {
  y: number;
  h: number;
  help: string;
  /** Enter / Space / A, or a click. */
  activate?: () => void;
  /** Left / right (sliders, switches, choices). */
  adjust?: (dir: number) => void;
}

/** Key name for a keyboard event (Phaser's KeyCodes names, e.g. "SPACE", "Q", "SHIFT"). */
function keyName(code: number): string | null {
  const codes = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
  return Object.keys(codes).find((n) => codes[n] === code) ?? null;
}

/** Sound, display, accessibility, controls, gameplay and save data, one tab each. */
export class OptionsScene extends Phaser.Scene {
  private from = 'Menu';
  private tab: Tab = 'audio';
  private content: Phaser.GameObjects.GameObject[] = [];
  private items: Item[] = [];
  private focus = 0;
  /** The action waiting for a key press, if rebinding. */
  private listening: Action | null = null;
  /** Reset progress needs a second press to go through. */
  private confirmReset = false;
  private help!: Phaser.GameObjects.Text;
  private note = '';

  constructor() {
    super('Options');
  }

  create(data: OptionsData): void {
    this.from = data.from;
    this.listening = null;
    this.confirmReset = false;
    this.content = [];
    this.note = '';
    this.focus = 0;
    this.scene.bringToTop();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b100d, 1).setOrigin(0).setInteractive();
    this.add
      .text(GAME_WIDTH / 2, 42, 'OPTIONS', { fontFamily: FONT, fontSize: '42px', color: '#d4ff7a', stroke: '#000', strokeThickness: 8, fontStyle: 'bold' })
      .setOrigin(0.5);
    const back = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 32, '◀ Back  (ESC)', { fontFamily: FONT, fontSize: '20px', color: '#ffffff', backgroundColor: '#263238', padding: { x: 16, y: 6 }, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.close());
    this.help = this.add.text(GAME_WIDTH / 2, PANEL_TOP + PANEL_H + 14, '', { fontFamily: FONT, fontSize: '14px', color: '#b0bec5', align: 'center', wordWrap: { width: PANEL_W } }).setOrigin(0.5, 0);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    onPadButton(this, (b) => this.onPad(b));
    // the pad's status can change while the screen is open
    this.input.gamepad?.on('connected', () => this.draw());
    this.input.gamepad?.on('disconnected', () => this.draw());
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, () => this.draw());
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, () => this.draw());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN);
    });
    this.draw();
  }

  private close(): void {
    Sfx.play('ui');
    this.scene.resume(this.from);
    this.scene.stop();
  }

  // ------------------------------------------------------------ input

  private onKey(e: KeyboardEvent): void {
    if (this.listening) {
      this.finishRebind(e);
      return;
    }
    switch (e.code) {
      case 'Escape': return this.close();
      case 'ArrowUp': return this.moveFocus(-1);
      case 'ArrowDown': return this.moveFocus(1);
      case 'ArrowLeft': return this.items[this.focus]?.adjust?.(-1);
      case 'ArrowRight': return this.items[this.focus]?.adjust?.(1);
      case 'Enter':
      case 'Space': return this.items[this.focus]?.activate?.();
      case 'KeyQ': return this.switchTab(-1);
      case 'KeyE':
      case 'Tab': return this.switchTab(1);
    }
  }

  private onPad(b: number): void {
    if (this.listening) {
      if (b === PAD.B) {
        this.listening = null;
        this.note = '';
        this.draw();
      }
      return;
    }
    if (b === PAD.B) this.close();
    else if (b === PAD.UP) this.moveFocus(-1);
    else if (b === PAD.DOWN) this.moveFocus(1);
    else if (b === PAD.LEFT) this.items[this.focus]?.adjust?.(-1);
    else if (b === PAD.RIGHT) this.items[this.focus]?.adjust?.(1);
    else if (b === PAD.A) this.items[this.focus]?.activate?.();
    else if (b === PAD.LB) this.switchTab(-1);
    else if (b === PAD.RB) this.switchTab(1);
  }

  private moveFocus(d: number): void {
    if (!this.items.length) return;
    this.focus = (this.focus + d + this.items.length) % this.items.length;
    Sfx.play('ui');
    this.draw();
  }

  private switchTab(d: number): void {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.openTab(TABS[(i + d + TABS.length) % TABS.length].id);
  }

  private openTab(tab: Tab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.focus = 0;
    this.listening = null;
    this.confirmReset = false;
    this.note = '';
    Sfx.play('ui');
    this.draw();
  }

  private finishRebind(e: KeyboardEvent): void {
    const action = this.listening!;
    this.listening = null;
    const name = keyName(e.keyCode);
    if (e.code === 'Escape' || !name) this.note = '';
    else if (RESERVED_KEYS.includes(name)) this.note = `${name} is reserved (arrows always move, ESC / P always pause).`;
    else {
      Settings.bind(action, name);
      Sfx.play('pick');
      this.note = '';
    }
    this.draw();
  }

  // ------------------------------------------------------------ drawing helpers

  private add2<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.content.push(o);
    return o;
  }

  private text(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.add2(this.add.text(x, y, s, { fontFamily: FONT, ...style }));
  }

  /** Adds a focusable row with its label and a hover zone; returns its index. */
  private row(y: number, label: string, help: string, item: Omit<Item, 'y' | 'h' | 'help'>, h = 48): number {
    const i = this.items.length;
    this.items.push({ y, h, help, ...item });
    const focused = i === this.focus;
    if (focused) {
      const g = this.add2(this.add.graphics());
      g.fillStyle(0xd4ff7a, 0.08);
      g.fillRoundedRect(PANEL_X + 16, y - h / 2 + 2, PANEL_W - 32, h - 4, 10);
      g.lineStyle(2, 0xd4ff7a, 0.6);
      g.strokeRoundedRect(PANEL_X + 16, y - h / 2 + 2, PANEL_W - 32, h - 4, 10);
    }
    this.text(LABEL_X, y, label, { fontSize: '17px', color: focused ? '#ffffff' : '#dfe6df', fontStyle: focused ? 'bold' : 'normal' }).setOrigin(0, 0.5);
    const zone = this.add2(this.add.zone(PANEL_X + 16, y - h / 2, PANEL_W - 32, h).setOrigin(0).setInteractive({ useHandCursor: !!(item.activate || item.adjust) }));
    zone.on('pointerover', () => {
      if (this.focus === i) return;
      this.focus = i;
      this.draw();
    });
    if (item.activate) zone.on('pointerup', () => item.activate!());
    return i;
  }

  /** A sliding on/off switch at the right edge of a row. */
  private toggle(y: number, label: string, help: string, get: () => boolean, set: (on: boolean) => void): void {
    const flip = (on: boolean) => {
      if (on === get()) return;
      set(on);
      Sfx.play('ui');
      this.draw();
    };
    this.row(y, label, help, { activate: () => flip(!get()), adjust: (d) => flip(d > 0) });
    const on = get();
    const g = this.add2(this.add.graphics());
    const x = CONTROL_X - 56;
    g.fillStyle(on ? 0x7cb342 : 0x37474f, 1);
    g.fillRoundedRect(x, y - 13, 56, 26, 13);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(on ? x + 43 : x + 13, y, 10);
    this.text(x - 12, y, on ? 'On' : 'Off', { fontSize: '14px', color: on ? '#c5e1a5' : '#90a4ae' }).setOrigin(1, 0.5);
  }

  /** A click-or-drag volume slider (left / right step it by 10%). */
  private slider(y: number, label: string, help: string, get: () => number, set: (v: number) => void, blip: boolean): void {
    const x0 = CONTROL_X - SLIDER_W - 60;
    const step = (d: number) => {
      set(Phaser.Math.Clamp(Math.round((get() + d * 0.1) * 10) / 10, 0, 1));
      if (blip) Sfx.play('eat');
      this.draw();
    };
    this.row(y, label, help, { adjust: step });
    const g = this.add2(this.add.graphics());
    const value = this.text(CONTROL_X, y, '', { fontSize: '15px', color: '#d4ff7a', fontStyle: 'bold' }).setOrigin(1, 0.5);
    const paint = () => {
      const v = get();
      g.clear();
      g.fillStyle(0x263238, 1);
      g.fillRoundedRect(x0, y - 4, SLIDER_W, 8, 4);
      g.fillStyle(0x9dff6a, 1);
      g.fillRoundedRect(x0, y - 4, Math.max(8, SLIDER_W * v), 8, 4);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x0 + SLIDER_W * v, y, 10);
      value.setText(`${Math.round(v * 100)}%`);
    };
    paint();
    const zone = this.add2(this.add.zone(x0 - 12, y - 16, SLIDER_W + 24, 32).setOrigin(0).setInteractive({ useHandCursor: true }));
    const apply = (p: Phaser.Input.Pointer) => {
      set(Phaser.Math.Clamp((p.x - x0) / SLIDER_W, 0, 1));
      paint();
    };
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => apply(p));
    zone.on('pointermove', (p: Phaser.Input.Pointer) => p.isDown && apply(p));
    // a blip so you can hear the new effects volume
    if (blip) zone.on('pointerup', () => Sfx.play('eat'));
  }

  /** ◀ value ▶ for a short list of choices. */
  private choice(y: number, label: string, help: string, options: string[], index: number, set: (i: number) => void): void {
    const pick = (d: number) => {
      const i = Phaser.Math.Clamp(index + d, 0, options.length - 1);
      if (i === index) return;
      set(i);
      Sfx.play('ui');
      this.draw();
    };
    this.row(y, label, help, { adjust: pick, activate: () => pick(index === options.length - 1 ? -index : 1) });
    const arrow = (x: number, s: string, d: number, enabled: boolean) => {
      const t = this.text(x, y, s, { fontSize: '18px', color: enabled ? '#d4ff7a' : '#455a64', fontStyle: 'bold' }).setOrigin(0.5);
      if (enabled) t.setInteractive({ useHandCursor: true }).on('pointerup', () => pick(d));
    };
    arrow(CONTROL_X - 140, '◀', -1, index > 0);
    this.text(CONTROL_X - 72, y, options[index], { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    arrow(CONTROL_X, '▶', 1, index < options.length - 1);
  }

  /** A button at the right edge of a row. */
  private action(y: number, label: string, help: string, button: string, color: string, run: () => void): void {
    this.row(y, label, help, { activate: run });
    this.text(CONTROL_X, y, button, { fontSize: '15px', color, backgroundColor: '#263238', padding: { x: 12, y: 6 }, fontStyle: 'bold' }).setOrigin(1, 0.5);
  }

  // ------------------------------------------------------------ tabs

  private draw(): void {
    this.content.forEach((o) => o.destroy());
    this.content = [];
    this.items = [];

    // tab bar
    const tw = 150;
    const tx0 = GAME_WIDTH / 2 - (TABS.length * tw) / 2;
    TABS.forEach((t, i) => {
      const on = t.id === this.tab;
      const x = tx0 + i * tw + tw / 2;
      const chip = this.text(x, 100, t.name, {
        fontSize: '16px', color: on ? '#10140f' : '#c8e6c9', backgroundColor: on ? '#d4ff7a' : '#1b2420', padding: { x: 14, y: 6 }, fontStyle: 'bold',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      chip.on('pointerup', () => this.openTab(t.id));
    });
    this.text(tx0 - 14, 100, 'Q', { fontSize: '12px', color: '#607d6b' }).setOrigin(1, 0.5);
    this.text(tx0 + TABS.length * tw + 14, 100, 'E', { fontSize: '12px', color: '#607d6b' }).setOrigin(0, 0.5);

    const g = this.add2(this.add.graphics());
    g.fillStyle(0x151d18, 0.95);
    g.fillRoundedRect(PANEL_X, PANEL_TOP, PANEL_W, PANEL_H, 14);
    g.lineStyle(2, 0x2c3b30, 1);
    g.strokeRoundedRect(PANEL_X, PANEL_TOP, PANEL_W, PANEL_H, 14);

    if (this.tab === 'audio') this.audioTab();
    else if (this.tab === 'display') this.displayTab();
    else if (this.tab === 'access') this.accessTab();
    else if (this.tab === 'controls') this.controlsTab();
    else if (this.tab === 'gameplay') this.gameplayTab();
    else this.dataTab();

    this.focus = Math.min(this.focus, Math.max(0, this.items.length - 1));
    const tip = this.items[this.focus]?.help ?? '';
    this.help.setText(this.note || tip).setColor(this.note ? '#ffcc80' : '#b0bec5');
  }

  private audioTab(): void {
    const y = PANEL_TOP + 50;
    this.slider(y, 'Master volume', 'Everything at once.', () => Sfx.masterVolume, (v) => Sfx.setMasterVolume(v), true);
    this.slider(y + 56, 'Sound effects', 'Bites, hits, abilities and alerts. Also S in the menu to mute.', () => Sfx.sfxVolume, (v) => Sfx.setSfxVolume(v), true);
    this.slider(y + 112, 'Music and ambience', "Each zone's music bed. Also U in the menu to mute.", () => Sfx.musicVolume, (v) => Sfx.setMusicVolume(v), false);
  }

  private displayTab(): void {
    let y = PANEL_TOP + 50;
    this.toggle(y, 'Fullscreen', 'Fill the whole screen. (F11 works too in most browsers.)', () => this.scale.isFullscreen, () => this.scale.toggleFullscreen());
    y += 56;
    const i = Math.max(0, HUD_SCALES.indexOf(Settings.hudScale));
    this.choice(y, 'HUD size', 'Bigger bars and text during play. Applies from the next stage.', HUD_SCALES.map((s) => `${Math.round(s * 100)}%`), i, (n) => (Settings.hudScale = HUD_SCALES[n]));
    for (const id of ['showNumbers', 'reducedParticles'] as FlagId[]) {
      y += 56;
      this.flagRow(y, id);
    }
  }

  private accessTab(): void {
    let y = PANEL_TOP + 50;
    this.toggle(y, 'Colour-blind indicator rings', 'Blue, yellow and vermillion rings instead of green, orange and red.', () => Settings.colorBlind, (on) => (Settings.colorBlind = on));
    // live preview of the ring colours
    y += 44;
    const g = this.add2(this.add.graphics());
    const swatches: [string, number][] = [['food', COLORS.edible], ['fight', COLORS.fight], ['danger', COLORS.danger], ['host', COLORS.host]];
    swatches.forEach(([label, color], i) => {
      const x = LABEL_X + 30 + i * 130;
      g.lineStyle(4, color, 1);
      g.strokeCircle(x, y, 13);
      this.text(x + 22, y, label, { fontSize: '14px', color: '#cfd8dc' }).setOrigin(0, 0.5);
    });
    for (const c of COMFORT) {
      y += 56;
      this.toggle(y, c.name, `${c.blurb}. Turn it off if it bothers you.`, () => Settings.effect(c.id), (on) => {
        Settings.setEffect(c.id, on);
        // a quick preview of what was just switched back on
        if (on && c.id === 'shake') this.cameras.main.shake(200, 0.006);
        if (on && c.id === 'flashes') this.cameras.main.flash(250, 255, 255, 255);
      });
    }
  }

  private controlsTab(): void {
    let y = PANEL_TOP + 34;
    ACTIONS.forEach((a) => {
      const waiting = this.listening === a.id;
      this.action(y, a.name, 'Press Enter / A or click, then press the new key. ESC cancels.', waiting ? 'press a key…' : keyLabel(a.id), waiting ? '#ffd54f' : '#d4ff7a', () => {
        Sfx.play('ui');
        this.listening = a.id;
        this.note = `Press the new key for ${a.name} on the keyboard (ESC cancels).`;
        this.draw();
      });
      y += 42;
    });
    this.action(y, 'Reset controls', 'Back to WASD, SPACE, SHIFT and E. Arrow keys always move; ESC / P always pause.', 'Reset', '#ffffff', () => {
      Settings.resetBindings();
      Sfx.play('ui');
      this.listening = null;
      this.note = 'Controls reset.';
      this.draw();
    });
    // gamepad: not rebindable, just what's connected and the layout
    y += 40;
    const pad = this.input.gamepad?.getAll().find((p) => p?.connected);
    this.text(LABEL_X, y, pad ? `Gamepad connected: ${pad.id.slice(0, 60)}` : 'No gamepad found. Plug one in and press any button on it.', {
      fontSize: '14px', color: pad ? '#c5e1a5' : '#9e9e9e', fontStyle: 'bold',
    });
    this.text(LABEL_X, y + 22, PAD_HELP, { fontSize: '12px', color: '#90a4ae', lineSpacing: 2, wordWrap: { width: PANEL_W - 80 } });
  }

  private gameplayTab(): void {
    let y = PANEL_TOP + 50;
    for (const id of ['mouseMove', 'pauseOnBlur'] as FlagId[]) {
      this.flagRow(y, id);
      y += 56;
    }
    this.toggle(y, 'First-time tips', 'The little tips that explain each new thing the first time you meet it.', () => Tutorial.enabled, (on) => (Tutorial.enabled = on));
    y += 56;
    this.action(y, 'Replay all tips', 'Shows every tip again, starting with your next Mosquito.', 'Replay', '#ffffff', () => {
      Tutorial.replay();
      Sfx.play('pick');
      this.note = 'Tips will show again, starting with your next Mosquito.';
      this.draw();
    });
  }

  private dataTab(): void {
    let y = PANEL_TOP + 50;
    this.action(y, 'Export save', 'Downloads your Bestiary, Gene Bank, achievements, records, settings and any run in progress as one file.', 'Export', '#d4ff7a', () => {
      Sfx.play('ui');
      this.note = SaveData.export() ? 'Save exported to your downloads.' : "Couldn't read the save to export it.";
      this.draw();
    });
    y += 56;
    this.action(y, 'Import save', 'Replaces everything with a save file you exported earlier. The game reloads.', 'Import…', '#ffd54f', () => {
      Sfx.play('ui');
      SaveData.import((error) => {
        this.note = error;
        this.draw();
      });
    });
    y += 56;
    const armed = this.confirmReset;
    this.action(y, 'Reset progress', 'Wipes the Bestiary, Gene Bank, achievements, records and any saved run. Settings stay.', armed ? 'Press again to confirm' : 'Reset…', armed ? '#ff5252' : '#ff8a80', () => {
      if (!this.confirmReset) {
        this.confirmReset = true;
        Sfx.play('warn');
        this.note = 'This cannot be undone. Press Reset progress again to wipe everything (export first if unsure).';
        this.draw();
        return;
      }
      SaveData.resetProgress();
    });
    y += 50;
    this.text(LABEL_X, y, 'Saves live in this browser only. Clearing site data deletes them, so export one now and then.', {
      fontSize: '13px', color: '#90a4ae', wordWrap: { width: PANEL_W - 80 },
    });
  }

  /** A row for one of the simple on/off flags in Settings. */
  private flagRow(y: number, id: FlagId): void {
    const f = FLAGS.find((x) => x.id === id)!;
    this.toggle(y, f.name, `${f.blurb}.`, () => Settings.flag(id), (on) => Settings.setFlag(id, on));
  }
}
