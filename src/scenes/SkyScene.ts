import Phaser from 'phaser';
import { Settings } from '../state/Settings';
import { TOTAL_STAGES } from '../data/stages';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { REGIONS, TERRAIN_COLOR, type RegionDef } from '../data/world';
import { WORLD_MUSIC } from '../data/atmosphere';
import { dashCooldown } from '../data/traits';
import { BODY_RADIUS } from '../art/textures';
import { RunSave } from '../state/RunSave';
import { Controls, PAD, keyLabel, moveLabel } from '../systems/Controls';
import { GameState } from '../state/GameState';
import { Codex } from '../state/Codex';
import { Achievements } from '../state/Achievements';
import { showBanners } from '../systems/Banners';
import { FinaleHud, finaleTime, showBriefing, showdownBanner, winMoment } from '../systems/Finale';
import { Sfx } from '../audio/Sfx';

/** Seconds until humanity launches its weather-control satellite (you lose). */
const SATELLITE_TIME = 210;
const BASE_SPEED = 230;
const BASE_STORM = 70;
const LIGHTNING_CD = 3;
const JET_SPEED = 520;
const JET_WARN = 0.9;
const FLAK_FUSE = 1.2;
const FLAK_RADIUS = 55;
/** Damage as a share of max health. */
const JET_DAMAGE = 0.08;
const FLAK_DAMAGE = 0.1;
/** Most jets and flak bursts in the air at once. */
const MAX_JETS = 3;
const MAX_FLAK = 2;
const DASH_TIME = 0.25;
const GRACE = 5;
/** Each lightning strike on a region darkens this much of its sky. */
const STRIKE_CONTROL = 0.25;
/** The satellite: lightning strikes it can take, shield nodes per shield, and its attacks. */
const SAT_STRIKES = 10;
const SAT_NODES = 3;
const SAT_BEAM_RADIUS = 70;
const SAT_BEAM_FUSE = 1.3;
const SAT_BEAM_DAMAGE = 0.14;

interface SkyRegion extends RegionDef {
  control: number;
  mine: boolean;
  points: Phaser.Types.Math.Vector2Like[];
  fireCd: number;
  /** Cloud puffs that gather over this region as its sky darkens. */
  clouds: { x: number; y: number; r: number; phase: number }[];
}

/** The weather satellite: the showdown once every sky is yours. */
interface Satellite {
  x: number;
  y: number;
  hp: number;
  t: number;
  beamCd: number;
  jetCd: number;
  /** Shield nodes to destroy before lightning can reach it. */
  nodes: { x: number; y: number }[];
  /** Health at which the next shield goes up. */
  nextShield: number;
}

interface Jet {
  x: number;
  y: number;
  angle: number;
  /** Seconds of warning line left before it launches. */
  warn: number;
  life: number;
}

interface Flak {
  x: number;
  y: number;
  fuse: number;
}

/** Controls line, shown at the bottom and on the pause menu. */
const controlsHelp = (): string =>
  `Move: ${moveLabel()} / mouse  ·  ${keyLabel('primary')}: lightning  ·  ${keyLabel('dash')}: dash  ·  ESC: pause`;

/**
 * The flying line's finale (aerial ending). You are a living storm over the world map: hover
 * over a region until its sky is yours. Human regions scramble jets and flak; lightning (SPACE)
 * swats them out of the sky. Darken every sky before the weather satellite launches.
 */
export class SkyScene extends Phaser.Scene {
  private regions: SkyRegion[] = [];
  private jets: Jet[] = [];
  private flak: Flak[] = [];
  private bolts: { x: number; y: number; life: number }[] = [];
  private beams: { x: number; y: number; fuse: number }[] = [];
  private sat: Satellite | null = null;
  private limit = 0;
  private started = false;
  private player!: Phaser.GameObjects.Image;
  private g!: Phaser.GameObjects.Graphics;
  private hud!: FinaleHud;
  private toastText!: Phaser.GameObjects.Text;
  private controls!: Controls;
  private vx = 0;
  private vy = 0;
  private t = 0;
  private lightningCd = 0;
  private dashCd = 0;
  private dashTime = 0;
  private invuln = 0;
  private over = false;
  private captured = 0;
  private toastTime = 0;

  constructor() {
    super('Sky');
  }

