import Phaser from 'phaser';
import { BOSS_BURST_SHARE, BOSS_MAX_DPS_SHARE } from '../data/zones';
import { PARALYZE_EDIBLE } from '../data/signatures';
import type { CreatureDef, ProjectileKind } from '../data/creatures';
import { BODY_RADIUS } from '../art/textures';
import { DANGER_RATIO, EDIBLE_RATIO } from '../config';
import { GameState } from '../state/GameState';
import { venomEdibleRatio } from '../data/traits';
import type { Player } from './Player';

export interface StageContext {
  player: Player;
  worldSize: number;
  /** A decoy predators chase instead of the player (lizard tail drop), or null. */
  lure: { x: number; y: number } | null;
  /** Camouflage/phantom: predators can't see you. */
  hiddenFromPredators: boolean;
  /** Phantom (or a submerged crocodile): prey can't see you either. */
  hiddenFromPrey: boolean;
  /** Water pools grazing animals walk to for a drink (empty in most stages). */
  pools: readonly { x: number; y: number; r: number }[];
  hurtPlayer(damage: number, fromX: number, fromY: number, source: string, attacker?: Creature): void;
  /** Throws a projectile at the player. */
  shoot(from: Creature, angle: number, kind: ProjectileKind): void;
  /** Resolves an area slam centred on the creature. */
  slam(from: Creature): void;
  /** A pack hunter spotted the player: rally the rest of the pack. */
  alertPack(from: Creature): void;
  /** Shows a floating shout above the creature. */
  say(from: Creature, text: string, color?: string): void;
  /** A creature died from damage over time. */
  defeated(c: Creature): void;
}

type AIState =
  | 'wander' | 'flee' | 'chase' | 'rest' | 'windup' | 'tongue'
  | 'aim' | 'charging' | 'spitAim' | 'slam';

interface Tongue {
  tx: number;
  ty: number;
  t: number;
  hit: boolean;
}

const WINDUP_TIME = 0.45;
const TONGUE_OUT = 0.14;
const TONGUE_HOLD = 0.08;
const TONGUE_BACK = 0.22;
const TONGUE_COOLDOWN = 2.2;
const RANGED_WINDUP = 0.45;
/** A rival attacks while it is bigger than this fraction of the player's size. */
const RIVAL_RATIO = 0.75;
/** Apex Frenzy: anything up to this fraction of your size is edible and harmless. */
export const FRENZY_RATIO = 1.35;
/** Alpha variants: bigger, tougher, worth more. */
const ALPHA_SIZE = 1.3;
const ALPHA_HP = 2;
const ALPHA_DNA = 3;
/** How long an alerted pack member keeps hunting even out of sight. */
const PACK_ALERT_TIME = 4;

export class Creature {
  readonly sprite: Phaser.GameObjects.Image;
  readonly size: number;
  readonly elite: boolean;
  alive = true;
  vx = 0;
  vy = 0;
  state: AIState = 'wander';
  /** Direction of the current wind-up (lunge / throw), for the telegraph. */
  aimAngle = 0;
  /** Golden Feast prey: worth a lot, glows. */
  golden = false;
  /** Set once this creature has noticed the player (for the Ambush unlock). */
  noticed = false;
  /** A zone boss (see systems/ZoneEvents.ts). */
  boss = false;
  /** Seconds until venom fangs can stun this again (no endless stun-lock). */
  fangCd = 0;
  /** Seconds during which another venom stun is much shorter (repeat stuns wear off). */
  venomCd = 0;
  /** Seconds left paralyzed by a wasp sting: stunned, and edible even when bigger than you. */
  paralyzed = 0;
  /** A boss in the middle of a scripted move: its own AI is paused (systems/BossMoves.ts). */
  held = false;
  /** Its warning hasn't shown yet (CreatureDef.warning): it ignores you instead of hunting. */
  calm = false;
  /** A boss's territory: it only hunts you while you are inside, otherwise it goes home. */
  lair: { x: number; y: number; r: number } | null = null;
  /** Set once Startle (Silent rank 2) has frozen it, so it only happens once. */
  startled = false;

  // fighting (only for creatures with def.hp)
  hp: number;
  readonly maxHp: number;
  /** Beaten in a fight: an edible carcass. */
  defeated = false;

