import Phaser from 'phaser';
import { showBanners, showRunUnlocks } from '../systems/Banners';
import { Achievements, SPEEDRUN_TIME } from '../state/Achievements';
import { MUTATORS } from '../state/GeneBank';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { TOTAL_STAGES } from '../data/stages';
import { BODY_RADIUS } from '../art/textures';
import { RunSave } from '../state/RunSave';
import { Settings } from '../state/Settings';
import { GameState } from '../state/GameState';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';
import { addReportButton } from '../systems/ReportButton';
import { showGenesBanked } from '../systems/GeneBadge';
import { RunHistory, formatTime, type Ending } from '../state/RunHistory';

export type { Ending } from '../state/RunHistory';

interface EndingDef {
  achievement: string;
  title: string;
  label: string;
  color: string;
  bg: number;
  texture: string;
  line: string;
  /** Second stats line, given what the finale reported. */
  stats: (d: { conquered: number; converted: number }) => string;
  decreesTitle: string;
  decrees: string[];
  confetti: number[];
}

const ENDINGS: Record<Ending, EndingDef> = {
  normal: {
    achievement: 'normal_ending',
    title: 'WORLD DOMINATION',
    label: 'NORMAL ENDING',
    color: '#ffd54f',
    bg: 0x120a24,
    texture: 'overlord',
    line: 'From mosquito to master of Earth. All hail the Overlord.',
    stats: (d) => `Regions conquered: ${d.conquered}   ·   Regions converted: ${d.converted}`,
    decreesTitle: 'FIRST DECREES OF THE OVERLORD',
    decrees: [
      'Mondays are now mandatory feeding days.',
      'All bug spray is hereby reclassified as perfume.',
      'Every city must keep one capybara for snacking purposes.',
      'Swatting is punishable by being swatted.',
      'The national anthem is now a low, continuous buzz.',
      'Frogs are to apologise. Publicly.',
    ],
    confetti: [0xffd54f, 0x7c4dff, 0xd4ff7a, 0xff80ab, 0x8be9fd],
  },
  aerial: {
    achievement: 'aerial_ending',
    title: 'LORD OF THE SKIES',
    label: 'AERIAL ENDING',
    color: '#90caf9',
    bg: 0x0c1a30,
    texture: 'sovereign',
    line: 'From mosquito to master of the weather. All hail the Storm Sovereign.',
    stats: (d) => `Skies darkened: ${d.conquered}`,
    decreesTitle: 'FIRST DECREES OF THE STORM SOVEREIGN',
    decrees: [
      'Umbrellas are now classified as weapons.',
      'Every picnic will be rained on. Personally.',
      'Airports are now nests.',
      'Weather forecasts must be submitted for approval.',
      'Kites are hereby banned. They know what they did.',
      'Pigeons have been promoted to middle management.',
    ],
    confetti: [0x90caf9, 0xe3f2fd, 0xfff59d, 0x9fa8da],
  },
  abyssal: {
    achievement: 'abyssal_ending',
    title: 'LORD OF THE DEEP',
    label: 'ABYSSAL ENDING',
    color: '#4dd0e1',
    bg: 0x04161f,
    texture: 'leviathan',
    line: 'From mosquito to monster of the deep. All hail the Leviathan.',
    stats: (d) => `Cities drowned: ${d.conquered}`,
    decreesTitle: 'FIRST DECREES OF THE LEVIATHAN',
    decrees: [
      'All beaches are now my beaches.',
      'Fish sticks are hereby a war crime.',
      'Submarines must knock first.',
      'Surfing is permitted only on my back.',
      'Every rubber duck must pledge allegiance.',
      'The ocean is no longer for swimming. It is for me.',
    ],
    confetti: [0x4dd0e1, 0x80cbc4, 0xb2ebf2, 0x26a69a],
  },
  hive: {
    achievement: 'hive_ending',
    title: 'QUEEN OF THE SWARM',
    label: 'HIVE ENDING',
    color: '#ffca28',
    bg: 0x1f1604,
    texture: 'hivequeen',
    line: 'From mosquito to mother of billions. All hail the Hive Queen.',
    stats: (d) => `Cities taken: ${d.conquered}`,
    decreesTitle: 'FIRST DECREES OF THE HIVE QUEEN',
    decrees: [
      'Every garden must contain at least one flower per citizen.',
      'Honey is now the official currency.',
      'Swatting is reclassified as treason.',
      'All picnics are hereby tribute.',
      'Fly swatters are to be melted into tiny crowns.',
      'Everyone buzzes on Thursdays.',
    ],
    confetti: [0xffca28, 0xffb300, 0x212121, 0xfff59d],
  },
};