  create(): void {
    this.regions = [];
    this.jets = [];
    this.flak = [];
    this.bolts = [];
    this.beams = [];
    this.sat = null;
    this.started = false;
    this.limit = finaleTime(SATELLITE_TIME);
    this.vx = this.vy = 0;
    this.t = 0;
    this.lightningCd = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.invuln = 0;
    this.over = false;
    this.captured = 0;
    GameState.stageIndex = TOTAL_STAGES - 1;
    GameState.hp = GameState.stats.maxHp;
    Codex.becomeForm('sky');
    RunSave.checkpoint();

    this.cameras.main.setBackgroundColor(0x0b2a4a);
    this.cameras.main.fadeIn(600);
    Sfx.startAmbient(WORLD_MUSIC);
    this.drawWorld();
    this.g = this.add.graphics().setDepth(10);
    this.player = this.add.image(GAME_WIDTH * 0.53, GAME_HEIGHT * 0.7, 'sovereign').setScale(32 / BODY_RADIUS).setDepth(20);

    const style = { fontFamily: FONT, stroke: '#000', strokeThickness: 4 };
    this.hud = new FinaleHud(this, 'STORM SOVEREIGN', '#b39ddb');
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 16, controlsHelp(), { ...style, fontSize: '14px', color: '#b0bec5' })
      .setOrigin(0.5)
      .setDepth(30);
    this.toastText = this.add.text(GAME_WIDTH / 2, 96, '', { ...style, fontSize: '20px', color: '#ffd54f', fontStyle: 'bold', align: 'center', backgroundColor: 'rgba(5, 2, 12, 0.7)', padding: { x: 10, y: 4 } }).setOrigin(0.5).setDepth(30);
    showBriefing(
      this,
      {
        title: 'THE STORM RISES',
        texture: 'sovereign',
        color: '#b39ddb',
        story: 'The sky was always yours. Now the whole world will live under it, unless humanity launches its weather satellite first.',
        rules: [
          'Fly your storm over a region and strike it with lightning until its sky is yours. Hovering alone is slow.',
          'Jets follow a red warning line, and flak bursts inside red circles. Lightning destroys both.',
          'Your own skies heal you, and every sky you take makes your storm bigger.',
          `Darken every sky before the satellite launches in ${Math.floor(this.limit / 60)}:${(this.limit % 60).toString().padStart(2, '0')}. Then bring it down.`,
        ],
        controls: controlsHelp(),
      },
      () => (this.started = true),
    );

