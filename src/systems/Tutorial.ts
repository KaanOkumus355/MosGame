import Phaser from 'phaser';
import { FONT, GAME_WIDTH } from '../config';
import { Codex } from '../state/Codex';
import { keyLabel, moveLabel, ringLegend } from './Controls';
import { Settings } from '../state/Settings';

const STORAGE_KEY = 'swarm-to-sovereign-tutorial';

/** One-time tips; the four guided ones run in order on the first Mosquito stage. */
export type TipId =
  | 'move' | 'eat' | 'drink' | 'grow'
  | 'danger' | 'swat' | 'evolve' | 'venom' | 'dash' | 'signature' | 'lair' | 'fusion' | 'secret' | 'trophy';

interface Tip {
  title: string;
  text: () => string;
  /** Seconds before it closes by itself (0 = only when done). */
  auto: number;
}

/** The first Mosquito stage, one idea at a time. */
const GUIDED: TipId[] = ['move', 'eat', 'drink', 'grow'];

const TIPS: Record<TipId, Tip> = {
  move: { title: 'MOVE', auto: 0, text: () => `${moveLabel()} or the arrow keys to fly, or hold the left mouse button.` },
  eat: { title: 'EAT', auto: 0, text: () => `${ringLegend().split(' · ')[0]}: fly into small prey to eat it. Eat 3 gnats.` },
  drink: { title: 'DRINK BLOOD', auto: 0, text: () => 'Pink-ringed animals are hosts. Land on one and hover there to drink: lots of DNA.' },
  grow: {
    title: 'GROW',
    auto: 12,
    text: () => 'Fill the DNA bar for new traits; fill Growth to evolve into the next creature. Keep eating!',
  },
  danger: { title: 'DANGER', auto: 7, text: () => `${ringLegend().split(' · ')[1]}: it can hurt or eat you. Keep away until you are bigger.` },
  swat: { title: 'SWAT!', auto: 6, text: () => 'Drink too long and the host swats. Fly out of the shadow before it lands!' },
  evolve: { title: 'EVOLUTION', auto: 0, text: () => 'Pick one card: click it or press its number. Every pick also adds max health.' },
  venom: { title: 'VENOM', auto: 9, text: () => `${keyLabel('primary')} or right-click spits venom. Stunned prey can be eaten even when bigger than you.` },
  dash: { title: 'DASH', auto: 9, text: () => `${keyLabel('dash')} to dash. You can't be hit mid-dash.` },
  signature: { title: 'SIGNATURE', auto: 9, text: () => `Every form has its own ability. Press ${keyLabel('signature')} to use this one (bottom left shows it).` },
  lair: { title: 'BOSS LAIR', auto: 9, text: () => 'A boss guards this feeding ground. Beat it for a Trophy: fuse two maxed traits, or jump a trait two ranks. Once fully grown, it stands between you and evolving.' },
  fusion: { title: 'FUSION', auto: 0, text: () => 'Beating a boss lets two maxed traits fuse into something stronger. Gold cards are fusions.' },
  secret: { title: 'SECRET FORM', auto: 0, text: () => 'A hidden form! Pick it and your next metamorphosis becomes something else entirely.' },
  trophy: { title: 'TROPHY', auto: 0, text: () => 'Your boss reward: one of these traits jumps two ranks at once. Max two traits that fit together, and next time you can fuse them.' },
};

interface TutorialData {
  seen: TipId[];
  /** Tips switched off (skipped with TAB or in Options). */
  off: boolean;
  /** Replayed from Options: show the guided steps even to a veteran. */
  replayed?: boolean;
}

/**
 * First-run tips. Each shows once, ever; the guided ones wait until you've done the thing.
 * Scenes report what happens (done / trigger) and draw the current tip with TipPanel.
 */
class TutorialStore {
  private data: TutorialData = this.load();
  current: TipId | null = null;
  private shownAt = 0;
  /** Progress counter for the current guided step. */
  progress = 0;

  get enabled(): boolean {
    return !this.data.off;
  }

  set enabled(on: boolean) {
    this.data.off = !on;
    if (!on) this.current = null;
    this.save();
  }

  seen(id: TipId): boolean {
    return this.data.seen.includes(id);
  }

  /**
   * Shows a tip the first time it's relevant. A contextual tip waits while another one is up;
   * `urgent` (the evolution screen, which pauses everything) takes over and the other comes back later.
   */
  trigger(id: TipId, urgent = false): void {
    if (!this.enabled || this.seen(id) || this.current === id) return;
    if (!urgent && this.current && GUIDED.includes(this.current) === false) return;
    this.current = id;
    this.shownAt = performance.now();
    this.progress = 0;
  }

