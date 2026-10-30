import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { TRAITS, type TraitId } from '../data/traits';
import { FORM_UNLOCKS } from '../data/forms';
import { stageById } from '../data/stages';
import { GeneBank, MUTATORS, PERKS, PRICE_RISE, type PerkDef } from '../state/GeneBank';
import { Codex } from '../state/Codex';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';

const LOCKED = '#6f6a7d';
const ROW_X = 60;
const ROW_W = 720;
const ROW_H = 62;
const ROW_GAP = 8;
const TOP = 132;
const SIDE_X = 810;
const SIDE_W = 410;
const HINTS_Y = 566;
const HINTS_H = 92;
/** Mutator card height: room for a two-line description. */
const MUT_H = 56;

/** Spend genes from past runs on small permanent perks, and switch mutators on for the next run. */
export class GeneBankScene extends Phaser.Scene {
  private content: Phaser.GameObjects.GameObject[] = [];
  private counter!: Phaser.GameObjects.Text;
  private counterLabel!: Phaser.GameObjects.Text;
  /** The number the counter shows (it ticks down after a purchase). */
  private shown = 0;
  /** The refund button has been pressed once and is waiting for the second press. */
  private refundArmed = false;

  constructor() {
    super('GeneBank');
  }

  create(): void {
    this.content = [];
    this.refundArmed = false;
    this.cameras.main.setBackgroundColor(0x0d1410);
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'tile_swamp').setOrigin(0).setAlpha(0.25);
    this.add
      .text(GAME_WIDTH / 2, 40, 'GENE BANK', { fontFamily: FONT, fontSize: '44px', color: '#8be9fd', stroke: '#000', strokeThickness: 8, fontStyle: 'bold' })
      .setOrigin(0.5);
    const back = this.add
      .text(24, 20, '◀ Back (ESC)', { fontFamily: FONT, fontSize: '18px', color: '#c8e6c9', stroke: '#000', strokeThickness: 4 })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());
    this.input.keyboard!.on('keydown-ESC', () => this.leave());
    this.input.keyboard!.on('keydown-G', () => this.leave());
    onPadButton(this, (b) => b === PAD.B && this.leave());
    this.geneCounter();
    this.draw();
    // keeps the refund countdown current
    this.time.addEvent({ delay: 60000, loop: true, callback: () => GeneBank.refundWait() > 0 && this.draw() });
  }

  private leave(): void {
    Sfx.play('ui');
    this.scene.start('Menu');
  }

  private add2<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.content.push(o);
    return o;
  }

  private text(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.add2(this.add.text(x, y, s, { fontFamily: FONT, ...style }));
  }

  /** A clickable label. Disabled ones look flat and do nothing on hover. */
  private button(x: number, y: number, label: string, enabled: boolean, onClick: () => void): Phaser.GameObjects.Text {
    const base = enabled ? '#2e4a2a' : '#1c2224';
    const b = this.text(x, y, label, { fontSize: '16px', color: enabled ? '#d4ff7a' : '#5f6b62', backgroundColor: base, padding: { x: 12, y: 6 }, fontStyle: 'bold' })
      .setInteractive({ useHandCursor: enabled });
    if (enabled) {
      b.on('pointerover', () => b.setBackgroundColor('#3f6639'));
      b.on('pointerout', () => b.setBackgroundColor(base));
    }
    b.on('pointerdown', onClick);
    return b;
  }

  // ------------------------------------------------------------ gene counter

  /** The screen's currency, big, with how runs pay out on hover. */
  private geneCounter(): void {
    const cx = GAME_WIDTH / 2;
    this.shown = GeneBank.genes;
    this.add.image(cx - 70, 92, 'perk_inherit').setScale(0.55);
    this.counter = this.add
      .text(cx - 44, 92, '', { fontFamily: FONT, fontSize: '32px', color: '#d4ff7a', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0, 0.5);
    const sub = (this.counterLabel = this.add
      .text(cx + 70, 96, '', { fontFamily: FONT, fontSize: '13px', color: '#9fb39a' })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true }));
    sub.setText(`genes  ·  ${GeneBank.earned} earned in total  ⓘ`);
    const tip = this.add
      .text(cx, 118, 'Every run banks 1 gene per 400 DNA, 5 per stage reached, 10 per boss beaten and 30 for a win. Hard pays 25% more, Nightmare 60%, and mutators add more.', {
        fontFamily: FONT, fontSize: '13px', color: '#e8f5e9', backgroundColor: '#263238', padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setVisible(false);
    sub.on('pointerover', () => tip.setVisible(true));
    sub.on('pointerout', () => tip.setVisible(false));
    this.refreshCounter();
  }

  private refreshCounter(): void {
    this.counter.setText(`${Math.round(this.shown)}`);
    // the label follows the number as it ticks
    this.counterLabel.setX(this.counter.x + this.counter.width + 10);
  }

  // ------------------------------------------------------------ layout

  private draw(): void {
    this.content.forEach((o) => o.destroy());
    this.content = [];
    this.priceNote();
    this.refundButton();
    PERKS.forEach((p, i) => this.perkRow(p, TOP + i * (ROW_H + ROW_GAP)));
    this.sidePanel();
    this.hintStrip(HINTS_Y);
  }

  /** Why the prices are what they are. */
  private priceNote(): void {
    const rise = Math.round((PRICE_RISE - 1) * 100);
    const now = GeneBank.owned ? `  Prices are at ×${GeneBank.priceFactor.toFixed(2)}.` : '';
    this.text(GAME_WIDTH / 2, 121, `Every purchase makes everything else ${rise}% more expensive.${now}`, { fontSize: '13px', color: '#9fb39a' }).setOrigin(0.5);
  }

  /** Sell everything back, once per cooldown. The first press only asks. */
  private refundButton(): void {
    const wait = GeneBank.refundWait();
    const back = GeneBank.spent;
    const ready = wait === 0 && back > 0;
    let label = `↺ Refund all · ${back}`;
    const mins = Math.ceil(wait / 60000);
    if (wait > 0) label = `↺ Refund in ${Math.floor(mins / 60)}h ${mins % 60}m`;
    else if (back === 0) label = '↺ Nothing to refund';
    else if (this.refundArmed) label = `Sell everything for ${back}?`;
    this.button(GAME_WIDTH - 24, 20, label, ready, () => {
      if (!ready) return Sfx.play('ui');
      if (!this.refundArmed) {
        Sfx.play('warn');
        this.refundArmed = true;
        this.time.delayedCall(4000, () => {
          this.refundArmed = false;
          this.draw();
        });
        return this.draw();
      }
      this.refundArmed = false;
      const before = GeneBank.genes;
      GeneBank.refundAll();
      Sfx.play('fusion');
      this.draw();
      this.shown = before;
      this.tweens.add({ targets: this, shown: GeneBank.genes, duration: 500, ease: 'Quad.easeOut', onUpdate: () => this.refreshCounter() });
    }).setOrigin(1, 0);
  }

  private perkRow(p: PerkDef, y: number): void {
    const level = GeneBank.level(p.id);
    const max = p.costs.length;
    const cost = GeneBank.nextCost(p.id);
    const maxed = cost === null;
    const afford = !maxed && cost <= GeneBank.genes;
    const g = this.add2(this.add.graphics());
    g.fillStyle(maxed ? 0x13302a : 0x151d18, 0.95);
    g.fillRoundedRect(ROW_X, y, ROW_W, ROW_H, 10);
    g.lineStyle(2, maxed ? 0x8be9fd : afford ? 0x9ccc65 : level ? 0x4f7d8a : 0x37474f, 1);
    g.strokeRoundedRect(ROW_X, y, ROW_W, ROW_H, 10);
    // something you can buy right now glows softly
    if (afford) {
      const glow = this.add2(this.add.graphics());
      glow.lineStyle(6, 0xd4ff7a, 0.35);
      glow.strokeRoundedRect(ROW_X - 2, y - 2, ROW_W + 4, ROW_H + 4, 12);
      this.tweens.add({ targets: glow, alpha: 0.2, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    }
    this.add2(this.add.image(ROW_X + 32, y + ROW_H / 2, `perk_${p.id}`).setScale(0.7).setAlpha(level || afford ? 1 : 0.55));
    const tx = ROW_X + 64;
    const name = this.text(tx, y + 8, p.name, { fontSize: '18px', color: level ? '#ffffff' : '#cfd8dc', fontStyle: 'bold' });
    for (let k = 0; k < max; k++) {
      g.fillStyle(k < level ? 0x8be9fd : 0x37474f, 1);
      g.fillCircle(tx + name.width + 16 + k * 16, y + 19, 5);
    }
    // the pips show the current level, so a part-bought perk describes its next one
    const shown = level === 0 ? p.effect(1) : maxed ? p.effect(level) : `Next: ${p.effect(level + 1)}`;
    this.text(tx, y + 36, shown, { fontSize: '14px', color: maxed ? '#b2ebf2' : level ? '#c5e1a5' : '#9e9e9e', wordWrap: { width: ROW_W - 240 } });
    const rx = ROW_X + ROW_W - 16;
    if (maxed) {
      this.text(rx, y + ROW_H / 2, '✓ MAXED', { fontSize: '16px', color: '#8be9fd', fontStyle: 'bold' }).setOrigin(1, 0.5);
      return;
    }
    this.button(rx, y + ROW_H / 2 - (afford ? 0 : 7), `Buy · ${cost}`, afford, () => {
      if (!afford) return Sfx.play('ui');
      const before = GeneBank.genes;
      GeneBank.buy(p.id);
      // first time buying Inherited Trait: start with a sensible pick
      if (p.id === 'inherit' && !GeneBank.inherit) GeneBank.setInherit(this.inheritOptions()[0] ?? null);
      this.draw();
      this.celebrate(ROW_X, y, ROW_W, ROW_H, before, cost, tx + name.width + 16 + level * 16, y + 19);
    }).setOrigin(1, 0.5);
    if (!afford) this.text(rx, y + ROW_H / 2 + 17, `${cost - GeneBank.genes} more needed`, { fontSize: '11px', color: '#78909c' }).setOrigin(1, 0.5);
  }

  /**
   * Purchase feedback: the row flashes, the cost floats off the counter while it ticks down,
   * and the new level pip pops in. `px, py` is that pip (skipped for one-off unlocks).
   */
  private celebrate(x: number, y: number, w: number, h: number, before: number, cost: number, px?: number, py?: number): void {
    Sfx.play('fusion');
    const flash = this.add.rectangle(x, y, w, h, 0xffffff, 0.35).setOrigin(0).setDepth(15);
    this.tweens.add({ targets: flash, alpha: 0, duration: 450, onComplete: () => flash.destroy() });
    const minus = this.add
      .text(this.counter.x + this.counter.width / 2, this.counter.y + 26, `−${cost}`, { fontFamily: FONT, fontSize: '22px', color: '#ff8a80', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(15);
    // drifts down from the counter (up would run into the title)
    this.tweens.add({ targets: minus, y: minus.y + 18, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => minus.destroy() });
    this.shown = before;
    this.tweens.add({ targets: this, shown: GeneBank.genes, duration: 500, ease: 'Quad.easeOut', onUpdate: () => this.refreshCounter() });
    if (px !== undefined && py !== undefined) {
      const pip = this.add.circle(px, py, 5, 0xffffff).setDepth(15);
      this.tweens.add({ targets: pip, scale: 2.6, alpha: 0, duration: 500, ease: 'Quad.easeOut', onComplete: () => pip.destroy() });
    }
  }

  /** Traits you have seen at least once can be inherited. */
  private inheritOptions(): TraitId[] {
    return (Object.keys(TRAITS) as TraitId[]).filter((id) => Codex.rank(id) > 0);
  }

  // ------------------------------------------------------------ side panel

  private sidePanel(): void {
    const g = this.add2(this.add.graphics());
    g.fillStyle(0x151d18, 0.95);
    g.fillRoundedRect(SIDE_X, TOP, SIDE_W, HINTS_Y - TOP - 12, 12);
    const x = SIDE_X + 18;
    let y = TOP + 12;

    // inherited trait picker
    this.text(x, y, 'INHERITED TRAIT', { fontSize: '15px', color: '#8be9fd', fontStyle: 'bold' });
    y += 24;
    if (GeneBank.level('inherit') === 0) {
      this.text(x, y + 4, 'Buy Inherited Trait to choose one.', { fontSize: '14px', color: LOCKED, fontStyle: 'italic' });
    } else {
      const opts: (TraitId | null)[] = [null, ...this.inheritOptions()];
      const cur = GeneBank.inherit;
      const i = Math.max(0, opts.indexOf(cur));
      const cycle = (d: number) => {
        Sfx.play('ui');
        GeneBank.setInherit(opts[(i + d + opts.length) % opts.length]);
        this.draw();
      };
      this.button(x, y, '◀', true, () => cycle(-1));
      if (cur) this.add2(this.add.image(x + 76, y + 16, `icon_${cur}`).setScale(0.36));
      this.text(x + SIDE_W / 2 - 10, y + 16, cur ? TRAITS[cur].forms[0] : 'None', { fontSize: '17px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      this.button(x + SIDE_W - 76, y, '▶', true, () => cycle(1));
    }
    y += 48;

    this.mutatorCards(x, y);
    this.nextRun(x, y + 24 + MUTATORS.length * (MUT_H + 6) + 8);
  }

  /** Mutators as toggle cards: the risk on one line, the reward on the other. */
  private mutatorCards(x: number, y: number): void {
    const unlocked = GeneBank.level('mutators') > 0;
    const active = GeneBank.activeMutators;
    this.text(x, y, unlocked ? 'MUTATORS (next run, click to toggle)' : 'MUTATORS (buy the perk to unlock)', { fontSize: '15px', color: '#ff8a80', fontStyle: 'bold' });
    y += 24;
    const w = SIDE_W - 36;
    for (const m of MUTATORS) {
      const on = active.includes(m.id);
      const g = this.add2(this.add.graphics());
      g.fillStyle(on ? 0x3a1414 : 0x1b2220, 0.95);
      g.fillRoundedRect(x, y, w, MUT_H, 8);
      g.lineStyle(2, on ? 0xff5252 : unlocked ? 0x5d4037 : 0x2b2f31, 1);
      g.strokeRoundedRect(x, y, w, MUT_H, 8);
      this.add2(this.add.image(x + 24, y + MUT_H / 2, `mut_${m.id}`).setScale(0.55).setAlpha(unlocked ? 1 : 0.35));
      this.text(x + 46, y + 7, m.name, { fontSize: '15px', color: !unlocked ? LOCKED : on ? '#ff8a80' : '#ffffff', fontStyle: 'bold' });
      this.text(x + 46, y + 28, m.blurb, { fontSize: '11px', color: unlocked ? '#bdbdbd' : LOCKED, wordWrap: { width: w - 150 } });
      this.text(x + w - 12, y + MUT_H / 2, `${on ? 'ON' : 'off'}  +${Math.round(m.genes * 100)}% genes`, {
        fontSize: '13px', color: !unlocked ? LOCKED : on ? '#ffd54f' : '#8f9a8a', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
      if (unlocked) {
        const zone = this.add2(this.add.zone(x, y, w, MUT_H).setOrigin(0).setInteractive({ useHandCursor: true }));
        zone.on('pointerdown', () => {
          Sfx.play(on ? 'ui' : 'warn');
          GeneBank.toggleMutator(m.id);
          this.draw();
        });
      }
      y += MUT_H + 6;
    }
  }

  /** Everything the Gene Bank gives your next run, in one place. */
  private nextRun(x: number, y: number): void {
    this.text(x, y, 'YOUR NEXT RUN', { fontSize: '15px', color: '#d4ff7a', fontStyle: 'bold' });
    const lines: string[] = [];
    const lv = (id: Parameters<typeof GeneBank.level>[0]) => GeneBank.level(id);
    if (lv('thickSkin')) lines.push(`+${10 * lv('thickSkin')} max health`);
    if (lv('headStart')) lines.push('Half-full first DNA bar every stage');
    if (lv('spareReroll')) lines.push(`${lv('spareReroll')} spare reroll${lv('spareReroll') > 1 ? 's' : ''}`);
    if (lv('widerPool')) lines.push("An extra card on each stage's first pick");
    const inherit = GeneBank.inherit;
    if (inherit) lines.push(`Starts with ${TRAITS[inherit].forms[0]}`);
    const active = MUTATORS.filter((m) => GeneBank.activeMutators.includes(m.id));
    if (active.length) lines.push(`${active.map((m) => m.name).join(' + ')}: +${Math.round(active.reduce((n, m) => n + m.genes, 0) * 100)}% genes`);
    const text = lines.length ? lines.map((l) => `•  ${l}`).join('\n') : 'Nothing yet. Buy a perk and every run starts a little stronger.';
    this.text(x, y + 22, text, { fontSize: '13px', color: lines.length ? '#e8f5e9' : LOCKED, fontStyle: lines.length ? 'normal' : 'italic', lineSpacing: 3, wordWrap: { width: SIDE_W - 36 } });
  }

  // ------------------------------------------------------------ hints

  /** Buyable hints for secret forms you haven't found yet (they also show in the Bestiary). */
  private hintStrip(y: number): void {
    const x0 = ROW_X;
    const w = SIDE_X + SIDE_W - ROW_X;
    const g = this.add2(this.add.graphics());
    g.fillStyle(0x151d18, 0.95);
    g.fillRoundedRect(x0, y, w, HINTS_H, 10);
    g.lineStyle(2, 0x2b5f55, 1);
    g.strokeRoundedRect(x0, y, w, HINTS_H, 10);
    this.text(x0 + 16, y + 8, 'SECRET FORM HINTS', { fontSize: '15px', color: '#64ffda', fontStyle: 'bold' });
    const colW = (w - 32) / FORM_UNLOCKS.length;
    FORM_UNLOCKS.forEach((f, i) => {
      const x = x0 + 16 + i * colW;
      const found = Codex.hasForm(f.stageId);
      const level = GeneBank.hintLevel(f.stageId);
      const title = found ? `Stage ${f.index + 1}: ${stageById(f.stageId)!.creatureName} (found)` : `Stage ${f.index + 1}: a hidden form`;
      this.text(x, y + 32, title, { fontSize: '14px', color: found ? '#c5e1a5' : '#ffffff', fontStyle: 'bold' });
      const shown = found ? 'Already discovered.' : level ? f.hints[level - 1] : 'No hints bought.';
      this.text(x, y + 52, shown, { fontSize: '12px', color: level && !found ? '#a7c4b5' : LOCKED, fontStyle: 'italic', wordWrap: { width: colW - 24 } });
      const cost = GeneBank.nextHintCost(f.stageId);
      if (found || cost === null) return;
      const afford = cost <= GeneBank.genes;
      // beside the title, so the hint below gets the whole column
      this.button(x + colW - 18, y + 38, `${level ? 'Clearer' : 'Hint'} · ${cost}`, afford, () => {
        if (!afford) return Sfx.play('ui');
        const before = GeneBank.genes;
        GeneBank.buyHint(f.stageId);
        this.draw();
        this.celebrate(x - 8, y + 26, colW, HINTS_H - 30, before, cost);
      }).setOrigin(1, 0.5);
    });
  }
}
