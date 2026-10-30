import Phaser from 'phaser';
import { ACHIEVEMENTS, Achievements } from '../state/Achievements';
import { showBanners } from '../systems/Banners';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { BODY_RADIUS } from '../art/textures';
import { DIFFICULTIES, DIFFICULTY_ORDER, loadDifficulty, saveDifficulty, type Difficulty } from '../data/difficulty';
import { GameState } from '../state/GameState';
import { RunSave } from '../state/RunSave';
import { GeneBank } from '../state/GeneBank';
import { Codex, FORM_COUNT } from '../state/Codex';
import { RunHistory, formatTime, type Ending } from '../state/RunHistory';
import { PAD, onPadButton } from '../systems/Controls';
import { Fx } from '../systems/Fx';
import { ATMOSPHERE } from '../data/atmosphere';
import { BRANCH_STAGES, OVERLORDS, STAGES, TOTAL_STAGES, stageInfo } from '../data/stages';
import { Sfx } from '../audio/Sfx';

/** Nightmare opens up once you've reached any ending on Hard. */
const nightmareUnlocked = () => Achievements.has('hard_win');

const STACK_X = 390;
const STACK_W = 340;
const STACK_TOP = 300;
const SIDE_X = 610;
const SIDE_W = 500;
/** The evolution parade under the title. */
const PARADE_Y = 196;
const PARADE_STEP = 112;
/** Dark shapes drifting under the swamp's surface. */
const DRIFTERS = ['frog', 'dragonfly', 'moth', 'capybara', 'snake', 'bird'];
const HOW_TO_PLAY = [
  'Eat things smaller than you. Avoid things bigger than you.',
  'Fill the DNA bar to pick a new trait.',
  'Grow big enough and you evolve into something worse.',
  '',
  'A coloured outline shows what is food, a fair fight, or a threat.',
  'Beat each zone boss to evolve and earn a Trophy mutation.',
  '',
  'Move with WASD, the arrow keys, or by holding the mouse button.',
  'See Options for the rest of the controls.',
];

/** One button in the main stack. */
interface MenuButton {
  y: number;
  h: number;
  run: () => void;
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  color: number;
}

export class MenuScene extends Phaser.Scene {
  private bug!: Phaser.GameObjects.Image;
  private bugX = 0;
  private t = 0;
  private parade: { img: Phaser.GameObjects.Image; phase: number }[] = [];
  private drifters: { img: Phaser.GameObjects.Image; speed: number; y: number }[] = [];
  private fx!: Fx;
  private buttons: MenuButton[] = [];
  private focus = 0;
  private chips: { id: Difficulty; text: Phaser.GameObjects.Text }[] = [];
  private diffBlurb!: Phaser.GameObjects.Text;
  private audioText!: Phaser.GameObjects.Text;
  /** The How to play panel while it is open. */
  private howTo: Phaser.GameObjects.Container | null = null;
  /** Loads the saved run and jumps into it (set up in create). */
  private continueRun: () => void = () => {};

  constructor() {
    super('Menu');
  }

