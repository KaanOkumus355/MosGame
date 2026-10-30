import Phaser from 'phaser';
import { TOTAL_STAGES } from '../data/stages';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { REGIONS, TERRAIN_COLOR, type RegionDef } from '../data/world';
import { WORLD_MUSIC } from '../data/atmosphere';
import { BODY_RADIUS } from '../art/textures';
import { RunSave } from '../state/RunSave';
import { Controls, PAD, keyLabel, moveLabel } from '../systems/Controls';
import { GameState } from '../state/GameState';
import { Codex } from '../state/Codex';
import { showBanners } from '../systems/Banners';
import { FinaleHud, finaleTime, showBriefing, showdownBanner, winMoment } from '../systems/Finale';
import { Sfx } from '../audio/Sfx';

/** Seconds until humanity's Global Fumigation (you lose). */
const FUMIGATION_TIME = 240;
const EGG_COST = 9;
const EGG_HATCH = 2.5;
const LAY_EVERY = 0.22;
const MAX_DRONES = 200;
const DRONE_SPEED = 120;
const RALLY_SPEED = 420;
/** Drones within this distance of a city's edge sting it. */
const STING_RANGE = 26;
const SQUAD_SPEED = 42;
const SPRAY_RANGE = 55;
const SPRAY_EVERY = 0.7;
const CLOUD_FUSE = 1.8;
/** Share of drones caught in a spray cloud that die. */
const CLOUD_KILL = 0.5;
const CLOUD_RADIUS = 70;
const GRACE = 10;
/** The hive stings squads at its gate on its own. */
const HIVE_GUARD_RANGE = 70;
const HIVE_GUARD_DPS = 4;
const SQUAD_HIVE_DPS = 3;
/** The Fumigator: a machine crawling on the hive that gasses everything around it. */
const FUMIGATOR_HP = 6000;
const FUMIGATOR_SPEED = 14;
const FUMIGATOR_RADIUS = 46;
const FUMIGATOR_HIVE_DPS = 12;
const GAS_RADIUS = 175;
const GAS_FUSE = 2;
const GAS_EVERY = 9;
/** Size of a honeycomb cell, and how long it takes to spread over a captured city. */
const CELL = 11;
const SPREAD_TIME = 2.5;

interface City extends RegionDef {
  hp: number;
  maxHp: number;
  taken: boolean;
  points: Phaser.Types.Math.Vector2Like[];
  squadCd: number;
  /** Honeycomb cells, and how far they have spread (0..1). */
  cells: { x: number; y: number; d: number }[];
  spread: number;
}

/** The Fumigator: the showdown once every city is taken. */
interface Fumigator {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  gasCd: number;
  /** Seconds until the gas ring goes off (0 when none is building). */
  gas: number;
  squadCd: number;
}

interface Drone {
  x: number;
  y: number;
  hp: number;
  /** Where in the swarm it flies (offset around the rally point). */
  ox: number;
  oy: number;
}

interface Squad {
  x: number;
  y: number;
  hp: number;
  sprayCd: number;
}

/** Controls line, shown at the bottom and on the pause menu. */
const controlsHelp = (): string =>
  `${keyLabel('primary')} (hold): lay eggs  ·  Mouse (hold) or ${moveLabel()}: move the swarm  ·  ESC: pause`;

/**
 * The hive line's finale (hive ending). You are the Queen: lay eggs at your hive, steer the
 * swarm with a rally point and sting every human city into submission. Exterminators march on
 * your hive and bug spray clouds fall on your swarm. Take every city before the Fumigation.
 */