  // host (blood) state
  blood: number;
  drained = false;
  annoyance = 0;
  swatThreshold = Phaser.Math.FloatBetween(1.6, 3);

  /** Pack flanking offset (radians), assigned at spawn. */
  flank = 0;

  private heading = Math.random() * Math.PI * 2;
  private timer = 0;
  private cooldown = Math.random() * TONGUE_COOLDOWN;
  private specialCd = Math.random() * 2;
  private stamina: number;
  private hopTimer = Math.random() * 2;
  /** Seconds until a grazer wants a drink, and seconds left drinking. */
  private thirst = Phaser.Math.FloatBetween(4, 20);
  private drinking = 0;
  private hopping = false;
  private phase = Math.random() * 100;
  private t = 0;
  private tongue: Tongue | null = null;
  private stunTime = 0;
  private alertTime = 0;
  private bleedTime = 0;
  private bleedDps = 0;
  /** True when the current lunge is a leap special rather than the charge behaviour. */
  private lungeFromBehavior = false;

  /**
   * `sizeFactor` < 1 for a creature returning from an earlier stage: its def is already shrunk into
   * this stage's units, and its fixed numbers (DNA override, knockback) shrink with it.
   */
  constructor(
    scene: Phaser.Scene,
    readonly def: CreatureDef,
    x: number,
    y: number,
    elite = false,
    private readonly sizeFactor = 1,
  ) {
    this.elite = elite;
    this.size = Phaser.Math.FloatBetween(def.size[0], def.size[1]) * (elite ? ALPHA_SIZE : 1);
    this.blood = def.blood ?? 0;
    this.stamina = def.stamina ?? 2;
    // bigger-than-average individuals are tougher
    // returning creatures you have outgrown are also much less tough (health scales with area)
    this.maxHp = def.hp ? def.hp * (this.size / ((def.size[0] + def.size[1]) / 2)) * sizeFactor ** 2 * (elite ? ALPHA_HP : 1) : 0;
    this.hp = this.maxHp;
    this.sprite = scene.add
      .image(x, y, def.texture)
      .setDepth(def.behavior === 'host' ? 5 : 10 + this.size * 0.01)
      .setRotation(this.heading);
    this.sprite.setScale(this.size / BODY_RADIUS);
    this.restoreTint();
  }

  private restoreTint(): void {
    if (this.defeated) this.sprite.setTint(0x5a4a40);
    else if (this.drained) this.sprite.setTint(0x9a9a9a);
    else if (this.golden) this.sprite.setTint(0xffd54f);
    else if (this.def.tint !== undefined) this.sprite.setTint(this.def.tint);
    else this.sprite.clearTint();
  }

  makeGolden(): void {
    this.golden = true;
    this.restoreTint();
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }
  get radius(): number { return this.size; }
  get name(): string { return this.elite ? `Alpha ${this.def.name}` : this.def.name; }
  get dnaValue(): number {
    const base = this.def.dnaValue ? this.def.dnaValue * this.sizeFactor : this.size;
    return Math.max(1, Math.round(base * (this.elite ? ALPHA_DNA : 1) * (this.golden ? 6 : 1)));
  }
  get stunned(): boolean { return this.stunTime > 0; }
  get fighter(): boolean { return this.maxHp > 0 && !this.defeated; }

  /** True if the player is big enough to eat this (venom-stunned prey can be bigger). */
  edibleBy(player: Player): boolean {
    if (this.defeated) return true;
    // bosses have to be beaten, never swallowed (not even stunned)
    if (this.def.behavior === 'host' || this.boss) return false;
    let ratio = EDIBLE_RATIO + GameState.stats.edibleBonus;
    if (this.stunned) ratio = Math.max(ratio, venomEdibleRatio(GameState.stats.venomRank));
    if (this.paralyzed > 0) ratio = Math.max(ratio, PARALYZE_EDIBLE);
    if (GameState.status.frenzy > 0) ratio = Math.max(ratio, FRENZY_RATIO);
    return this.size < player.size * ratio;
  }

