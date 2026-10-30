import Phaser from 'phaser';
import { CREATURES, type CreatureDef } from '../data/creatures';
import { creatureDef } from '../data/scaling';
import { STAGES } from '../data/stages';
import {
  BOSS_DAMAGE_BASE,
  BOSS_DAMAGE_PER_STAGE,
  BOSS_SIZE,
  LAIR_PREY,
  LAIR_PREY_MIN,
  LAIR_SIZE,
  BOSS_FEAST_TIME,
  BOSS_GATE_TIME,
  ZONE_EVENT_MARKS,
  ZONE_EVENT_MARKS_EXTRA,
  ZONE_EVENT_TIME,
  ZONE_PEAKS,
  type ZonePeak,
} from '../data/zones';
import { Tutorial } from './Tutorial';
import { GameState } from '../state/GameState';
import { Achievements } from '../state/Achievements';
import type { Creature } from '../entities/Creature';
import type { StageScene } from '../scenes/StageScene';
import { Sfx } from '../audio/Sfx';
import { BossMoves, NIGHT_HOLE, NIGHT_TEX, NIGHT_TEX_SIZE, ensureDarkTexture } from './BossMoves';

/** The zones added with the 7-stage update, whose bosses count for Big Game. */
const NEW_BOSS_ZONES = ['ashlands', 'outskirts', 'spires', 'trench'];
/** DNA multiplier for the rest of the stage once its boss is beaten, and golden snacks left in the lair. */
const BOSS_DNA_BONUS = 1.25;
const BOSS_GOLDEN_PREY = 6;
/** Growth at which Nightmare's second zone event starts. */
const STRIKE_WARN = 1.2;
const STRIKE_EVERY = 1.6;
const STRIKE_DAMAGE = 22;
/** Night: radius of light around you, in body radii (Keen Eyes widens it). */
const NIGHT_LIGHT = 3.5;
/** Eruption: cracks open around you, each with a short warning, and burn whatever stands on them. */
const CRACK_EVERY = 4;
const CRACK_WARN = 1;
const CRACK_DAMAGE = 14;
const CRACK_MAX = 9;
/** Thermals: how much faster you fly inside one, and how hard it throws you sideways. */
const THERMAL_SPEED = 1.35;
const THERMAL_FLING = 650;
/** Pesticide: damage per tick inside the fog. */
const FOG_DAMAGE = 7;

/** A stage's peak: one zone event in the middle of the stage, and a boss guarding its lair. */
export class ZoneEvents {
  private readonly peak: ZonePeak | undefined;
  /** Events run so far this stage. */
  private eventsRun = GameState.zoneEventDone ? 1 : 0;
  private eventTime = 0;
  private gateNoted = false;
  /** Fully grown and the boss just fell: seconds left to enjoy the feast. */
  private feastTime = 0;
  private gateArrow: Phaser.GameObjects.Text | null = null;
  boss: Creature | null = null;
  private moves: BossMoves | null = null;
  /** The boss's territory, set up on the first frame. */
  lair: { x: number; y: number; r: number } | null = null;
  private lairLabel: Phaser.GameObjects.Text | null = null;
  private lairRestock = 0;
  private warned = false;
  /** You are currently inside (re-entering roars again, but the warning shows once). */
  private inside = false;

  // event state
  private strikes: { x: number; y: number; r: number; t: number }[] = [];
  private flashes: { x: number; y: number; r: number; life: number }[] = [];
  private strikeTimer = 0;
  private water: { x: number; y: number } | null = null;
  private migrants: Creature[] = [];
  private migrationTarget = { x: 0, y: 0 };
  private night: Phaser.GameObjects.Image | null = null;
  private nightFrame: Phaser.GameObjects.Graphics | null = null;
  private cracks: { x1: number; y1: number; x2: number; y2: number; w: number; warn: number }[] = [];
  private crackTimer = 0;
  private columns: { x: number; y: number; r: number; vx: number; vy: number; spin: number }[] = [];
  private fog: { x: number; dir: number; w: number } | null = null;
  /** Shared cooldown for ground and fog damage, so standing in it hurts in ticks. */
  private hazardCd = 0;

  constructor(private readonly s: StageScene) {
    this.peak = ZONE_PEAKS[s.stage.id];
  }