/** An ending reached. Expects data { ending, conquered, converted, mapTime }. */
export class VictoryScene extends Phaser.Scene {
  private confetti: { s: Phaser.GameObjects.Image; vx: number; vy: number; spin: number }[] = [];
  private palette: number[] = ENDINGS.normal.confetti;

  constructor() {
    super('Victory');
  }

  create(data: { ending?: Ending; conquered: number; converted: number; mapTime: number }): void {
    const s = GameState;
    const e = ENDINGS[data.ending ?? 'normal'];
    RunSave.clear();
    Achievements.unlock(e.achievement);
    if (s.difficulty === 'hard') Achievements.unlock('hard_win');
    if (s.timeAlive < SPEEDRUN_TIME) Achievements.unlock('speedrun');
    for (const m of s.mutators) Achievements.unlock(`${m}_win`);
    if (s.mutators.length === MUTATORS.length) Achievements.unlock('all_mutators');
    const cx = GAME_WIDTH / 2;
    this.confetti = [];
    this.palette = e.confetti;
    this.cameras.main.setBackgroundColor(e.bg);
    // fades in from white, or from black with flashes off
    const fade = Settings.effect('flashes') ? 255 : 0;
    this.cameras.main.fadeIn(800, fade, fade, fade);
    Sfx.stopAmbient();
    Sfx.play('victory');

    const overlord = this.add.image(cx, 184, e.texture).setScale(58 / BODY_RADIUS);
    this.tweens.add({ targets: overlord, scale: 64 / BODY_RADIUS, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });

    this.add
      .text(cx, 46, e.title, { fontFamily: FONT, fontSize: '60px', color: e.color, stroke: '#000', strokeThickness: 10, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 92, e.label, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5);
    this.add.text(cx, 262, e.line, { fontFamily: FONT, fontSize: '22px', color: '#e8f5e9' }).setOrigin(0.5);

    // the run goes into the history; a faster win than ever before is a new record
    showGenesBanked(this, true);
    // under the decrees
    showRunUnlocks(this, 600);
    const ending = data.ending ?? 'normal';
    const saved = RunHistory.save(true, ending, e.label);
    if (s.difficulty === 'nightmare') {
      Achievements.unlock('nightmare_win');
      if (s.secondWindsUsed === 0) Achievements.unlock('nightmare_nowind');
      if (s.mutators.length === MUTATORS.length) Achievements.unlock('nightmare_mutators');
      // checked after saving, so this win counts
      const endings: Ending[] = ['normal', 'aerial', 'abyssal', 'hive'];
      if (endings.every((en) => RunHistory.hasWon(en, 'nightmare'))) Achievements.unlock('nightmare_all');
    }
    const recordLine = saved.newBest
      ? `★ NEW RECORD: ${formatTime(saved.record.time)} on ${s.diff.name}${saved.previousBest !== undefined ? `  (was ${formatTime(saved.previousBest)})` : ''}`
      : `Best ${e.label.toLowerCase()} on ${s.diff.name}: ${formatTime(saved.previousBest!)}  ·  this run ${formatTime(saved.record.time)}`;
    const rec = this.add
      .text(cx, 288, recordLine, { fontFamily: FONT, fontSize: '17px', color: saved.newBest ? '#ffd54f' : '#b0bec5', fontStyle: 'bold' })
      .setOrigin(0.5);
    if (saved.newBest) this.tweens.add({ targets: rec, scale: 1.08, yoyo: true, repeat: -1, duration: 600 });

    // the full evolution ladder, all lit
    const stepW = 170;
    const x0 = cx - ((TOTAL_STAGES - 1) * stepW) / 2;
    const g = this.add.graphics();
    for (let i = 0; i < TOTAL_STAGES; i++) {
      const x = x0 + i * stepW;
      if (i > 0) {
        g.lineStyle(4, 0xd4ff7a, 1);
        g.lineBetween(x - stepW + 22, 312, x - 22, 312);
      }
      g.fillStyle(i === TOTAL_STAGES - 1 ? 0xffd54f : 0xd4ff7a, 1);
      g.fillCircle(x, 312, i === TOTAL_STAGES - 1 ? 18 : 14);
      this.add.text(x, 340, GameState.formName(i), { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5, 0);
    }

    const total = Math.floor(s.timeAlive);
    const fusions = s.fusions.length ? ` (${s.fusions.length} fusions)` : '';
    this.add
      .text(
        cx,
        388,
        [
          `Difficulty: ${s.diff.name}   ·   Total time: ${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}   ·   Things eaten: ${s.eaten}   ·   DNA: ${Math.floor(s.dnaTotal)}`,
          `Traits: ${s.traitEntries().length}${fusions}   ·   ${e.stats(data)}`,
        ].join('\n'),
        { fontFamily: FONT, fontSize: '18px', color: '#e0e0e0', align: 'center', lineSpacing: 8 },
      )
      .setOrigin(0.5, 0);

    const decrees = Phaser.Utils.Array.Shuffle([...e.decrees]).slice(0, 3);
    this.add.text(cx, 470, e.decreesTitle, { fontFamily: FONT, fontSize: '18px', color: '#8be9fd', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.add
      .text(cx, 498, decrees.map((d, i) => `${i + 1}. ${d}`).join('\n'), {
        fontFamily: FONT, fontSize: '17px', color: '#e8f5e9', align: 'center', lineSpacing: 6, fontStyle: 'italic',
      })
      .setOrigin(0.5, 0);

    const again = this.add
      .text(cx, GAME_HEIGHT - 44, 'Click or press SPACE to evolve again', { fontFamily: FONT, fontSize: '26px', color: '#ffffff', stroke: '#000', strokeThickness: 5, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tweens.add({ targets: again, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });

    const canLeave = addReportButton(this, { record: saved.record });
    this.time.delayedCall(1200, () => {
      let left = false;
      const go = () => {
        if (left || !canLeave()) return;
        left = true;
        GameState.reset();
        this.scene.start('Menu');
      };
      this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => over.length || go());
      this.input.keyboard!.on('keydown-SPACE', go);
      onPadButton(this, (b) => (b === PAD.A || b === PAD.START) && go());
    });
  }

  update(_t: number, deltaMs: number): void {
    showBanners(this);
    const dt = deltaMs / 1000;
    if (this.confetti.length < 120 && Math.random() < 0.5) {
      const s = this.add
        .image(Phaser.Math.Between(0, GAME_WIDTH), -10, 'spark')
        .setTint(Phaser.Utils.Array.GetRandom(this.palette))
        .setScale(Phaser.Math.FloatBetween(0.4, 0.9), Phaser.Math.FloatBetween(0.8, 1.4))
        .setDepth(-1);
      this.confetti.push({ s, vx: Phaser.Math.FloatBetween(-40, 40), vy: Phaser.Math.FloatBetween(80, 160), spin: Phaser.Math.FloatBetween(-4, 4) });
    }
    for (const c of this.confetti) {
      c.s.x += c.vx * dt;
      c.s.y += c.vy * dt;
      c.s.rotation += c.spin * dt;
      if (c.s.y > GAME_HEIGHT + 20) {
        c.s.setPosition(Phaser.Math.Between(0, GAME_WIDTH), -10);
      }
    }
  }
}
