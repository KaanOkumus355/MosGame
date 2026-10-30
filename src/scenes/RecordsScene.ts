import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../data/difficulty';
import { CREATURES } from '../data/creatures';
import { stageById } from '../data/stages';
import { BODY_RADIUS } from '../art/textures';
import { HISTORY_SIZE, RunHistory, formatTime, type Ending, type RunRecord } from '../state/RunHistory';
import { MUTATORS } from '../state/GeneBank';
import { damageKey } from '../state/GameState';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';

/** Each ending, with the final form of the line that reaches it (its icon in the table). */
const ENDING_ROWS: { id: Ending; name: string; texture: string }[] = [
  { id: 'normal', name: 'Normal ending', texture: 'overlord' },
  { id: 'aerial', name: 'Aerial ending', texture: 'sovereign' },
  { id: 'abyssal', name: 'Abyssal ending', texture: 'leviathan' },
  { id: 'hive', name: 'Hive ending', texture: 'hivequeen' },
];
const LEFT_X = 40;
const LEFT_W = 560;
const RIGHT_X = 620;
const RIGHT_W = 620;
const PANEL_TOP = 162;
const PANEL_H = 530;
const ROW_H = 24;

/** Lifetime stats, best win times and the last runs (click one for its report). */
export class RecordsScene extends Phaser.Scene {
  private rows: Phaser.GameObjects.Rectangle[] = [];
  /** Gamepad-highlighted run (-1 = none). */
  private focus = -1;

  constructor() {
    super('Records');
  }

