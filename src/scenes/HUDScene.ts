import Phaser from 'phaser';
import { Settings } from '../state/Settings';
import { showBanners } from '../systems/Banners';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { TOTAL_STAGES } from '../data/stages';
import { SIGNATURES } from '../data/signatures';
import { dashCooldown, venomCooldown } from '../data/traits';
import { TipPanel } from '../systems/Tutorial';
import { GameState } from '../state/GameState';
import { keyLabel, moveLabel, ringLegend } from '../systems/Controls';

const BAR_W = 260;
const BAR_H = 14;
const SLOT = 58;
const MAX_TOASTS = 4;

interface AbilitySlot {
  key: 'signature' | 'venom' | 'dash';
  x: number;
  y: number;
  color: number;
  /** Full cooldown, or 0 for a passive. */
  max: () => number;
  label: Phaser.GameObjects.Text;
}

/** Screen-space overlay that runs on top of StageScene. Reads GameState every frame. */
export class HUDScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  /** Drawn above the ability icons (cooldown shading). */
  private fg!: Phaser.GameObjects.Graphics;
  private stageText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private dnaText!: Phaser.GameObjects.Text;
  private growthText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private toasts: Phaser.GameObjects.Text[] = [];
  private tips!: TipPanel;
  /** Rebuilt whenever the trait list changes. */
  private traitObjects: Phaser.GameObjects.GameObject[] = [];
  private traitPanel = new Phaser.Geom.Rectangle();
  private traitSignature = '';
  private slots: AbilitySlot[] = [];
  private slotObjects: Phaser.GameObjects.GameObject[] = [];
  private slotSignature = '';

  constructor() {
    super('HUD');
  }

  /** Visible size at the chosen HUD scale: the camera zooms from the top-left, so layout uses these. */
  private get vw(): number {
    return GAME_WIDTH / Settings.hudScale;
  }

  private get vh(): number {
    return GAME_HEIGHT / Settings.hudScale;
  }

  create(): void {
    this.cameras.main.setOrigin(0, 0).setZoom(Settings.hudScale);
    this.toasts = [];
    // the evolution screen shows the card tips itself
    this.tips = new TipPanel(this, this.vh - 160, ['move', 'eat', 'drink', 'grow', 'danger', 'swat', 'venom', 'dash', 'signature', 'lair']);
    this.traitObjects = [];
    this.traitSignature = '';
    this.slots = [];
    this.slotObjects = [];
    this.slotSignature = '';
    this.g = this.add.graphics();
    // scene instances are reused, so drop the label from the previous stage (it was destroyed)
    this.bossText = undefined;
    this.fg = this.add.graphics().setDepth(2);
    const small = { fontFamily: FONT, fontSize: '13px', color: '#e8f5e9', stroke: '#000000', strokeThickness: 3 };

    this.stageText = this.add.text(24, 18, '', { ...small, fontSize: '16px', fontStyle: 'bold' });
    this.hpText = this.add.text(24, 48, '', small);
    this.dnaText = this.add.text(24, 84, '', small);
    this.growthText = this.add.text(24, 120, '', small);
    this.statusText = this.add.text(24, 162, '', { ...small, fontStyle: 'bold' });
    // difficulty, top-right of the bars panel
    this.add.text(BAR_W + 24, 48, GameState.diff.name, { ...small, color: '#9e9e9e' }).setOrigin(1, 0);

    const hint = this.add
      .text(this.vw / 2, this.vh - 20, `${moveLabel()} / arrows or hold left mouse to move  ·  ${keyLabel('signature')}: signature ability  ·  ESC: pause  ·  ${ringLegend()}`, {
        ...small,
        color: '#c8e6c9',
      })
      .setOrigin(0.5, 1);
    this.tweens.add({ targets: hint, alpha: 0, delay: 10000, duration: 1500 });

    this.game.events.on('toast', this.toast, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('toast', this.toast, this));
  }

  update(): void {
    showBanners(this);
    this.tips.update();
    const stage = GameState.stageDef();
    const s = GameState;
    const g = this.g;
    g.clear();
    this.drawLowHealth();

    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(12, 10, BAR_W + 24, 146, 10);

    this.stageText.setText(`STAGE ${s.stageIndex + 1}/${TOTAL_STAGES} · ${stage.creatureName.toUpperCase()} · ${stage.biome}`);

    const max = s.stats.maxHp;
    this.bar(24, 66, s.hp / max, COLORS.hp);
    if (s.status.shield > 0) {
      // shield shown as a white strip over the health bar
      g.fillStyle(0xffffff, 0.85);
      g.fillRoundedRect(24, 66, Math.max(6, BAR_W * Math.min(1, s.status.shield / max)), 5, 2);
    }
    const shield = s.status.shield > 0 ? `  (+${Math.ceil(s.status.shield)} shield)` : '';
    this.hpText.setText(`Health ${Math.ceil(Math.max(0, s.hp))} / ${max}${shield}`);

    this.bar(24, 102, s.dna / s.dnaToNext, COLORS.dna);
    this.dnaText.setText(`DNA ${Math.floor(s.dna)} / ${s.dnaToNext}`);

    const growth = (s.size - stage.startSize) / (stage.evolveSize - stage.startSize);
    this.bar(24, 138, growth, COLORS.growth);
    const next = s.formName(s.stageIndex + 1);
    this.growthText.setText(`Growth → ${next}  ${Math.floor(Phaser.Math.Clamp(growth, 0, 1) * 100)}%`);

    this.statusText.setText(this.statusLine());
    this.drawBossBar();

    this.refreshTraits();
    const tp = this.traitPanel;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(tp.x, tp.y, tp.width, tp.height, 10);

    this.drawAbilitySlots();
  }

  /** A red edge around the screen that pulses with the heartbeat while health is low. */
  private drawLowHealth(): void {
    const low = GameState.status.lowHealth;
    // not behind the evolution or pause screens
    if (!low || !this.scene.isActive('Stage')) return;
    const beat = low === 2 ? 0.6 : 0.9;
    const pulse = Math.pow(1 - ((this.time.now / 1000) % beat) / beat, 2);
    const strength = (low === 2 ? 0.32 : 0.2) * (0.45 + 0.55 * pulse);
    const g = this.g;
    for (let i = 0; i < 6; i++) {
      const w = 14 + i * 14;
      g.lineStyle(w, 0xb71c1c, strength * (1 - i / 6) * 0.6);
      g.strokeRect(w / 2, w / 2, this.vw - w, this.vh - w);
    }
  }

  private bossText?: Phaser.GameObjects.Text;

  /** Big health bar across the top while a zone boss is alive. */
  private drawBossBar(): void {
    const boss = GameState.status.boss;
    if (!this.bossText) {
      this.bossText = this.add
        .text(this.vw / 2, 16, '', { fontFamily: FONT, fontSize: '16px', color: '#ffcdd2', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5, 0);
    }
    this.bossText.setVisible(!!boss);
    if (!boss) return;
    const w = 420;
    const x = this.vw / 2 - w / 2;
    this.g.fillStyle(0x000000, 0.6);
    this.g.fillRoundedRect(x - 4, 38, w + 8, 18, 6);
    this.g.fillStyle(0xff1744, 1);
    this.g.fillRoundedRect(x, 42, Math.max(4, w * Phaser.Math.Clamp(boss.hp / boss.max, 0, 1)), 10, 4);
    this.bossText.setText(`☠ ${boss.name}`);
  }

  private statusLine(): string {
    const st = GameState.status;
    const parts: { text: string; color: string }[] = [];
    if (st.event) parts.push({ text: st.event, color: '#ffd54f' });
    if (st.slowed > 0) parts.push({ text: 'SLOWED', color: '#eceff1' });
    if (st.poisoned > 0) parts.push({ text: 'POISONED', color: '#9ccc65' });
    if (st.recovering) parts.push({ text: 'RECOVERING', color: '#a5d6a7' });
    if (st.hidden) parts.push({ text: 'HIDDEN', color: '#b39ddb' });
    if (st.frenzy > 0) parts.push({ text: `FRENZY ${st.frenzy.toFixed(1)}s`, color: '#ff5252' });
    if (st.adrenaline) parts.push({ text: 'RUSH', color: '#ff8a65' });
    if (GameState.secondWindsLeft > 0) parts.push({ text: `♥ x${GameState.secondWindsLeft}`, color: '#ef9a9a' });
    this.statusText.setColor(parts[0]?.color ?? '#ffffff');
    return parts.map((p) => p.text).join('  ·  ');
  }

  /** Rebuilds the trait list (icons + name per trait or fusion) when it changes. */
  private refreshTraits(): void {
    const entries = GameState.traitEntries();
    const sig = entries.map((e) => e.name).join('|');
    if (sig === this.traitSignature) return;
    this.traitSignature = sig;
    this.traitObjects.forEach((o) => o.destroy());
    this.traitObjects = [];

    const right = this.vw - 22;
    // shrink rows when the list gets long so it never runs off screen
    const compact = entries.length > 14;
    const rowH = compact ? 18 : 22;
    const style = { fontFamily: FONT, fontSize: compact ? '12px' : '14px', color: '#e8f5e9', stroke: '#000000', strokeThickness: 3 };
    const header = this.add.text(right, 16, `TRAITS (${entries.length})`, { ...style, fontSize: '14px', fontStyle: 'bold' }).setOrigin(1, 0);
    this.traitObjects.push(header);

    let y = 38;
    let width = header.width;
    if (entries.length === 0) {
      const none = this.add.text(right, y, 'none yet: fill the DNA bar', { ...style, color: '#a5b8a8' }).setOrigin(1, 0);
      this.traitObjects.push(none);
      width = Math.max(width, none.width);
      y += rowH;
    }
    const iconScale = compact ? 0.24 : 0.3;
    for (const e of entries) {
      const label = this.add.text(right, y, e.name, { ...style, color: e.fusion ? '#ffd54f' : '#e8f5e9' }).setOrigin(1, 0);
      this.traitObjects.push(label);
      let x = right - label.width - 12;
      for (const icon of [...e.icons].reverse()) {
        this.traitObjects.push(this.add.image(x, y + rowH / 2 - 2, icon).setScale(iconScale));
        x -= 18;
      }
      width = Math.max(width, label.width + 12 + e.icons.length * 18);
      y += rowH;
    }
    this.traitPanel.setTo(right - width - 12, 8, width + 24, y - 2);
  }

  private drawAbilitySlots(): void {
    const stats = GameState.stats;
    const sig = SIGNATURES[GameState.stageDef().signature];
    // key labels are part of it, so the slots redraw after rebinding in Options
    const wanted = [sig.id, stats.venomRank > 0 ? 'venom' : '', stats.dashRank > 0 ? 'dash' : '', keyLabel('primary'), keyLabel('dash'), keyLabel('signature')].join(',');
    if (wanted !== this.slotSignature) this.buildSlots(wanted);

    const g = this.g;
    this.fg.clear();
    for (const sl of this.slots) {
      g.fillStyle(0x000000, 0.5);
      g.fillRoundedRect(sl.x, sl.y, SLOT, SLOT, 10);
      const max = sl.max();
      const frac = max > 0 ? GameState.cooldowns[sl.key] / max : 0;
      if (frac > 0) {
        // cooldown shade drains from top to bottom
        this.fg.fillStyle(0x000000, 0.65);
        this.fg.fillRect(sl.x + 2, sl.y + 2 + (SLOT - 4) * (1 - frac), SLOT - 4, (SLOT - 4) * frac);
      }
      if (frac <= 0 || (sl.key === 'dash' && GameState.status.dashCharges > 0)) {
        g.lineStyle(2, sl.color, 1);
        g.strokeRoundedRect(sl.x, sl.y, SLOT, SLOT, 10);
      }
      if (sl.key === 'dash' && GameState.rank('wings') >= 2) {
        sl.label.setText(`${keyLabel('dash')} x${GameState.status.dashCharges}`);
      }
    }
  }

  private buildSlots(signature: string): void {
    this.slotSignature = signature;
    this.slotObjects.forEach((o) => o.destroy());
    this.slotObjects = [];
    const sig = SIGNATURES[GameState.stageDef().signature];
    const list: { key: AbilitySlot['key']; icon: string; text: string; color: number; max: () => number }[] = [
      { key: 'signature', icon: sig.icon, text: sig.key ? keyLabel('signature') : 'PASSIVE', color: 0xffd54f, max: () => sig.cooldown },
    ];
    if (GameState.stats.venomRank > 0) {
      list.push({ key: 'venom', icon: 'icon_venom', text: keyLabel('primary'), color: 0x9b59ff, max: () => venomCooldown(GameState.stats.venomRank) });
    }
    if (GameState.stats.dashRank > 0) {
      list.push({
        key: 'dash', icon: 'icon_wings', text: keyLabel('dash'), color: 0x81d4fa,
        max: () => dashCooldown(GameState.stats.dashRank, GameState.rank('nimble')),
      });
    }
    this.slots = list.map((d, i) => {
      const x = 24 + i * (SLOT + 14);
      const y = this.vh - SLOT - 30;
      const icon = this.add.image(x + SLOT / 2, y + SLOT / 2, d.icon).setScale(0.62).setDepth(1);
      const label = this.add
        .text(x + SLOT / 2, y + SLOT + 4, d.text, { fontFamily: FONT, fontSize: '12px', color: '#e8f5e9', stroke: '#000', strokeThickness: 3, fontStyle: 'bold' })
        .setOrigin(0.5, 0);
      this.slotObjects.push(icon, label);
      return { key: d.key, x, y, color: d.color, max: d.max, label };
    });
    // signature name above its slot
    const first = this.slots[0];
    this.slotObjects.push(
      this.add
        .text(first.x, first.y - 18, sig.name, { fontFamily: FONT, fontSize: '12px', color: '#ffd54f', stroke: '#000', strokeThickness: 3, fontStyle: 'bold' })
        .setOrigin(0, 0),
    );
  }

  private bar(x: number, y: number, frac: number, color: number): void {
    const f = Phaser.Math.Clamp(frac, 0, 1);
    this.g.fillStyle(0x000000, 0.6);
    this.g.fillRoundedRect(x, y, BAR_W, BAR_H, 5);
    if (f > 0) {
      this.g.fillStyle(color, 1);
      this.g.fillRoundedRect(x, y, Math.max(BAR_W * f, 10), BAR_H, 5);
    }
  }

  private toast(msg: string): void {
    // keep the screen readable: drop the oldest message when too many pile up
    while (this.toasts.length >= MAX_TOASTS) this.toasts.shift()?.destroy();
    const t = this.add
      .text(this.vw / 2, 0, msg, {
        fontFamily: FONT,
        fontSize: '19px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 680 },
      })
      .setOrigin(0.5, 0)
      .setAlpha(0);
    this.toasts.push(t);
    this.layoutToasts();
    this.tweens.add({ targets: t, alpha: 1, duration: 200 });
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 3600,
      duration: 600,
      onComplete: () => {
        this.toasts = this.toasts.filter((x) => x !== t);
        t.destroy();
        this.layoutToasts();
      },
    });
  }

  private layoutToasts(): void {
    let y = 190;
    for (const t of this.toasts) {
      if (!t.active) continue;
      t.setY(y);
      y += t.height + 6;
    }
  }
}