  /** True if this can currently hurt the player. Rivals pick fights even when a bit smaller. */
  threatTo(player: Player): boolean {
    // calm: not introduced yet, or cowed by beating its boss
    if (this.calm || this.stunned || this.defeated || this.def.damage <= 0) return false;
    if (GameState.status.frenzy > 0 && this.size < player.size * FRENZY_RATIO) return false;
    if (this.def.behavior === 'rival' && this.size > player.size * this.rivalRatio()) return true;
    return this.size > player.size * DANGER_RATIO;
  }

  /** Size rank 3 (Intimidating) makes smaller rivals back down. */
  private rivalRatio(): number {
    return GameState.rank('size') >= 3 ? 1 : RIVAL_RATIO;
  }

  /** Length of the wind-up warning line drawn by the scene. */
  telegraphLength(): number {
    if (this.def.behavior === 'ranged') return (this.def.range ?? 300) * 1.4;
    if (this.state === 'spitAim') return (this.def.spit?.range ?? 300) * 1.2;
    return (this.def.chargeSpeed ?? 500) * (this.def.chargeTime ?? 0.5);
  }

  /** 0..1 progress of a slam wind-up, for the telegraph. */
  slamProgress(): number {
    const windup = this.def.slam?.windup ?? 1;
    return Phaser.Math.Clamp(1 - this.timer / windup, 0, 1);
  }

  /** Damage from the player. Returns true if this blow defeated it. */
  takeDamage(amount: number, fromX: number, fromY: number, knock = true): boolean {
    if (!this.fighter) return false;
    if (this.boss) amount = this.bossBudget(amount);
    this.hp -= amount;
    if (knock) {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.vx += Math.cos(a) * 220 * this.sizeFactor;
      this.vy += Math.sin(a) * 220 * this.sizeFactor;
    }
    if (this.hp > 0) return false;
    this.hp = 0;
    this.defeated = true;
    this.tongue = null;
    this.state = 'rest';
    this.stunTime = 0;
    this.bleedTime = 0;
    this.restoreTint();
    return true;
  }

  /** Claws: lose health over time. Up to `maxStacks` bleeds add together. */
  bleed(dps: number, seconds: number, maxStacks = 1): void {
    if (!this.fighter) return;
    this.bleedDps = this.bleedTime > 0 ? Math.min(this.bleedDps + dps, dps * maxStacks) : dps;
    this.bleedTime = Math.max(this.bleedTime, seconds);
  }

  /** Frozen and harmless for `seconds`. */
  /** Bosses can't be burst down: damage beyond a steady rate (plus a small burst) is shrugged off. */
  private budget = -1;
  private budgetAt = 0;
  private bossBudget(amount: number): number {
    const now = this.sprite.scene.time.now / 1000;
    const cap = this.maxHp * BOSS_BURST_SHARE;
    if (this.budget < 0) this.budget = cap;
    this.budget = Math.min(cap, this.budget + (now - this.budgetAt) * this.maxHp * BOSS_MAX_DPS_SHARE);
    this.budgetAt = now;
    const dealt = Math.min(amount, this.budget);
    this.budget -= dealt;
    return dealt;
  }

  /** A wasp sting: a stun that also makes it edible while it lasts (bosses just get stunned). */
  paralyze(seconds: number): void {
    this.stun(seconds);
    if (!this.boss) this.paralyzed = Math.max(this.paralyzed, seconds);
  }

  /** A venom stun: weaker on bosses, and repeats within a few seconds are much shorter. */
  venomStun(seconds: number): void {
    // bosses ignore repeat venom entirely; others get a much shorter repeat stun
    if (this.venomCd > 0 && this.boss) return;
    if (this.boss) seconds *= 0.4;
    if (this.venomCd > 0) seconds *= 0.35;
    this.venomCd = 4;
    this.stun(seconds);
  }

  stun(seconds: number): void {
    if (this.defeated) return;
    // bosses shrug stuns off twice as fast, and tiny stuns don't interrupt their attacks
    if (this.boss) seconds *= 0.5;
    if (this.boss && seconds < 0.3) return;
    this.stunTime = Math.max(this.stunTime, seconds);
    this.tongue = null;
    this.state = 'wander';
    this.sprite.setTint(0xb58cff);
  }

