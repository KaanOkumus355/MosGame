import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { GameState } from '../state/GameState';
import { Sfx } from '../audio/Sfx';
import { PAD, keyLabel, moveLabel, onPadButton } from '../systems/Controls';

/** What paused: the scene to resume (a stage, with its HUD, or a finale) and its controls line. */
export interface PauseData {
  from?: string;
  help?: string;
}

const stageHelp = (): string =>
  `Move: ${moveLabel()} / arrows / hold left mouse   ·   ${keyLabel('signature')}: signature ability\n` +
  `${keyLabel('primary')} or right-click: venom   ·   ${keyLabel('dash')}: dash   ·   ESC / P: pause`;

/** ESC/P menu over a paused stage or finale: continue, restart the run, or go back to the title. */
export class PauseScene extends Phaser.Scene {
  private from = 'Stage';
  private buttons: { bg: Phaser.GameObjects.Rectangle; onClick: () => void }[] = [];
  /** Gamepad-highlighted button (-1 = none). */
  private focus = -1;
  /** Ignore keys briefly after coming back from Options, so its ESC doesn't also unpause. */
  private blockUntil = 0;

  constructor() {
    super('Pause');
  }

  create(data?: PauseData): void {
    this.from = data?.from ?? 'Stage';
    // finales come later in the scene list and would otherwise draw over the menu
    this.scene.bringToTop();
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05020c, 0.72).setOrigin(0);
    this.add
      .text(cx, 140, 'PAUSED', { fontFamily: FONT, fontSize: '64px', color: '#d4ff7a', stroke: '#000', strokeThickness: 9, fontStyle: 'bold' })
      .setOrigin(0.5);

    const s = GameState;
    const mins = Math.floor(s.timeAlive / 60);
    const secs = Math.floor(s.timeAlive % 60).toString().padStart(2, '0');
    this.add
      .text(cx, 205, `${s.stageDef().creatureName} · ${s.traitEntries().length} traits · ${s.eaten} things eaten · ${mins}:${secs}`, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#c8e6c9',
      })
      .setOrigin(0.5);

    this.buttons = [];
    this.focus = -1;
    this.button(cx, 268, 'Continue', 'ESC', () => this.resume());
    this.button(cx, 338, 'Options', 'O', () => this.openOptions());
    this.button(cx, 408, 'Restart run', 'R', () => this.restart());
    this.button(cx, 478, 'Main menu', 'M', () => this.toMenu());

    this.add
      .text(
        cx,
        580,
        data?.help ?? stageHelp(),
        { fontFamily: FONT, fontSize: '15px', color: '#9e95b0', align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5);
    const audio = this.add.text(cx, 640, '', { fontFamily: FONT, fontSize: '15px', color: '#c8e6c9' }).setOrigin(0.5);
    const refreshAudio = () => audio.setText(`S: sound ${Sfx.sfxOn ? 'ON' : 'OFF'}   ·   U: music ${Sfx.musicOn ? 'ON' : 'OFF'}`);
    refreshAudio();
    // scene events outlive a restart, so drop the last visit's listener first
    this.events.off(Phaser.Scenes.Events.RESUME);
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.blockUntil = performance.now() + 250;
      refreshAudio();
    });
    onPadButton(this, (b) => {
      if (b === PAD.START || b === PAD.B) this.resume();
      else if (b === PAD.UP || b === PAD.DOWN) this.focusButton(this.focus + (b === PAD.DOWN ? 1 : -1));
      else if (b === PAD.A && this.focus >= 0) this.buttons[this.focus].onClick();
    });

    // short delay so the key that opened the menu doesn't instantly close it
    this.time.delayedCall(200, () => {
      const kb = this.input.keyboard!;
      kb.on('keydown-ESC', () => this.resume());
      kb.on('keydown-P', () => this.resume());
      kb.on('keydown-ENTER', () => this.resume());
      kb.on('keydown-R', () => this.restart());
      kb.on('keydown-O', () => this.openOptions());
      kb.on('keydown-M', () => this.toMenu());
      kb.on('keydown-S', () => {
        Sfx.setSfx(!Sfx.sfxOn);
        Sfx.play('ui');
        refreshAudio();
      });
      kb.on('keydown-U', () => {
        Sfx.setMusic(!Sfx.musicOn);
        refreshAudio();
      });
    });
  }

  private button(x: number, y: number, label: string, key: string, onClick: () => void): void {
    const w = 320;
    const h = 58;
    const bg = this.add.rectangle(x, y, w, h, 0x16121f, 0.95).setStrokeStyle(3, 0x8be9fd).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(x + w / 2 - 12, y, key, { fontFamily: FONT, fontSize: '13px', color: '#8f87a0' }).setOrigin(1, 0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x2a2340, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x16121f, 0.95));
    bg.on('pointerdown', () => {
      Sfx.play('ui');
      onClick();
    });
    this.buttons.push({ bg, onClick });
  }

  private focusButton(i: number): void {
    const n = this.buttons.length;
    if (this.focus >= 0) this.buttons[this.focus].bg.setFillStyle(0x16121f, 0.95);
    this.focus = this.focus < 0 ? 0 : (i + n) % n;
    this.buttons[this.focus].bg.setFillStyle(0x2a2340, 1);
    Sfx.play('ui');
  }

  private openOptions(): void {
    this.scene.pause();
    this.scene.launch('Options', { from: 'Pause' });
  }

  private resume(): void {
    if (performance.now() < this.blockUntil) return;
    if (this.from === 'Stage') this.scene.resume('HUD');
    this.scene.resume(this.from);
    this.scene.stop();
  }

  /** Stops whatever was paused (and the stage HUD) before leaving. */
  private leave(): void {
    this.scene.stop('HUD');
    this.scene.stop(this.from);
  }

  private restart(): void {
    GameState.reset();
    this.leave();
    this.scene.start('Stage');
  }

  private toMenu(): void {
    this.leave();
    this.scene.start('Menu');
  }
}