    const kb = this.input.keyboard!;
    this.controls = new Controls(this);
    kb.on('keydown-ESC', () => this.openPause());
    kb.on('keydown-P', () => this.openPause());
  }

  private toast(text: string, seconds = 2.5): void {
    this.toastText.setText(text).setAlpha(1);
    this.toastTime = seconds;
  }

  /** The shared pause menu: continue, restart the run or go back to the title. */
  private openPause(): void {
    if (this.over || !this.started || !this.scene.isActive()) return;
    Sfx.play('pause');
    // keys released while paused would otherwise stay held (SPACE, WASD)
    this.events.once(Phaser.Scenes.Events.RESUME, () => {
      this.input.keyboard!.resetKeys();
      this.controls.reset();
    });
    this.scene.pause();
    this.scene.launch('Pause', { from: this.scene.key, help: controlsHelp() });
  }

  // ------------------------------------------------------------ setup

  private blob(def: RegionDef): Phaser.Types.Math.Vector2Like[] {
    const rng = new Phaser.Math.RandomDataGenerator([def.id]);
    const p1 = rng.realInRange(0, Math.PI * 2);
    const p2 = rng.realInRange(0, Math.PI * 2);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const wobble = 1 + 0.12 * Math.sin(a * 3 + p1) + 0.07 * Math.sin(a * 5 + p2);
      pts.push({ x: def.x + Math.cos(a) * def.rx * wobble, y: def.y + Math.sin(a) * def.ry * wobble });
    }
    return pts;
  }

  private drawWorld(): void {
    const g = this.add.graphics().setDepth(0);
    const rng = new Phaser.Math.RandomDataGenerator(['sky']);
    g.lineStyle(2, 0x1c4f7a, 0.5);
    for (let i = 0; i < 70; i++) {
      g.beginPath();
      g.arc(rng.between(0, GAME_WIDTH), rng.between(40, GAME_HEIGHT - 30), 14, Math.PI * 1.15, Math.PI * 1.85);
      g.strokePath();
    }
    for (const def of REGIONS) {
      const points = this.blob(def);
      g.fillStyle(TERRAIN_COLOR[def.terrain], 1);
      g.fillPoints(points, true);
      g.lineStyle(2, 0x000000, 0.35);
      g.strokePoints(points, true);
      this.add
        .text(def.x, def.y, def.name, { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(12);
      const mine = def.owner === 'you';
      const clouds = Array.from({ length: 6 }, () => {
        const a = rng.realInRange(0, Math.PI * 2);
        const d = Math.sqrt(rng.frac()) * 0.75;
        return { x: def.x + Math.cos(a) * def.rx * d, y: def.y + Math.sin(a) * def.ry * d, r: rng.realInRange(14, 26), phase: rng.realInRange(0, 6) };
      });
      this.regions.push({
        ...def,
        points,
        clouds,
        mine,
        control: mine ? 1 : 0,
        fireCd: GRACE + Phaser.Math.FloatBetween(1, 5),
      });
    }
  }

  // ------------------------------------------------------------ stats from your traits

  private stormRadius(): number {
    return Math.min(150, BASE_STORM * (1 + 0.08 * GameState.rank('size')) + this.captured * 1.5);
  }

  private speed(): number {
    return BASE_SPEED * GameState.stats.speedMul * (this.dashTime > 0 ? 2.6 : 1);
  }

  /** Control gained per second over a region. Acid Rain (venom) darkens skies faster. */
  private captureRate(r: SkyRegion): number {
    return (0.12 / (1 + r.level)) * (1 + 0.15 * GameState.stats.venomRank) * (1 + 0.03 * this.captured);
  }

  private warnTime(): number {
    return JET_WARN + 0.3 * GameState.rank('eyes');
  }

  // ------------------------------------------------------------ update

  update(_t: number, deltaMs: number): void {
    showBanners(this);
    this.controls.update();
    if (this.controls.padPressed(PAD.START)) this.openPause();
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.toastTime -= dt;
    if (this.toastTime <= 0) this.toastText.setAlpha(Math.max(0, this.toastText.alpha - dt * 2));
    if (this.over || !this.started) {
      this.draw();
      return;
    }
    this.t += dt;
    GameState.tick(dt);
    this.lightningCd = Math.max(0, this.lightningCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    this.move(dt);
    this.capture(dt);
    this.defend(dt);
    this.updateThreats(dt);
    if (this.sat) this.updateSatellite(this.sat, dt);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);

    if (this.controls.pressed('primary')) this.lightning();
    if (this.controls.pressed('dash') && GameState.stats.dashRank > 0 && this.dashCd <= 0) {
      this.dashTime = DASH_TIME;
      this.invuln = Math.max(this.invuln, DASH_TIME);
      this.dashCd = dashCooldown(GameState.stats.dashRank, GameState.rank('nimble'));
      Sfx.play('dash');
    }

    if (!this.sat && this.t >= this.limit) this.lose("humanity's weather satellite");
    this.draw();
  }

  private move(dt: number): void {
    let { x: dx, y: dy } = this.controls.move();
    const ptr = this.input.activePointer;
    if (!dx && !dy && ptr.leftButtonDown() && Settings.flag('mouseMove')) {
      dx = ptr.x - this.player.x;
      dy = ptr.y - this.player.y;
      if (Math.hypot(dx, dy) < 12) dx = dy = 0;
    }
    const len = Math.hypot(dx, dy);
    // mouse moves at full speed; the stick can go slower
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    const a = Math.min(1, dt * 5 * GameState.stats.accelMul);
    this.vx += (dx * this.speed() - this.vx) * a;
    this.vy += (dy * this.speed() - this.vy) * a;
    const p = this.player;
    p.x = Phaser.Math.Clamp(p.x + this.vx * dt, 20, GAME_WIDTH - 20);
    p.y = Phaser.Math.Clamp(p.y + this.vy * dt, 50, GAME_HEIGHT - 36);
    if (Math.hypot(this.vx, this.vy) > 20) p.rotation = Phaser.Math.Angle.RotateTo(p.rotation, Math.atan2(this.vy, this.vx), dt * 8);
    p.setAlpha(this.invuln > 0 && Math.floor(this.t * 16) % 2 === 0 ? 0.4 : 1);
  }

  /** True if the storm covers this region. */
  private covers(r: SkyRegion, extra = 0): boolean {
    const R = this.stormRadius() * 0.6 + extra;
    const nx = (this.player.x - r.x) / (r.rx + R);
    const ny = (this.player.y - r.y) / (r.ry + R);
    return nx * nx + ny * ny <= 1;
  }

  private capture(dt: number): void {
    let overOwn = false;
    for (const r of this.regions) {
      if (r.mine) {
        if (this.covers(r)) overOwn = true;
        continue;
      }
      if (!this.covers(r)) continue;
      r.control = Math.min(1, r.control + this.captureRate(r) * dt);
      if (r.control >= 1) this.claim(r);
    }
    // your own skies heal you
    if (overOwn) GameState.heal(GameState.stats.maxHp * 0.02 * dt);
  }

  private claim(r: SkyRegion): void {
    r.mine = true;
    r.control = 1;
    this.captured++;
    Sfx.play('capture');
    this.toast(`The skies over ${r.name} are yours!`);
    const left = this.regions.filter((x) => !x.mine).length;
    if (left === 0) this.startShowdown();
  }

  // ------------------------------------------------------------ showdown

  /** Every sky is dark, so humanity launches early: the satellite must fall. */
  private startShowdown(): void {
    this.sat = { x: GAME_WIDTH / 2, y: 320, hp: SAT_STRIKES, t: 0, beamCd: 3, jetCd: 5, nodes: [], nextShield: SAT_STRIKES * 0.66 };
    showdownBanner(this, 'THE SATELLITE LAUNCHES', 'Chase it down and strike it with lightning.', '#ff8a80');
  }

  private updateSatellite(s: Satellite, dt: number): void {
    const p = this.player;
    s.t += dt;
    s.x = GAME_WIDTH / 2 + Math.cos(s.t * 0.35) * 430;
    s.y = 340 + Math.sin(s.t * 0.7) * 170;
    const anger = GameState.diff.humanStrength * GameState.threatLevel;
    // a beam lands where you are heading
    s.beamCd -= dt * anger;
    if (s.beamCd <= 0) {
      s.beamCd = 3.2;
      this.beams.push({ x: p.x + this.vx * 0.7, y: p.y + this.vy * 0.7, fuse: SAT_BEAM_FUSE });
      Sfx.play('warn');
    }
    s.jetCd -= dt * anger;
    if (s.jetCd <= 0 && this.jets.length < MAX_JETS) {
      s.jetCd = 5;
      this.jets.push({ x: s.x, y: s.y, angle: Math.atan2(p.y - s.y, p.x - s.x), warn: this.warnTime(), life: 3 });
    }
    for (const b of this.beams) {
      b.fuse -= dt;
      if (b.fuse > 0) continue;
      Sfx.play('slam', 0.8);
      this.bolts.push({ x: b.x, y: b.y, life: 0.3 });
      this.cameras.main.flash(90, 255, 120, 120);
      if (Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) < SAT_BEAM_RADIUS) this.hurt(SAT_BEAM_DAMAGE, 'the orbital beam');
    }
    this.beams = this.beams.filter((b) => b.fuse > 0);
  }

  /** Lightning in reach of the satellite: shields first, then the satellite itself. */
  private strikeSatellite(s: Satellite, R: number): void {
    const p = this.player;
    const inReach = (x: number, y: number) => Phaser.Math.Distance.Between(x, y, p.x, p.y) < R;
    const left = s.nodes.filter((n) => !inReach(n.x, n.y));
    for (const n of s.nodes) if (inReach(n.x, n.y)) this.bolts.push({ x: n.x, y: n.y, life: 0.3 });
    const broke = s.nodes.length > 0 && left.length === 0;
    s.nodes = left;
    if (broke) this.toast('The shield is down! Strike it now!');
    if (s.nodes.length || broke || !inReach(s.x, s.y)) return;
    s.hp -= 1 + 0.25 * GameState.rank('shock');
    this.bolts.push({ x: s.x, y: s.y, life: 0.3 });
    if (s.hp <= 0) {
      this.win();
      return;
    }
    if (s.hp > s.nextShield) return;
    // a new shield, powered from far away
    s.nextShield -= SAT_STRIKES * 0.33;
    for (let i = 0; i < SAT_NODES; i++) {
      const a = (i / SAT_NODES) * Math.PI * 2 + Math.random() * 2;
      s.nodes.push({
        x: Phaser.Math.Clamp(p.x + Math.cos(a) * 340, 60, GAME_WIDTH - 60),
        y: Phaser.Math.Clamp(p.y + Math.sin(a) * 260, 110, GAME_HEIGHT - 60),
      });
    }
    this.toast('SHIELD UP! Destroy its three relays.');
    Sfx.play('warn');
  }

  /** Human regions scramble jets and flak; they get angrier over time. */
  private defend(dt: number): void {
    if (this.t < GRACE) return;
    const anger = (1 + this.t / 110) * GameState.threatLevel;
    for (const r of this.regions) {
      if (r.mine || r.level === 0) continue;
      r.fireCd -= dt * anger * GameState.diff.humanStrength;
      if (r.fireCd > 0) continue;
      r.fireCd = (9 - r.level * 1.2) * Phaser.Math.FloatBetween(0.8, 1.25);
      const p = this.player;
      if (Phaser.Math.Distance.Between(r.x, r.y, p.x, p.y) > 480) continue;
      const jet = Math.random() < 0.55;
      if (jet ? this.jets.length >= MAX_JETS : this.flak.length >= MAX_FLAK) continue;
      if (jet) {
        this.jets.push({ x: r.x, y: r.y, angle: Math.atan2(p.y - r.y, p.x - r.x), warn: this.warnTime(), life: 3 });
      } else {
        this.flak.push({ x: p.x + this.vx * 0.8, y: p.y + this.vy * 0.8, fuse: FLAK_FUSE });
      }
    }
  }

  private updateThreats(dt: number): void {
    const p = this.player;
    for (const j of this.jets) {
      if (j.warn > 0) {
        j.warn -= dt;
        if (j.warn <= 0) Sfx.play('spear');
        continue;
      }
      j.life -= dt;
      j.x += Math.cos(j.angle) * JET_SPEED * dt;
      j.y += Math.sin(j.angle) * JET_SPEED * dt;
      if (Phaser.Math.Distance.Between(j.x, j.y, p.x, p.y) < 26 && this.hurt(JET_DAMAGE, 'a fighter jet')) j.life = 0;
    }
    this.jets = this.jets.filter((j) => j.life > 0);
    for (const f of this.flak) {
      f.fuse -= dt;
      if (f.fuse > 0) continue;
      Sfx.play('slam', 1.4);
      this.bolts.push({ x: f.x, y: f.y, life: -1 });
      if (Phaser.Math.Distance.Between(f.x, f.y, p.x, p.y) < FLAK_RADIUS) this.hurt(FLAK_DAMAGE, 'anti-aircraft flak');
    }
    this.flak = this.flak.filter((f) => f.fuse > 0);
  }

  private hurt(share: number, source: string): boolean {
    if (this.invuln > 0 || this.over) return false;
    const dealt = GameState.stats.maxHp * share * (1 - GameState.stats.armor) * GameState.diff.damageTaken;
    GameState.hp -= dealt;
    GameState.logDamage(source, dealt);
    this.invuln = 0.8;
    Sfx.play('hurt');
    this.cameras.main.shake(150, 0.006);
    if (GameState.hp <= 0) this.lose(source);
    return true;
  }

  /** Lightning: wipes out jets and flak in the storm and darkens the skies below. */
  private lightning(): void {
    if (this.lightningCd > 0) return;
    this.lightningCd = LIGHTNING_CD * (1 - 0.15 * GameState.rank('shock'));
    const p = this.player;
    const R = this.stormRadius() * 1.4;
    Sfx.play('crit');
    Sfx.play('slam', 1.6);
    this.cameras.main.flash(120, 220, 230, 255);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * R;
      this.bolts.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, life: 0.3 });
    }
    for (const j of this.jets) {
      if (Phaser.Math.Distance.Between(j.x, j.y, p.x, p.y) < R) {
        j.life = 0;
        this.bolts.push({ x: j.x, y: j.y, life: 0.3 });
      }
    }
    this.flak = this.flak.filter((f) => Phaser.Math.Distance.Between(f.x, f.y, p.x, p.y) >= R);
    for (const r of this.regions) {
      if (r.mine || !this.covers(r)) continue;
      r.control = Math.min(1, r.control + STRIKE_CONTROL);
      if (r.control >= 1) this.claim(r);
    }
    if (this.sat) this.strikeSatellite(this.sat, R);
  }

  // ------------------------------------------------------------ end

  private win(): void {
    this.over = true;
    Achievements.unlock('aerial_ending');
    const s = this.sat!;
    this.jets = [];
    this.flak = [];
    this.beams = [];
    winMoment(this, s.x, s.y, 'EVERY SKY ON EARTH IS YOURS.', '#b39ddb', () =>
      this.scene.start('Victory', { ending: 'aerial', conquered: this.captured, converted: 0, mapTime: this.t }),
    );
  }

  private lose(source: string): void {
    if (this.over) return;
    this.over = true;
    Sfx.stopAmbient();
    GameState.killedBy = source;
    this.cameras.main.fadeOut(1200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('GameOver'));
  }

  // ------------------------------------------------------------ drawing

  private draw(): void {
    const g = this.g;
    const p = this.player;
    g.clear();

    // the whole world dims as your storm spreads
    const owned = this.regions.filter((r) => r.mine).length / Math.max(1, this.regions.length);
    g.fillStyle(0x0a0d1f, 0.55 * owned);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    for (const r of this.regions) {
      if (r.mine) {
        g.fillStyle(0x1b2138, 0.85);
        g.fillPoints(r.points, true);
      }
      if (r.control > 0) {
        // storm clouds gather, and owned skies flicker with lightning
        const puffs = Math.ceil(r.clouds.length * r.control);
        for (let i = 0; i < puffs; i++) {
          const c = r.clouds[i];
          const drift = Math.sin(this.t * 0.5 + c.phase) * 7;
          g.fillStyle(r.mine ? 0x2e3650 : 0x37474f, 0.7);
          g.fillCircle(c.x + drift, c.y, c.r);
          g.fillStyle(0x5b6a9a, 0.22);
          g.fillCircle(c.x + drift - c.r * 0.3, c.y - c.r * 0.3, c.r * 0.6);
        }
        if (r.mine && Math.sin(this.t * 1.7 + r.x) > 0.985) {
          const c = r.clouds[0];
          g.lineStyle(3, 0xfff59d, 0.9);
          g.lineBetween(c.x, c.y, c.x + 8, c.y + 16);
          g.lineBetween(c.x + 8, c.y + 16, c.x - 2, c.y + 30);
        }
      }
      if (!r.mine && r.control > 0) {
        // progress ring
        g.lineStyle(4, 0xffd54f, 0.9);
        g.beginPath();
        g.arc(r.x, r.y - 22, 9, -Math.PI / 2, -Math.PI / 2 + r.control * Math.PI * 2);
        g.strokePath();
      }
      if (!r.mine && r.level > 0) {
        // little city towers
        for (let i = 0; i < r.level; i++) {
          g.fillStyle(0xeceff1, 0.9);
          g.fillRect(r.x - 10 + i * 8, r.y + 10 - i * 2, 5, 8 + i * 2);
        }
      }
    }

    // the storm
    const R = this.stormRadius();
    g.fillStyle(0x37474f, 0.28);
    g.fillCircle(p.x, p.y, R);
    g.lineStyle(3, 0xb0bec5, 0.35);
    for (let i = 0; i < 3; i++) {
      const a = this.t * (1.5 + i * 0.4) + i * 2;
      g.beginPath();
      g.arc(p.x, p.y, R * (0.55 + i * 0.18), a, a + 1.6);
      g.strokePath();
    }
    // the flock grows with every sky you take
    const flock = Math.min(14, this.captured);
    for (let i = 0; i < flock; i++) {
      const a = this.t * 1.2 + (i / Math.max(1, flock)) * Math.PI * 2;
      const fx = p.x + Math.cos(a) * R * 0.8;
      const fy = p.y + Math.sin(a) * R * 0.8;
      g.fillStyle(0x9fa8da, 0.9);
      g.fillTriangle(fx + Math.cos(a + 1.57) * 6, fy + Math.sin(a + 1.57) * 6, fx - 4, fy - 3, fx + 4, fy + 3);
    }

    this.drawSatellite(g);
    for (const f of this.flak) {
      const k = 1 - f.fuse / FLAK_FUSE;
      g.lineStyle(3, 0xff5252, 0.9);
      g.strokeCircle(f.x, f.y, FLAK_RADIUS);
      g.fillStyle(0xff5252, 0.25 * k);
      g.fillCircle(f.x, f.y, FLAK_RADIUS * k);
    }
    for (const j of this.jets) {
      if (j.warn > 0) {
        g.lineStyle(2, 0xff5252, 0.5 + 0.4 * Math.sin(this.t * 30));
        g.lineBetween(j.x, j.y, j.x + Math.cos(j.angle) * 900, j.y + Math.sin(j.angle) * 900);
        continue;
      }
      const c = Math.cos(j.angle);
      const s = Math.sin(j.angle);
      g.fillStyle(0xcfd8dc, 1);
      g.fillTriangle(j.x + c * 14, j.y + s * 14, j.x - c * 10 - s * 9, j.y - s * 10 + c * 9, j.x - c * 10 + s * 9, j.y - s * 10 - c * 9);
    }
    for (const b of this.bolts) {
      if (b.life < 0) {
        // flak burst
        g.fillStyle(0xffab40, 0.7);
        g.fillCircle(b.x, b.y, FLAK_RADIUS * 0.8);
        b.life = 0;
        continue;
      }
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i <= 6; i++) pts.push({ x: b.x + (i === 6 ? 0 : (Math.random() - 0.5) * 24), y: b.y - 140 + (i / 6) * 140 });
      g.lineStyle(5, 0xfff59d, b.life / 0.3);
      g.strokePoints(pts, false);
      g.lineStyle(2, 0xffffff, b.life / 0.3);
      g.strokePoints(pts, false);
    }

    const total = this.regions.length;
    const mine = this.regions.filter((r) => r.mine).length;
    const bolt = this.lightningCd > 0 ? `${this.lightningCd.toFixed(1)}s` : 'READY';
    const s = this.sat;
    this.hud.update(
      `Skies ${mine}/${total}   ·   Lightning: ${bolt}`,
      s ? null : { label: 'Satellite launches in', left: this.limit - this.t },
      GameState.hp / GameState.stats.maxHp,
      s ? { name: s.nodes.length ? `WEATHER SATELLITE: SHIELDED (${s.nodes.length} relays left)` : 'WEATHER SATELLITE', share: s.hp / SAT_STRIKES } : null,
    );
  }

  private drawSatellite(g: Phaser.GameObjects.Graphics): void {
    const s = this.sat;
    if (!s || s.hp <= 0) return;
    for (const b of this.beams) {
      const k = 1 - b.fuse / SAT_BEAM_FUSE;
      g.lineStyle(3, 0xff1744, 0.9);
      g.strokeCircle(b.x, b.y, SAT_BEAM_RADIUS);
      g.fillStyle(0xff1744, 0.3 * k);
      g.fillCircle(b.x, b.y, SAT_BEAM_RADIUS * k);
      g.lineStyle(2 + 6 * k, 0xff8a80, 0.25 + 0.6 * k);
      g.lineBetween(s.x, s.y, b.x, b.y);
    }
    g.fillStyle(0x1565c0, 1);
    g.fillRect(s.x - 62, s.y - 12, 40, 24);
    g.fillRect(s.x + 22, s.y - 12, 40, 24);
    g.lineStyle(2, 0x90caf9, 0.9);
    g.strokeRect(s.x - 62, s.y - 12, 40, 24);
    g.strokeRect(s.x + 22, s.y - 12, 40, 24);
    g.fillStyle(0xcfd8dc, 1);
    g.fillRect(s.x - 22, s.y - 4, 44, 8);
    g.fillCircle(s.x, s.y, 17);
    g.fillStyle(0xff5252, 0.6 + 0.4 * Math.sin(this.t * 8));
    g.fillCircle(s.x, s.y, 6);
    if (s.nodes.length) {
      g.lineStyle(4, 0x4fc3f7, 0.5 + 0.3 * Math.sin(this.t * 5));
      g.strokeCircle(s.x, s.y, 74);
    }
    for (const n of s.nodes) {
      g.lineStyle(1, 0x4fc3f7, 0.3);
      g.lineBetween(n.x, n.y, s.x, s.y);
      g.fillStyle(0x4fc3f7, 1);
      g.fillPoints([{ x: n.x, y: n.y - 15 }, { x: n.x + 15, y: n.y }, { x: n.x, y: n.y + 15 }, { x: n.x - 15, y: n.y }], true);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeCircle(n.x, n.y, 21 + Math.sin(this.t * 6) * 3);
    }
  }
}