  /** This stage's boss is beaten (now or before a save): its lair and its kind are yours. */
  get conquered(): boolean {
    return !!this.peak && GameState.bossKills.some((k) => k.stage === GameState.stageIndex);
  }

  /** Beating the boss cows the species it is a giant of: they stop hunting you. */
  tames(key: string): boolean {
    return this.conquered && this.peak!.boss.base === key;
  }

  /** Beating the boss makes the whole zone richer. */
  get dnaBonus(): number {
    return this.conquered ? BOSS_DNA_BONUS : 1;
  }

  get eventActive(): boolean {
    return this.eventTime > 0;
  }

  /** Night: creatures this far out are lost in the dark (no rings, bars or telegraphs drawn). */
  inDarkness(x: number, y: number): boolean {
    const p = this.s.player;
    const d = Phaser.Math.Distance.Between(x, y, p.x, p.y);
    const blind = this.moves?.blindRadius ?? 0;
    if (blind > 0 && d > blind) return true;
    if (!this.night) return false;
    return d > p.radius * (NIGHT_LIGHT + 1.5 * GameState.rank('eyes')) * 1.6;
  }

  /** The boss is hiding (Scythe Ambush, Lure): nothing gives it away. */
  get bossHiding(): boolean {
    return !!this.moves?.hiding;
  }

  /** Thermals: inside a rising column you fly faster. */
  speedMul(): number {
    return this.inThermal(this.s.player.x, this.s.player.y) ? THERMAL_SPEED : 1;
  }

  private inThermal(x: number, y: number) {
    return this.columns.find((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r);
  }

  /** Night without Keen Eyes: predator warning rings stay hidden. */
  get hidesThreats(): boolean {
    return this.eventActive && this.peak?.event.kind === 'night' && GameState.rank('eyes') === 0;
  }

  update(dt: number): void {
    if (!this.peak) return;
    if (!this.lair) this.setupLair();
    this.updateLair(dt);
    this.moves?.update(dt, this.inLair());
    const progress = this.s.growthProgress;
    const marks = GameState.diff.extraEvent ? ZONE_EVENT_MARKS_EXTRA : ZONE_EVENT_MARKS;
    if (this.eventTime <= 0 && this.eventsRun < marks.length && progress >= marks[this.eventsRun]) this.startEvent();
    this.updateGate(dt);
    if (this.eventTime > 0) {
      this.eventTime -= dt;
      this.updateEvent(dt);
      if (this.eventTime <= 0) this.endEvent();
    }
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);

    const st = GameState.status;
    const event = this.eventTime > 0 ? `${this.peak.event.name.toUpperCase()} ${Math.ceil(this.eventTime)}s` : '';
    st.event = [event, this.gateStatus()].filter(Boolean).join('   ·   ');
    const b = this.boss;
    // the boss bar shows while you are near its lair or it is on screen
    const showBar = !!b && b.alive && !b.defeated && (this.inLair(1.4) || this.s.cameras.main.worldView.contains(b.x, b.y));
    st.boss = showBar ? { name: b!.name, hp: b!.hp, max: b!.maxHp } : null;
  }

  /** You can evolve: the boss is beaten and the feast is over, or you have waited it out. */
  get gateOpen(): boolean {
    if (!this.peak) return true;
    return this.conquered ? this.feastTime <= 0 : this.gateTime <= 0;
  }

  /** Fully grown with the boss alive: seconds until you evolve anyway. */
  private get gateTime(): number {
    return BOSS_GATE_TIME - GameState.gateWaited;
  }

  /** Fully grown: counts down, and points you at the lair while the boss still stands. */
  private updateGate(dt: number): void {
    const waiting = this.s.fullyGrown && !this.conquered && this.gateTime > 0;
    if (waiting && !this.gateNoted) {
      this.gateNoted = true;
      const name = this.peak!.boss.name;
      this.s.time.delayedCall(2500, () => this.s.toast(`Fully grown, but ${name} still rules this zone. Beat it to evolve, or outlast it for ${BOSS_GATE_TIME / 60} minutes.`));
    }
    if (waiting) GameState.gateWaited += dt;
    this.feastTime = Math.max(0, this.feastTime - dt);
    this.pointAtLair(waiting && !this.inLair());
  }