  create(): void {
    this.rows = [];
    this.focus = -1;
    this.cameras.main.setBackgroundColor(0x0d1410);
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'tile_swamp').setOrigin(0).setAlpha(0.25);
    this.add
      .text(GAME_WIDTH / 2, 40, 'RECORDS', { fontFamily: FONT, fontSize: '44px', color: '#ffd54f', stroke: '#000', strokeThickness: 8, fontStyle: 'bold' })
      .setOrigin(0.5);
    const back = this.add
      .text(24, 20, '◀ Back (ESC)', { fontFamily: FONT, fontSize: '18px', color: '#c8e6c9', stroke: '#000', strokeThickness: 4 })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.leave());
    kb.on('keydown-H', () => this.leave());
    onPadButton(this, (b) => {
      if (b === PAD.B) this.leave();
      else if (b === PAD.UP || b === PAD.DOWN) this.focusRow(this.focus + (b === PAD.DOWN ? 1 : -1));
      else if (b === PAD.A && this.focus >= 0) this.open(this.focus);
    });

    this.statCards();
    this.bestTimes();
    this.history();
  }

  private leave(): void {
    Sfx.play('ui');
    this.scene.start('Menu');
  }

  private text(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: FONT, ...style });
  }

  private panel(x: number, w: number, title: string): void {
    const g = this.add.graphics();
    g.fillStyle(0x151d18, 0.95);
    g.fillRoundedRect(x, PANEL_TOP, w, PANEL_H, 12);
    g.lineStyle(2, 0x2c3b30, 1);
    g.strokeRoundedRect(x, PANEL_TOP, w, PANEL_H, 12);
    this.text(x + 16, PANEL_TOP + 12, title, { fontSize: '17px', color: '#8be9fd', fontStyle: 'bold' });
  }

  /** A small picture of a creature or form, facing up like everywhere else in the menus. */
  private icon(x: number, y: number, texture: string, radius: number, alpha = 1): void {
    this.add.image(x, y, texture).setScale(radius / BODY_RADIUS).setAngle(-90).setAlpha(alpha);
  }

  // ------------------------------------------------------------ lifetime stats

  /** One card per lifetime number across the top. */
  private statCards(): void {
    const t = RunHistory.totals;
    const fav = (Object.entries(t.lines) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
    const hours = Math.floor(t.time / 3600);
    const cards: { label: string; value: string; sub: string; color: number }[] = [
      { label: 'RUNS', value: `${t.runs}`, sub: t.runs ? `${t.wins} won · ${Math.round((100 * t.wins) / t.runs)}%` : 'none yet', color: 0xffd54f },
      { label: 'PLAY TIME', value: hours ? `${hours}h ${Math.floor((t.time % 3600) / 60)}m` : formatTime(t.time), sub: 'in finished runs', color: 0x8be9fd },
      { label: 'CREATURES EATEN', value: t.eaten.toLocaleString(), sub: t.runs ? `${Math.round(t.eaten / t.runs)} a run` : '—', color: 0x9dff6a },
      { label: 'BOSSES BEATEN', value: `${t.bosses}`, sub: t.runs ? `${(t.bosses / t.runs).toFixed(1)} a run` : '—', color: 0xff8a65 },
      { label: 'DEEPEST STAGE', value: t.deepest ? `${t.deepest} / 7` : '—', sub: t.wins ? 'and you won' : 'keep going', color: 0xce93d8 },
      { label: 'FAVOURITE LINE', value: fav ? fav[0] : '—', sub: fav ? `${fav[1]} run${fav[1] > 1 ? 's' : ''}` : 'play to find out', color: 0x64ffda },
    ];
    const gap = 10;
    const w = (GAME_WIDTH - 80 - gap * (cards.length - 1)) / cards.length;
    const g = this.add.graphics();
    cards.forEach((c, i) => {
      const x = 40 + i * (w + gap);
      const y = 80;
      g.fillStyle(0x151d18, 0.95);
      g.fillRoundedRect(x, y, w, 70, 10);
      g.fillStyle(c.color, 0.9);
      g.fillRoundedRect(x, y, w, 4, { tl: 10, tr: 10, bl: 0, br: 0 });
      const hex = `#${c.color.toString(16).padStart(6, '0')}`;
      this.text(x + 12, y + 10, c.label, { fontSize: '11px', color: hex, fontStyle: 'bold' });
      this.text(x + 12, y + 25, c.value, { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' });
      this.text(x + 12, y + 52, c.sub, { fontSize: '11px', color: '#90a4ae' });
    });
  }

  // ------------------------------------------------------------ best times

  /** Fastest win for each ending on each difficulty, then mutator runs, old times and your nemesis. */
  private bestTimes(): void {
    this.panel(LEFT_X, LEFT_W, 'BEST TIMES');
    // four difficulty columns, Nightmare included
    const colX = (i: number) => LEFT_X + 226 + i * 84;
    DIFFICULTY_ORDER.forEach((d, i) => this.text(colX(i), PANEL_TOP + 46, DIFFICULTIES[d].name, { fontSize: '14px', color: '#cfd8dc', fontStyle: 'bold' }));
    // the single fastest win of all is the one to beat
    let fastest = Infinity;
    for (const e of ENDING_ROWS) for (const d of DIFFICULTY_ORDER) fastest = Math.min(fastest, RunHistory.best(e.id, d) ?? Infinity);
    const g = this.add.graphics();
    ENDING_ROWS.forEach((e, r) => {
      const y = PANEL_TOP + 74 + r * 46;
      const won = DIFFICULTY_ORDER.some((d) => RunHistory.best(e.id, d) !== undefined);
      this.icon(LEFT_X + 34, y + 12, e.texture, 15, won ? 1 : 0.3);
      this.text(LEFT_X + 58, y + 3, e.name, { fontSize: '15px', color: won ? '#ffffff' : '#78909c', fontStyle: 'bold' });
      DIFFICULTY_ORDER.forEach((d, i) => {
        const b = RunHistory.bestEntry(e.id, d);
        if (!b) {
          this.text(colX(i), y + 3, '—', { fontSize: '15px', color: '#5f6b62' });
          return;
        }
        const top = b.time === fastest;
        if (top) {
          g.fillStyle(0xffd54f, 0.14);
          g.fillRoundedRect(colX(i) - 6, y - 4, 76, 40, 8);
        }
        this.text(colX(i), y, formatTime(b.time), { fontSize: '16px', color: top ? '#ffd54f' : '#ffe082', fontStyle: 'bold' });
        const when = new Date(b.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        this.text(colX(i), y + 19, top ? `${when} ★` : when, { fontSize: '11px', color: '#90a4ae' });
      });
    });

    const name = (id: Ending) => ENDING_ROWS.find((e) => e.id === id)?.name ?? id;
    let ty = PANEL_TOP + 74 + ENDING_ROWS.length * 46 + 6;
    // mutator runs are timed apart from plain ones: the three fastest
    const withMutators = RunHistory.mutatorBests().slice(0, 3);
    if (withMutators.length) {
      const mut = (ids: string[]) => ids.map((id) => MUTATORS.find((m) => m.id === id)?.name ?? id).join(' + ');
      this.text(LEFT_X + 16, ty, 'Fastest wins with mutators', { fontSize: '13px', color: '#ff8a80', fontStyle: 'bold' });
      const t = this.text(LEFT_X + 16, ty + 20, withMutators.map((b) => `${name(b.ending)}, ${DIFFICULTIES[b.difficulty].name} + ${mut(b.mutators)}: ${formatTime(b.time)}`).join('\n'), {
        fontSize: '12px', color: '#bcaaa4', lineSpacing: 3,
      });
      ty += 28 + t.height;
    }
    // times from before the game had 7 stages, kept but not comparable
    const old = RunHistory.oldEraBests();
    if (old.length) {
      this.text(LEFT_X + 16, ty, '6-stage era bests (shorter runs, not comparable)', { fontSize: '13px', color: '#90a4ae', fontStyle: 'bold' });
      const t = this.text(LEFT_X + 16, ty + 20, old.map((b) => `${name(b.ending)}, ${DIFFICULTIES[b.difficulty].name}: ${formatTime(b.time)}`).join('   ·   '), {
        fontSize: '12px', color: '#78909c', wordWrap: { width: LEFT_W - 32 }, lineSpacing: 3,
      });
      ty += 28 + t.height;
    }
    this.nemesis(PANEL_TOP + PANEL_H - 88);
  }

  /** What has ended the most of your runs. */
  private nemesis(y: number): void {
    const killers = Object.entries(RunHistory.totals.killers).sort((a, b) => b[1] - a[1]);
    const g = this.add.graphics();
    g.fillStyle(0x1f1416, 1);
    g.fillRoundedRect(LEFT_X + 12, y, LEFT_W - 24, 76, 10);
    this.text(LEFT_X + 28, y + 10, 'YOUR NEMESIS', { fontSize: '12px', color: '#ff8a80', fontStyle: 'bold' });
    if (!killers.length) {
      this.text(LEFT_X + 28, y + 32, 'Nothing has killed you yet. Suspicious.', { fontSize: '14px', color: '#9e9e9e', fontStyle: 'italic' });
      return;
    }
    const [who, n] = killers[0];
    const def = Object.values(CREATURES).find((c) => c.name === who);
    let tx = LEFT_X + 28;
    if (def) {
      this.add.image(LEFT_X + 50, y + 48, def.texture).setScale(20 / BODY_RADIUS).setAngle(-90).setTint(def.tint ?? 0xffffff);
      tx = LEFT_X + 82;
    }
    this.text(tx, y + 30, who, { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' });
    const runner = killers[1] ? `  ·  then ${killers[1][0]} (${killers[1][1]})` : '';
    this.text(tx, y + 52, `ended ${n} of your runs${runner}`, { fontSize: '12px', color: '#ffab91' });
  }

  // ------------------------------------------------------------ history

  /** The last runs, newest first, each with the path of forms it took. */
  private history(): void {
    this.panel(RIGHT_X, RIGHT_W, `LAST ${HISTORY_SIZE} RUNS  (click for the report)`);
    const runs = RunHistory.runs;
    if (!runs.length) {
      this.text(RIGHT_X + 16, PANEL_TOP + 48, 'Finished runs show up here.', { fontSize: '15px', color: '#9e9e9e', fontStyle: 'italic' });
      return;
    }
    const top = PANEL_TOP + 46;
    runs.forEach((r, i) => {
      const y = top + i * ROW_H;
      const hover = this.add.rectangle(RIGHT_X + 8, y - 2, RIGHT_W - 16, ROW_H - 2, 0xffd54f, 0).setOrigin(0).setInteractive({ useHandCursor: true });
      hover.on('pointerover', () => hover.setFillStyle(0xffd54f, 0.1));
      hover.on('pointerout', () => hover.setFillStyle(0xffd54f, 0));
      hover.on('pointerdown', () => this.open(i));
      this.rows.push(hover);
      const when = new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      this.text(RIGHT_X + 16, y + 2, when, { fontSize: '12px', color: '#90a4ae' });
      this.text(RIGHT_X + 72, y, r.won ? '✔' : '✘', { fontSize: '15px', color: r.won ? '#9dff6a' : '#ff8a80', fontStyle: 'bold' });
      this.formStrip(r, RIGHT_X + 100, y + 9);
      const what = r.won ? r.label ?? 'Victory' : damageKey(r.killedBy || 'died');
      const short = what.length > 24 ? `${what.slice(0, 23)}…` : what;
      this.text(RIGHT_X + 232, y + 1, short, { fontSize: '13px', color: r.won ? '#c5e1a5' : '#e0e0e0' });
      this.text(RIGHT_X + 420, y + 2, DIFFICULTIES[r.difficulty].name, { fontSize: '12px', color: '#90a4ae' });
      this.text(RIGHT_X + 480, y + 1, formatTime(r.time), { fontSize: '13px', color: '#ffffff' });
      this.text(RIGHT_X + 534, y + 1, `🧬${r.genes}`, { fontSize: '12px', color: '#d4ff7a' });
    });
  }

  /** Small icons of every form a run reached; the one it died as is red. */
  private formStrip(r: RunRecord, x: number, y: number): void {
    r.stageIds.forEach((id, i) => {
      const st = stageById(id);
      if (!st) return;
      const img = this.add.image(x + i * 18, y, st.playerTexture).setScale(8 / BODY_RADIUS).setAngle(-90);
      if (!r.won && i === r.last) img.setTint(0xff5252);
    });
  }

  private focusRow(i: number): void {
    const n = this.rows.length;
    if (!n) return;
    if (this.focus >= 0) this.rows[this.focus].emit('pointerout');
    this.focus = this.focus < 0 ? 0 : (i + n) % n;
    this.rows[this.focus].emit('pointerover');
    Sfx.play('ui');
  }

  private open(i: number): void {
    const record = RunHistory.runs[i];
    if (!record) return;
    Sfx.play('ui');
    this.scene.pause();
    this.scene.launch('RunReport', { from: 'Records', record });
  }
}