  /** Shove in a direction (shockwaves, tail whips). */
  push(fromX: number, fromY: number, force: number): void {
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.vx += Math.cos(a) * force;
    this.vy += Math.sin(a) * force;
  }

  /** Drag toward a point regardless of what the AI wants (magnet, tongue). */
  pull(toX: number, toY: number, speed: number, dt: number): void {
    const a = Math.atan2(toY - this.y, toX - this.x);
    this.sprite.x += Math.cos(a) * speed * dt;
    this.sprite.y += Math.sin(a) * speed * dt;
  }

  /** Pack call: hunt the player for a while even from out of sight. */
  alert(): void {
    if (this.defeated || this.stunned) return;
    this.alertTime = PACK_ALERT_TIME;
    this.stamina = this.def.stamina ?? 3;
    if (this.state === 'rest' || this.state === 'wander') this.state = 'chase';
  }

  /** Called by the scene after this creature lands a body hit, so it backs off. */
  onHitPlayer(): void {
    if (this.def.behavior === 'chase') {
      this.state = 'rest';
      this.timer = 1.8;
      this.stamina = 0;
    } else if (this.def.behavior === 'rival') {
      // back off for a moment, then come again
      this.state = 'rest';
      this.timer = 0.9;
    } else if (this.state === 'charging') {
      this.state = 'rest';
      this.timer = 0.6;
      this.cooldown = this.def.chargeCooldown ?? 2.5;
      this.vx *= 0.2;
      this.vy *= 0.2;
    }
  }

  drain(): void {
    this.drained = true;
    this.sprite.setTint(0x9a9a9a);
  }

  update(dt: number, ctx: StageContext): void {
    this.t += dt;
    const p = ctx.player;
    const def = this.def;
    const threat = this.threatTo(p);
    // predators may be chasing a decoy instead of you
    const target = threat && ctx.lure ? ctx.lure : p;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    let dist = Math.hypot(dx, dy);
    const realDist = Math.hypot(p.x - this.x, p.y - this.y);
    if (threat && !def.keenNose && ctx.hiddenFromPredators && !ctx.lure && this.alertTime <= 0) dist = Infinity;

    if (this.defeated) {
      this.brake(dt);
      this.integrate(dt, ctx.worldSize, null);
      this.updateVisual();
      return;
    }
    if (this.held) {
      this.vx = 0;
      this.vy = 0;
      this.updateVisual();
      return;
    }

    if (this.bleedTime > 0) {
      this.bleedTime -= dt;
      if (this.takeDamage(this.bleedDps * dt, this.x, this.y, false)) {
        ctx.defeated(this);
        return;
      }
    }

    this.fangCd -= dt;
    this.venomCd -= dt;
    this.paralyzed = Math.max(0, this.paralyzed - dt);
    if (this.stunned) {
      this.stunTime -= dt;
      this.brake(dt);
      this.sprite.rotation += Math.sin(this.t * 30) * dt * 3;
      if (!this.stunned) this.restoreTint();
      this.integrate(dt, ctx.worldSize, null);
      this.updateVisual();
      return;
    }

    this.alertTime -= dt;
    this.specialCd -= dt;
    // territorial: once you leave its lair, it stops chasing and heads home
    const lair = this.lair;
    if (lair && Math.hypot(p.x - lair.x, p.y - lair.y) > lair.r * 1.15) {
      this.state = 'wander';
      if (Math.hypot(lair.x - this.x, lair.y - this.y) > lair.r * 0.35) this.steer(Math.atan2(lair.y - this.y, lair.x - this.x), def.speed * 1.5, dt);
      else this.wander(dt, def.speed * 0.5);
      this.integrate(dt, ctx.worldSize, null);
      this.updateVisual();
      return;
    }
    let faceTarget: number | null = null;
    const preySees = !ctx.hiddenFromPrey && realDist < Math.max(def.sense * GameState.stats.preySenseMul, 40);

    if (this.inSpecialState()) {
      faceTarget = this.updateSpecial(dt, dx, dy, ctx);
    } else if (def.behavior !== 'ranged' && this.edibleBy(p) && preySees) {
      // run away, with a bit of panic jitter
      this.state = 'flee';
      this.noticed = true;
      this.tongue = null;
      const jitter = Math.sin(this.t * 7 + this.phase) * (def.erratic ?? 0.3);
      this.steer(Math.atan2(p.y - this.y, p.x - this.x) + Math.PI + jitter, def.fleeSpeed ?? def.speed * 1.5, dt);
    } else if (threat && this.tryStartSpecial(dist, dx, dy, p.radius)) {
      faceTarget = Math.atan2(dy, dx);
    } else if (def.behavior === 'chase') {
      this.updateChase(dt, dist, dx, dy, threat, ctx);
    } else if (def.behavior === 'tongue') {
      faceTarget = this.updateTongue(dt, dist, dx, dy, threat, ctx);
    } else if (def.behavior === 'charge') {
      this.updateCharge(dt, dist, dx, dy, threat, p.radius);
    } else if (def.behavior === 'rival') {
      this.updateRival(dt, dist, dx, dy, threat, ctx, realDist, p);
    } else if (def.behavior === 'ranged') {
      faceTarget = this.updateRanged(dt, ctx.hiddenFromPredators ? Infinity : realDist, p.x - this.x, p.y - this.y);
    } else {
      this.state = 'wander';
      if (!this.goDrink(dt, ctx.pools)) this.wander(dt, def.speed);
    }

    this.integrate(dt, ctx.worldSize, faceTarget);
    this.updateVisual();
  }

