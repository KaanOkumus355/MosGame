import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { BODY_RADIUS } from '../art/textures';
import { GameState } from '../state/GameState';
import { PAD, onPadButton } from './Controls';
import { Sfx } from '../audio/Sfx';

/** A finale's deadline on this difficulty (the same scale as the Overlord's research clock). */
export const finaleTime = (seconds: number): number => Math.round(seconds * GameState.diff.researchTime);

export const clock = (seconds: number): string => {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

export interface BriefingDef {
  title: string;
  /** Picture of the form, facing up. */
  texture: string;
  color: string;
  story: string;
  rules: string[];
  controls: string;
}

/** The full-screen introduction: the clock waits until the player starts. */
export function showBriefing(scene: Phaser.Scene, def: BriefingDef, start: () => void): void {
  const cx = GAME_WIDTH / 2;
  const text = (y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle) =>
    scene.add.text(cx, y, s, { fontFamily: FONT, align: 'center', ...style }).setOrigin(0.5, 0);
  const go = text(636, 'Click or press SPACE to begin', { fontSize: '26px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 });
  scene.tweens.add({ targets: go, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
  const box = scene.add
    .container(0, 0, [
      scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05020c, 0.9).setOrigin(0),
      text(36, def.title, { fontSize: '46px', color: def.color, fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }),
      scene.add.image(cx, 186, def.texture).setScale(72 / BODY_RADIUS).setAngle(-90),
      text(278, def.story, { fontSize: '18px', color: '#e0e0e0', wordWrap: { width: 900 } }),
      text(356, 'HOW TO WIN', { fontSize: '16px', color: def.color, fontStyle: 'bold' }),
      text(382, def.rules.map((r) => `•  ${r}`).join('\n'), { fontSize: '16px', color: '#e8f5e9', lineSpacing: 6, wordWrap: { width: 980 } }),
      text(570, def.controls, { fontSize: '15px', color: '#b0bec5', wordWrap: { width: 980 } }),
      go,
    ])
    .setDepth(60);
  let begun = false;
  const begin = () => {
    if (begun) return;
    begun = true;
    box.destroy();
    start();
  };
  // a short wait, so a key still held from the last scene doesn't skip it
  scene.time.delayedCall(400, () => {
    scene.input.once('pointerdown', begin);
    scene.input.keyboard!.once('keydown-SPACE', begin);
    onPadButton(scene, (b) => (b === PAD.A || b === PAD.START) && begin());
  });
}

/** Top band shared by the action finales: form, stats, deadline, health and any boss bar. */
export class FinaleHud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly stats: Phaser.GameObjects.Text;
  private readonly clockText: Phaser.GameObjects.Text;
  private readonly bossName: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, name: string, color: string) {
    this.g = scene.add.graphics().setDepth(29);
    const style = { fontFamily: FONT, stroke: '#000', strokeThickness: 3 };
    const title = scene.add.text(16, 6, name, { ...style, fontSize: '20px', color, fontStyle: 'bold' }).setDepth(30);
    this.stats = scene.add.text(title.x + title.width + 24, 9, '', { ...style, fontSize: '15px', color: '#e8f5e9' }).setDepth(30);
    this.clockText = scene.add.text(GAME_WIDTH - 16, 7, '', { ...style, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(30);
    this.bossName = scene.add.text(GAME_WIDTH / 2, 52, '', { ...style, fontSize: '16px', color: '#ff8a80', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(30);
  }

  /** `health` is 0..1 under the title; `boss` shows a big bar below the band. */
  update(stats: string, deadline: { label: string; left: number } | null, health: number, boss: { name: string; share: number } | null): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x05020c, 0.72);
    g.fillRect(0, 0, GAME_WIDTH, 46);
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(16, 33, 264, 8, 4);
    g.fillStyle(0xff5566, 1);
    g.fillRoundedRect(17, 34, 262 * Phaser.Math.Clamp(health, 0, 1), 6, 3);
    this.stats.setText(stats);
    const urgent = !!deadline && deadline.left < 30;
    this.clockText.setText(deadline ? `${deadline.label} ${clock(deadline.left)}` : '').setColor(urgent ? '#ff5252' : '#ffffff');
    this.bossName.setText(boss?.name ?? '');
    if (!boss) return;
    const w = 460;
    const x = GAME_WIDTH / 2 - w / 2;
    g.fillStyle(0x000000, 0.7);
    g.fillRoundedRect(x - 2, 72, w + 4, 16, 6);
    g.fillStyle(0xff5252, 1);
    g.fillRoundedRect(x, 74, w * Phaser.Math.Clamp(boss.share, 0, 1), 12, 5);
  }
}

/** The showdown begins: a big title across the screen. */
export function showdownBanner(scene: Phaser.Scene, title: string, sub: string, color: string): void {
  const cx = GAME_WIDTH / 2;
  const t = scene.add.text(cx, 300, title, { fontFamily: FONT, fontSize: '56px', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 9 }).setOrigin(0.5).setDepth(40);
  const s = scene.add.text(cx, 362, sub, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 5, align: 'center' }).setOrigin(0.5).setDepth(40);
  Sfx.play('roar');
  scene.cameras.main.shake(500, 0.01);
  scene.tweens.add({ targets: [t, s], alpha: 0, delay: 2800, duration: 500, onComplete: () => (t.destroy(), s.destroy()) });
}

/** The last blow: the camera closes in, the title lands, then on to the ending. */
export function winMoment(scene: Phaser.Scene, x: number, y: number, title: string, color: string, done: () => void): void {
  const cam = scene.cameras.main;
  Sfx.play('fusion');
  cam.flash(700, 255, 255, 255);
  cam.shake(900, 0.012);
  cam.pan(x, y, 1400, 'Sine.easeInOut');
  cam.zoomTo(1.5, 1400, 'Sine.easeInOut');
  const t = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, title, { fontFamily: FONT, fontSize: '38px', color, fontStyle: 'bold', stroke: '#000', strokeThickness: 8, align: 'center' })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(70)
    .setAlpha(0);
  scene.tweens.add({ targets: t, alpha: 1, delay: 500, duration: 600 });
  scene.time.delayedCall(3000, () => {
    cam.fadeOut(900, 255, 255, 255);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, done);
  });
}
