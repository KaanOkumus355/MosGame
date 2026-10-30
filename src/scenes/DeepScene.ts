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
import { showBanners } from '../systems/Banners';
import { FinaleHud, finaleTime, showBriefing, showdownBanner, winMoment } from '../systems/Finale';
import { Sfx } from '../audio/Sfx';

/** Seconds until humanity finishes the Great Sea Wall (you lose). */
const SEA_WALL_TIME = 210;
const SWIM_SPEED = 210;
/** Seconds of holding SPACE for a full-power wave. */
const CHARGE_TIME = 1.2;
const WAVE_SPEED = 340;
const WAVE_RANGE = 520;
const WAVE_COOLDOWN = 0.6;
const SHIP_SPEED = 70;
const MAX_SHIPS = 6;
const TORPEDO_SPEED = 190;
const TORPEDO_TURN = 0.8;
const CHARGE_FUSE = 1.4;
const CHARGE_RADIUS = 60;
/** Damage as a share of max health. */
const TORPEDO_DAMAGE = 0.12;
const DEPTH_CHARGE_DAMAGE = 0.12;
const DASH_TIME = 0.3;
const GRACE = 5;
/** The Great Sea Wall: one tower per entry, in open water; health, ram damage and fire rate. */
const WALL_TOWERS = [
  { x: 500, y: 415 },
  { x: 500, y: 470 },
  { x: 500, y: 525 },
  { x: 500, y: 580 },
  { x: 500, y: 635 },
];
const TOWER_HP = 260;
const TOWER_RADIUS = 26;
const TOWER_RAM = 40;
const TOWER_FIRE = 3.6;
const WALL_SHIPS = 3;

interface City extends RegionDef {
  hp: number;
  maxHp: number;
  flooded: boolean;
  points: Phaser.Types.Math.Vector2Like[];
  shipCd: number;
  /** Ripples on the drowned land. */
  ripples: { x: number; y: number; phase: number }[];
}

/** A tower of the Great Sea Wall: the showdown once every city has drowned. */
interface Tower {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  fireCd: number;
  ramCd: number;
}

interface Wave {
  x: number;
  y: number;
  angle: number;
  r: number;
  damage: number;
  traveled: number;
}

interface Ship {
  x: number;
  y: number;
  angle: number;
  fireCd: number;
}

interface Torpedo {
  x: number;
  y: number;
  angle: number;
  life: number;
}

/** Controls line, shown at the bottom and on the pause menu. */
const controlsHelp = (): string =>
  `Swim: ${moveLabel()} / mouse  ·  hold ${keyLabel('primary')}: tidal wave (aims where you face)  ·  ${keyLabel('dash')}: ram  ·  ESC: pause`;

/**
 * The water line's finale (abyssal ending). You are a leviathan in the world's oceans: land
 * blocks you, so circle the coasts, charge tidal waves (hold SPACE) and drown every human city.
 * Their navies hunt you with torpedoes and depth charges; ram ships with a dash or sink them
 * with waves. Drown them all before the Great Sea Wall is finished.
 */
export class DeepScene extends Phaser.Scene {
  private cities: City[] = [];
  private waves: Wave[] = [];
  private ships: Ship[] = [];
  private torpedoes: Torpedo[] = [];
  private charges: { x: number; y: number; fuse: number }[] = [];
  private booms: { x: number; y: number; r: number; life: number }[] = [];
  private towers: Tower[] = [];
  private shipCd = 0;
  private limit = 0;
  private started = false;
  private player!: Phaser.GameObjects.Image;
  private g!: Phaser.GameObjects.Graphics;
  private hud!: FinaleHud;
  private toastText!: Phaser.GameObjects.Text;
  private controls!: Controls;
  private vx = 0;
  private vy = 0;
  private facing = 0;
  private t = 0;
  private charge = -1;
  private waveCd = 0;
  private dashCd = 0;
  private dashTime = 0;
  private invuln = 0;
  private sinceHit = 99;
  private over = false;
  private drowned = 0;
  private toastTime = 0;