  /** The guided Mosquito steps, from the first unseen one. Veterans skip them. */
  startGuided(): void {
    if (!this.enabled) return;
    // someone who has already evolved past the Mosquito doesn't need the basics
    if (!this.data.replayed && (Codex.hasForm('pond') || Codex.hasForm('meadow'))) {
      for (const id of GUIDED) this.markSeen(id);
      return;
    }
    const next = GUIDED.find((id) => !this.seen(id));
    if (next) this.trigger(next);
  }

  /**
   * Leaving the Mosquito ends the guided steps: any still unseen (say, you never drank blood) are
   * marked seen, so they don't keep coming back in forms that can't do them.
   */
  endGuided(): void {
    for (const id of GUIDED) this.markSeen(id);
    if (this.current && GUIDED.includes(this.current)) this.current = null;
  }

  /** The thing the current tip asks for happened: close it and move on to the next guided step. */
  done(id: TipId): void {
    if (this.current !== id) return;
    this.markSeen(id);
    this.current = null;
    this.resumeGuided();
  }

  /** Once the guided steps have started, show the next one still unseen (also after a contextual tip). */
  private resumeGuided(): void {
    if (!GUIDED.some((g) => this.seen(g))) return;
    const next = GUIDED.find((g) => !this.seen(g));
    if (next) this.trigger(next);
  }

  /** Called every frame by the panel: closes timed tips. */
  tick(): void {
    const id = this.current;
    if (!id) return;
    const auto = TIPS[id].auto;
    if (auto > 0 && performance.now() - this.shownAt > auto * 1000) this.done(id);
  }

  tip(id: TipId): Tip {
    return TIPS[id];
  }

  /** Turns every tip off for good (TAB). */
  skipAll(): void {
    this.enabled = false;
  }

  /** Options: show every tip again from the start. */
  replay(): void {
    this.data = { seen: [], off: false, replayed: true };
    this.current = null;
    this.save();
  }

  private markSeen(id: TipId): void {
    if (!this.data.seen.includes(id)) this.data.seen.push(id);
    this.save();
  }

  private load(): TutorialData {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<TutorialData> | null;
      return { seen: raw?.seen ?? [], off: raw?.off ?? false, replayed: raw?.replayed ?? false };
    } catch {
      return { seen: [], off: false };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage blocked: tips may repeat next session
    }
  }
}

export const Tutorial = new TutorialStore();

/**
 * Draws the current tip in a box. `only` limits it to the tips meant for this scene
 * (the evolution screen shows its own card tips; the HUD shows the rest).
 */
export class TipPanel {
  private box: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private shown: TipId | null = null;

  constructor(private scene: Phaser.Scene, private y: number, private only?: TipId[]) {
    this.box = scene.add.graphics().setDepth(50);
    this.title = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#ffd54f', fontStyle: 'bold' }).setDepth(51);
    this.body = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', wordWrap: { width: 600 }, lineSpacing: 3 })
      .setDepth(51);
    this.hint = scene.add.text(0, 0, 'TAB: skip tips', { fontFamily: FONT, fontSize: '12px', color: '#90a4ae' }).setDepth(51);
    scene.input.keyboard?.on('keydown-TAB', (e: KeyboardEvent) => {
      if (!Tutorial.current) return;
      e.preventDefault?.();
      Tutorial.skipAll();
    });
    this.update();
  }

  update(): void {
    Tutorial.tick();
    const id = Tutorial.current && (!this.only || this.only.includes(Tutorial.current)) ? Tutorial.current : null;
    const visible = !!id;
    [this.box, this.title, this.body, this.hint].forEach((o) => o.setVisible(visible));
    if (!id) {
      this.shown = null;
      return;
    }
    if (id === this.shown) return;
    this.shown = id;
    const tip = Tutorial.tip(id);
    this.title.setText(`TIP · ${tip.title}`);
    this.body.setText(tip.text());
    const w = Math.max(this.body.width, 300) + 40;
    const h = this.body.height + 52;
    // centred in what this scene's camera shows (the HUD can be zoomed)
    const x = GAME_WIDTH / this.scene.cameras.main.zoom / 2 - w / 2;
    this.box.clear();
    this.box.fillStyle(0x0b1a10, 0.92);
    this.box.fillRoundedRect(x, this.y, w, h, 12);
    this.box.lineStyle(2, Settings.colorBlind ? 0x56b4e9 : 0xd4ff7a, 0.9);
    this.box.strokeRoundedRect(x, this.y, w, h, 12);
    this.title.setPosition(x + 20, this.y + 10);
    this.body.setPosition(x + 20, this.y + 30);
    this.hint.setPosition(x + w - 20 - this.hint.width, this.y + 11);
    // a little pop so new tips get noticed
    this.scene.tweens.add({ targets: [this.box, this.title, this.body, this.hint], alpha: { from: 0, to: 1 }, duration: 250 });
  }
}
