import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { TOTAL_STAGES } from '../data/stages';
import { CREATURES } from '../data/creatures';
import { SIGNATURES } from '../data/signatures';
import { BODY_RADIUS } from '../art/textures';
import { sceneForStage } from '../state/RunSave';
import { Settings } from '../state/Settings';
import { GameState, HP_PER_STAGE } from '../state/GameState';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';

/** Display radius (px) of the creature in the middle of the screen. */
const SHOW_RADIUS = 48;
const CREATURE_Y = 150;
/** Trait grid: max rows per column before adding another column. */
const GRID_ROWS = 7;
const GRID_ROW_H = 21;

/**
 * Metamorphosis screen between arena stages: the old creature shakes, flashes and pops out
 * as the new one, then shows what changed. Secret forms come from mutations picked earlier
 * (GameState.forms). Expects data { from: stageIndex }.
 */
export class TransitionScene extends Phaser.Scene {
  constructor() {
    super('Transition');
  }

  create(data: { from: number }): void {
    const toIndex = data.from + 1;
    this.cameras.main.setBackgroundColor(0x05080a);
    this.metamorph(toIndex - 1);
  }

  /** The shake, flash and reveal of the new form, then what changed. */
  private metamorph(fromIndex: number): void {
    const from = GameState.stageDef(fromIndex);
    const toIndex = fromIndex + 1;
    const to = GameState.stageDef(toIndex);
    const cx = GAME_WIDTH / 2;

    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, to.groundTexture).setOrigin(0).setAlpha(0.25);

    const title = this.add
      .text(cx, 44, 'METAMORPHOSIS!', { fontFamily: FONT, fontSize: '48px', color: '#d4ff7a', stroke: '#000', strokeThickness: 9, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 400 });

    const bug = this.add.image(cx, CREATURE_Y, from.playerTexture).setScale(SHOW_RADIUS / BODY_RADIUS);
    // the rising sweep is timed to land on the flash
    Sfx.play('metamorph');

    // 1) wobble and swell
    this.tweens.add({ targets: bug, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 12 });
    this.tweens.add({ targets: bug, scale: (SHOW_RADIUS * 1.35) / BODY_RADIUS, duration: 1100, ease: 'Quad.easeIn' });

