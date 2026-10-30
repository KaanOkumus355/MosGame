import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { TRAITS, type TraitId } from '../data/traits';
import { FUSIONS, fusionsWith, pickChoices, type Choice, type FusionId } from '../data/fusions';
import { Settings } from '../state/Settings';
import { TipPanel, Tutorial } from '../systems/Tutorial';
import { GameState, HP_PER_PICK } from '../state/GameState';
import { Codex } from '../state/Codex';
import { MUTATION_WEIGHT, availableMutation, formUnlock, traitBoosts } from '../data/forms';
import { stageById } from '../data/stages';
import { SIGNATURES, SIGNATURE_UPGRADES } from '../data/signatures';
import { BODY_RADIUS } from '../art/textures';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';

const MAX_CARD_W = 330;
const CARD_H = 440;
const CARD_GAP = 26;
const CARD_Y = 150 + CARD_H / 2 + 14;
/** Below this width a card shows only its essential lines. */
const COMPACT_CARD_W = 270;
/** Most fusion cards on a Trophy screen, so there is always a trait to take instead. */
const TROPHY_FUSIONS = 2;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Overlay shown when the DNA bar fills. Pauses the stage, offers traits (after a boss, also
 * fusions of maxed traits), applies the pick, then resumes the stage with { chosen }.
 */