  // ------------------------------------------------------------ special attacks

  private inSpecialState(): boolean {
    return this.state === 'aim' || this.state === 'charging' || this.state === 'spitAim' || this.state === 'slam';
  }

  /** Starts a slam, spit or leap if one is ready and in range. */
  private tryStartSpecial(dist: number, dx: number, dy: number, playerRadius: number): boolean {
    const def = this.def;
    if (this.specialCd > 0 || !isFinite(dist)) return false;
    if (def.slam && dist < this.radius * def.slam.range + playerRadius) {
      this.state = 'slam';
      this.timer = def.slam.windup;
      return true;
    }
    if (def.spit && dist < def.spit.range && dist > this.radius * 2.5) {
      this.state = 'spitAim';
      this.timer = RANGED_WINDUP;
      this.aimAngle = Math.atan2(dy, dx);
      return true;
    }
    if (def.leap && dist > this.radius * def.leap.min && dist < this.radius * def.leap.max) {
      this.state = 'aim';
      this.timer = def.windup ?? 0.4;
      this.aimAngle = Math.atan2(dy, dx);
      this.lungeFromBehavior = true;
      return true;
    }
    return false;
  }

  /** Runs whichever special attack is in progress. Returns an angle to face, or null. */
  private updateSpecial(dt: number, dx: number, dy: number, ctx: StageContext): number | null {
    const def = this.def;
    this.timer -= dt;
    if (this.state === 'slam') {
      this.brake(dt);
      if (this.timer <= 0) {
        ctx.slam(this);
        this.state = 'rest';
        this.timer = 0.6;
        this.specialCd = def.slam?.cooldown ?? 3;
      }
      return null;
    }
    if (this.state === 'spitAim') {
      this.brake(dt);
      this.aimAngle = Math.atan2(dy, dx);
      if (this.timer <= 0) {
        ctx.shoot(this, this.aimAngle, def.projectile ?? def.spit?.kind ?? 'spear');
        this.state = 'chase';
        this.specialCd = def.spit?.cooldown ?? 3;
      }
      return this.aimAngle;
    }
    if (this.state === 'aim') {
      this.brake(dt);
      this.aimAngle = Math.atan2(dy, dx);
      if (this.timer <= 0) {
        const speed = def.chargeSpeed ?? 500;
        this.state = 'charging';
        this.timer = def.chargeTime ?? 0.5;
        this.vx = Math.cos(this.aimAngle) * speed;
        this.vy = Math.sin(this.aimAngle) * speed;
      }
      return this.aimAngle;
    }
    // charging: velocity is locked in for the whole lunge
    if (this.timer <= 0) {
      this.state = 'rest';
      this.timer = 0.6;
      if (this.lungeFromBehavior) this.specialCd = def.chargeCooldown ?? 2.5;
      else this.cooldown = def.chargeCooldown ?? 2.5;
      this.lungeFromBehavior = false;
    }
    return null;
  }