    // 2) flash, burst, swap
    this.time.delayedCall(1150, () => {
      if (Settings.effect('flashes')) {
        // a bright bloom on the creature itself, and only a soft, quick blink over the rest
        const flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.3).setOrigin(0);
        this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
        const bloom = this.add.circle(cx, CREATURE_Y, SHOW_RADIUS * 1.2, 0xffffff, 0.95);
        this.tweens.add({ targets: bloom, scale: 3.2, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => bloom.destroy() });
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const spark = this.add.image(cx, CREATURE_Y, 'spark').setTint(0xd4ff7a).setScale(1.2);
        this.tweens.add({
          targets: spark,
          x: cx + Math.cos(a) * 200,
          y: CREATURE_Y + Math.sin(a) * 200,
          alpha: 0,
          scale: 0.3,
          duration: 700,
          ease: 'Quad.easeOut',
          onComplete: () => spark.destroy(),
        });
      }
      bug.setTexture(to.playerTexture).setAngle(-90).setScale(0.2);
      this.tweens.add({ targets: bug, scale: SHOW_RADIUS / BODY_RADIUS, duration: 500, ease: 'Back.easeOut' });
      this.tweens.add({ targets: bug, angle: -90 + 360, duration: 8000, repeat: -1 });
      this.showText(from.creatureName, toIndex);
    });
  }

  /** Creatures in the new stage that you met in an earlier one (former threats are now food). */
  private returningCreatures(toIndex: number): string[] {
    const path = Array.from({ length: toIndex }, (_, i) => GameState.stageDef(i));
    const earlier = new Set(path.flatMap((s) => s.spawns.map((sp) => CREATURES[sp.creature].name)));
    const names = GameState.stageDef(toIndex).spawns.map((sp) => CREATURES[sp.creature].name).filter((n) => earlier.has(n));
    return [...new Set(names)];
  }

  private showText(fromName: string, toIndex: number): void {
    const to = GameState.stageDef(toIndex);
    const cx = GAME_WIDTH / 2;
    const items: Phaser.GameObjects.Text[] = [];
    let y = 236;
    const line = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle, gap = 6) => {
      const t = this.add
        .text(cx, y, text, { fontFamily: FONT, align: 'center', wordWrap: { width: 1000 }, ...style })
        .setOrigin(0.5, 0)
        .setAlpha(0);
      items.push(t);
      y += t.height + gap;
      return t;
    };

    line(`${fromName}  →  ${to.creatureName}`, { fontSize: '30px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }, 4);
    line(`Stage ${toIndex + 1} of ${TOTAL_STAGES} · Welcome to ${to.biome}`, { fontSize: '18px', color: '#c8e6c9' }, 2);
    if (to.arrival) line(to.arrival, { fontSize: '16px', color: '#e0e0e0', fontStyle: 'italic' }, 10);

    const newMax = GameState.stats.maxHp + HP_PER_STAGE;
    line(`Bigger body: +${HP_PER_STAGE} max health (${GameState.stats.maxHp} → ${newMax})`, { fontSize: '16px', color: '#ff8a95', fontStyle: 'bold' }, 4);
    const sig = SIGNATURES[to.signature];
    line(`New signature ability, ${sig.name}${sig.key ? ` (${sig.key})` : ''}: ${sig.description}`, { fontSize: '15px', color: '#ffd54f' }, 4);
    const back = this.returningCreatures(toIndex);
    if (back.length) line(`Back on the menu: ${back.join(', ')}`, { fontSize: '15px', color: '#9dff6a' }, 10);

    // traits carry forward and take a new form, laid out as a compact grid
    const entries = GameState.traitEntries(toIndex);
    const before = GameState.traitEntries(toIndex - 1);
    if (entries.length) {
      line('Your traits evolve with you:', { fontSize: '15px', color: '#8be9fd', fontStyle: 'bold' }, 6);
      const cols = Math.ceil(entries.length / GRID_ROWS);
      const colW = Math.min(420, (GAME_WIDTH - 80) / cols);
      const rows = Math.ceil(entries.length / cols);
      entries.forEach((e, i) => {
        const col = Math.floor(i / rows);
        const row = i % rows;
        const old = before[i]?.name;
        const text = e.fusion ? `★ ${e.name}` : old && old !== e.name ? `${old} → ${e.name}` : `${e.name} (kept)`;
        const x = cx - (cols * colW) / 2 + col * colW + colW / 2;
        const t = this.add
          .text(x, y + row * GRID_ROW_H, text, {
            fontFamily: FONT,
            fontSize: cols > 2 ? '13px' : '14px',
            color: e.fusion ? '#ffd54f' : '#e8f5e9',
            align: 'center',
            fixedWidth: colW - 10,
          })
          .setOrigin(0.5, 0)
          .setAlpha(0);
        items.push(t);
      });
    }

    const go = this.add
      .text(cx, GAME_HEIGHT - 34, 'Click or press SPACE to continue', {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    items.push(go);

    items.forEach((t, i) => this.tweens.add({ targets: t, alpha: 1, duration: 300, delay: 200 + Math.min(i, 12) * 70 }));
    this.tweens.add({ targets: go, alpha: 0.4, yoyo: true, repeat: -1, duration: 700, delay: 1400 });

    this.time.delayedCall(900, () => {
      let done = false;
      const next = () => {
        if (done) return;
        done = true;
        GameState.stageIndex = toIndex;
        GameState.addStageBonus();
        GameState.hp = GameState.stats.maxHp;
        // the last metamorphosis leads to a finale instead of another arena
        this.scene.start(sceneForStage(toIndex));
      };
      this.input.once('pointerdown', next);
      this.input.keyboard!.once('keydown-SPACE', next);
      onPadButton(this, (b) => (b === PAD.A || b === PAD.START) && next());
    });
  }
}