  create(): void {
    Sfx.stopAmbient();
    // a continued run plays at its own difficulty; the menu shows your chosen one again
    GameState.difficulty = loadDifficulty();
    if (GameState.difficulty === 'nightmare' && !nightmareUnlocked()) GameState.difficulty = 'hard';
    this.buttons = [];
    this.chips = [];
    this.focus = 0;
    this.t = 0;
    this.howTo = null;

    this.background();
    this.title();
    this.paradeOfForms();
    if (RunSave.takeOutdated()) {
      this.add
        .text(GAME_WIDTH / 2, 278, `Your saved run was from the 6-stage version and can't be continued (the game now has ${TOTAL_STAGES} stages). Your Bestiary, Gene Bank and achievements are kept.`, {
          fontFamily: FONT, fontSize: '13px', color: '#ffcc80', stroke: '#000', strokeThickness: 3, align: 'center',
        })
        .setOrigin(0.5);
    }

    let started = false;
    let abandonArmed = false;
    const save = RunSave.info();
    const leaveTo = (scene: string) => {
      if (started || this.howTo) return;
      Sfx.unlock();
      Sfx.play('ui');
      this.scene.start(scene);
    };
    const openBestiary = () => leaveTo('Bestiary');
    const openBank = () => leaveTo('GeneBank');
    const openRecords = () => leaveTo('Records');
    const openOptions = () => {
      if (started || this.howTo) return;
      Sfx.unlock();
      Sfx.play('ui');
      this.scene.pause();
      this.scene.launch('Options', { from: 'Menu' });
    };
    const go = () => {
      if (started || this.howTo) return;
      // starting over replaces the saved run, so ask once first
      if (save && !abandonArmed) {
        abandonArmed = true;
        Sfx.unlock();
        Sfx.play('ui');
        newRun?.label.setText('Abandon saved run? Press again').setColor('#ff8a80');
        return;
      }
      started = true;
      Sfx.unlock();
      Sfx.play('pick');
      RunSave.clear();
      GameState.reset();
      this.scene.start('Stage');
    };
    this.continueRun = () => {
      if (started || this.howTo) return;
      const scene = RunSave.resume();
      if (!scene) return;
      started = true;
      Sfx.unlock();
      Sfx.play('pick');
      this.scene.start(scene);
    };

    // with a saved run, Continue is the main action and a new run needs a second press
    let y = STACK_TOP;
    let newRun: MenuButton | undefined;
    if (save) {
      const mins = Math.floor(save.time / 60);
      const secs = Math.floor(save.time % 60).toString().padStart(2, '0');
      const big = this.addButton(y, 58, `▶ Continue: ${save.form}`, 0x9dff6a, () => this.continueRun());
      const form = [...STAGES, ...BRANCH_STAGES, ...OVERLORDS].find((s) => s.creatureName === save.form);
      if (form) this.add.image(STACK_X - STACK_W / 2 + 32, y + 29, form.playerTexture).setScale(17 / BODY_RADIUS).setAngle(-90);
      big.label.setY(y + 20);
      this.add.text(STACK_X, y + 42, `stage ${save.stage + 1} of ${TOTAL_STAGES}  ·  ${save.difficulty}  ·  ${mins}:${secs}`, { fontFamily: FONT, fontSize: '12px', color: '#c5e1a5' }).setOrigin(0.5);
      y += 66;
      newRun = this.addButton(y, 40, 'New run  (N)', 0xc8e6c9, go);
      y += 48;
    } else {
      this.addButton(y, 58, '▶ Hatch', 0x9dff6a, go);
      y += 66;
    }
    this.addButton(y, 40, `Bestiary  (B)`, 0xd4ff7a, openBestiary);
    y += 48;
    const mutators = GeneBank.activeMutators.length;
    this.addButton(y, 40, `Gene Bank  (G)   🧬 ${GeneBank.genes}${mutators ? `  ·  ${mutators} on` : ''}`, 0x8be9fd, openBank);
    y += 48;
    this.addButton(y, 40, 'Records  (H)', 0xffd54f, openRecords);
    y += 48;
    this.addButton(y, 40, 'Options  (O)', 0xcfd8dc, openOptions);
    y += 48;
    this.addButton(y, 40, 'How to play  (I)', 0xcfd8dc, () => this.toggleHowTo());
    this.paintButtons();

    this.sidePanel();

    this.audioText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 16, '', { fontFamily: FONT, fontSize: '13px', color: '#9e9e9e', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5);
    this.refreshAudio();

    const activate = () => {
      if (this.howTo) return this.toggleHowTo();
      this.buttons[this.focus]?.run();
    };
    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', activate);
    kb.on('keydown-ENTER', activate);
    kb.on('keydown-C', () => this.continueRun());
    kb.on('keydown-N', go);
    kb.on('keydown-B', openBestiary);
    kb.on('keydown-G', openBank);
    kb.on('keydown-O', openOptions);
    kb.on('keydown-H', openRecords);
    kb.on('keydown-I', () => this.toggleHowTo());
    kb.on('keydown-ESC', () => this.howTo && this.toggleHowTo());
    kb.on('keydown-UP', () => this.moveFocus(-1));
    kb.on('keydown-DOWN', () => this.moveFocus(1));
    kb.on('keydown-LEFT', () => this.changeDifficulty(-1));
    kb.on('keydown-RIGHT', () => this.changeDifficulty(1));
    kb.on('keydown-S', () => {
      Sfx.unlock();
      Sfx.setSfx(!Sfx.sfxOn);
      Sfx.play('ui');
      this.refreshAudio();
    });
    kb.on('keydown-U', () => {
      Sfx.setMusic(!Sfx.musicOn);
      this.refreshAudio();
    });
    this.events.off(Phaser.Scenes.Events.RESUME);
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.refreshAudio());
    onPadButton(this, (b) => {
      Sfx.unlock();
      if (b === PAD.A || b === PAD.START) activate();
      else if (b === PAD.B && this.howTo) this.toggleHowTo();
      else if (b === PAD.X) go();
      else if (b === PAD.UP || b === PAD.DOWN) this.moveFocus(b === PAD.DOWN ? 1 : -1);
      else if (b === PAD.LEFT || b === PAD.RIGHT) this.changeDifficulty(b === PAD.RIGHT ? 1 : -1);
      else if (b === PAD.Y) openOptions();
      else if (b === PAD.LB) openBestiary();
      else if (b === PAD.RB) openBank();
      else if (b === PAD.BACK) openRecords();
    });
  }

  // ------------------------------------------------------------ backdrop

  /** The swamp, dark shapes drifting under it, fireflies, and darkened edges so the UI stands out. */
  private background(): void {
    this.cameras.main.setBackgroundColor(0x0f2016);
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'tile_swamp').setOrigin(0).setAlpha(0.6);
    this.drifters = DRIFTERS.map((key, i) => {
      // one above the title, the rest below the parade so they never cross it
      const y = i === 0 ? 40 : 290 + ((i - 1) * 380) / (DRIFTERS.length - 2);
      const speed = (i % 2 ? -1 : 1) * Phaser.Math.FloatBetween(10, 22);
      const img = this.add
        .image(Phaser.Math.Between(0, GAME_WIDTH), y, key)
        .setScale((30 + (i % 3) * 16) / BODY_RADIUS)
        .setRotation(speed > 0 ? 0 : Math.PI)
        .setTintFill(0x081309)
        .setAlpha(0.45);
      return { img, speed, y };
    });
    const g = this.add.graphics();
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.75, 0.75, 0, 0);
    g.fillRect(0, 0, W, 170);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.75, 0.75);
    g.fillRect(0, H - 170, W, 170);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.6, 0, 0.6, 0);
    g.fillRect(0, 0, 170, H);
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.6, 0, 0.6);
    g.fillRect(W - 170, 0, 170, H);
    this.fx = new Fx(this, 2);
    this.fx.setAmbient(ATMOSPHERE.swamp.particles);
  }

  private title(): void {
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, 70, 'SWARM TO SOVEREIGN', { fontFamily: FONT, fontSize: '64px', color: '#d4ff7a', stroke: '#0b1a0f', strokeThickness: 10, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 126, 'From bloodsucker to supreme ruler of Earth. Probably.', { fontFamily: FONT, fontSize: '21px', color: '#e8f5e9', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5);
  }

  /** The game in one picture: every main form, growing as it marches. Undiscovered ones are shadows. */
  private paradeOfForms(): void {
    const x0 = GAME_WIDTH / 2 - (PARADE_STEP * (TOTAL_STAGES - 1)) / 2;
    // a dark band keeps the drifting shapes from muddying the row
    this.add.rectangle(GAME_WIDTH / 2, PARADE_Y + 10, GAME_WIDTH, 126, 0x000000, 0.4);
    this.parade = [];
    for (let i = 0; i < TOTAL_STAGES; i++) {
      const st = stageInfo(i);
      // the mosquito is where everyone starts, so it's always known
      const known = i === 0 || Codex.hasForm(st.id);
      const x = x0 + i * PARADE_STEP;
      const img = this.add.image(x, PARADE_Y, st.playerTexture).setScale((14 + i * 5) / BODY_RADIUS);
      if (!known) img.setTintFill(0x2f4233);
      this.add
        .text(x, PARADE_Y + 54, known ? st.creatureName : '???', { fontFamily: FONT, fontSize: '12px', color: known ? '#e8f5e9' : '#7f8c82', stroke: '#000', strokeThickness: 3, fontStyle: 'bold' })
        .setOrigin(0.5);
      if (i > 0) this.add.text(x - PARADE_STEP / 2, PARADE_Y, '›', { fontFamily: FONT, fontSize: '24px', color: '#7f9a78', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
      if (i === 0) {
        this.bug = img;
        this.bugX = x;
      } else this.parade.push({ img, phase: i * 0.8 });
    }
  }

  // ------------------------------------------------------------ buttons

  private addButton(y: number, h: number, text: string, color: number, run: () => void): MenuButton {
    const index = this.buttons.length;
    const bg = this.add.graphics();
    const label = this.add
      .text(STACK_X, y + h / 2, text, { fontFamily: FONT, fontSize: h > 50 ? '22px' : '17px', color: `#${color.toString(16).padStart(6, '0')}`, fontStyle: 'bold' })
      .setOrigin(0.5);
    const b: MenuButton = { y, h, run, bg, label, color };
    this.buttons.push(b);
    const zone = this.add.zone(STACK_X - STACK_W / 2, y, STACK_W, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      this.focus = index;
      this.paintButtons();
    });
    zone.on('pointerup', () => run());
    return b;
  }

  /** The focused button lights up; the first one (Hatch / Continue) always stands out a little. */
  private paintButtons(): void {
    this.buttons.forEach((b, i) => {
      const on = i === this.focus;
      const x = STACK_X - STACK_W / 2;
      b.bg.clear();
      b.bg.fillStyle(on ? 0x2e4a2a : i === 0 ? 0x1f3320 : 0x151d18, 0.95);
      b.bg.fillRoundedRect(x, b.y, STACK_W, b.h, 10);
      b.bg.lineStyle(2, on ? b.color : i === 0 ? 0x5f8a4a : 0x2c3b30, 1);
      b.bg.strokeRoundedRect(x, b.y, STACK_W, b.h, 10);
    });
  }

  private moveFocus(d: number): void {
    if (this.howTo) return;
    Sfx.unlock();
    this.focus = (this.focus + d + this.buttons.length) % this.buttons.length;
    Sfx.play('ui');
    this.paintButtons();
  }

  private toggleHowTo(): void {
    Sfx.unlock();
    Sfx.play('ui');
    if (this.howTo) {
      this.howTo.destroy();
      this.howTo = null;
      return;
    }
    const w = 680;
    const h = 330;
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive();
    shade.on('pointerup', () => this.toggleHowTo());
    const g = this.add.graphics();
    g.fillStyle(0x151d18, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(2, 0xd4ff7a, 0.8);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    const head = this.add.text(0, -h / 2 + 30, 'HOW TO PLAY', { fontFamily: FONT, fontSize: '24px', color: '#d4ff7a', fontStyle: 'bold' }).setOrigin(0.5);
    const body = this.add.text(0, 8, HOW_TO_PLAY.join('\n'), { fontFamily: FONT, fontSize: '16px', color: '#e8f5e9', align: 'center', lineSpacing: 5 }).setOrigin(0.5);
    const close = this.add.text(0, h / 2 - 22, 'Click or press ESC to close', { fontFamily: FONT, fontSize: '13px', color: '#90a4ae' }).setOrigin(0.5);
    this.howTo = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [shade, g, head, body, close]).setDepth(50);
  }

  // ------------------------------------------------------------ difficulty and progress

  private sidePanel(): void {
    const g = this.add.graphics();
    g.fillStyle(0x151d18, 0.85);
    g.fillRoundedRect(SIDE_X, STACK_TOP, SIDE_W, 170, 12);
    g.fillRoundedRect(SIDE_X, STACK_TOP + 182, SIDE_W, 170, 12);
    this.add.text(SIDE_X + 18, STACK_TOP + 12, 'DIFFICULTY', { fontFamily: FONT, fontSize: '14px', color: '#8be9fd', fontStyle: 'bold' });
    const chipW = (SIDE_W - 36) / DIFFICULTY_ORDER.length;
    DIFFICULTY_ORDER.forEach((d, i) => {
      const text = this.add
        .text(SIDE_X + 18 + chipW * i + chipW / 2, STACK_TOP + 56, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', padding: { x: 10, y: 6 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      text.on('pointerup', () => this.pickDifficulty(d));
      this.chips.push({ id: d, text });
    });
    this.diffBlurb = this.add.text(SIDE_X + 18, STACK_TOP + 88, '', { fontFamily: FONT, fontSize: '14px', color: '#c5e1a5', lineSpacing: 3, wordWrap: { width: SIDE_W - 36 } });
    this.refreshDifficulty();

    // progress
    const py = STACK_TOP + 194;
    this.add.text(SIDE_X + 18, py, 'YOUR PROGRESS', { fontFamily: FONT, fontSize: '14px', color: '#ffd54f', fontStyle: 'bold' });
    const forms = [...STAGES, ...BRANCH_STAGES, ...OVERLORDS].filter((s) => Codex.hasForm(s.id)).length;
    const t = RunHistory.totals;
    const endings: Ending[] = ['normal', 'aerial', 'abyssal', 'hive'];
    const times = endings.flatMap((e) => DIFFICULTY_ORDER.map((d) => RunHistory.best(e, d))).filter((v): v is number => v !== undefined);
    const stats: [string, string][] = [
      ['Forms', `${forms} / ${FORM_COUNT}`],
      ['Achievements', `${Achievements.count} / ${ACHIEVEMENTS.length}`],
      ['Runs', t.runs ? `${t.runs}  (${t.wins} won)` : 'none yet'],
      ['Best time', times.length ? formatTime(Math.min(...times)) : '—'],
    ];
    stats.forEach(([label, value], i) => {
      const x = SIDE_X + 18 + (i % 2) * ((SIDE_W - 36) / 2);
      const y = py + 34 + Math.floor(i / 2) * 58;
      this.add.text(x, y, label, { fontFamily: FONT, fontSize: '12px', color: '#90a4ae' });
      this.add.text(x, y + 16, value, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' });
    });
  }

  private pickDifficulty(d: Difficulty): void {
    Sfx.unlock();
    if (d === 'nightmare' && !nightmareUnlocked()) {
      Sfx.play('ui');
      this.diffBlurb.setText('Locked. Reach any ending on Hard to unlock Nightmare.').setColor('#ff8a80');
      return;
    }
    GameState.difficulty = d;
    saveDifficulty(d);
    Sfx.play('ui');
    this.refreshDifficulty();
  }

  private changeDifficulty(dir: number): void {
    if (this.howTo) return;
    // Nightmare stays out of the cycle until you've won on Hard
    const order = DIFFICULTY_ORDER.filter((d) => d !== 'nightmare' || nightmareUnlocked());
    const i = Math.max(0, order.indexOf(GameState.difficulty));
    this.pickDifficulty(order[(i + dir + order.length) % order.length]);
  }

  private refreshDifficulty(): void {
    const d = DIFFICULTIES[GameState.difficulty];
    for (const c of this.chips) {
      const on = c.id === GameState.difficulty;
      const locked = c.id === 'nightmare' && !nightmareUnlocked();
      const hard = c.id === 'nightmare';
      c.text
        .setText(locked ? `🔒 ${DIFFICULTIES[c.id].name}` : DIFFICULTIES[c.id].name)
        .setColor(on ? '#10140f' : locked ? '#6f6a7d' : hard ? '#ff8a80' : '#c8e6c9')
        .setBackgroundColor(on ? (hard ? '#ff5252' : '#d4ff7a') : '#1b2420');
    }
    this.diffBlurb.setText(d.blurb).setColor('#c5e1a5');
  }

  private refreshAudio(): void {
    this.audioText.setText(`↑/↓: choose   ·   ←/→: difficulty   ·   SPACE: select   ·   S: sound ${Sfx.sfxOn ? 'ON' : 'OFF'}   ·   U: music ${Sfx.musicOn ? 'ON' : 'OFF'}`);
  }

  update(_time: number, deltaMs: number): void {
    showBanners(this);
    const dt = deltaMs / 1000;
    this.t += dt;
    // the mosquito buzzes figure-eights in its place at the head of the parade
    const x = this.bugX + Math.sin(this.t * 1.6) * 16;
    const y = PARADE_Y + Math.sin(this.t * 3.2) * 12;
    this.bug.setRotation(Math.atan2(y - this.bug.y, x - this.bug.x));
    this.bug.setPosition(x, y);
    for (const p of this.parade) p.img.y = PARADE_Y + Math.sin(this.t * 1.5 + p.phase) * 3;
    for (const d of this.drifters) {
      d.img.x += d.speed * dt;
      d.img.y = d.y + Math.sin(this.t * 0.4 + d.y) * 12;
      if (d.speed > 0 && d.img.x > GAME_WIDTH + 80) d.img.x = -80;
      if (d.speed < 0 && d.img.x < -80) d.img.x = GAME_WIDTH + 80;
    }
    this.fx.updateAmbient(dt, this.cameras.main);
  }
}