  // ------------------------------------------------------------ behaviours

  private updateChase(dt: number, dist: number, dx: number, dy: number, threat: boolean, ctx: StageContext): void {
    const def = this.def;
    const maxStamina = def.stamina ?? 2;
    if (this.state === 'rest') {
      this.timer -= dt;
      this.wander(dt, def.speed * 0.5);
      if (this.timer <= 0) {
        this.state = 'wander';
        this.stamina = maxStamina;
      }
    } else if (threat && (dist < def.sense * GameState.stats.senseMul || this.alertTime > 0) && this.stamina > 0) {
      if (this.state !== 'chase') this.onSpotted(ctx);
      this.state = 'chase';
      this.stamina -= dt;
      this.steer(Math.atan2(dy, dx), def.chaseSpeed ?? def.speed * 2, dt);
      if (this.stamina <= 0) {
        this.state = 'rest';
        this.timer = 2.5;
      }
    } else {
      this.state = 'wander';
      this.stamina = Math.min(maxStamina, this.stamina + dt * 0.5);
      this.wander(dt, def.speed);
    }
  }

  /** Hunts the player whenever it thinks it can take them; backs off briefly after each hit. */
  private updateRival(dt: number, dist: number, dx: number, dy: number, threat: boolean, ctx: StageContext, realDist: number, p: Player): void {
    const def = this.def;
    const maxStamina = def.stamina ?? 3;
    // Intimidating: smaller rivals back down instead of fighting
    if (!threat && GameState.rank('size') >= 3 && this.size < p.size && realDist < def.sense) {
      this.state = 'flee';
      this.steer(Math.atan2(-dy, -dx), def.fleeSpeed ?? def.speed * 1.5, dt);
      return;
    }
    if (this.state === 'rest') {
      this.timer -= dt;
      this.steer(Math.atan2(-dy, -dx) + Math.sin(this.t * 2 + this.phase), def.speed * 1.5, dt);
      if (this.timer <= 0) this.state = 'wander';
    } else if (threat && (dist < def.sense * GameState.stats.senseMul || this.alertTime > 0) && this.stamina > 0) {
      if (this.state !== 'chase') this.onSpotted(ctx);
      this.state = 'chase';
      this.stamina -= dt * 0.6;
      // pack members fan out around you as they close in
      const spread = this.flank * Phaser.Math.Clamp((dist - 120) / 300, 0, 1);
      this.steer(Math.atan2(dy, dx) + spread, def.chaseSpeed ?? def.speed * 2, dt);
      if (this.stamina <= 0) {
        this.state = 'rest';
        this.timer = 2;
      }
    } else {
      this.state = 'wander';
      this.stamina = Math.min(maxStamina, this.stamina + dt * 0.5);
      this.wander(dt, def.speed);
    }
  }

  private onSpotted(ctx: StageContext): void {
    if (this.def.pack && this.alertTime <= 0) {
      ctx.say(this, 'AWOOO!', '#cfd8dc');
      ctx.alertPack(this);
    }
  }

  /** Keeps its distance, strafes, winds up and throws. Returns an angle to face, or null. */
  private updateRanged(dt: number, dist: number, dx: number, dy: number): number | null {
    const def = this.def;
    const range = def.range ?? 300;
    const toPlayer = Math.atan2(dy, dx);
    this.cooldown -= dt;
    if (dist > def.sense * GameState.stats.senseMul) {
      this.state = 'wander';
      this.wander(dt, def.speed * 0.6);
      return null;
    }
    if (this.cooldown <= 0 && dist < range * 1.3) {
      // reuse the spit wind-up/throw path
      this.state = 'spitAim';
      this.timer = RANGED_WINDUP;
      this.aimAngle = toPlayer;
      this.cooldown = (def.shootCooldown ?? 2.5) * Phaser.Math.FloatBetween(0.85, 1.2);
      return toPlayer;
    }
    this.state = 'chase';
    if (dist < range * 0.6) this.steer(toPlayer + Math.PI, def.fleeSpeed ?? def.speed * 1.6, dt);
    else if (dist > range) this.steer(toPlayer, def.speed, dt);
    else this.steer(toPlayer + Math.PI / 2 * Math.sign(Math.sin(this.phase)), def.speed * 0.6, dt);
    return toPlayer;
  }