export class HiveScene extends Phaser.Scene {
  private cities: City[] = [];
  private drones: Drone[] = [];
  private eggs: { x: number; y: number; t: number }[] = [];
  private squads: Squad[] = [];
  private clouds: { x: number; y: number; fuse: number }[] = [];
  private puffs: { x: number; y: number; life: number }[] = [];
  private hive = { x: 0, y: 0, hp: 100, maxHp: 100 };
  private rally = { x: 0, y: 0 };
  private fumigator: Fumigator | null = null;
  private homeCells: { x: number; y: number; d: number }[] = [];
  private limit = 0;
  private started = false;
  private jelly = 30;
  private layCd = 0;
  private cloudCd = 0;
  private t = 0;
  private taken = 0;
  private over = false;
  private toastTime = 0;
  private g!: Phaser.GameObjects.Graphics;
  private hud!: FinaleHud;
  private toastText!: Phaser.GameObjects.Text;
  private queen!: Phaser.GameObjects.Image;
  private controls!: Controls;

  constructor() {
    super('Hive');
  }

  create(): void {
    this.cities = [];
    this.drones = [];
    this.eggs = [];
    this.squads = [];
    this.clouds = [];
    this.puffs = [];
    this.fumigator = null;
    this.homeCells = [];
    this.started = false;
    this.limit = finaleTime(FUMIGATION_TIME);
    this.jelly = 40;
    this.layCd = 0;
    this.cloudCd = GRACE + 4;
    this.t = 0;
    this.taken = 0;
    this.over = false;
    GameState.stageIndex = TOTAL_STAGES - 1;
    GameState.hp = GameState.stats.maxHp;
    Codex.becomeForm('queen');
    RunSave.checkpoint();

    this.cameras.main.setBackgroundColor(0x0b2a4a);
    this.cameras.main.fadeIn(600);
    Sfx.startAmbient(WORLD_MUSIC);
    this.drawWorld();

    // the hive sits in your home region
    const home = REGIONS.find((r) => r.owner === 'you') ?? REGIONS[0];
    const armor = GameState.rank('armor');
    this.hive = { x: home.x, y: home.y, hp: 300 * (1 + 0.25 * armor), maxHp: 300 * (1 + 0.25 * armor) };
    this.rally = { x: home.x, y: home.y - 60 };
    this.g = this.add.graphics().setDepth(10);
    this.queen = this.add.image(home.x, home.y, 'hivequeen').setScale(22 / BODY_RADIUS).setDepth(20);
    // the swarm starts with a few drones
    for (let i = 0; i < 14; i++) this.hatch(home.x, home.y);

    const style = { fontFamily: FONT, stroke: '#000', strokeThickness: 4 };
    this.hud = new FinaleHud(this, 'HIVE QUEEN', '#ffd54f');
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 16, controlsHelp(), { ...style, fontSize: '14px', color: '#b0bec5' })
      .setOrigin(0.5)
      .setDepth(30);
    this.toastText = this.add.text(GAME_WIDTH / 2, 96, '', { ...style, fontSize: '20px', color: '#ffd54f', fontStyle: 'bold', align: 'center', backgroundColor: 'rgba(5, 2, 12, 0.7)', padding: { x: 10, y: 4 } }).setOrigin(0.5).setDepth(30);
    showBriefing(
      this,
      {
        title: 'THE HIVE AWAKENS',
        texture: 'hivequeen',
        color: '#ffd54f',
        story: 'One queen. One hive. A world full of warm, soft, undefended cities, and a Global Fumigation on its way.',
        rules: [
          'Hold the egg key to spend jelly on eggs. Each one hatches into a drone at your hive.',
          'Your drones follow the rally marker, and sting any city or exterminator near it. Keep them moving.',
          'Exterminators march on your hive, and bug spray falls where your swarm gathers. If the hive dies, you lose.',
          `Take every city before the Fumigation in ${Math.floor(this.limit / 60)}:${(this.limit % 60).toString().padStart(2, '0')}. Then destroy what they send last.`,
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

  /** Honeycomb cells filling a region, nearest the middle first. */
  private honeycomb(def: RegionDef): { x: number; y: number; d: number }[] {
    const cells: { x: number; y: number; d: number }[] = [];
    const w = CELL * 1.75;
    const h = CELL * 1.5;
    for (let row = -8; row <= 8; row++) {
      for (let col = -12; col <= 12; col++) {
        const x = col * w + (row & 1 ? w / 2 : 0);
        const y = row * h;
        const d = Math.hypot(x / def.rx, y / def.ry);
        if (d < 0.86) cells.push({ x: def.x + x, y: def.y + y, d });
      }
    }
    return cells;
  }

  private hex(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    const pts = [0, 1, 2, 3, 4, 5].map((i) => ({ x: x + Math.sin((i * Math.PI) / 3) * r, y: y + Math.cos((i * Math.PI) / 3) * r }));
    g.fillPoints(pts, true);
  }

  private drawWorld(): void {
    const g = this.add.graphics().setDepth(0);
    // the sea is the same as everywhere else; what changes here is the land
    const waves = new Phaser.Math.RandomDataGenerator(['hive']);
    g.lineStyle(2, 0x1c4f7a, 0.5);
    for (let i = 0; i < 70; i++) {
      g.beginPath();
      g.arc(waves.between(0, GAME_WIDTH), waves.between(50, GAME_HEIGHT - 30), 14, Math.PI * 1.15, Math.PI * 1.85);
      g.strokePath();
    }
    for (const def of REGIONS) {
      const points = this.blob(def);
      g.fillStyle(TERRAIN_COLOR[def.terrain], 1);
      g.fillPoints(points, true);
      g.lineStyle(2, 0x000000, 0.35);
      g.strokePoints(points, true);
      this.add
        .text(def.x, def.y - 8, def.name, { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(12);
      if (def.owner === 'you') this.homeCells = this.honeycomb(def);
      if (def.owner !== 'humans') continue;
      const maxHp = (180 + 110 * def.level) * GameState.threatLevel;
      // the first squads leave at different times, sooner from the bigger cities
      this.cities.push({ ...def, points, hp: maxHp, maxHp, taken: false, cells: this.honeycomb(def), spread: 0, squadCd: GRACE + Phaser.Math.FloatBetween(4, 24) - def.level * 2 });
    }
  }

  // ------------------------------------------------------------ stats from your traits

  private droneSpeed(): number {
    return DRONE_SPEED * (1 + 0.12 * GameState.rank('speed') + 0.08 * GameState.rank('wings'));
  }

  /** Sting damage per drone per second. Claws and venom make the swarm deadlier. */
  private droneDps(): number {
    return 1.6 * (1 + 0.2 * GameState.rank('claws') + 0.15 * GameState.stats.venomRank + 0.1 * GameState.rank('jaw'));
  }

  private droneHp(): number {
    return 1 + Math.floor(GameState.rank('size') / 2) + (GameState.rank('armor') >= 3 ? 1 : 0);
  }

  private eggCost(): number {
    return EGG_COST * (1 - 0.08 * GameState.rank('intelligence') - 0.05 * GameState.rank('glutton'));
  }

  private jellyRate(): number {
    return (3.5 + 1.5 * this.taken) * (1 + 0.15 * GameState.rank('pheromones'));
  }

  private hatch(x: number, y: number): void {
    if (this.drones.length >= MAX_DRONES) return;
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * 34;
    this.drones.push({ x: x + Phaser.Math.FloatBetween(-6, 6), y: y + Phaser.Math.FloatBetween(-6, 6), hp: this.droneHp(), ox: Math.cos(a) * d, oy: Math.sin(a) * d });
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
    this.jelly += this.jellyRate() * dt;

    this.moveRally(dt);
    this.lay(dt);
    this.updateEggs(dt);
    this.updateDrones(dt);
    this.updateHumans(dt);
    if (this.fumigator) this.updateFumigator(this.fumigator, dt);
    for (const c of this.cities) if (c.taken) c.spread = Math.min(1, c.spread + dt / SPREAD_TIME);

    if (this.hive.hp <= 0) this.lose(this.fumigator ? 'the Fumigator' : 'exterminators at the hive');
    else if (!this.fumigator && this.t >= this.limit) this.lose("humanity's Global Fumigation");
    this.draw();
  }

  private moveRally(dt: number): void {
    const ptr = this.input.activePointer;
    if (ptr.leftButtonDown()) {
      this.rally.x = ptr.x;
      this.rally.y = ptr.y;
    } else {
      const m = this.controls.move();
      this.rally.x += m.x * RALLY_SPEED * dt;
      this.rally.y += m.y * RALLY_SPEED * dt;
    }
    this.rally.x = Phaser.Math.Clamp(this.rally.x, 10, GAME_WIDTH - 10);
    this.rally.y = Phaser.Math.Clamp(this.rally.y, 46, GAME_HEIGHT - 30);
  }

  private lay(dt: number): void {
    this.layCd -= dt;
    if (!this.controls.down('primary') || this.layCd > 0) return;
    const cost = this.eggCost();
    if (this.jelly < cost || this.drones.length + this.eggs.length >= MAX_DRONES) return;
    this.layCd = LAY_EVERY;
    this.jelly -= cost;
    const a = Math.random() * Math.PI * 2;
    this.eggs.push({ x: this.hive.x + Math.cos(a) * 14, y: this.hive.y + Math.sin(a) * 10, t: EGG_HATCH });
    Sfx.play('pick', 1.6);
  }

  private updateEggs(dt: number): void {
    for (const e of this.eggs) {
      e.t -= dt;
      if (e.t <= 0) this.hatch(e.x, e.y);
    }
    this.eggs = this.eggs.filter((e) => e.t > 0);
  }

  /** Drones swarm toward the rally point, sting cities in reach and gang up on exterminators. */
  private updateDrones(dt: number): void {
    const speed = this.droneSpeed();
    const dps = this.droneDps();
    for (const d of this.drones) {
      // a squad near the drone gets mobbed first
      let tx = this.rally.x + d.ox;
      let ty = this.rally.y + d.oy;
      let target: Squad | null = null;
      for (const s of this.squads) {
        if (Phaser.Math.Distance.Between(d.x, d.y, s.x, s.y) < 70) {
          target = s;
          tx = s.x + d.ox * 0.3;
          ty = s.y + d.oy * 0.3;
          break;
        }
      }
      const a = Math.atan2(ty - d.y, tx - d.x);
      const dist = Math.hypot(tx - d.x, ty - d.y);
      const step = Math.min(dist, speed * dt);
      d.x += Math.cos(a) * step + Phaser.Math.FloatBetween(-12, 12) * dt;
      d.y += Math.sin(a) * step + Phaser.Math.FloatBetween(-12, 12) * dt;
      if (target && Phaser.Math.Distance.Between(d.x, d.y, target.x, target.y) < 14) target.hp -= dps * 1.5 * dt;
      const m = this.fumigator;
      if (m && Phaser.Math.Distance.Between(d.x, d.y, m.x, m.y) < FUMIGATOR_RADIUS + STING_RANGE) m.hp -= dps * dt;
      // sting any city it is over
      for (const c of this.cities) {
        if (c.taken) continue;
        const nx = (d.x - c.x) / (c.rx + STING_RANGE);
        const ny = (d.y - c.y) / (c.ry + STING_RANGE);
        if (nx * nx + ny * ny < 1) {
          c.hp -= dps * dt;
          break;
        }
      }
    }
    for (const c of this.cities) if (!c.taken && c.hp <= 0) this.capture(c);
    this.drones = this.drones.filter((d) => d.hp > 0);
    for (const s of this.squads) if (s.hp <= 0) this.puffs.push({ x: s.x, y: s.y, life: 0.4 });
    this.squads = this.squads.filter((s) => s.hp > 0);
  }

  private capture(c: City): void {
    c.taken = true;
    c.hp = 0;
    this.taken++;
    Sfx.play('capture');
    this.toast(`${c.name} belongs to the swarm!`);
    // a new hive outpost: a few drones hatch there
    for (let i = 0; i < 3; i++) this.hatch(c.x, c.y);
    if (this.cities.every((x) => x.taken)) this.startShowdown();
  }

  // ------------------------------------------------------------ showdown

  /** Every city is yours, so humanity rolls out its last machine from the one furthest from the hive. */
  private startShowdown(): void {
    const h = this.hive;
    const dist = (c: City) => Phaser.Math.Distance.Between(c.x, c.y, h.x, h.y);
    const from = this.cities.reduce((a, b) => (dist(b) > dist(a) ? b : a));
    const maxHp = FUMIGATOR_HP * GameState.threatLevel;
    this.fumigator = { x: from.x, y: from.y, hp: maxHp, maxHp, gasCd: 5, gas: 0, squadCd: 4 };
    showdownBanner(this, 'THE FUMIGATOR ROLLS OUT', 'Swarm it before it reaches your hive. Run from the gas.', '#ff8a80');
  }

  private updateFumigator(m: Fumigator, dt: number): void {
    const h = this.hive;
    const anger = GameState.diff.humanStrength * GameState.threatLevel;
    const d = Phaser.Math.Distance.Between(m.x, m.y, h.x, h.y);
    if (d > FUMIGATOR_RADIUS + 20) {
      const a = Math.atan2(h.y - m.y, h.x - m.x);
      m.x += Math.cos(a) * FUMIGATOR_SPEED * dt;
      m.y += Math.sin(a) * FUMIGATOR_SPEED * dt;
    } else {
      h.hp -= FUMIGATOR_HIVE_DPS * dt;
      GameState.logDamage('The Fumigator', FUMIGATOR_HIVE_DPS * dt);
    }
    if (m.gas > 0) {
      m.gas -= dt;
      if (m.gas <= 0) {
        Sfx.play('breath', 0.6);
        this.puffs.push({ x: m.x, y: m.y, life: 0.6 });
        const kill = CLOUD_KILL * (1 - 0.15 * GameState.rank('armor'));
        for (const dr of this.drones) {
          if (dr.hp > 0 && Phaser.Math.Distance.Between(dr.x, dr.y, m.x, m.y) < GAS_RADIUS && Math.random() < kill) {
            dr.hp = 0;
            GameState.logLoss('The Fumigator');
          }
        }
      }
    } else {
      m.gasCd -= dt * anger;
      if (m.gasCd <= 0) {
        m.gasCd = GAS_EVERY;
        m.gas = GAS_FUSE;
        Sfx.play('warn');
      }
    }
    // it keeps a few exterminators around it
    m.squadCd -= dt * anger;
    if (m.squadCd <= 0) {
      m.squadCd = 7;
      this.squads.push({ x: m.x, y: m.y, hp: 6 * GameState.threatLevel, sprayCd: 1 });
    }
    if (m.hp <= 0) this.win();
  }

  /** Cities send exterminator squads at your hive; bug spray clouds fall on the swarm. */
  private updateHumans(dt: number): void {
    if (this.t < GRACE) return;
    const anger = (1 + this.t / 180) * GameState.diff.humanStrength * GameState.threatLevel;
    for (const c of this.cities) {
      if (c.taken) continue;
      c.squadCd -= dt * anger;
      if (c.squadCd > 0) continue;
      c.squadCd = (26 - 3 * c.level) * Phaser.Math.FloatBetween(0.85, 1.2);
      this.squads.push({ x: c.x, y: c.y, hp: 6 * GameState.threatLevel, sprayCd: 1 });
    }

    const h = this.hive;
    for (const s of this.squads) {
      const a = Math.atan2(h.y - s.y, h.x - s.x);
      const d = Phaser.Math.Distance.Between(s.x, s.y, h.x, h.y);
      if (d > 28) {
        s.x += Math.cos(a) * SQUAD_SPEED * dt;
        s.y += Math.sin(a) * SQUAD_SPEED * dt;
      } else {
        h.hp -= SQUAD_HIVE_DPS * dt;
        GameState.logDamage('Exterminator squads', SQUAD_HIVE_DPS * dt);
      }
      // the hive's own guards sting anything at the gate
      if (d < HIVE_GUARD_RANGE) s.hp -= HIVE_GUARD_DPS * (1 + 0.3 * GameState.rank('thorns')) * dt;
      // they spray the nearest drone
      s.sprayCd -= dt;
      if (s.sprayCd <= 0) {
        s.sprayCd = SPRAY_EVERY;
        let best: Drone | null = null;
        let bd = SPRAY_RANGE;
        for (const dr of this.drones) {
          const dd = Phaser.Math.Distance.Between(dr.x, dr.y, s.x, s.y);
          if (dd < bd) {
            bd = dd;
            best = dr;
          }
        }
        if (best) {
          best.hp--;
          if (best.hp <= 0) GameState.logLoss('Exterminator spray');
          this.puffs.push({ x: best.x, y: best.y, life: 0.25 });
        }
      }
    }

    // bug spray from the sky, aimed at the thick of your swarm
    this.cloudCd -= dt * anger;
    if (this.cloudCd <= 0 && this.drones.length) {
      this.cloudCd = Phaser.Math.FloatBetween(7, 10);
      this.clouds.push({ x: this.rally.x + Phaser.Math.FloatBetween(-20, 20), y: this.rally.y + Phaser.Math.FloatBetween(-20, 20), fuse: CLOUD_FUSE });
      Sfx.play('warn');
    }
    // about half the drones caught in the spray die; armored ones shrug it off more often
    const kill = CLOUD_KILL * (1 - 0.15 * GameState.rank('armor'));
    for (const cl of this.clouds) {
      cl.fuse -= dt;
      if (cl.fuse > 0) continue;
      Sfx.play('breath', 0.8);
      for (const dr of this.drones) if (Phaser.Math.Distance.Between(dr.x, dr.y, cl.x, cl.y) < CLOUD_RADIUS && dr.hp > 0 && Math.random() < kill) {
          dr.hp = 0;
          GameState.logLoss('Bug spray clouds');
        }
      this.puffs.push({ x: cl.x, y: cl.y, life: 0.6 });
    }
    this.clouds = this.clouds.filter((cl) => cl.fuse > 0);
    for (const p of this.puffs) p.life -= dt;
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  // ------------------------------------------------------------ end

  private win(): void {
    this.over = true;
    const m = this.fumigator!;
    this.clouds = [];
    this.squads = [];
    winMoment(this, m.x, m.y, 'EVERY CITY HUMS WITH YOUR SWARM.', '#ffd54f', () =>
      this.scene.start('Victory', { ending: 'hive', conquered: this.taken, converted: 0, mapTime: this.t }),
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
    g.clear();
    this.drawComb(g, this.homeCells, 1);
    for (const c of this.cities) {
      if (c.taken) {
        g.fillStyle(0x4e3b12, 0.55 * c.spread);
        g.fillPoints(c.points, true);
        this.drawComb(g, c.cells, c.spread);
        continue;
      }
      for (let i = 0; i < c.level; i++) {
        g.fillStyle(0xeceff1, 0.9);
        g.fillRect(c.x - 10 + i * 8, c.y + 8 - i * 2, 5, 8 + i * 2);
      }
      g.fillStyle(0x000000, 0.5);
      g.fillRect(c.x - 22, c.y + 22, 44, 5);
      g.fillStyle(0xffd54f, 1);
      g.fillRect(c.x - 22, c.y + 22, 44 * Math.max(0, c.hp / c.maxHp), 5);
    }

    // the hive, with the queen bobbing on top of it
    const h = this.hive;
    this.queen.setPosition(h.x, h.y - 4 + Math.sin(this.t * 3) * 2);
    g.fillStyle(0x8d6e2a, 1);
    g.fillCircle(h.x, h.y, 20);
    g.lineStyle(3, 0xffb300, 1);
    g.strokeCircle(h.x, h.y, 20);
    g.fillStyle(0x000000, 0.5);
    g.fillRect(h.x - 26, h.y + 26, 52, 6);
    g.fillStyle(0xff5566, 1);
    g.fillRect(h.x - 26, h.y + 26, 52 * Math.max(0, h.hp / h.maxHp), 6);

    this.drawFumigator(g);
    for (const e of this.eggs) {
      g.fillStyle(0xfffde7, 0.9);
      g.fillEllipse(e.x, e.y, 6, 8);
    }
    for (const cl of this.clouds) {
      const k = 1 - cl.fuse / CLOUD_FUSE;
      g.lineStyle(3, 0xb2ff59, 0.9);
      g.strokeCircle(cl.x, cl.y, CLOUD_RADIUS);
      g.fillStyle(0xb2ff59, 0.22 * k);
      g.fillCircle(cl.x, cl.y, CLOUD_RADIUS * k);
    }
    for (const s of this.squads) {
      g.fillStyle(0xfafafa, 1);
      g.fillCircle(s.x, s.y, 6);
      g.fillStyle(0x90caf9, 1);
      g.fillCircle(s.x, s.y - 4, 3);
    }
    for (const d of this.drones) {
      g.fillStyle(0xffca28, 1);
      g.fillCircle(d.x, d.y, 2.6);
      g.fillStyle(0x212121, 1);
      g.fillCircle(d.x - 1, d.y, 1.2);
    }
    for (const p of this.puffs) {
      g.fillStyle(0xccff90, p.life * 1.2);
      g.fillCircle(p.x, p.y, 10 + (0.6 - p.life) * 40);
    }
    // rally marker
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    g.lineStyle(2, 0xffd54f, 0.5 + 0.4 * pulse);
    g.strokeCircle(this.rally.x, this.rally.y, 14);
    g.lineBetween(this.rally.x - 6, this.rally.y, this.rally.x + 6, this.rally.y);
    g.lineBetween(this.rally.x, this.rally.y - 6, this.rally.x, this.rally.y + 6);

    const m = this.fumigator;
    this.hud.update(
      `Jelly ${Math.floor(this.jelly)} (egg ${this.eggCost().toFixed(0)})   ·   Drones ${this.drones.length}   ·   Cities ${this.taken}/${this.cities.length}`,
      m ? null : { label: 'Fumigation in', left: this.limit - this.t },
      h.hp / h.maxHp,
      m ? { name: 'THE FUMIGATOR', share: m.hp / m.maxHp } : null,
    );
  }

  /** Honeycomb creeping outward from the middle of a captured region. */
  private drawComb(g: Phaser.GameObjects.Graphics, cells: { x: number; y: number; d: number }[], spread: number): void {
    for (const cell of cells) {
      if (cell.d > spread) continue;
      g.fillStyle(0xffb300, 0.75);
      this.hex(g, cell.x, cell.y, CELL * 0.86);
      g.fillStyle(0xffe082, 0.2 + 0.15 * Math.sin(this.t * 2 + cell.x * 0.05));
      this.hex(g, cell.x, cell.y, CELL * 0.5);
    }
  }

  private drawFumigator(g: Phaser.GameObjects.Graphics): void {
    const m = this.fumigator;
    if (!m || m.hp <= 0) return;
    if (m.gas > 0) {
      const k = 1 - m.gas / GAS_FUSE;
      g.lineStyle(4, 0xb2ff59, 0.9);
      g.strokeCircle(m.x, m.y, GAS_RADIUS);
      g.fillStyle(0xb2ff59, 0.25 * k);
      g.fillCircle(m.x, m.y, GAS_RADIUS * k);
    }
    // a tanker on tracks, with a spray nozzle turning on top
    g.fillStyle(0x263238, 1);
    g.fillRoundedRect(m.x - 50, m.y - 34, 100, 14, 5);
    g.fillRoundedRect(m.x - 50, m.y + 20, 100, 14, 5);
    g.fillStyle(0xeceff1, 1);
    g.fillRoundedRect(m.x - 44, m.y - 24, 88, 48, 10);
    g.fillStyle(0xb2ff59, 1);
    g.fillRect(m.x - 44, m.y - 6, 88, 12);
    g.fillStyle(0xff5252, 0.7 + 0.3 * Math.sin(this.t * 9));
    g.fillCircle(m.x, m.y, 10);
    const a = this.t * 1.5;
    g.lineStyle(6, 0x455a64, 1);
    g.lineBetween(m.x, m.y, m.x + Math.cos(a) * 42, m.y + Math.sin(a) * 42);
  }
}
