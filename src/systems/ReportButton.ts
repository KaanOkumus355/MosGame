import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { Sfx } from '../audio/Sfx';
import type { RunReportData } from '../scenes/RunReportScene';
import { PAD, onPadButton } from './Controls';

/**
 * Adds the "Run report" button (and R key) to an end screen. Returns a check for the screen's own
 * click-to-continue: false while the report is open or was just closed, so closing it doesn't skip the screen.
 */
export function addReportButton(scene: Phaser.Scene, data: Omit<RunReportData, 'from'>): () => boolean {
  let blockedUntil = 0;
  const open = () => {
    if (!scene.scene.isActive()) return;
    Sfx.play('ui');
    scene.scene.pause();
    scene.scene.launch('RunReport', { ...data, from: scene.scene.key });
  };
  const btn = scene.add
    .text(GAME_WIDTH - 24, GAME_HEIGHT - 24, '📋 Run report  (R)', {
      fontFamily: FONT,
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#37474f',
      padding: { x: 14, y: 8 },
      fontStyle: 'bold',
    })
    .setOrigin(1, 1)
    .setDepth(10)
    .setInteractive({ useHandCursor: true });
  btn.on('pointerover', () => btn.setBackgroundColor('#546e7a'));
  btn.on('pointerout', () => btn.setBackgroundColor('#37474f'));
  btn.on('pointerdown', open);
  scene.input.keyboard!.on('keydown-R', open);
  onPadButton(scene, (b) => b === PAD.Y && open());
  scene.events.on(Phaser.Scenes.Events.RESUME, () => (blockedUntil = performance.now() + 300));
  return () => performance.now() > blockedUntil && scene.scene.isActive();
}
