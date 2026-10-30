import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { Achievements, CATEGORIES } from '../state/Achievements';
import { Sfx } from '../audio/Sfx';

const SHOW_TIME = 3200;
/** Banners shown at once; more wait in the queue. */
const MAX_STACK = 3;
const STACK_GAP = 72;
/** Which stack slots are taken, per scene. */
const slots = new WeakMap<Phaser.Scene, boolean[]>();

/** End screens: a centred row of the achievements unlocked this run (nothing if there were none). */
export function showRunUnlocks(scene: Phaser.Scene, y: number): void {
  const list = Achievements.thisRun();
  if (!list.length) return;
  const shown = list.slice(0, 5);
  const items = shown.map((a) => {
    const badge = scene.add.image(0, y + 26, `badge_${a.category}`).setScale(0.42);
    const name = scene.add.text(0, y + 26, a.name, { fontFamily: FONT, fontSize: '15px', color: '#ffd54f', fontStyle: 'bold' }).setOrigin(0, 0.5);
    return { badge, name, w: 30 + name.width };
  });
  const more = list.length - shown.length;
  const extra = more > 0 ? scene.add.text(0, y + 26, `+${more} more`, { fontFamily: FONT, fontSize: '14px', color: '#bdbdbd' }).setOrigin(0, 0.5) : null;
  const gap = 26;
  const total = items.reduce((n, it) => n + it.w, 0) + gap * (items.length - 1) + (extra ? gap + extra.width : 0);
  let x = GAME_WIDTH / 2 - total / 2;
  for (const it of items) {
    it.badge.setX(x + 11);
    it.name.setX(x + 28);
    x += it.w + gap;
  }
  extra?.setX(x);
  scene.add
    .text(GAME_WIDTH / 2, y, `🏆 UNLOCKED THIS RUN (${list.length})`, { fontFamily: FONT, fontSize: '14px', color: '#c5e1a5', fontStyle: 'bold' })
    .setOrigin(0.5, 0.5);
}

/** Call every frame from a scene that can show achievement banners; stacks up to MAX_STACK. */
export function showBanners(scene: Phaser.Scene): void {
  let taken = slots.get(scene);
  if (!taken) {
    taken = [];
    slots.set(scene, taken);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => slots.delete(scene));
  }
  const slot = [...Array(MAX_STACK).keys()].find((i) => !taken![i]);
  if (slot === undefined) return;
  const a = Achievements.takeQueued();
  if (!a) return;
  taken[slot] = true;
  Sfx.play('golden');
  const color = CATEGORIES.find((c) => c.id === a.category)?.color ?? 0xffd54f;
  const w = 480;
  const bg = scene.add.graphics();
  bg.fillStyle(0x1a1408, 0.95);
  bg.fillRoundedRect(-w / 2, -32, w, 64, 12);
  bg.lineStyle(3, color, 1);
  bg.strokeRoundedRect(-w / 2, -32, w, 64, 12);
  const badge = scene.add.image(-w / 2 + 34, 0, `badge_${a.category}`).setScale(0.78);
  const title = scene.add
    .text(-w / 2 + 66, -14, `Achievement unlocked: ${a.name}`, { fontFamily: FONT, fontSize: '17px', color: '#ffd54f', fontStyle: 'bold' })
    .setOrigin(0, 0.5);
  const desc = scene.add
    .text(-w / 2 + 66, 11, a.description, { fontFamily: FONT, fontSize: '12px', color: '#e8f5e9', wordWrap: { width: w - 84 } })
    .setOrigin(0, 0.5);
  // a quick shine sweeps across once it has landed
  const shine = scene.add.graphics().setAlpha(0);
  shine.fillStyle(0xffffff, 0.22);
  shine.fillPoints([{ x: -6, y: -30 }, { x: 14, y: -30 }, { x: -2, y: 30 }, { x: -22, y: 30 }], true);
  shine.x = -w / 2 + 20;
  // bottom-right, clear of titles and the HUD bars; later banners stack above
  // in what this scene's camera shows (the HUD can be zoomed)
  const zoom = scene.cameras.main.zoom;
  const hidden = GAME_HEIGHT / zoom + 50;
  const y = GAME_HEIGHT / zoom - 84 - slot * STACK_GAP;
  const box = scene.add.container(GAME_WIDTH / zoom - w / 2 - 16, hidden, [bg, shine, badge, title, desc]).setDepth(1000).setScrollFactor(0);
  scene.tweens.add({ targets: box, y, duration: 350, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: badge, scale: { from: 1.2, to: 0.78 }, angle: { from: -20, to: 0 }, duration: 500, delay: 200, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: shine, x: w / 2 - 20, duration: 700, delay: 450, ease: 'Sine.easeInOut', onStart: () => shine.setAlpha(1), onComplete: () => shine.setAlpha(0) });
  scene.tweens.add({
    targets: box,
    y: hidden,
    delay: SHOW_TIME,
    duration: 300,
    onComplete: () => {
      box.destroy();
      taken![slot] = false;
    },
  });
}
