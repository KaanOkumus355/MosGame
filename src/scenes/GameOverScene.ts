import Phaser from 'phaser';
import { showBanners, showRunUnlocks } from '../systems/Banners';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { TOTAL_STAGES } from '../data/stages';
import { RunSave } from '../state/RunSave';
import { GameState } from '../state/GameState';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';
import { addReportButton } from '../systems/ReportButton';
import { showGenesBanked } from '../systems/GeneBadge';
import { RunHistory } from '../state/RunHistory';

const DEATH_TITLES = ['SWATTED.', 'LUNCH.', 'EXTINCT.', 'DE-EVOLVED.', 'NATURAL SELECTION SAYS NO.'];

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(): void {
    const s = GameState;
    const stage = s.stageDef();
    // the run is over: nothing to continue
    RunSave.clear();
    Sfx.stopAmbient();
    Sfx.play('lose');
    const cx = GAME_WIDTH / 2;
    this.cameras.main.setBackgroundColor(0x120808);

    this.add
      .text(cx, 130, Phaser.Utils.Array.GetRandom(DEATH_TITLES), { fontFamily: FONT, fontSize: '72px', color: '#ff5566', stroke: '#000', strokeThickness: 10, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 210, `Killed by ${s.killedBy || 'mysterious forces'}.   (${s.diff.name})`, { fontFamily: FONT, fontSize: '24px', color: '#ffd0d6' })
      .setOrigin(0.5);

    // evolution ladder: how far you got
    const stepW = 170;
    const x0 = cx - ((TOTAL_STAGES - 1) * stepW) / 2;
    const g = this.add.graphics();
    for (let i = 0; i < TOTAL_STAGES; i++) {
      const x = x0 + i * stepW;
      const reached = i <= s.stageIndex;
      if (i > 0) {
        g.lineStyle(4, i <= s.stageIndex ? 0xd4ff7a : 0x444444, 1);
        g.lineBetween(x - stepW + 22, 330, x - 22, 330);
      }
      g.fillStyle(i === s.stageIndex ? 0xff5566 : reached ? 0xd4ff7a : 0x333333, 1);
      g.fillCircle(x, 330, i === s.stageIndex ? 18 : 14);
      this.add
        .text(x, 362, s.formName(i), { fontFamily: FONT, fontSize: '16px', color: reached ? '#ffffff' : '#777777' })
        .setOrigin(0.5, 0);
    }
    this.add
      .text(cx, 280, `You evolved as far as: ${stage.creatureName} (stage ${s.stageIndex + 1} of ${TOTAL_STAGES})`, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const mins = Math.floor(s.timeAlive / 60);
    const secs = Math.floor(s.timeAlive % 60).toString().padStart(2, '0');
    const summary = this.add
      .text(
        cx,
        450,
        [
          `Things eaten: ${s.eaten}`,
          `Total DNA: ${Math.floor(s.dnaTotal)}`,
          `Traits: ${s.traitNames().join(', ') || 'none'}`,
          `Survived: ${mins}:${secs}`,
          '',
          `"${stage.epitaph}"`,
        ].join('\n'),
        { fontFamily: FONT, fontSize: '20px', color: '#e0e0e0', align: 'center', lineSpacing: 6, wordWrap: { width: GAME_WIDTH - 160 } },
      )
      .setOrigin(0.5, 0);
    // a long trait list wraps; shrink the text if that would run into the prompt below
    for (let size = 19; summary.y + summary.height > GAME_HEIGHT - 80 && size >= 14; size--) summary.setFontSize(size);

    const again = this.add
      .text(cx, GAME_HEIGHT - 50, 'Click or press SPACE to hatch again', { fontFamily: FONT, fontSize: '26px', color: '#ffffff', stroke: '#000', strokeThickness: 5, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tweens.add({ targets: again, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });

    showGenesBanked(this, false);
    // between the evolution ladder and the run summary
    showRunUnlocks(this, 404);
    const { record } = RunHistory.save(false);
    const canLeave = addReportButton(this, { record });
    // short delay so a panicked click doesn't skip the screen
    this.time.delayedCall(700, () => {
      let left = false;
      const go = () => {
        if (left || !canLeave()) return;
        left = true;
        GameState.reset();
        this.scene.start('Stage');
      };
      this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => over.length || go());
      this.input.keyboard!.on('keydown-SPACE', go);
      onPadButton(this, (b) => (b === PAD.A || b === PAD.START) && go());
    });
  }

  update(): void {
    showBanners(this);
  }
}