  /** A marker beside you, aimed at the lair. */
  private pointAtLair(show: boolean): void {
    const l = this.lair!;
    const p = this.s.player;
    this.gateArrow ??= this.s.add.text(0, 0, '➤', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '30px', color: '#ff8a80', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(31);
    const a = Math.atan2(l.y - p.y, l.x - p.x);
    const d = p.radius * 2 + 40;
    this.gateArrow.setVisible(show).setPosition(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d).setRotation(a);
  }

  /** The status line while the boss stands between you and evolving. */
  private gateStatus(): string {
    if (this.feastTime > 0) return `GOLDEN FEAST ${Math.ceil(this.feastTime)}s`;
    if (!this.s.fullyGrown || this.gateOpen) return '';
    return `BEAT ${this.peak!.boss.name.toUpperCase()} TO EVOLVE ${Math.ceil(this.gateTime)}s`;
  }

  /** Metamorphosis waits while you are fighting a living boss inside its lair. */
  get holdsEvolution(): boolean {
    const b = this.boss;
    // a bit past the edge too: the boss keeps chasing you there
    return !!b && b.alive && !b.defeated && this.inLair(1.25);
  }

  /** True if you are inside the lair (scaled by `k`). */
  inLair(k = 1): boolean {
    const l = this.lair;
    if (!l) return false;
    const p = this.s.player;
    return Phaser.Math.Distance.Between(p.x, p.y, l.x, l.y) < l.r * k;
  }

  // ------------------------------------------------------------ boss

  /** Places the lair away from where you start, stocks it with prey and puts the boss in it. */
  private setupLair(): void {
    const st = this.s.stage;
    const W = st.worldSize;
    const r = W * LAIR_SIZE;
    // somewhere between the middle and an edge, never right on top of the start
    const a = Math.random() * Math.PI * 2;
    const d = Phaser.Math.FloatBetween(0.28, 0.36) * W;
    this.lair = { x: Phaser.Math.Clamp(W / 2 + Math.cos(a) * d, r + 60, W - r - 60), y: Phaser.Math.Clamp(W / 2 + Math.sin(a) * d, r + 60, W - r - 60), r };
    for (let i = 0; i < LAIR_PREY; i++) this.spawnLairPrey();

    // a boss beaten before a save stays beaten when the stage is continued
    const beaten = GameState.bossKills.some((k) => k.stage === GameState.stageIndex);
    if (!beaten) this.spawnBoss();
    const b = this.peak!.boss;
    this.lairLabel = this.s.add
      .text(this.lair.x, this.lair.y - r - 10, '', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '18px', color: '#ff8a80', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5, 1)
      .setDepth(31);
    if (!beaten) this.s.time.delayedCall(2600, () => this.s.toast(`☠ ${b.name}'s lair is somewhere in this zone: plenty of food, guarded by ${b.title.toLowerCase()}.`));
  }

  /** One harmless prey animal at a random spot inside the lair. */
  private spawnLairPrey(): Creature | null {
    const l = this.lair!;
    const defs = this.harmlessPrey();
    if (!defs.length) return null;
    const def = defs[Math.floor(Math.random() * defs.length)];
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * l.r * 0.85;
    return this.s.spawnAt(def, l.x + Math.cos(a) * d, l.y + Math.sin(a) * d, 1)[0] ?? null;
  }

  private updateLair(dt: number): void {
    const l = this.lair!;
    const b = this.boss;
    const alive = !!b && b.alive && !b.defeated;
    // keep the feeding ground stocked
    this.lairRestock -= dt;
    if (this.lairRestock <= 0) {
      this.lairRestock = 2;
      const inside = this.s.creatures.filter((c) => c.alive && !c.fighter && c.def.damage === 0 && Phaser.Math.Distance.Between(c.x, c.y, l.x, l.y) < l.r).length;
      if (inside < LAIR_PREY_MIN) for (let i = 0; i < 3; i++) this.spawnLairPrey();
    }
    // first time you step in while it lives: it notices you
    // stepping in: it notices you (the full warning only the first time each stage)
    if (alive && this.inLair(1.8)) Tutorial.trigger('lair');
    if (alive && this.inLair() && !this.inside) {
      this.inside = true;
      b!.alert();
      Sfx.play('roar');
      this.s.cameras.main.shake(300, 0.005);
      if (!this.warned) {
        this.warned = true;
        this.s.toast(`⚠ ${this.peak!.boss.title.toUpperCase()}: ${b!.name} defends its lair! Beat it for a Trophy mutation, or get out.`);
      } else this.s.floatText(b!.x, b!.y - b!.radius * 1.5, '⚠', '#ff5252');
    }
    if (!this.inLair(1.3)) this.inside = false;
    const cam = this.s.cameras.main;
    this.lairLabel?.setText(alive ? `☠ ${this.peak!.boss.name}'s lair` : `${this.peak!.boss.name}'s lair (yours: +25% DNA)`).setColor(alive ? '#ff8a80' : '#c5e1a5').setScale(1 / cam.zoom);
  }

  private spawnBoss(): void {
    const b = this.peak!.boss;
    const base = creatureDef(b.base, this.s.stage);
    const size = this.s.stage.evolveSize * BOSS_SIZE;
    const charger = base.behavior === 'charge';
    const def: CreatureDef = {
      ...base,
      key: `boss_${this.s.stage.id}`,
      name: b.name,
      // the lair has its own warning
      warning: undefined,
      tint: b.tint,
      size: [size, size],
      hp: b.hp,
      damage: Math.round(base.damage * (BOSS_DAMAGE_BASE + BOSS_DAMAGE_PER_STAGE * GameState.stageIndex)),
      dnaValue: Math.round(size * 4),
      // it hunts you across the whole map
      sense: charger ? (base.sense ?? 300) * 1.3 : 3000,
      stamina: 6,
      stalkSpeed: charger ? Math.max(base.stalkSpeed ?? 0, base.speed * 1.6, 80) : base.stalkSpeed,
      stalkRange: charger ? 3000 : base.stalkRange,
    };
    const l = this.lair!;
    const boss = this.s.spawnAt(def, l.x, l.y, 1)[0];
    boss.boss = true;
    boss.lair = l;
    this.boss = boss;
    this.moves = new BossMoves(this.s, boss, { move: b.move, name: b.moveName }, { move: b.phase2, name: b.phase2Name });
  }

  /** Called when any creature is defeated. */
  onDefeated(c: Creature): void {
    if (c !== this.boss) return;
    GameState.trophies++;
    GameState.pendingEvolutions++;
    GameState.bossesBeaten++;
    GameState.bossKills.push({ name: this.peak!.boss.name, stage: GameState.stageIndex, at: GameState.stageTimes[GameState.stageIndex] ?? 0 });
    if (this.s.fullyGrown) this.feastTime = BOSS_FEAST_TIME;
    Achievements.unlock('boss_slayer');
    if (GameState.bossesBeaten >= 3) Achievements.unlock('boss_hunter');
    // every arena stage has a lair boss
    if (GameState.bossKills.length >= STAGES.length) Achievements.unlock('clean_sweep');
    if (NEW_BOSS_ZONES.includes(this.s.stage.id)) Achievements.unlock('big_game');
    Sfx.play('fusion');
    Sfx.play('defeat', 0.6);
    this.s.slowMotion(1.4);
    this.s.impact(0.12, 450, 0.012);
    this.s.cameras.main.flash(600, 255, 230, 160);
    // the boss's kind backs off, the lair turns into a golden feast, and the zone pays better
    const base = this.peak!.boss.base;
    for (const o of this.s.creatures) if (o.def.key === base) o.calm = true;
    for (let i = 0; i < BOSS_GOLDEN_PREY; i++) this.spawnLairPrey()?.makeGolden();
    const kind = CREATURES[base]?.name ?? 'its kind';
    this.s.toast(`${c.name} is defeated! TROPHY mutation earned. Every ${kind} here now fears you, the lair is a golden feast, and this zone gives 25% more DNA.`);
  }

  // ------------------------------------------------------------ events

  private startEvent(): void {
    this.eventsRun++;
    GameState.zoneEventDone = true;
    this.eventTime = ZONE_EVENT_TIME;
    const ev = this.peak!.event;
    Sfx.play('warn');
    this.s.toast(`${ev.name.toUpperCase()}! ${ev.text}`);
    const p = this.s.player;
    const gs = this.s.growthScale();
    switch (ev.kind) {
      case 'flood': {
        // everything is swept one way, and fresh prey washes in around you
        const a = Math.random() * Math.PI * 2;
        for (const c of this.s.creatures) {
          if (!c.alive || c.def.behavior === 'host') continue;
          c.push(c.x - Math.cos(a) * 100, c.y - Math.sin(a) * 100, 700 * gs);
          if (c.edibleBy(p)) c.stun(1);
        }
        const prey = this.preyDef('smallest');
        if (prey) for (let i = 0; i < 3; i++) this.s.spawnNear(prey, 300 * gs, 5);
        this.s.cameras.main.flash(500, 120, 180, 255);
        break;
      }
      case 'drought': {
        const W = this.s.stage.worldSize;
        const a = Math.random() * Math.PI * 2;
        this.water = {
          x: Phaser.Math.Clamp(p.x + Math.cos(a) * 450 * gs, 300, W - 300),
          y: Phaser.Math.Clamp(p.y + Math.sin(a) * 450 * gs, 300, W - 300),
        };
        break;
      }
      case 'night':
        this.makeNight();
        break;
      case 'storm':
        this.strikeTimer = 1;
        break;
      case 'eruption':
        for (let i = 0; i < 4; i++) this.openCrack();
        this.crackTimer = CRACK_EVERY;
        this.s.cameras.main.shake(500, 0.006);
        break;
      case 'thermals':
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.random();
          const d = Phaser.Math.FloatBetween(200, 650) * gs;
          const drift = Phaser.Math.FloatBetween(-40, 40) * gs;
          this.columns.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: Phaser.Math.FloatBetween(110, 160) * gs, vx: drift, vy: -drift, spin: Math.random() < 0.5 ? -1 : 1 });
        }
        break;
      case 'pesticide': {
        // the spray drifts across the map, starting a little behind you
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.fog = { x: p.x - dir * 650 * gs, dir, w: 480 * gs };
        break;
      }
      case 'migration': {
        const herd = this.preyDef('biggest');
        if (!herd) break;
        const a = Math.random() * Math.PI * 2;
        const from = 700 * gs;
        const cam = this.s.cameras.main;
        this.migrationTarget = { x: p.x - Math.cos(a) * from * 2, y: p.y - Math.sin(a) * from * 2 };
        // three herds charge in from one side and run past you
        for (let i = 0; i < 3; i++) {
          this.migrants.push(...this.s.spawnAt(herd, p.x + Math.cos(a + (i - 1) * 0.3) * from, p.y + Math.sin(a + (i - 1) * 0.3) * from, 6));
        }
        cam.shake(600, 0.004);
        break;
      }
    }
  }

  private updateEvent(dt: number): void {
    const kind = this.peak!.event.kind;
    const p = this.s.player;
    const gs = this.s.growthScale();
    if (kind === 'drought' && this.water) {
      const w = this.water;
      const r = this.waterRadius();
      for (const c of this.s.creatures) {
        if (!c.alive || c.stunned || c.defeated || c.boss || c.def.behavior === 'host') continue;
        if (Phaser.Math.Distance.Between(c.x, c.y, w.x, w.y) > r * 0.8) c.pull(w.x, w.y, 70 * gs, dt);
      }
    } else if (kind === 'storm') {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        this.strikeTimer = STRIKE_EVERY;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          // one strike lands near you, one anywhere around
          const d = (i === 0 ? Phaser.Math.FloatBetween(0, 120) : Phaser.Math.FloatBetween(150, 450)) * gs;
          this.strikes.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 70 * gs, t: STRIKE_WARN });
        }
      }
      for (const st of this.strikes) {
        st.t -= dt;
        if (st.t > 0) continue;
        Sfx.play('crit');
        this.flashes.push({ x: st.x, y: st.y, r: st.r, life: 0.3 });
        for (const c of this.s.creatures) {
          if (!c.alive || c.def.behavior === 'host') continue;
          if (Phaser.Math.Distance.Between(c.x, c.y, st.x, st.y) > st.r + c.radius) continue;
          c.stun(2);
          if (c.fighter && c.takeDamage(30, st.x, st.y, false)) this.s.onDefeated(c);
        }
        if (Phaser.Math.Distance.Between(p.x, p.y, st.x, st.y) < st.r + p.radius * 0.5) this.s.zoneHurt(STRIKE_DAMAGE, st.x, st.y, 'a lightning strike');
      }
      this.strikes = this.strikes.filter((st) => st.t > 0);
    } else if (kind === 'eruption') {
      this.updateCracks(dt);
    } else if (kind === 'thermals') {
      for (const col of this.columns) {
        col.x += col.vx * dt;
        col.y += col.vy * dt;
      }
      const col = this.inThermal(p.x, p.y);
      if (col && !p.dashing) {
        // the spinning air throws you sideways
        const a = Math.atan2(p.y - col.y, p.x - col.x) + (col.spin * Math.PI) / 2;
        p.vx += Math.cos(a) * THERMAL_FLING * gs * dt;
        p.vy += Math.sin(a) * THERMAL_FLING * gs * dt;
      }
      for (const c of this.s.creatures) {
        if (!c.alive || !c.def.flying || c.boss) continue;
        const cc = this.inThermal(c.x, c.y);
        if (!cc) continue;
        const a = Math.atan2(c.y - cc.y, c.x - cc.x) + (cc.spin * Math.PI) / 2;
        c.pull(c.x + Math.cos(a) * 100, c.y + Math.sin(a) * 100, 160 * gs, dt);
      }
    } else if (kind === 'pesticide' && this.fog) {
      const f = this.fog;
      f.x += f.dir * 170 * gs * dt;
      this.hazardCd -= dt;
      if (Math.abs(p.x - f.x) < f.w / 2) {
        if (this.hazardCd <= 0) {
          this.hazardCd = 0.5;
          this.s.zoneHurt(FOG_DAMAGE, p.x, p.y, 'pesticide');
        }
        // drones drop dead in the spray
        for (const a of this.s.abilities.allies) a.life = Math.min(a.life, 0);
      }
      for (const c of this.s.creatures) {
        if (!c.alive || c.stunned || c.boss || c.def.behavior === 'host') continue;
        const ahead = (c.x - f.x) * f.dir;
        // everything runs ahead of the fog
        if (ahead > -f.w / 2 && ahead < f.w) c.pull(c.x + f.dir * 100, c.y, 120 * gs, dt);
      }
    } else if (kind === 'migration') {
      const t = this.migrationTarget;
      for (const c of this.migrants) if (c.alive && !c.stunned) c.pull(t.x, t.y, 150 * gs, dt);
    } else if (kind === 'night' && this.night) {
      const fade = Math.min(1, (ZONE_EVENT_TIME - this.eventTime) / 2, this.eventTime / 2);
      const light = p.radius * (NIGHT_LIGHT + 1.5 * GameState.rank('eyes'));
      const scale = light / NIGHT_HOLE;
      this.night.setPosition(p.x, p.y).setScale(scale).setAlpha(fade);
      // everything beyond the texture is fully dark
      const half = (NIGHT_TEX_SIZE / 2) * scale;
      const v = this.s.cameras.main.worldView;
      const f = this.nightFrame!;
      f.clear();
      f.fillStyle(0x00000a, 0.95 * fade);
      const pad = 200;
      f.fillRect(v.x - pad, v.y - pad, v.width + pad * 2, p.y - half - v.y + pad);
      f.fillRect(v.x - pad, p.y + half, v.width + pad * 2, v.bottom - p.y - half + pad);
      f.fillRect(v.x - pad, p.y - half, p.x - half - v.x + pad, half * 2);
      f.fillRect(p.x + half, p.y - half, v.right - p.x - half + pad, half * 2);
    }
  }

  private endEvent(): void {
    this.water = null;
    this.cracks = [];
    this.columns = [];
    this.fog = null;
    this.strikes = [];
    this.migrants = [];
    this.night?.destroy();
    this.nightFrame?.destroy();
    this.night = null;
    this.nightFrame = null;
    this.s.toast(`The ${this.peak!.event.name.toLowerCase()} has passed.`);
  }

  /** Eruption: a new crack near you, with a warning flicker before it burns. */
  private openCrack(): void {
    const p = this.s.player;
    const gs = this.s.growthScale();
    const a = Math.random() * Math.PI * 2;
    const d = Phaser.Math.FloatBetween(120, 550) * gs;
    const cx = p.x + Math.cos(a) * d;
    const cy = p.y + Math.sin(a) * d;
    const ang = Math.random() * Math.PI;
    const half = Phaser.Math.FloatBetween(160, 320) * gs;
    this.cracks.push({ x1: cx - Math.cos(ang) * half, y1: cy - Math.sin(ang) * half, x2: cx + Math.cos(ang) * half, y2: cy + Math.sin(ang) * half, w: 22 * gs, warn: CRACK_WARN });
    if (this.cracks.length > CRACK_MAX) this.cracks.shift();
    Sfx.play('slam', 0.5);
  }

  /** Distance from a point to a crack, and the nearest point on it. */
  private crackDist(c: { x1: number; y1: number; x2: number; y2: number }, x: number, y: number): { d: number; nx: number; ny: number } {
    const dx = c.x2 - c.x1;
    const dy = c.y2 - c.y1;
    const t = Phaser.Math.Clamp(((x - c.x1) * dx + (y - c.y1) * dy) / (dx * dx + dy * dy), 0, 1);
    const nx = c.x1 + dx * t;
    const ny = c.y1 + dy * t;
    return { d: Phaser.Math.Distance.Between(x, y, nx, ny), nx, ny };
  }

  private updateCracks(dt: number): void {
    const p = this.s.player;
    const gs = this.s.growthScale();
    this.crackTimer -= dt;
    if (this.crackTimer <= 0) {
      this.crackTimer = CRACK_EVERY;
      this.openCrack();
    }
    this.hazardCd -= dt;
    for (const cr of this.cracks) {
      cr.warn -= dt;
      if (cr.warn > 0) continue;
      if (this.hazardCd <= 0 && !p.dashing && this.crackDist(cr, p.x, p.y).d < cr.w + p.radius * 0.4) {
        this.hazardCd = 0.6;
        this.s.zoneHurt(CRACK_DAMAGE, p.x, p.y, 'the burning ground');
      }
    }
    for (const c of this.s.creatures) {
      if (!c.alive || c.boss || c.def.flying || c.def.behavior === 'host') continue;
      for (const cr of this.cracks) {
        if (cr.warn > 0) continue;
        const { d, nx, ny } = this.crackDist(cr, c.x, c.y);
        if (d > 260 * gs) continue;
        // run from the glow; fighters standing in it get burned
        const a = Math.atan2(c.y - ny, c.x - nx);
        c.pull(c.x + Math.cos(a) * 100, c.y + Math.sin(a) * 100, 150 * gs, dt);
        if (d < cr.w + c.radius * 0.5 && c.fighter && c.takeDamage(20 * dt, nx, ny, false)) this.s.onDefeated(c);
        break;
      }
    }
  }

  private waterRadius(): number {
    // the last water shrinks as the event goes on
    return (120 + 160 * (this.eventTime / ZONE_EVENT_TIME)) * this.s.growthScale();
  }

  private makeNight(): void {
    const scene = this.s;
    ensureDarkTexture(scene);
    this.night = scene.add.image(0, 0, NIGHT_TEX).setDepth(29).setAlpha(0);
    this.nightFrame = scene.add.graphics().setDepth(29);
  }

  /** This stage's harmless wandering prey. */
  private harmlessPrey(): CreatureDef[] {
    return this.s.stage.spawns
      .map((sp) => creatureDef(sp.creature, this.s.stage))
      .filter((d) => d.damage === 0 && d.behavior === 'wander' && !d.hp);
  }

  /** Smallest harmless prey (flood) or biggest harmless herd animal (migration) of this stage. */
  private preyDef(which: 'smallest' | 'biggest'): CreatureDef | null {
    const defs = this.harmlessPrey();
    if (!defs.length) return null;
    defs.sort((a, b) => a.size[1] - b.size[1]);
    return which === 'smallest' ? defs[0] : defs[defs.length - 1];
  }

  // ------------------------------------------------------------ drawing

  draw(g: Phaser.GameObjects.Graphics, lw: number): void {
    if (this.water) {
      const r = this.waterRadius();
      g.fillStyle(0x4fc3f7, 0.35);
      g.fillCircle(this.water.x, this.water.y, r);
      g.lineStyle(lw * 2, 0xb3e5fc, 0.8);
      g.strokeCircle(this.water.x, this.water.y, r);
    }
    for (const cr of this.cracks) {
      const live = cr.warn <= 0;
      const flicker = live ? 0.75 + 0.25 * Math.sin(this.s.time.now / 90) : 0.3 + 0.3 * Math.sin(this.s.time.now / 50);
      g.lineStyle(cr.w * 2.4, 0xff3d00, 0.25 * flicker);
      g.lineBetween(cr.x1, cr.y1, cr.x2, cr.y2);
      g.lineStyle(cr.w * (live ? 1 : 0.4), live ? 0xffab40 : 0xff6e40, flicker);
      g.lineBetween(cr.x1, cr.y1, cr.x2, cr.y2);
    }
    for (const col of this.columns) {
      const spin = (this.s.time.now / 300) * col.spin;
      g.fillStyle(0xfff3e0, 0.12);
      g.fillCircle(col.x, col.y, col.r);
      g.lineStyle(lw * 2, 0xfff3e0, 0.5);
      for (let i = 0; i < 4; i++) {
        const a = spin + (i / 4) * Math.PI * 2;
        g.beginPath();
        g.arc(col.x, col.y, col.r * (0.4 + 0.15 * i), a, a + 1.4);
        g.strokePath();
      }
    }
    if (this.fog) {
      const v = this.s.cameras.main.worldView;
      const f = this.fog;
      g.fillStyle(0xd4e157, 0.42);
      g.fillRect(f.x - f.w / 2, v.y - 50, f.w, v.height + 100);
      g.lineStyle(lw * 3, 0xeeff41, 0.7);
      g.lineBetween(f.x - f.w / 2, v.y - 50, f.x - f.w / 2, v.bottom + 50);
      g.lineBetween(f.x + f.w / 2, v.y - 50, f.x + f.w / 2, v.bottom + 50);
      g.fillStyle(0xf0f4c3, 0.25);
      for (let i = 0; i < 8; i++) {
        const y = v.y + ((i * 173 + this.s.time.now * 0.05) % (v.height + 100));
        g.fillCircle(f.x + Math.sin(i * 2.1 + this.s.time.now / 900) * f.w * 0.35, y, f.w * 0.22);
      }
    }
    for (const st of this.strikes) {
      const k = 1 - st.t / STRIKE_WARN;
      g.lineStyle(lw * 2, 0xfff176, 0.9);
      g.strokeCircle(st.x, st.y, st.r);
      g.fillStyle(0xfff176, 0.25 * k);
      g.fillCircle(st.x, st.y, st.r * k);
    }
    for (const f of this.flashes) {
      g.fillStyle(0xffffff, f.life / 0.3);
      g.fillCircle(f.x, f.y, f.r);
      g.lineStyle(lw * 4, 0xfff59d, f.life / 0.3);
      g.lineBetween(f.x, f.y - f.r * 6, f.x, f.y);
    }
    const l = this.lair;
    const b = this.boss;
    const alive = !!b && b.alive && !b.defeated;
    if (l) {
      const pulse = 0.5 + 0.5 * Math.sin(this.s.time.now / 400);
      g.fillStyle(alive ? 0xff1744 : 0x9ccc65, 0.05);
      g.fillCircle(l.x, l.y, l.r);
      g.lineStyle(lw * 3, alive ? 0xff5252 : 0x9ccc65, 0.35 + 0.25 * pulse);
      g.strokeCircle(l.x, l.y, l.r);
      // while the boss lives, an arrow at the screen edge points to its lair
      const v = this.s.cameras.main.worldView;
      if (alive && !v.contains(l.x, l.y)) {
        const p = this.s.player;
        const a = Math.atan2(l.y - p.y, l.x - p.x);
        const ex = Phaser.Math.Clamp(p.x + Math.cos(a) * v.width, v.x + 30 * lw, v.right - 30 * lw);
        const ey = Phaser.Math.Clamp(p.y + Math.sin(a) * v.height, v.y + 30 * lw, v.bottom - 30 * lw);
        const s = 14 * lw;
        g.fillStyle(0xff5252, 0.85);
        g.fillTriangle(ex + Math.cos(a) * s, ey + Math.sin(a) * s, ex + Math.cos(a + 2.5) * s, ey + Math.sin(a + 2.5) * s, ex + Math.cos(a - 2.5) * s, ey + Math.sin(a - 2.5) * s);
      }
    }
    this.moves?.draw(g, lw);
    if (alive && b && !this.inDarkness(b.x, b.y) && !this.bossHiding) {
      // a pulsing crown ring so you always know which one is the boss
      const pulse = 0.5 + 0.5 * Math.sin(this.s.time.now / 120);
      g.lineStyle(lw * 3, 0xff1744, 0.5 + 0.4 * pulse);
      g.strokeCircle(b.x, b.y, b.radius + 12 * lw);
    }
  }

  destroy(): void {
    this.moves?.destroy();
    this.lairLabel?.destroy();
    this.night?.destroy();
    this.nightFrame?.destroy();
    GameState.status.event = '';
    GameState.status.boss = null;
  }
}