  constructor() {
    super('Deep');
  }

  create(): void {
    this.cities = [];
    this.waves = [];
    this.ships = [];
    this.torpedoes = [];
    this.charges = [];
    this.booms = [];
    this.towers = [];
    this.shipCd = 0;
    this.started = false;
    this.limit = finaleTime(SEA_WALL_TIME);
    this.vx = this.vy = 0;
    this.facing = 0;
    this.t = 0;
    this.charge = -1;
    this.waveCd = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.invuln = 0;
    this.sinceHit = 99;
    this.over = false;
    this.drowned = 0;
    GameState.stageIndex = TOTAL_STAGES - 1;
    GameState.hp = GameState.stats.maxHp;
    Codex.becomeForm('abyss');
    RunSave.checkpoint();

    this.cameras.main.setBackgroundColor(0x072238);
    this.cameras.main.fadeIn(600);
    Sfx.startAmbient(WORLD_MUSIC);
    this.drawWorld();
    this.g = this.add.graphics().setDepth(10);
    // start in the ocean off Africa's west coast
    this.player = this.add.image(560, 470, 'leviathan').setScale(28 / BODY_RADIUS).setDepth(20);
    for (let r = 0; this.onLand(this.player.x, this.player.y, 30) && r < 400; r += 10) this.player.setPosition(560 - r, 470 + r * 0.3);

    const style = { fontFamily: FONT, stroke: '#000', strokeThickness: 4 };
    this.hud = new FinaleHud(this, 'LEVIATHAN', '#4dd0e1');
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 16, controlsHelp(), {
        ...style, fontSize: '14px', color: '#b0bec5',
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.toastText = this.add.text(GAME_WIDTH / 2, 96, '', { ...style, fontSize: '20px', color: '#4dd0e1', fontStyle: 'bold', align: 'center', backgroundColor: 'rgba(5, 2, 12, 0.7)', padding: { x: 10, y: 4 } }).setOrigin(0.5).setDepth(30);
    showBriefing(
      this,
      {
        title: 'THE SEA REMEMBERS',
        texture: 'leviathan',
        color: '#4dd0e1',
        story: 'Everything came from the water once. It is time for it all to go back, before humanity seals the oceans behind the Great Sea Wall.',
        rules: [
          'Hold the wave key to charge a tidal wave, and release it to send it the way you face. A longer charge hits harder.',
          'Land blocks you, so circle the coasts. Waves crash on the first coast they reach and hurt the cities there.',
          'Warships fire homing torpedoes and depth charges. Waves sink them, and so does ramming them with a dash.',
          `Drown every city before the wall is finished in ${Math.floor(this.limit / 60)}:${(this.limit % 60).toString().padStart(2, '0')}. Then smash through it.`,
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
    const rng = new Phaser.Math.RandomDataGenerator(['deep']);
    g.lineStyle(2, 0x0f4c75, 0.6);
    for (let i = 0; i < 90; i++) {
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
        .text(def.x, def.y - 6, def.name, { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(12);
      if (def.owner !== 'humans') continue;
      const maxHp = (150 + 120 * def.level) * GameState.threatLevel;
      const ripples = Array.from({ length: 7 }, () => {
        const a = rng.realInRange(0, Math.PI * 2);
        const d = Math.sqrt(rng.frac()) * 0.8;
        return { x: def.x + Math.cos(a) * def.rx * d, y: def.y + Math.sin(a) * def.ry * d, phase: rng.realInRange(0, 6) };
      });
      this.cities.push({ ...def, points, ripples, hp: maxHp, maxHp, flooded: false, shipCd: GRACE + Phaser.Math.FloatBetween(0, 6) });
    }
  }

  // ------------------------------------------------------------ geometry

  /** True if the point is on land (any region still above water, slightly shrunk so coasts are swimmable). */
  private onLand(x: number, y: number, pad = 0): boolean {
    for (const r of REGIONS) {
      if (this.cities.some((c) => c.id === r.id && c.flooded)) continue;
      const nx = (x - r.x) / (r.rx * 0.92 + pad);
      const ny = (y - r.y) / (r.ry * 0.92 + pad);
      if (nx * nx + ny * ny < 1) return true;
    }
    return false;
  }

  /** Moves a swimmer, gliding around coasts (tries turning up to ~70° either way) instead of crossing land. */
  private swim(o: { x: number; y: number }, dx: number, dy: number): void {
    const blocked = (x: number, y: number) => x < 16 || x > GAME_WIDTH - 16 || y < 50 || y > GAME_HEIGHT - 34 || this.onLand(x, y);
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const a = Math.atan2(dy, dx);
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
      // turning costs a little speed, like dragging along the shore
      const step = len * Math.cos(turn * 0.6);
      const nx = o.x + Math.cos(a + turn) * step;
      const ny = o.y + Math.sin(a + turn) * step;
      if (!blocked(nx, ny)) {
        o.x = nx;
        o.y = ny;
        return;
      }
    }
  }

  // ------------------------------------------------------------ stats from your traits

  private speed(): number {
    return SWIM_SPEED * GameState.stats.speedMul * (this.dashTime > 0 ? 2.8 : 1) * (this.charge >= 0 ? 0.6 : 1);
  }

  private waveRadius(power: number): number {
    return (26 + 34 * power) * (1 + 0.08 * GameState.rank('size'));
  }

  private waveDamage(power: number): number {
    // bite strength helps, but only partly, so huge damage builds can't one-shot coastlines
    return (20 + 50 * power) * (1 + 0.35 * (GameState.stats.biteMul - 1)) * (1 + 0.15 * GameState.stats.venomRank);
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
    this.waveCd = Math.max(0, this.waveCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.sinceHit += dt;
    // the deep heals you while nothing is hitting you
    if (this.sinceHit > 4) GameState.heal(GameState.stats.maxHp * 0.03 * dt);

    this.move(dt);
    this.updateCharge(dt);
    if (this.controls.pressed('dash') && this.dashCd <= 0) {
      this.dashTime = DASH_TIME;
      this.invuln = Math.max(this.invuln, DASH_TIME);
      this.dashCd = GameState.stats.dashRank > 0 ? dashCooldown(GameState.stats.dashRank, GameState.rank('nimble')) : 3;
      Sfx.play('dash');
    }
    this.updateWaves(dt);
    this.updateNavy(dt);
    this.updateWall(dt);

    if (!this.towers.length && this.t >= this.limit) this.lose("humanity's Great Sea Wall");
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
    const pos = { x: p.x, y: p.y };
    this.swim(pos, this.vx * dt, this.vy * dt);
    p.setPosition(pos.x, pos.y);
    if (Math.hypot(this.vx, this.vy) > 20) this.facing = Math.atan2(this.vy, this.vx);
    p.rotation = Phaser.Math.Angle.RotateTo(p.rotation, this.facing, dt * 8);
    p.setAlpha(this.invuln > 0 && Math.floor(this.t * 16) % 2 === 0 ? 0.4 : 1);
  }

  /** Hold SPACE to build a wave; release to send it where you face. */
  private updateCharge(dt: number): void {
    const held = this.controls.down('primary');
    if (held && this.charge < 0 && this.waveCd <= 0) this.charge = 0;
    if (this.charge < 0) return;
    if (held) {
      this.charge = Math.min(1, this.charge + (dt / CHARGE_TIME) * (1 + 0.2 * GameState.rank('shock')));
      return;
    }
    const power = Math.max(0.2, this.charge);
    this.charge = -1;
    this.waveCd = WAVE_COOLDOWN;
    const p = this.player;
    this.waves.push({ x: p.x, y: p.y, angle: this.facing, r: this.waveRadius(power), damage: this.waveDamage(power), traveled: 0 });
    Sfx.play('breath', 0.5 + power * 0.3);
  }

  private updateWaves(dt: number): void {
    for (const w of this.waves) {
      const step = WAVE_SPEED * dt;
      w.x += Math.cos(w.angle) * step;
      w.y += Math.sin(w.angle) * step;
      w.traveled += step;
      // waves sink any ship they roll over
      for (const s of this.ships) {
        if (Phaser.Math.Distance.Between(s.x, s.y, w.x, w.y) < w.r + 10) this.sink(s);
      }
      this.torpedoes = this.torpedoes.filter((t) => Phaser.Math.Distance.Between(t.x, t.y, w.x, w.y) > w.r);
      // the wall takes it head on
      const tower = this.towers.find((t) => t.hp > 0 && Phaser.Math.Distance.Between(t.x, t.y, w.x, w.y) < w.r + TOWER_RADIUS);
      if (tower) {
        this.hitTower(tower, w.damage);
        this.booms.push({ x: w.x, y: w.y, r: w.r * 1.6, life: 0.4 });
        w.traveled = WAVE_RANGE;
        continue;
      }
      // crash on the first coast it reaches
      if (w.traveled > 20 && this.onLand(w.x, w.y, w.r * 0.4)) {
        this.crash(w);
        w.traveled = WAVE_RANGE;
      }
    }
    this.waves = this.waves.filter((w) => w.traveled < WAVE_RANGE);
    this.ships = this.ships.filter((s) => s.fireCd > -99);
  }

  private crash(w: Wave): void {
    Sfx.play('slam', 0.9);
    this.booms.push({ x: w.x, y: w.y, r: w.r * 1.6, life: 0.4 });
    for (const c of this.cities) {
      if (c.flooded) continue;
      const nx = (w.x - c.x) / (c.rx + w.r);
      const ny = (w.y - c.y) / (c.ry + w.r);
      if (nx * nx + ny * ny > 1) continue;
      c.hp -= w.damage;
      if (c.hp <= 0) this.flood(c);
    }
  }

  private flood(c: City): void {
    c.flooded = true;
    c.hp = 0;
    this.drowned++;
    Sfx.play('capture');
    this.toast(`${c.name} has been reclaimed by the sea!`);
    if (this.cities.every((x) => x.flooded)) this.startShowdown();
  }

  // ------------------------------------------------------------ showdown

  /** Every city has drowned, so humanity's wall goes up in the open sea: tear it down. */
  private startShowdown(): void {
    const maxHp = TOWER_HP * GameState.threatLevel;
    this.towers = WALL_TOWERS.map((t, i) => ({ ...t, hp: maxHp, maxHp, fireCd: 2 + i * 0.5, ramCd: 0 }));
    this.shipCd = 6;
    showdownBanner(this, 'THE GREAT SEA WALL RISES', 'Tear down all five of its towers.', '#ff8a80');
  }

  private hitTower(t: Tower, damage: number): void {
    t.hp -= damage;
    Sfx.play('slam', 1);
    this.cameras.main.shake(120, 0.005);
    if (t.hp > 0) return;
    this.booms.push({ x: t.x, y: t.y, r: 60, life: 0.4 });
    Sfx.play('crit');
    const left = this.towers.filter((x) => x.hp > 0).length;
    if (left === 0) this.win();
    else this.toast(`A tower falls! ${left} to go.`);
  }

  /** Towers fire at you, the wall launches ships, and a dash smashes into a tower. */
  private updateWall(dt: number): void {
    if (!this.towers.length) return;
    const p = this.player;
    const anger = GameState.diff.humanStrength * GameState.threatLevel;
    for (const t of this.towers) {
      if (t.hp <= 0) continue;
      t.ramCd -= dt;
      const d = Phaser.Math.Distance.Between(t.x, t.y, p.x, p.y);
      if (this.dashTime > 0 && t.ramCd <= 0 && d < TOWER_RADIUS + 30) {
        t.ramCd = 1;
        this.hitTower(t, TOWER_RAM);
      }
      t.fireCd -= dt * anger;
      if (t.fireCd > 0 || d > 620) continue;
      t.fireCd = TOWER_FIRE * Phaser.Math.FloatBetween(0.85, 1.2);
      if (Math.random() < 0.6) this.torpedoes.push({ x: t.x, y: t.y, angle: Math.atan2(p.y - t.y, p.x - t.x), life: 4 });
      else this.charges.push({ x: p.x + this.vx * 0.9, y: p.y + this.vy * 0.9, fuse: CHARGE_FUSE });
    }
    this.shipCd -= dt * anger;
    const live = this.towers.filter((t) => t.hp > 0);
    if (this.shipCd <= 0 && live.length && this.ships.length < WALL_SHIPS) {
      this.shipCd = 8;
      const t = Phaser.Utils.Array.GetRandom(live);
      const a = Math.atan2(p.y - t.y, p.x - t.x);
      this.ships.push({ x: t.x + Math.cos(a) * 44, y: t.y + Math.sin(a) * 44, angle: a, fireCd: 2 });
    }
  }

  private sink(s: Ship): void {
    if (s.fireCd <= -99) return;
    s.fireCd = -100;
    Sfx.play('crit');
    this.booms.push({ x: s.x, y: s.y, r: 26, life: 0.4 });
  }

  /** Coastal cities launch warships that fire homing torpedoes and drop depth charges. */
  private updateNavy(dt: number): void {
    const p = this.player;
    if (this.t > GRACE) {
      const anger = (1 + this.t / 120) * GameState.diff.humanStrength * GameState.threatLevel;
      for (const c of this.cities) {
        if (c.flooded) continue;
        c.shipCd -= dt * anger;
        if (c.shipCd > 0 || this.ships.length >= MAX_SHIPS) continue;
        c.shipCd = (9 - 1.5 * c.level) * Phaser.Math.FloatBetween(0.8, 1.2);
        // launch from the coast facing the leviathan
        const a = Math.atan2(p.y - c.y, p.x - c.x);
        const sx = c.x + Math.cos(a) * (c.rx + 18);
        const sy = c.y + Math.sin(a) * (c.ry + 18);
        if (!this.onLand(sx, sy)) this.ships.push({ x: sx, y: sy, angle: a, fireCd: Phaser.Math.FloatBetween(1.5, 3) });
      }
    }

    for (const s of this.ships) {
      // keep a firing distance from the leviathan
      const d = Phaser.Math.Distance.Between(s.x, s.y, p.x, p.y);
      const toward = Math.atan2(p.y - s.y, p.x - s.x);
      const dir = d > 190 ? toward : toward + Math.PI / 2;
      s.angle = Phaser.Math.Angle.RotateTo(s.angle, dir, dt * 1.5);
      this.swim(s, Math.cos(s.angle) * SHIP_SPEED * dt, Math.sin(s.angle) * SHIP_SPEED * dt);
      if (this.dashTime > 0 && d < 34) {
        this.sink(s);
        continue;
      }
      s.fireCd -= dt;
      if (s.fireCd <= 0 && d < 420) {
        s.fireCd = Phaser.Math.FloatBetween(3, 4.5);
        if (Math.random() < 0.65) this.torpedoes.push({ x: s.x, y: s.y, angle: toward, life: 4 });
        else this.charges.push({ x: p.x + this.vx * 0.9, y: p.y + this.vy * 0.9, fuse: CHARGE_FUSE });
      }
    }
    this.ships = this.ships.filter((s) => s.fireCd > -99);

    for (const t of this.torpedoes) {
      const want = Math.atan2(p.y - t.y, p.x - t.x);
      t.angle = Phaser.Math.Angle.RotateTo(t.angle, want, dt * TORPEDO_TURN);
      t.x += Math.cos(t.angle) * TORPEDO_SPEED * dt;
      t.y += Math.sin(t.angle) * TORPEDO_SPEED * dt;
      t.life -= dt;
      if (this.onLand(t.x, t.y)) t.life = 0;
      if (Phaser.Math.Distance.Between(t.x, t.y, p.x, p.y) < 24 && this.hurt(TORPEDO_DAMAGE, 'a torpedo')) t.life = 0;
    }
    this.torpedoes = this.torpedoes.filter((t) => t.life > 0);

    for (const c of this.charges) {
      c.fuse -= dt;
      if (c.fuse > 0) continue;
      Sfx.play('slam', 1.3);
      this.booms.push({ x: c.x, y: c.y, r: CHARGE_RADIUS, life: 0.35 });
      if (Phaser.Math.Distance.Between(c.x, c.y, p.x, p.y) < CHARGE_RADIUS) this.hurt(DEPTH_CHARGE_DAMAGE, 'a depth charge');
    }
    this.charges = this.charges.filter((c) => c.fuse > 0);
    for (const b of this.booms) b.life -= dt;
    this.booms = this.booms.filter((b) => b.life > 0);
  }

  private hurt(share: number, source: string): boolean {
    if (this.invuln > 0 || this.over) return false;
    const dealt = GameState.stats.maxHp * share * (1 - GameState.stats.armor) * GameState.diff.damageTaken;
    GameState.hp -= dealt;
    GameState.logDamage(source, dealt);
    this.invuln = 0.8;
    this.sinceHit = 0;
    Sfx.play('hurt');
    this.cameras.main.shake(150, 0.006);
    if (GameState.hp <= 0) this.lose(source);
    return true;
  }

  // ------------------------------------------------------------ end

  private win(): void {
    this.over = true;
    this.torpedoes = [];
    this.charges = [];
    const last = this.towers[2];
    winMoment(this, last.x, last.y, 'THE SEAS HAVE SWALLOWED HUMANITY.', '#4dd0e1', () =>
      this.scene.start('Victory', { ending: 'abyssal', conquered: this.drowned, converted: 0, mapTime: this.t }),
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

    // the world turns a deeper blue with every city lost
    const drownedShare = this.drowned / Math.max(1, this.cities.length);
    g.fillStyle(0x021428, 0.5 * drownedShare);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    for (const c of this.cities) {
      if (c.flooded) {
        // the land is gone: open water, foam along the old coast, ruins breaking the surface
        g.fillStyle(0x0b3a5e, 0.95);
        g.fillPoints(c.points, true);
        g.lineStyle(2, 0xb3e5fc, 0.35 + 0.2 * Math.sin(this.t * 2 + c.x));
        g.strokePoints(c.points, true);
        for (const r of c.ripples) {
          g.lineStyle(2, 0x4fc3f7, 0.45);
          g.beginPath();
          g.arc(r.x + Math.sin(this.t + r.phase) * 5, r.y, 11, Math.PI * 1.15, Math.PI * 1.85);
          g.strokePath();
        }
        for (let i = 0; i < c.level; i++) {
          g.fillStyle(0x455a64, 1);
          g.fillRect(c.x - 10 + i * 9, c.y + 8 + i % 2, 5, 5 + i);
        }
        continue;
      }
      // city towers and a health bar
      for (let i = 0; i < c.level; i++) {
        g.fillStyle(0xeceff1, 0.9);
        g.fillRect(c.x - 10 + i * 8, c.y + 8 - i * 2, 5, 8 + i * 2);
      }
      g.fillStyle(0x000000, 0.5);
      g.fillRect(c.x - 22, c.y + 22, 44, 5);
      g.fillStyle(0x4dd0e1, 1);
      g.fillRect(c.x - 22, c.y + 22, 44 * (c.hp / c.maxHp), 5);
    }

    this.drawWall(g);

    // charging swell around you, and where the wave will go
    if (this.charge >= 0) {
      const r = this.waveRadius(Math.max(0.2, this.charge));
      g.lineStyle(3, 0x4dd0e1, 0.5 + 0.4 * this.charge);
      g.strokeCircle(p.x, p.y, r * 0.8);
      g.lineStyle(2, 0x4dd0e1, 0.35);
      g.lineBetween(p.x, p.y, p.x + Math.cos(this.facing) * WAVE_RANGE, p.y + Math.sin(this.facing) * WAVE_RANGE);
    }
    for (const w of this.waves) {
      g.lineStyle(6, 0x4dd0e1, 0.9);
      g.beginPath();
      g.arc(w.x, w.y, w.r, w.angle - 1.2, w.angle + 1.2);
      g.strokePath();
      g.lineStyle(2, 0xffffff, 0.9);
      g.beginPath();
      g.arc(w.x, w.y, w.r * 0.85, w.angle - 1, w.angle + 1);
      g.strokePath();
    }
    for (const s of this.ships) {
      const c = Math.cos(s.angle);
      const sn = Math.sin(s.angle);
      g.fillStyle(0x90a4ae, 1);
      g.fillTriangle(s.x + c * 16, s.y + sn * 16, s.x - c * 12 - sn * 7, s.y - sn * 12 + c * 7, s.x - c * 12 + sn * 7, s.y - sn * 12 - c * 7);
      g.fillStyle(0x455a64, 1);
      g.fillCircle(s.x, s.y, 4);
    }
    for (const t of this.torpedoes) {
      g.fillStyle(0xff5252, 1);
      g.fillCircle(t.x, t.y, 5);
      g.lineStyle(2, 0xffffff, 0.5);
      g.lineBetween(t.x, t.y, t.x - Math.cos(t.angle) * 18, t.y - Math.sin(t.angle) * 18);
    }
    for (const c of this.charges) {
      const k = 1 - c.fuse / CHARGE_FUSE;
      g.lineStyle(3, 0xff5252, 0.9);
      g.strokeCircle(c.x, c.y, CHARGE_RADIUS);
      g.fillStyle(0xff5252, 0.25 * k);
      g.fillCircle(c.x, c.y, CHARGE_RADIUS * k);
    }
    for (const b of this.booms) {
      g.fillStyle(0xe0f7fa, b.life / 0.4);
      g.fillCircle(b.x, b.y, b.r * (1.2 - b.life));
    }

    const wave = this.charge >= 0 ? `charging ${Math.round(this.charge * 100)}%` : this.waveCd > 0 ? '...' : 'READY';
    const wall = this.towers.length > 0;
    const total = this.towers.reduce((n, t) => n + t.maxHp, 0);
    const hp = this.towers.reduce((n, t) => n + Math.max(0, t.hp), 0);
    this.hud.update(
      `Cities drowned ${this.drowned}/${this.cities.length}   ·   Wave: ${wave}`,
      wall ? null : { label: 'Sea wall finished in', left: this.limit - this.t },
      GameState.hp / GameState.stats.maxHp,
      wall ? { name: `THE GREAT SEA WALL (${this.towers.filter((t) => t.hp > 0).length} towers left)`, share: hp / total } : null,
    );
  }

  private drawWall(g: Phaser.GameObjects.Graphics): void {
    const live = this.towers.filter((t) => t.hp > 0);
    // concrete joining the towers still standing
    for (let i = 1; i < live.length; i++) {
      g.lineStyle(12, 0x546e7a, 1);
      g.lineBetween(live[i - 1].x, live[i - 1].y, live[i].x, live[i].y);
      g.lineStyle(2, 0x90a4ae, 1);
      g.lineBetween(live[i - 1].x - 6, live[i - 1].y, live[i].x - 6, live[i].y);
    }
    for (const t of live) {
      g.fillStyle(0x455a64, 1);
      g.fillRoundedRect(t.x - TOWER_RADIUS, t.y - TOWER_RADIUS, TOWER_RADIUS * 2, TOWER_RADIUS * 2, 6);
      g.lineStyle(3, 0xcfd8dc, 1);
      g.strokeRoundedRect(t.x - TOWER_RADIUS, t.y - TOWER_RADIUS, TOWER_RADIUS * 2, TOWER_RADIUS * 2, 6);
      g.fillStyle(0xff5252, 0.6 + 0.4 * Math.sin(this.t * 6 + t.y));
      g.fillCircle(t.x, t.y, 7);
      g.fillStyle(0x000000, 0.6);
      g.fillRect(t.x - 24, t.y + 18, 48, 5);
      g.fillStyle(0x4dd0e1, 1);
      g.fillRect(t.x - 24, t.y + 18, 48 * (t.hp / t.maxHp), 5);
    }
  }
}
