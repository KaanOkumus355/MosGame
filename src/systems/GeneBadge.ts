import Phaser from 'phaser';
import { FONT, GAME_HEIGHT } from '../config';
import { GameState } from '../state/GameState';
import { GeneBank } from '../state/GeneBank';

/** "DNA 12 · stages 25 · bosses 20 · win 30 · mutators +25%": where this run's genes came from. */
function breakdown(): string {
  const b = GameState.geneBreakdown;
  if (!b) return '';
  const { dna, stages, bosses, win } = b.parts;
  const parts = [`DNA ${dna}`, `stages ${stages}`];
  if (bosses) parts.push(`bosses ${bosses}`);
  if (win) parts.push(`win ${win}`);
  if (b.mutatorBonus) parts.push(`mutators +${Math.round(b.mutatorBonus * 100)}%`);
  if (b.difficultyMul > 1) parts.push(`${GameState.diff.name.split(' + ')[0]} +${Math.round((b.difficultyMul - 1) * 100)}%`);
  return parts.join('  ·  ');
}

/** Banks the run's genes and shows what was earned in the end screen's bottom-left corner. */
export function showGenesBanked(scene: Phaser.Scene, won: boolean): void {
  const gained = GameState.bankGenes(won);
  const x = 24;
  const y = GAME_HEIGHT - 24;
  const head = scene.add
    .text(x, y, `🧬 +${gained} genes banked  (${GeneBank.genes} to spend)`, { fontFamily: FONT, fontSize: '20px', color: '#d4ff7a', fontStyle: 'bold' })
    .setOrigin(0, 1);
  // the breakdown sits on top of the total
  const parts = scene.add.text(x, y - head.height - 2, breakdown(), { fontFamily: FONT, fontSize: '13px', color: '#a5c99a' }).setOrigin(0, 1);
  const w = Math.max(head.width, parts.width) + 28;
  const h = head.height + parts.height + 18;
  const bg = scene.add.rectangle(x - 14, y + 8, w, h, 0x1b2a1e).setOrigin(0, 1);
  const all = [bg, parts, head];
  all.forEach((o, i) => o.setDepth(10 + i * 0.1).setAlpha(0));
  scene.tweens.add({ targets: all, alpha: 1, duration: 500, delay: 600 });
}