  /** Stalk (optional), wind up, then lunge in a straight line. */
  private updateCharge(dt: number, dist: number, dx: number, dy: number, threat: boolean, playerRadius: number): void {
    const def = this.def;
    const senseMul = GameState.stats.senseMul;
    this.cooldown -= dt;
    if (this.state === 'rest') {
      this.timer -= dt;
      this.wander(dt, def.speed * 0.6);
      if (this.timer <= 0) this.state = 'wander';
      return;
    }
    if (threat && this.cooldown <= 0 && dist < def.sense * senseMul + playerRadius) {
      this.state = 'aim';
      this.timer = def.windup ?? 0.6;
      this.aimAngle = Math.atan2(dy, dx);
      return;
    }
    if (threat && def.stalkSpeed && dist < (def.stalkRange ?? 300) * senseMul) {
      this.state = 'chase';
      this.steer(Math.atan2(dy, dx), def.stalkSpeed, dt);
      return;
    }
    this.state = 'wander';
    this.wander(dt, def.speed * (this.cooldown > 0 ? 0.6 : 1));
  }

  /** Returns an angle to face, or null to face movement. */
  private updateTongue(dt: number, dist: number, dx: number, dy: number, threat: boolean, ctx: StageContext): number | null {
    const range = this.def.tongueRange ?? 120;
    this.cooldown -= dt;

    if (this.state === 'windup') {
      this.timer -= dt;
      this.brake(dt);
      if (this.timer <= 0) {
        // aim slightly ahead of the player
        const p = ctx.player;
        let tx = p.x + p.vx * 0.12 - this.mouthX();
        let ty = p.y + p.vy * 0.12 - this.mouthY();
        const len = Math.hypot(tx, ty);
        if (len > range) {
          tx = (tx / len) * range;
          ty = (ty / len) * range;
        }
        this.tongue = { tx, ty, t: 0, hit: false };
        this.state = 'tongue';
      }
      return Math.atan2(dy, dx);
    }

    if (this.state === 'tongue' && this.tongue) {
      const tg = this.tongue;
      tg.t += dt;
      this.brake(dt);
      const tip = this.tongueTip();
      if (tip && !tg.hit && tg.t < TONGUE_OUT + TONGUE_HOLD) {
        const p = ctx.player;
        if (Math.hypot(p.x - tip.x, p.y - tip.y) < p.radius + 4 && this.threatTo(p)) {
          tg.hit = true;
          ctx.hurtPlayer(this.def.damage, this.x, this.y, `a ${this.name}'s tongue`, this);
        }
      }
      if (tg.t >= TONGUE_OUT + TONGUE_HOLD + TONGUE_BACK) {
        this.tongue = null;
        this.state = 'wander';
        this.cooldown = TONGUE_COOLDOWN;
      }
      return Math.atan2(tg.ty, tg.tx);
    }

    if (threat && this.cooldown <= 0 && dist < range * Math.min(1, GameState.stats.senseMul + 0.3) + ctx.player.radius) {
      this.state = 'windup';
      this.timer = WINDUP_TIME;
      return Math.atan2(dy, dx);
    }

    this.state = 'wander';
    this.wander(dt, this.def.speed);
    return null;
  }

  private mouthX(): number { return this.x + Math.cos(this.sprite.rotation) * this.size * 0.85; }
  private mouthY(): number { return this.y + Math.sin(this.sprite.rotation) * this.size * 0.85; }

  /** Current world position of the tongue tip, or null. */
  tongueTip(): { x: number; y: number; mx: number; my: number } | null {
    if (!this.tongue) return null;
    const { t, tx, ty } = this.tongue;
    let k: number;
    if (t < TONGUE_OUT) k = t / TONGUE_OUT;
    else if (t < TONGUE_OUT + TONGUE_HOLD) k = 1;
    else k = 1 - (t - TONGUE_OUT - TONGUE_HOLD) / TONGUE_BACK;
    k = Phaser.Math.Clamp(k, 0, 1);
    const mx = this.mouthX();
    const my = this.mouthY();
    return { x: mx + tx * k, y: my + ty * k, mx, my };
  }

