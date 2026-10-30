import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { STAGES } from '../data/stages';
import { ZONE_PEAKS } from '../data/zones';
import { damageKey } from '../state/GameState';
import { formatTime as fmt, type RunRecord } from '../state/RunHistory';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';

/** Opened over an end screen or the Records screen. `from` is the scene to resume. */
export interface RunReportData {
  from: string;
  record: RunRecord;
}

const PANEL_W = 600;
const COL_L = 40;
const COL_R = GAME_WIDTH / 2 + 20;
/** Room for the traits in the Build section, stopping short of its stats line. */
const BUILD_H = 276;

/**
 * The run report: time and meals per stage, your build, the zone bosses you beat (or didn't)
 * and what hurt you most. Shows a RunRecord: the run just finished, or one from the history.
 */
export class RunReportScene extends Phaser.Scene {
  private from = '';
  private r!: RunRecord;

  constructor() {
    super('RunReport');
  }

  create(data: RunReportData): void {
    this.from = data.from;
    this.r = data.record;
    const r = this.r;
    this.scene.bringToTop();
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070a, 1).setOrigin(0).setInteractive();

    this.add.text(cx, 30, 'RUN REPORT', { fontFamily: FONT, fontSize: '40px', color: '#ffd54f', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    const outcome = r.won ? `${r.label ?? 'VICTORY'}` : `Killed by ${r.killedBy || 'mysterious forces'} as a ${r.forms[r.last]}`;
    const when = new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    this.add
      .text(cx, 66, `${outcome}   ·   ${r.diffName}   ·   ${fmt(r.time)} total   ·   ${when}`, { fontFamily: FONT, fontSize: '18px', color: r.won ? '#c5e1a5' : '#ff8a80' })
      .setOrigin(0.5);

    this.stageTimes(COL_L, 100);
    this.bosses(COL_L, 400);
    this.build(COL_R, 100);
    this.hurt(COL_R, 400);

    const back = this.add
      .text(cx, GAME_HEIGHT - 28, '◀ Back  (ESC / R)', { fontFamily: FONT, fontSize: '22px', color: '#ffffff', backgroundColor: '#263238', padding: { x: 16, y: 6 }, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setBackgroundColor('#37474f'));
    back.on('pointerout', () => back.setBackgroundColor('#263238'));
    back.on('pointerup', () => this.close());
    this.input.keyboard!.on('keydown-ESC', () => this.close());
    this.input.keyboard!.on('keydown-R', () => this.close());
    onPadButton(this, (b) => (b === PAD.B || b === PAD.Y) && this.close());
  }

  private close(): void {
    Sfx.play('ui');
    this.scene.resume(this.from);
    this.scene.stop();
  }

  private heading(x: number, y: number, text: string): void {
    this.add.text(x, y, text, { fontFamily: FONT, fontSize: '20px', color: '#8be9fd', fontStyle: 'bold' });
    this.add.rectangle(x, y + 28, PANEL_W, 2, 0x8be9fd, 0.35).setOrigin(0);
  }

  private label(x: number, y: number, text: string, color = '#e0e0e0', size = 16): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color });
  }

  /** One bar per stage reached: the longest stage fills the bar. */
  private stageTimes(x: number, y: number): void {
    const r = this.r;
    const last = r.last;
    this.heading(x, y, 'TIME PER STAGE');
    const times = r.stageTimes;
    const max = Math.max(1, ...times);
    const g = this.add.graphics();
    const barX = x + 170;
    const barW = 300;
    // seven stages have to fit above the bosses section
    const rowH = 33;
    times.forEach((t, i) => {
      const ry = y + 40 + i * rowH;
      const finale = i >= STAGES.length;
      const diedHere = !r.won && i === last;
      this.label(x, ry + 2, r.forms[i] + (finale ? ' ★' : ''), diedHere ? '#ff8a80' : '#ffffff', 17);
      g.fillStyle(0x263238, 1);
      g.fillRect(barX, ry + 4, barW, 14);
      g.fillStyle(diedHere ? 0xff5566 : finale ? 0xffd54f : 0x9dff6a, 1);
      g.fillRect(barX, ry + 4, Math.max(2, (barW * t) / max), 14);
      const meals = finale ? '' : `   ${r.stageEaten[i] ?? 0} eaten`;
      this.label(barX + barW + 10, ry + 2, `${fmt(t)}${meals}`, '#cfd8dc', 15);
    });
    if (times.length > 1 && max > 1) {
      const slow = times.indexOf(Math.max(...times.slice(0, Math.min(times.length, STAGES.length))));
      this.label(x, y + 42 + times.length * rowH, `Longest stage: ${r.forms[slow]} (${fmt(times[slow])})`, '#90a4ae', 15);
    }
  }

  /** Every zone boss on your path: beaten, or not. */
  private bosses(x: number, y: number): void {
    const r = this.r;
    this.heading(x, y, `BOSSES  (${r.bossKills.length} beaten)`);
    const arenas = Math.min(r.last, STAGES.length - 1);
    for (let i = 0; i <= arenas; i++) {
      const peak = ZONE_PEAKS[r.stageIds[i]];
      if (!peak) continue;
      const ry = y + 42 + i * 28;
      const kill = r.bossKills.find((k) => k.stage === i);
      const here = !r.won && i === r.last;
      this.label(x, ry, kill ? '✔' : '✘', kill ? '#9dff6a' : '#757575', 18);
      this.label(x + 26, ry + 1, `${peak.boss.name}`, kill ? '#ffffff' : '#9e9e9e', 17);
      const note = kill ? `beaten at ${fmt(kill.at)} into the stage` : here ? 'still waiting for you' : 'left alone';
      this.label(x + 290, ry + 3, note, kill ? '#c5e1a5' : '#757575', 14);
    }
  }

  /** Your form path, traits and fusions. */
  private build(x: number, y: number): void {
    const r = this.r;
    this.heading(x, y, 'BUILD');
    const path = r.forms.join('  →  ');
    const pathText = this.add.text(x, y + 38, path, { fontFamily: FONT, fontSize: '16px', color: '#ffd54f', wordWrap: { width: PANEL_W } });
    // a long path wraps, so the trait rows tighten to keep the section above the one below
    const top = pathText.y + pathText.height + 8;

    const entries = r.traits;
    if (!entries.length) {
      this.label(x, top, 'No traits. A purist.', '#9e9e9e');
    }
    const shown = entries.slice(0, 14);
    const rows = Math.max(1, Math.ceil(shown.length / 2));
    const moreH = entries.length > shown.length ? 22 : 0;
    const rowH = Math.min(30, Math.floor((y + BUILD_H - top - moreH) / rows));
    shown.forEach((e, i) => {
      const ex = x + (i % 2) * 300;
      const ey = top + Math.floor(i / 2) * rowH;
      e.icons.forEach((icon, k) => this.add.image(ex + 12 + k * 18, ey + 10, icon).setScale(0.32));
      this.label(ex + 14 + e.icons.length * 18, ey + 1, e.name, e.fusion ? '#ffd54f' : '#ffffff', 15);
    });
    let sy = top + 2 + rows * rowH;
    if (entries.length > shown.length) {
      this.label(x, sy, `+${entries.length - shown.length} more`, '#90a4ae', 14);
      sy += 22;
    }
    const st = r.stats;
    this.label(
      x,
      sy,
      `Max HP ${Math.round(st.maxHp)}   ·   Armor ${Math.round(st.armor * 100)}%   ·   Speed ×${st.speed.toFixed(2)}   ·   DNA ${Math.floor(st.dna)}   ·   🧬 ${r.genes}`,
      '#90a4ae',
      14,
    );
  }

  /** Top damage sources, plus finale losses. */
  private hurt(x: number, y: number): void {
    const r = this.r;
    this.heading(x, y, 'WHAT HURT YOU MOST');
    // older records kept a hunter's spear apart from the hunter: merge them by source
    const merged: Record<string, number> = {};
    for (const [who, dmg] of Object.entries(r.damageBy)) merged[damageKey(who)] = (merged[damageKey(who)] ?? 0) + dmg;
    const rows = Object.entries(merged).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((n, r) => n + r[1], 0);
    const g = this.add.graphics();
    const top = rows.slice(0, 5);
    if (!top.length) this.label(x, y + 42, 'Nothing laid a finger on you.', '#9e9e9e');
    top.forEach(([who, dmg], i) => {
      const ry = y + 42 + i * 28;
      const killer = !r.won && r.killedBy && who === damageKey(r.killedBy);
      this.label(x, ry, who.length > 22 ? `${who.slice(0, 21)}…` : who, i === 0 ? '#ff8a80' : '#ffffff', 16);
      g.fillStyle(0x263238, 1);
      g.fillRect(x + 200, ry + 3, 250, 14);
      g.fillStyle(i === 0 ? 0xff5566 : 0xff8a65, 1);
      g.fillRect(x + 200, ry + 3, Math.max(2, (250 * dmg) / rows[0][1]), 14);
      this.label(x + 460, ry + 1, `${Math.round(dmg)} hp  ${Math.round((100 * dmg) / total)}%${killer ? '  ☠' : ''}`, '#cfd8dc', 14);
    });
    let ly = y + 50 + Math.max(1, top.length) * 28;
    const losses = Object.entries(r.lossesBy).sort((a, b) => b[1] - a[1]);
    if (losses.length) {
      this.label(x, ly, `Finale losses: ${losses.map(([c, n]) => `${c} ×${n}`).join('   ·   ')}`, '#ffcc80', 14);
      ly += 24;
    }
    if (total > 0) this.label(x, ly, `Total damage taken: ${Math.round(total)} hp`, '#90a4ae', 14);
  }
}