export class EvolutionScene extends Phaser.Scene {
  private choices: Choice[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private chosen = false;
  private inputReady = false;
  /** Rerolls left on this screen (Intelligence 1: one, 3: two); Gene Bank spares come after. */
  private rerollsLeft = 0;
  private cardW = MAX_CARD_W;
  private rerollText?: Phaser.GameObjects.Text;
  /** Card highlighted with the gamepad d-pad (-1 = none). */
  private padFocus = -1;
  /** Gene Bank's Wider Gene Pool cards on this screen. */
  private extraCards = 0;
  /** A Trophy evolution (from beating a zone boss): fusions if you can make any, and a rare double-rank card. */
  private trophy = false;

  constructor() {
    super('Evolution');
  }

  create(): void {
    this.cards = [];
    this.zones = [];
    this.chosen = false;
    this.inputReady = false;
    this.trophy = GameState.trophies > 0;
    const intel = GameState.rank('intelligence');
    this.rerollsLeft = intel >= 3 ? 2 : intel >= 1 ? 1 : 0;
    this.extraCards = GameState.firstPickBonus;
    this.rerollText = undefined;
    const cx = GAME_WIDTH / 2;

    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05020c, 0.75).setOrigin(0).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 200 });
    if (Settings.effect('flashes')) {
      const flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xc8f0ff, 0.6).setOrigin(0);
      this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
    }

    const title = this.add
      .text(cx, 62, this.trophy ? 'TROPHY!' : 'EVOLUTION!', { fontFamily: FONT, fontSize: '52px', color: '#8be9fd', stroke: '#000', strokeThickness: 9, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 350, ease: 'Back.easeOut' });

    const more = GameState.pendingEvolutions > 1 ? `   (${GameState.pendingEvolutions} mutations waiting)` : '';
    this.add
      .text(cx, 112, `Pick one (+${HP_PER_PICK} max health either way): click or press its number${more}`, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#e8f5e9',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    if (this.totalRerolls() > 0) {
      this.rerollText = this.add
        .text(cx, GAME_HEIGHT - 26, this.rerollLabel(), { fontFamily: FONT, fontSize: '16px', color: '#f48fb1', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5);
    }

    this.buildCards();
    // first-time tips for what's on offer
    const kinds = this.choices.map((c) => c.kind);
    Tutorial.trigger(kinds.includes('form') ? 'secret' : kinds.includes('fusion') ? 'fusion' : this.trophy ? 'trophy' : 'evolve', true);
    new TipPanel(this, GAME_HEIGHT - 104, ['evolve', 'secret', 'fusion', 'trophy']);
    onPadButton(this, (b) => {
      if (!this.inputReady || this.chosen) return;
      if (b === PAD.LEFT || b === PAD.RIGHT) this.focusCard(this.padFocus + (b === PAD.RIGHT ? 1 : -1));
      else if (b === PAD.A && this.padFocus >= 0) this.choose(this.padFocus);
      else if (b === PAD.Y) this.reroll();
    });

    // ignore input briefly so a click that was meant for movement doesn't pick a card
    this.time.delayedCall(350, () => {
      this.inputReady = true;
      const readyAt = performance.now();
      const onKey = (e: KeyboardEvent) => {
        // only fresh, physical presses (no repeats, nothing queued before we were ready)
        if (e.repeat || e.timeStamp < readyAt) return;
        if (e.code === 'KeyR') {
          this.reroll();
          return;
        }
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (!m) return;
        const n = Number(m[1]);
        if (n <= this.choices.length) this.choose(n - 1);
      };
      this.input.keyboard!.on('keydown', onKey);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
    });
  }

  private buildCards(): void {
    this.cards.forEach((c) => c.destroy());
    this.zones.forEach((z) => z.destroy());
    this.cards = [];
    this.zones = [];
    this.padFocus = -1;
    // a discovered secret form's mutation competes for a slot like a trait, with its own odds
    const mutation = availableMutation();
    const extras = mutation ? [{ choice: { kind: 'form', id: mutation.stageId } as const, w: MUTATION_WEIGHT }] : [];
    this.choices = pickChoices(
      GameState.traitRanks,
      GameState.fusions,
      3 + GameState.stats.extraChoices + (this.trophy ? 1 : 0) + this.extraCards,
      traitBoosts(),
      extras,
      this.trophy ? TROPHY_FUSIONS : 0,
    );
    // trophy: the first trait that can take two more ranks becomes a rare double mutation
    if (this.trophy) {
      const i = this.choices.findIndex((c) => c.kind === 'trait' && GameState.rank(c.id) + 2 <= TRAITS[c.id].maxRank);
      if (i >= 0) this.choices[i] = { kind: 'double', id: (this.choices[i] as { id: TraitId }).id };
    }
    const n = this.choices.length;
    this.cardW = Math.min(MAX_CARD_W, (GAME_WIDTH - 60 - CARD_GAP * (n - 1)) / n);
    const totalW = n * this.cardW + (n - 1) * CARD_GAP;
    this.choices.forEach((choice, i) => {
      const x = GAME_WIDTH / 2 - totalW / 2 + this.cardW / 2 + i * (this.cardW + CARD_GAP);
      this.cards.push(
        choice.kind === 'trait' || choice.kind === 'double'
          ? this.traitCard(choice.id, i, x, choice.kind === 'double')
          : choice.kind === 'fusion'
            ? this.fusionCard(choice.id, i, x)
            : this.formCard(choice.id, i, x),
      );
    });
  }

  /** Gamepad highlight: reuses the mouse hover effect. */
  private focusCard(i: number): void {
    const n = this.zones.length;
    if (!n) return;
    if (this.padFocus >= 0) this.zones[this.padFocus]?.emit('pointerout');
    this.padFocus = this.padFocus < 0 ? 0 : (i + n) % n;
    this.zones[this.padFocus].emit('pointerover');
  }

  private totalRerolls(): number {
    return this.rerollsLeft + GameState.spareRerolls;
  }

  private rerollLabel(): string {
    const spare = GameState.spareRerolls > 0 ? `, ${GameState.spareRerolls} spare this run` : '';
    return this.totalRerolls() > 0 ? `R: reroll these choices (${this.rerollsLeft} left${spare})` : '(no rerolls left)';
  }

  private reroll(): void {
    if (this.totalRerolls() <= 0 || this.chosen) return;
    // the screen's own rerolls go first, then the run's Gene Bank spares
    if (this.rerollsLeft > 0) this.rerollsLeft--;
    else GameState.spareRerolls--;
    this.rerollText?.setText(this.rerollLabel()).setColor(this.totalRerolls() > 0 ? '#f48fb1' : '#8f87a0');
    this.buildCards();
  }

  /** Card frame shared by traits and fusions; returns the container to fill. */
  private frame(index: number, x: number, colors: [number, number], badge: string): Phaser.GameObjects.Container {
    const w = this.cardW;
    const bg = this.add.graphics();
    bg.fillStyle(0x16121f, 0.97);
    bg.fillRoundedRect(-w / 2, -CARD_H / 2, w, CARD_H, 16);
    bg.fillStyle(colors[0], 0.9);
    bg.fillRoundedRect(-w / 2, -CARD_H / 2, w / 2 + 1, 88, { tl: 16, tr: 0, bl: 0, br: 0 });
    bg.fillStyle(colors[1], 0.9);
    bg.fillRoundedRect(0, -CARD_H / 2, w / 2, 88, { tl: 0, tr: 16, bl: 0, br: 0 });
    bg.lineStyle(3, colors[0], 1);
    bg.strokeRoundedRect(-w / 2, -CARD_H / 2, w, CARD_H, 16);
    const key = this.add.text(-w / 2 + 14, -CARD_H / 2 + 10, `${index + 1}`, { fontFamily: FONT, fontSize: '22px', color: '#16121f', fontStyle: 'bold' });
    const badgeText = this.add
      .text(w / 2 - 14, -CARD_H / 2 + 12, badge, { fontFamily: FONT, fontSize: '15px', color: '#16121f', fontStyle: 'bold' })
      .setOrigin(1, 0);
    const card = this.add.container(x, CARD_Y + 60, [bg, key, badgeText]).setAlpha(0);
    this.tweens.add({ targets: card, y: CARD_Y, alpha: 1, duration: 300, delay: 80 + index * 80, ease: 'Back.easeOut' });

    const zone = this.add.zone(x, CARD_Y, w, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      if (this.chosen) return;
      Sfx.play('ui');
      this.tweens.add({ targets: card, scale: 1.04, duration: 120 });
    });
    zone.on('pointerout', () => !this.chosen && this.tweens.add({ targets: card, scale: 1, duration: 120 }));
    zone.on('pointerdown', () => this.inputReady && this.choose(index));
    this.zones.push(zone);
    return card;
  }

  /** Adds a block of wrapped text at `y` inside the card, returns the y below it. */
  private para(card: Phaser.GameObjects.Container, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): number {
    const t = this.add.text(-this.cardW / 2 + 18, y, text, { fontFamily: FONT, wordWrap: { width: this.cardW - 36 }, lineSpacing: 3, ...style });
    card.add(t);
    return y + t.height + 10;
  }

  private traitCard(id: TraitId, index: number, x: number, double = false): Phaser.GameObjects.Container {
    const t = TRAITS[id];
    // a double mutation describes the rank you end up at
    const rank = GameState.rank(id) + (double ? 2 : 1);
    const stage = GameState.stageIndex;
    const card = this.frame(index, x, double ? [0xffd54f, t.color] : [t.color, t.color], double ? `TROPHY x2 → RANK ${rank}` : rank === 1 ? 'NEW!' : `RANK ${rank}`);
    if (double) {
      const glow = this.add.rectangle(0, 0, this.cardW, CARD_H, 0xffd54f, 0.06);
      card.addAt(glow, 1);
      this.tweens.add({ targets: glow, alpha: 0.18, yoyo: true, repeat: -1, duration: 600 });
    }

    const iconBack = this.add.circle(0, -CARD_H / 2 + 88, 42, 0x16121f).setStrokeStyle(3, t.color);
    const icon = this.add.image(0, -CARD_H / 2 + 88, `icon_${id}`).setScale(1.1);
    const name = this.add
      .text(0, -CARD_H / 2 + 140, GameState.traitName(id, rank, stage), {
        fontFamily: FONT, fontSize: '22px', color: hex(t.color), fontStyle: 'bold', align: 'center', wordWrap: { width: this.cardW - 30 },
      })
      .setOrigin(0.5, 0);
    card.add([iconBack, icon, name]);
    // your form's favoured traits wear a star
    const form = GameState.stageDef(stage);
    if (form.affinity?.includes(id)) {
      card.add(
        this.add
          .text(0, -CARD_H / 2 + 42, `★ ${form.creatureName} favourite`, { fontFamily: FONT, fontSize: '12px', color: '#ffd54f', fontStyle: 'bold', backgroundColor: '#2a2210', padding: { x: 6, y: 2 } })
          .setOrigin(0.5),
      );
    }

    // narrow cards (4-5 choices) drop the least important lines so the rest stays readable
    const compact = this.cardW < COMPACT_CARD_W;
    const body = compact ? '14px' : '15px';
    let y = name.y + name.height + 12;
    y = this.para(card, y, t.blurb, { fontSize: body, color: '#d7d2e0', fontStyle: 'italic' });
    y = this.para(card, y, t.effect(rank, stage), { fontSize: body, color: '#ffffff', fontStyle: 'bold' });
    // new abilities stay a mystery until you've reached that rank once (in any run)
    // a double mutation unlocks both ranks it skips through
    for (const r of double ? [rank - 1, rank] : [rank]) {
      const unlock = t.unlock?.(r, stage);
      if (!unlock) continue;
      const known = Codex.rank(id) >= r;
      y = this.para(card, y, known ? `NEW: ${unlock}` : 'NEW: ??? (pick it to find out)', { fontSize: body, color: '#ffd54f', fontStyle: 'bold' });
    }
    // this trait powers up your form's signature at rank III
    const up = SIGNATURE_UPGRADES[form.signature];
    if (up?.trait === id) {
      y = this.para(card, y, rank >= 3 ? `★ ${up.text}` : `★ At rank III: ${up.text}`, { fontSize: '13px', color: '#ffd54f' });
    }
    const next = rank < t.maxRank && !compact ? t.unlock?.(rank + 1, stage) : null;
    if (next) y = this.para(card, y, `Rank ${rank + 1}: ${Codex.rank(id) >= rank + 1 ? next : '???'}`, { fontSize: '13px', color: '#9e95b0' });
    // point at fusions this trait could lead to, preferring ones whose partner you already own
    const fusions = fusionsWith(id, GameState.fusions).sort(
      (f1, f2) => Number(f2.parents.every((p) => p === id || GameState.rank(p) > 0)) - Number(f1.parents.every((p) => p === id || GameState.rank(p) > 0)),
    );
    if (fusions.length && y < CARD_H / 2 - 60) {
      const f = fusions[0];
      const partner = f.parents.find((p) => p !== id)!;
      const owned = GameState.rank(partner) > 0;
      const fname = Codex.hasFusion(f.id) ? f.name : '???';
      this.para(card, y, `Max this and ${GameState.traitName(partner, TRAITS[partner].maxRank, stage)}, then beat a boss to fuse: ${fname}${owned ? ' (you have it!)' : ''}`, {
        fontSize: '13px',
        color: owned ? '#ffd54f' : '#b39ddb',
      });
    }

    if (compact) return card;
    card.add(
      this.add
        .text(0, CARD_H / 2 - 14, `Evolves into: ${t.forms[4]} → ${t.forms[5]}`, {
          fontFamily: FONT, fontSize: '12px', color: '#8f87a0', align: 'center', wordWrap: { width: this.cardW - 30 },
        })
        .setOrigin(0.5, 1),
    );
    return card;
  }

  private fusionCard(id: FusionId, index: number, x: number): Phaser.GameObjects.Container {
    const f = FUSIONS[id];
    const [a, b] = f.parents.map((p) => TRAITS[p]);
    const card = this.frame(index, x, [a.color, b.color], 'FUSION');
    // a subtle shimmer so fusions stand out
    const glow = this.add.rectangle(0, 0, this.cardW, CARD_H, 0xffd54f, 0.06);
    card.addAt(glow, 1);
    this.tweens.add({ targets: glow, alpha: 0.18, yoyo: true, repeat: -1, duration: 700 });

    const iy = -CARD_H / 2 + 88;
    card.add([
      this.add.circle(-30, iy, 34, 0x16121f).setStrokeStyle(3, a.color),
      this.add.image(-30, iy, `icon_${a.id}`).setScale(0.85),
      this.add.circle(30, iy, 34, 0x16121f).setStrokeStyle(3, b.color),
      this.add.image(30, iy, `icon_${b.id}`).setScale(0.85),
      this.add.text(0, iy, '+', { fontFamily: FONT, fontSize: '30px', color: '#ffd54f', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5),
    ]);
    const name = this.add
      .text(0, -CARD_H / 2 + 136, f.name, {
        fontFamily: FONT, fontSize: '24px', color: '#ffd54f', fontStyle: 'bold', align: 'center', wordWrap: { width: this.cardW - 30 },
      })
      .setOrigin(0.5, 0);
    card.add(name);
    let y = name.y + name.height + 12;
    y = this.para(card, y, f.blurb, { fontSize: '15px', color: '#d7d2e0', fontStyle: 'italic' });
    y = this.para(card, y, f.effect, { fontSize: '15px', color: '#ffffff', fontStyle: 'bold' });
    const stage = GameState.stageIndex;
    this.para(card, y, `Combines your maxed ${GameState.traitName(a.id, a.maxRank, stage)} + ${GameState.traitName(b.id, b.maxRank, stage)}`, {
      fontSize: '13px',
      color: '#ffe082',
    });
    return card;
  }

  /** A secret form's mutation: decides what you metamorphose into next. */
  private formCard(stageId: string, index: number, x: number): Phaser.GameObjects.Container {
    const f = formUnlock(stageId)!;
    const st = stageById(stageId)!;
    const card = this.frame(index, x, [0x64ffda, 0x1de9b6], 'SECRET FORM');
    const glow = this.add.rectangle(0, 0, this.cardW, CARD_H, 0x64ffda, 0.05);
    card.addAt(glow, 1);
    this.tweens.add({ targets: glow, alpha: 0.16, yoyo: true, repeat: -1, duration: 800 });

    const iy = -CARD_H / 2 + 88;
    card.add([
      this.add.circle(0, iy, 42, 0x16121f).setStrokeStyle(3, 0x64ffda),
      this.add.image(0, iy, st.playerTexture).setScale(36 / BODY_RADIUS).setAngle(-90),
    ]);
    const name = this.add
      .text(0, -CARD_H / 2 + 140, f.mutation, {
        fontFamily: FONT, fontSize: '22px', color: '#64ffda', fontStyle: 'bold', align: 'center', wordWrap: { width: this.cardW - 30 },
      })
      .setOrigin(0.5, 0);
    card.add(name);
    const compact = this.cardW < COMPACT_CARD_W;
    const body = compact ? '14px' : '15px';
    let y = name.y + name.height + 12;
    y = this.para(card, y, f.blurb, { fontSize: body, color: '#d7d2e0', fontStyle: 'italic' });
    const into = GameState.stageDef(f.index).creatureName;
    y = this.para(card, y, `At your next metamorphosis, become a ${st.creatureName} instead of a ${into}.`, { fontSize: body, color: '#ffffff', fontStyle: 'bold' });
    if (st.pitch && !compact) y = this.para(card, y, st.pitch, { fontSize: '13px', color: '#c8e6c9' });
    const sig = SIGNATURES[st.signature];
    this.para(card, y, `${sig.name}: ${sig.short}`, { fontSize: '13px', color: '#ffd54f' });
    return card;
  }

  private choose(index: number): void {
    if (this.chosen) return;
    this.chosen = true;
    const tip = Tutorial.current;
    if (tip === 'evolve' || tip === 'secret' || tip === 'fusion' || tip === 'trophy') Tutorial.done(tip);
    const choice = this.choices[index];
    if (this.trophy) GameState.trophies--;
    // Wider Gene Pool only widens the first screen of each stage (StageScene refills it)
    GameState.firstPickBonus = 0;
    if (choice.kind === 'trait') GameState.addTrait(choice.id);
    else if (choice.kind === 'double') {
      GameState.addTrait(choice.id);
      GameState.addTrait(choice.id);
    } else if (choice.kind === 'fusion') GameState.addFusion(choice.id);
    else GameState.chooseForm(formUnlock(choice.id)!.index, choice.id);
    GameState.pendingEvolutions--;

    this.cards.forEach((c, i) => {
      if (i === index) this.tweens.add({ targets: c, scale: 1.1, duration: 160, yoyo: true });
      else this.tweens.add({ targets: c, alpha: 0, y: c.y + 40, duration: 200 });
    });

    this.time.delayedCall(420, () => {
      this.scene.resume('Stage', { chosen: choice });
      this.scene.stop();
    });
  }
}