  // ------------------------------------------------------------ movement

  /** Grazers (walking prey) now and then walk to the nearest pool and drink. Returns true while busy. */
  private goDrink(dt: number, pools: StageContext['pools']): boolean {
    if (!pools.length || this.def.hopper || this.def.flying || this.def.damage > 0) return false;
    if (this.drinking > 0) {
      this.drinking -= dt;
      this.brake(dt);
      if (this.drinking <= 0) {
        this.thirst = Phaser.Math.FloatBetween(15, 30);
        this.heading += Math.PI;
      }
      return true;
    }
    this.thirst -= dt;
    if (this.thirst > 0) return false;
    let best = pools[0];
    let bd = Infinity;
    for (const pl of pools) {
      const d = Math.hypot(pl.x - this.x, pl.y - this.y) - pl.r;
      if (d < bd) {
        bd = d;
        best = pl;
      }
    }
    if (bd < this.radius * 0.5) {
      this.drinking = Phaser.Math.FloatBetween(3, 6);
      return true;
    }
    this.heading = Math.atan2(best.y - this.y, best.x - this.x);
    this.steer(this.heading, this.def.speed, dt);
    return true;
  }

  private wander(dt: number, speed: number): void {
    if (this.def.hopper) {
      this.hopTimer -= dt;
      if (this.hopTimer <= 0) {
        this.hopping = !this.hopping;
        if (this.hopping) {
          this.heading += Phaser.Math.FloatBetween(-1.2, 1.2);
          this.vx = Math.cos(this.heading) * speed;
          this.vy = Math.sin(this.heading) * speed;
          this.hopTimer = 0.3;
        } else {
          this.hopTimer = Phaser.Math.FloatBetween(1.2, 3);
        }
      }
      if (!this.hopping) this.brake(dt);
      return;
    }
    const erratic = this.def.erratic ?? 0.2;
    this.heading += (Math.sin(this.t * 1.3 + this.phase) * 0.8 + (Math.random() - 0.5) * erratic * 6) * dt;
    this.steer(this.heading, speed, dt);
  }

  private steer(angle: number, speed: number, dt: number): void {
    const k = Math.min(1, dt * (this.def.accel ?? 5));
    this.vx += (Math.cos(angle) * speed - this.vx) * k;
    this.vy += (Math.sin(angle) * speed - this.vy) * k;
  }

  private brake(dt: number): void {
    const k = Math.max(0, 1 - dt * 6);
    this.vx *= k;
    this.vy *= k;
  }

  private integrate(dt: number, W: number, faceTarget: number | null): void {
    const r = this.radius;
    let x = this.x + this.vx * dt;
    let y = this.y + this.vy * dt;
    // bounce off world edges and turn back inward
    if (x < r || x > W - r) {
      this.vx = -this.vx;
      this.heading = Math.PI - this.heading;
      x = Phaser.Math.Clamp(x, r, W - r);
    }
    if (y < r || y > W - r) {
      this.vy = -this.vy;
      this.heading = -this.heading;
      y = Phaser.Math.Clamp(y, r, W - r);
    }
    this.sprite.setPosition(x, y);

    const target = faceTarget ?? (Math.hypot(this.vx, this.vy) > 8 ? Math.atan2(this.vy, this.vx) : null);
    if (target !== null) this.sprite.rotation = Phaser.Math.Angle.RotateTo(this.sprite.rotation, target, dt * 8);
  }

  private updateVisual(): void {
    const base = this.size / BODY_RADIUS;
    let sx = base;
    let sy = base;
    if (this.def.flying) {
      const buzz = 1 + Math.sin(this.t * 40 + this.phase) * 0.04;
      sx *= buzz;
      sy *= buzz;
    }
    if (this.state === 'windup' || this.state === 'aim' || this.state === 'spitAim') {
      // squash before the tongue snaps / the lunge / the throw
      sx *= 0.86;
      sy *= 1.12;
    } else if (this.state === 'slam') {
      // rear up and swell before slamming down
      const k = 1 + 0.18 * this.slamProgress();
      sx *= k;
      sy *= k;
    }
    this.sprite.setScale(sx, sy);
  }

  destroy(): void {
    this.alive = false;
    this.sprite.destroy();
  }
}
