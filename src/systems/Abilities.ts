import Phaser from 'phaser';
import { COLORS } from '../config';
import { creatureDef } from '../data/scaling';
import {
  swarmInterval,
  ADRENALINE_THRESHOLD,
  RUSH_TIME,
  BREATH_STAGE,
  CHARGE_STAGE,
  FANGS_STAGE,
  POUNCE_STAGE,
  WHIP_INTERVAL,
  breathDamage,
  dashCooldown,
  quillCount,
  quillDamage,
  quillInterval,
  shockRadius,
  shockStun,
  venomCooldown,
  venomStunTime,
  whipDamage,
  whipRadius,
} from '../data/traits';
import {
  PARALYZE_TIME,
  STING_TIME,
  SWARM_CLOUD_TIME,
  WAVE_HALF,
  WAVE_LENGTH,
  LIFT_HP_SHARE,
  LIFT_MAX_RATIO,
  LIFT_TIME,
  STORM_TARGETS,
  AERIAL_DASH,
  DIVE_DAMAGE,
  DIVE_RADIUS,
  DIVE_TIME,
  FRENZY_DURATION,
  PACK_DURATION,
  ROLL_HP_SHARE,
  ROLL_MAX_RATIO,
  ROLL_MIN_DAMAGE,
  ROLL_TIME,
  SIGNATURES,
  SUBMERGE_SPEED,
  TAIL_DROP_COOLDOWN,
  CRUSH_TIME,
  CRUSH_HP_SHARE,
  CARRY_MAX_RATIO,
  CARRY_HP_SHARE,
  CARRY_DRAG,
  CARRY_MAX_PREY,
  CARRY_MIN_HOLD,
  CARRY_SPLASH_SHARE,
  CARRY_TIME,
  RALLY_DRONES,
  RALLY_TIME,
  SCENT_TIME,
  SCENT_SPEED,
  SCENT_BITE,
  signatureUpgraded,
} from '../data/signatures';
import { GameState } from '../state/GameState';
import { Achievements, CRUSH_KILLS, SCENT_KILLS } from '../state/Achievements';
import { Ally } from '../entities/Ally';
import { Sfx } from '../audio/Sfx';
import type { Creature } from '../entities/Creature';
import type { StageScene } from '../scenes/StageScene';

const DASH_DURATION = 0.2;
/** Nimble rank 3: how long the dash decoy distracts predators. */
const DECOY_TIME = 1.5;
const DASH_SPEED_MUL = 3.2;
const GLOB_LIFE = 0.7;
const GLOB_SPEED = 380;
const BREATH_LIFE = 0.35;
const BREATH_HALF_ANGLE = 0.55;
const SNATCH_TIME = 0.4;
const TONGUE_OUT = 0.15;
const TONGUE_REEL = 0.2;
const LURE_TIME = 3;
const SHELL_COOLDOWN = 15;
const SHELL_COOLDOWN_FAST = 8;
const QUAKE_INTERVAL = 4;
/** Prey skewered by quills is collected at this share of its value. */
const SKEWER_SHARE = 0.7;
/** Dive Bomb and Thunderclap catch several meals at once, each at this share of its value. */
const AOE_MEAL_SHARE = 0.6;
const FANG_STUN_COOLDOWN = 2.5;
/** Signatures that take a share of a fighter's health hit a boss for at most this much (before biteMul). */
const BOSS_SHARE_CAP = 90;

/** Damage that takes a share of max health (Death Roll, Talon Lift...), capped against bosses. */
const shareDamage = (c: Creature, share: number, min: number): number =>
  Math.max(min, Math.min(c.maxHp * share, c.boss ? BOSS_SHARE_CAP : Infinity)) * GameState.stats.biteMul;
const GOLDEN_INTERVAL = 20;
const BULLET_TIME = 0.7;
const BULLET_SCALE = 0.35;
const BULLET_COOLDOWN = 3;
const UNDYING_MEALS = 30;
/** Magnets pull prey up to this fraction of your size. */
const MAGNET_MAX_RATIO = 0.6;

interface Glob {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  r: number;
  life: number;
  pierce: number;
  hit: Set<Creature>;
}

interface Quill {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  hit: Set<Creature>;
}

interface Cone {
  x: number;
  y: number;
  angle: number;
  len: number;
  half: number;
  life: number;
}

/** A patch of toxic gas: stuns anything that wanders in. */
interface Cloud {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  color: number;
}

interface TongueLash {
  angle: number;
  maxLen: number;
  t: number;
  grabbed: Creature | null;
  /** 'out' = extending, 'reel' = pulling back (with or without a catch). */
  phase: 'out' | 'reel';
  reelFrom: number;
}

/**
 * Everything the player can do beyond moving and eating: trait abilities (venom, dash),
 * the stage's signature ability, passive traits, rank unlocks and fusions.
 */
export class Abilities {
  allies: Ally[] = [];
  /** Lizard tail decoy that predators chase. */
  lure: { x: number; y: number; life: number; sprite: Phaser.GameObjects.Image } | null = null;
  /** Bullet time from Predator Instinct: creatures run at this fraction of speed. */
  creatureTimeScale = 1;
  shield = 0;

  private globs: Glob[] = [];
  private quills: Quill[] = [];
  private cones: Cone[] = [];
  private clouds: Cloud[] = [];
  private rings: Ring[] = [];
  private dashCharges = 1;
  private wasDashing = false;
  private pounceHits = new Set<Creature>();
  private dashStunned = new Set<Creature>();
  private afterimageTimer = 0;
  private cloudTimer = 0;
  private snatchTarget: Creature | null = null;
  private snatchTime = 0;
  private tongue: TongueLash | null = null;
  /** Dive Bomb in progress (seconds since take-off). */
  private dive: number | null = null;
  /** Talon Lift in progress. */
  private lift: { targets: Creature[]; t: number; carry: boolean } | null = null;
  /** Bone-Crush Bite lunge in progress. */
  private crush: { t: number; hit: boolean } | null = null;
  /** Blood Scent: seconds left, and kills made during this one. */
  private scentTime = 0;
  private scentKills = 0;
  /** Adrenaline: seconds of Rush left. */
  private rushTime = 0;
  /** True while allies' kills are being handled (they don't charge your signature). */
  private byAlly = false;
  /** Paralyzing Sting lunge in progress. */
  private sting: { t: number; hit: boolean } | null = null;
  /** Swarm Cloud: seconds left, and time to the next sting tick. */
  private swarmCloud = 0;
  private swarmTick = 0;
  /** Tidal Wave fronts being drawn. */
  private waves: { x: number; y: number; angle: number; r: number; maxR: number; life: number }[] = [];
  /** Thunderclap bolts being drawn. */
  private bolts: { x1: number; y1: number; x2: number; y2: number; life: number }[] = [];
  /** Death Roll in progress. */
  private roll: { target: Creature; t: number } | null = null;
  private splashTimer = 0;
  /** Crocodile in a pool: hidden and faster. */
  private submerged = false;
  private tailDropCd = 0;
  private frenzyTime = 0;
  private gluttonFrenzy = 0;
  private quillTimer = 0;
  private whipTimer = WHIP_INTERVAL;
  private swarmTimer = 25;
  private quakeTimer = QUAKE_INTERVAL;
  /** Creatures already stunned by this Stampede contact (cleared when they recover). */
  private trampled = new Set<Creature>();
  private goldenTimer = GOLDEN_INTERVAL;
  private shellCd = 0;
  private stillTime = 0;
  private vanishTime = 0;
  private movingTime = 0;
  private wasLow = false;
  private lastStandCd = 0;
  private undyingMeals = 0;
  private bulletTime = 0;
  private bulletCd = 0;
  private plagueTick = 0;
  private hidden = false;
  /** Hidden by camouflage (standing still or vanishing), the only hiding that powers ambushes. */
  private stealth = false;
  /** Armor rank 3 bubble, ready to block a hit. */
  private shellUp = false;

  constructor(private readonly s: StageScene) {
    this.dashCharges = this.maxDashCharges();
  }

  private get p() {
    return this.s.player;
  }

  private get stageIndex(): number {
    return GameState.stageIndex;
  }

  // ------------------------------------------------------------ queries used by the stage

  get hiddenFromPredators(): boolean {
    return this.hidden || this.airborne;
  }

  get hiddenFromPrey(): boolean {
    // up in the air (Dive Bomb) or under water (Submerge), prey loses sight of you
    return (this.hidden && GameState.hasFusion('phantom')) || this.submerged || this.airborne;
  }

  /** Dashing or snatching (for the Swift's secret condition). */
  get inBurst(): boolean {
    return this.p.dashing || this.snatchTarget !== null;
  }

  /** Up in the air mid Dive Bomb: nothing touches you and you touch nothing. */
  get airborne(): boolean {
    return this.dive !== null || this.lift !== null;
  }

  get pouncing(): boolean {
    return this.p.dashing && this.stageIndex >= POUNCE_STAGE;
  }

  get frenzy(): boolean {
    return this.frenzyTime > 0;
  }

  /** Multiplier on player speed from momentum, adrenaline and frenzies. */
  speedMul(): number {
    let m = 1;
    if (GameState.rank('speed') >= 1 && this.movingTime > 1.5) m *= 1.2;
    if (this.rushTime > 0) m *= 1 + 0.15 * GameState.rank('adrenaline');
    if (this.frenzyTime > 0) m *= 1.3;
    if (this.gluttonFrenzy > 0) m *= 1.3;
    if (this.submerged) m *= SUBMERGE_SPEED;
    if (this.dive !== null) m *= 1.5;
    if (this.lift?.carry) m *= (this.upgraded() ? 1.4 : 1) * (1 - CARRY_DRAG * this.lift.targets.length);
    if (this.scentTime > 0 && this.headingForScent()) m *= SCENT_SPEED;
    return m;
  }

  regenMul(): number {
    // Blood Rage doubles regen below half health
    return this.bloodRage() ? 2 : 1;
  }

  knockbackMul(): number {
    // the Roc is simply too heavy to shove around
    return GameState.rank('armor') >= 1 || GameState.hasFusion('juggernaut') || this.s.stage.signature === 'carry' ? 0 : 1;
  }

  biteCooldown(): number {
    return GameState.rank('size') >= 1 ? 0.22 : 0.45;
  }

  comboWindow(): number {
    return 1.6 + (GameState.rank('glutton') >= 2 ? 0.8 : 0) + (GameState.hasFusion('blackhole') ? 1 : 0);
  }

  /** Pull radius (world px) and speed for the magnet trait. */
  magnet(): { range: number; speed: number } {
    let range = GameState.stats.magnetRange * this.p.radius;
    let speed = 110 * this.s.growthScale();
    if (GameState.rank('magnet') >= 2) speed *= 1.5;
    if (GameState.hasFusion('blackhole')) {
      range *= 1.3;
      speed *= 1.5;
    }
    return { range, speed };
  }

  /** The magnet only drags small prey; rank 3 also drags stunned foes and carcasses. */
  pullsCreature(c: Creature): boolean {
    if (c.edibleBy(this.p) && c.size < this.p.size * MAGNET_MAX_RATIO) return true;
    return GameState.rank('magnet') >= 3 && (c.stunned || c.defeated);
  }

  /** Adrenaline: a burst of speed after you eat or dash. */
  private rush(): void {
    if (GameState.rank('adrenaline') > 0) this.rushTime = RUSH_TIME;
  }

  private maxDashCharges(): number {
    return GameState.rank('wings') >= 2 ? 2 : 1;
  }

  // ------------------------------------------------------------ per-frame update

  update(dt: number): void {
    const cd = GameState.cooldowns;
    const p = this.p;
    cd.venom = Math.max(0, cd.venom - dt);
    cd.signature = Math.max(0, cd.signature - dt);
    this.tailDropCd -= dt;
    this.frenzyTime = Math.max(0, this.frenzyTime - dt);
    this.gluttonFrenzy = Math.max(0, this.gluttonFrenzy - dt);
    this.shellCd -= dt;
    this.lastStandCd -= dt;
    this.bulletCd -= dt;
    this.vanishTime -= dt;
    this.bulletTime = Math.max(0, this.bulletTime - dt);
    this.scentTime = Math.max(0, this.scentTime - dt);
    this.rushTime = Math.max(0, this.rushTime - dt);
    this.creatureTimeScale = this.bulletTime > 0 ? BULLET_SCALE : 1;

    const c = this.s.controls;
    if (c.pressed('primary')) this.fireVenom(this.s.aimAngle());
    if (c.pressed('signature')) this.useSignature();
    this.updateDash(dt, c.pressed('dash'));

    // movement-based states
    const speed = Math.hypot(p.vx, p.vy);
    const full = this.s.playerSpeed();
    const inputting = Math.hypot(this.s.inputDir.x, this.s.inputDir.y) > 0.5;
    this.movingTime = inputting ? this.movingTime + dt : 0;
    this.stillTime = speed < full * (GameState.hasFusion('phantom') ? 0.5 : 0.12) ? this.stillTime + dt : 0;
    const canHide = GameState.rank('camo') >= 1 || GameState.hasFusion('phantom');
    this.stealth = (canHide && this.stillTime > (GameState.hasFusion('phantom') ? 0.3 : 1)) || this.vanishTime > 0;
    this.hidden = this.stealth;
    // Crocodile: water hides you
    this.submerged = !!this.s.stage.submerge && this.s.inPool(p.x, p.y);
    p.inWater = this.submerged;
    if (this.submerged) this.hidden = true;

    this.updateSignature(dt);
    this.updatePassives(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateAllies(dt);
    this.updateLure(dt);

    // adrenaline: Last Stand when you first drop low
    const low = GameState.hp < GameState.stats.maxHp * ADRENALINE_THRESHOLD;
    if (low && !this.wasLow && GameState.rank('adrenaline') >= 3 && this.lastStandCd <= 0) {
      this.lastStandCd = 20;
      this.stunAround(p.radius * 5, 2, 0xff7043);
      this.s.floatText(p.x, p.y - p.radius * 2, 'LAST STAND!', '#ff8a65');
    }
    this.wasLow = low;

    const st = GameState.status;
    st.hidden = this.hidden;
    st.frenzy = this.frenzyTime;
    st.adrenaline = this.rushTime > 0;
    st.shield = this.shield;
    st.dashCharges = this.dashCharges;
    p.sprite.setAlpha(this.hidden ? 0.35 : p.sprite.alpha);
  }

  // ------------------------------------------------------------ venom

  fireVenom(angle: number): void {
    const rank = GameState.stats.venomRank;
    if (rank <= 0 || GameState.cooldowns.venom > 0 || this.s.isOver) return;
    GameState.cooldowns.venom = venomCooldown(rank);
    if (this.stageIndex >= BREATH_STAGE) {
      Sfx.play('breath');
      this.breath(angle);
      return;
    }
    Sfx.play('spit');
    const angles = rank >= 3 ? [angle - 0.25, angle, angle + 0.25] : [angle];
    for (const a of angles) this.spawnGlob(a, rank >= 2 ? 3 : 1);
  }

  private spawnGlob(angle: number, pierce: number): void {
    const p = this.p;
    const r = Math.max(3, p.size * 0.35);
    const speed = GLOB_SPEED * this.s.growthScale();
    const sprite = this.s.add
      .image(p.x + Math.cos(angle) * p.radius, p.y + Math.sin(angle) * p.radius, 'venom_glob')
      .setScale(r / 9)
      .setDepth(25);
    this.globs.push({ sprite, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, life: GLOB_LIFE, pierce, hit: new Set() });
  }

  /** Toxic Breath: a cone that stuns everything in it and burns fighters. */
  private breath(angle: number): void {
    const p = this.p;
    const rank = GameState.stats.venomRank;
    const big = rank >= 2 ? 1.3 : 1;
    const len = p.radius * 6 * big;
    const half = BREATH_HALF_ANGLE * (rank >= 2 ? 1.25 : 1);
    for (const c of this.s.creatures) {
      if (!c.alive || c.def.behavior === 'host' || c.defeated) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y);
      if (d > len + c.radius) continue;
      const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(c.y - p.y, c.x - p.x) - angle));
      if (off > half + c.radius / Math.max(d, 1)) continue;
      c.venomStun(venomStunTime(rank));
      if (c.fighter) {
        const dmg = breathDamage(rank);
        this.s.floatText(c.x, c.y - c.radius, `-${dmg}`, '#c9a6ff');
        if (c.takeDamage(dmg, p.x, p.y)) this.s.onDefeated(c);
      }
    }
    this.cones.push({ x: p.x, y: p.y, angle, len, half, life: BREATH_LIFE });
    if (rank >= 3) {
      const cx = p.x + Math.cos(angle) * len * 0.6;
      const cy = p.y + Math.sin(angle) * len * 0.6;
      this.clouds.push({ x: cx, y: cy, r: len * 0.4, life: 2.5, maxLife: 2.5 });
    }
    for (let i = 0; i < 18; i++) {
      const a = angle + Phaser.Math.FloatBetween(-half, half);
      const dist = len * Phaser.Math.FloatBetween(0.5, 1);
      this.puff(p.x, p.y, p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist, i % 2 ? 0x9b59ff : 0x76ff03, (p.radius / 20) * Phaser.Math.FloatBetween(0.8, 1.6));
    }
  }

  private puff(x: number, y: number, tx: number, ty: number, tint: number, scale: number): void {
    const puff = this.s.add.image(x, y, 'spark').setTint(tint).setScale(scale).setAlpha(0.8).setDepth(26);
    this.s.tweens.add({ targets: puff, x: tx, y: ty, alpha: 0, scale: scale * 2.5, duration: 420, ease: 'Quad.easeOut', onComplete: () => puff.destroy() });
  }

  // ------------------------------------------------------------ dash

  private updateDash(dt: number, pressed: boolean): void {
    const p = this.p;
    const rank = GameState.stats.dashRank;
    const cd = GameState.cooldowns;
    const max = this.maxDashCharges();
    const recharge = dashCooldown(rank, GameState.rank('nimble'));
    if (this.dashCharges < max) {
      cd.dash -= dt;
      if (cd.dash <= 0) {
        this.dashCharges++;
        cd.dash = this.dashCharges < max ? recharge : 0;
      }
    } else {
      cd.dash = 0;
    }

    if (pressed && rank > 0 && this.dashCharges > 0 && !this.s.isOver) {
      if (this.dashCharges === max) cd.dash = recharge;
      this.dashCharges--;
      this.rush();
      this.pounceHits.clear();
      this.dashStunned.clear();
      // without Wings (Nimble's sidestep) the dash is shorter
      const full = GameState.rank('wings') > 0 || GameState.hasFusion('sonic');
      if (GameState.rank('nimble') >= 3 && !this.lure) {
        const sprite = this.s.add.image(p.x, p.y, p.sprite.texture.key).setScale(p.sprite.scaleX).setRotation(p.sprite.rotation).setAlpha(0.6).setTint(0xaed581).setDepth(18);
        this.lure = { x: p.x, y: p.y, life: DECOY_TIME, sprite };
      }
      const aerial = this.s.stage.aerial ? AERIAL_DASH : 1;
      p.dash(this.s.inputDir.x, this.s.inputDir.y, this.s.playerSpeed() * DASH_SPEED_MUL, (full ? DASH_DURATION : DASH_DURATION * 0.55) * aerial);
      Sfx.play('dash');
    }

    if (this.wasDashing && !p.dashing) {
      if (this.stageIndex >= CHARGE_STAGE) this.shockwave();
      if (GameState.hasFusion('sonic')) this.sonicBoom();
    }
    this.wasDashing = p.dashing;

    if (p.dashing) {
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.afterimageTimer = 0.03;
        this.ghost(0x81d4fa);
      }
      // Toxic Slipstream: leave a gas trail
      if (GameState.hasFusion('slipstream')) {
        this.cloudTimer -= dt;
        if (this.cloudTimer <= 0) {
          this.cloudTimer = 0.04;
          this.clouds.push({ x: p.x, y: p.y, r: p.radius * 1.3, life: 2, maxLife: 2 });
        }
      }
      // Wings rank 3: dashing through creatures stuns them
      if (GameState.rank('wings') >= 3) {
        for (const c of this.s.creatures) {
          if (!c.alive || c.defeated || c.def.behavior === 'host' || this.dashStunned.has(c)) continue;
          if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) < p.radius + c.radius) {
            this.dashStunned.add(c);
            c.stun(1);
          }
        }
      }
    }
  }

  /** Pounce: one double-damage bite per creature per dash. */
  consumePounce(c: Creature): boolean {
    if (!this.pouncing || this.pounceHits.has(c)) return false;
    this.pounceHits.add(c);
    return true;
  }

  private ghost(tint: number): void {
    const p = this.p;
    const ghost = this.s.add
      .image(p.x, p.y, p.sprite.texture.key)
      .setRotation(p.sprite.rotation)
      .setScale(p.sprite.scaleX)
      .setTint(tint)
      .setAlpha(0.5)
      .setDepth(19);
    this.s.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  /** Earthshaking Charge: landing a dash stuns and hurts everything nearby. */
  private shockwave(): void {
    const p = this.p;
    const r = p.radius * 4;
    this.rings.push({ x: p.x, y: p.y, r, life: 0.3, maxLife: 0.3, color: 0xffffff });
    this.s.cameras.main.shake(200, 0.01);
    Sfx.play('slam');
    this.s.fx.ring(p.x, p.y, r, 0xd7ccc8, 24);
    for (const c of this.s.creatures) {
      if (!c.alive || c.def.behavior === 'host' || c.defeated) continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > r + c.radius) continue;
      c.stun(1);
      if (c.fighter && c.takeDamage(10 * GameState.stats.biteMul, p.x, p.y)) this.s.onDefeated(c);
    }
  }

  private sonicBoom(): void {
    const p = this.p;
    const r = p.radius * 3;
    this.rings.push({ x: p.x, y: p.y, r, life: 0.35, maxLife: 0.35, color: 0xaed581 });
    this.s.floatText(p.x, p.y - p.radius * 1.5, 'BOOM!', '#dcedc8');
    Sfx.play('slam', 1.5);
    for (const c of this.s.creatures) {
      if (!c.alive || c.def.behavior === 'host' || c.defeated) continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > r + c.radius) continue;
      c.push(p.x, p.y, 600);
      if (c.fighter && c.takeDamage(15, p.x, p.y)) this.s.onDefeated(c);
    }
  }

  // ------------------------------------------------------------ signature abilities

  private useSignature(): void {
    const sig = SIGNATURES[this.s.stage.signature];
    // Carry Off: a second press lets go early, once the take-off has settled
    if (this.lift?.carry && this.lift.t > CARRY_MIN_HOLD) {
      this.p.invuln = Math.min(this.p.invuln, 0.15);
      this.dropCarried();
      return;
    }
    if (!sig.key || GameState.cooldowns.signature > 0 || this.s.isOver) return;
    const p = this.p;
    let used = true;
    switch (sig.id) {
      case 'snatch':
        used = this.startSnatch();
        break;
      case 'tongue':
        Sfx.play('tongue');
        this.tongue = { angle: this.s.aimAngle(), maxLen: p.radius * 7, t: 0, grabbed: null, phase: 'out', reelFrom: 0 };
        break;
      case 'pack':
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          this.allies.push(
            new Ally(this.s, this.s.stage.playerTexture, p.x + Math.cos(a) * p.radius * 2.5, p.y + Math.sin(a) * p.radius * 2.5, p.size * 0.7, PACK_DURATION),
          );
        }
        this.rings.push({ x: p.x, y: p.y, r: p.radius * 4, life: 0.4, maxLife: 0.4, color: 0xffcc80 });
        this.s.floatText(p.x, p.y - p.radius * 1.6, 'SKREEEE!', '#ffcc80');
        Sfx.play('pack');
        break;
      case 'roll':
        used = this.startRoll();
        break;
      case 'sting': {
        const a = this.s.aimAngle();
        p.dash(Math.cos(a), Math.sin(a), this.s.playerSpeed() * 3, STING_TIME);
        this.sting = { t: STING_TIME, hit: false };
        Sfx.play('dash', 1.6);
        break;
      }
      case 'brood':
      case 'royal': {
        const royal = sig.id === 'royal';
        const n = royal ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.allies.push(
            new Ally(this.s, 'wasp', p.x + Math.cos(a) * p.radius * 2.2, p.y + Math.sin(a) * p.radius * 2.2, p.size * (royal ? 0.6 : 0.5), royal ? 20 : 14),
          );
        }
        this.rings.push({ x: p.x, y: p.y, r: p.radius * 3.5, life: 0.4, maxLife: 0.4, color: 0xffd54f });
        this.s.floatText(p.x, p.y - p.radius * 1.6, royal ? 'RISE, MY SOLDIERS!' : 'BZZZZ!', '#ffd54f');
        Sfx.play('pack', 1.6);
        break;
      }
      case 'swarmcloud':
        this.swarmCloud = SWARM_CLOUD_TIME;
        this.swarmTick = 0;
        Sfx.play('breath', 1.4);
        break;
      case 'lift':
        used = this.startLift(false);
        break;
      case 'carry':
        used = this.startLift(true);
        break;
      case 'crush': {
        const a = this.s.aimAngle();
        p.dash(Math.cos(a), Math.sin(a), this.s.playerSpeed() * 3, CRUSH_TIME);
        this.crush = { t: CRUSH_TIME, hit: false };
        Sfx.play('dash', 0.8);
        break;
      }
      case 'rally':
        this.rally();
        break;
      case 'scent':
        this.scentTime = SCENT_TIME * (this.upgraded() ? 1.5 : 1);
        this.scentKills = 0;
        Sfx.play('breath', 0.5);
        this.rings.push({ x: p.x, y: p.y, r: p.radius * 6, life: 0.6, maxLife: 0.6, color: 0xff1744 });
        this.s.floatText(p.x, p.y - p.radius * 1.6, 'BLOOD IN THE WATER', '#ff8a80');
        break;
      case 'storm':
        used = this.thunderclap();
        break;
      case 'wave':
        this.tidalWave(this.s.aimAngle());
        break;
      case 'dive':
        this.dive = 0;
        p.invuln = Math.max(p.invuln, DIVE_TIME + 0.1);
        Sfx.play('dash', 0.7);
        this.s.floatText(p.x, p.y - p.radius * 1.6, 'UP!', '#90caf9');
        break;
      case 'frenzy':
        this.frenzyTime = FRENZY_DURATION;
        Sfx.play('frenzy');
        this.s.fx.ring(p.x, p.y, p.radius * 3, 0xff1744, 28);
        this.s.cameras.main.shake(250, 0.008);
        this.s.toast('APEX FRENZY! Eat EVERYTHING.');
        break;
    }
    // Wings III: Carry Off recharges 2s sooner
    const faster = sig.id === 'carry' && this.upgraded() ? 2 : 0;
    if (used) GameState.cooldowns.signature = sig.cooldown - faster;
  }

  /** The closest thing in grabbing reach that isn't already held. */
  private nearestLiftable(maxRatio: number, held: Creature[] = []): Creature | null {
    const p = this.p;
    let best: Creature | null = null;
    let bd = p.radius * 1.5;
    for (const c of this.s.creatures) {
      if (!c.alive || c.boss || c.def.behavior === 'host' || c.size > p.size * maxRatio || held.includes(c)) continue;
      const gap = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) - c.radius - p.radius;
      if (gap < bd) {
        bd = gap;
        best = c;
      }
    }
    return best;
  }

  /** Talon Lift (or the Roc's Carry Off): grab the closest thing in reach and take off with it. */
  private startLift(carry: boolean): boolean {
    const p = this.p;
    const best = this.nearestLiftable(carry ? CARRY_MAX_RATIO : LIFT_MAX_RATIO);
    if (!best) {
      this.s.floatText(p.x, p.y - p.radius * 1.5, 'nothing in reach', '#b0bec5');
      return false;
    }
    this.lift = { targets: [best], t: 0, carry };
    p.invuln = Math.max(p.invuln, (carry ? CARRY_TIME : LIFT_TIME) + 0.15);
    Sfx.play('dash', 0.6);
    this.s.floatText(p.x, p.y - p.radius * 1.6, carry ? 'MINE NOW!' : 'UP YOU GO!', '#ffcc80');
    return true;
  }

  /** Your rank-III trait powers up this form's signature (see SIGNATURE_UPGRADES). */
  private upgraded(): boolean {
    return signatureUpgraded(this.s.stage.signature, (t) => GameState.rank(t));
  }

  /** Rally: soldier drones that all go for whatever is nearest where you aim. */
  private rally(): void {
    const p = this.p;
    const a = this.s.aimAngle();
    const ax = p.x + Math.cos(a) * p.radius * 5;
    const ay = p.y + Math.sin(a) * p.radius * 5;
    let focus: Creature | null = null;
    let bd = p.radius * 12;
    for (const c of this.s.creatures) {
      // drones eat whatever harmless thing they touch, so only order them onto fighters or food
      if (!c.alive || c.defeated || c.def.behavior === 'host' || (!c.fighter && !c.edibleBy(p))) continue;
      const d = Phaser.Math.Distance.Between(ax, ay, c.x, c.y);
      if (d < bd) {
        bd = d;
        focus = c;
      }
    }
    const drones = RALLY_DRONES + (this.upgraded() ? 1 : 0);
    for (let i = 0; i < drones; i++) {
      const k = (i / drones) * Math.PI * 2;
      const drone = new Ally(this.s, 'wasp', p.x + Math.cos(k) * p.radius * 2, p.y + Math.sin(k) * p.radius * 2, p.size * 0.5, RALLY_TIME);
      drone.focus = focus;
      drone.rally = true;
      this.allies.push(drone);
    }
    if (focus) {
      this.rings.push({ x: focus.x, y: focus.y, r: focus.radius * 1.6, life: 0.5, maxLife: 0.5, color: 0xffd54f });
      this.s.floatText(focus.x, focus.y - focus.radius * 1.4, 'ATTACK!', '#ffd54f');
    } else this.s.floatText(p.x, p.y - p.radius * 1.6, 'TO ME!', '#ffd54f');
    Sfx.play('pack', 1.4);
  }

  /** Blood Scent marks: anything bleeding, hurt or already dead. */
  private scented(c: Creature): boolean {
    return c.alive && c.def.behavior !== 'host' && (c.defeated || (c.fighter && c.hp < c.maxHp));
  }

  /** Blood Scent: you are swimming toward one of the marked creatures. */
  private headingForScent(): boolean {
    const p = this.p;
    if (Math.hypot(p.vx, p.vy) < 10) return false;
    const heading = Math.atan2(p.vy, p.vx);
    return this.s.creatures.some(
      (c) => this.scented(c) && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(c.y - p.y, c.x - p.x) - heading)) < 0.6,
    );
  }

  /** Bone-Crush Bite connects: small enough dies outright, bigger is stunned and hurt. */
  private crushBite(c: Creature): void {
    const p = this.p;
    Sfx.play('crit', 0.8);
    this.s.cameras.main.shake(120, 0.006);
    this.rings.push({ x: c.x, y: c.y, r: c.radius * 1.4, life: 0.3, maxLife: 0.3, color: 0xffab40 });
    if (!c.boss && c.size <= p.size) {
      this.s.floatText(c.x, c.y - c.radius, 'CRUNCH!', '#ffab40');
      if (c.fighter && c.takeDamage(c.hp, p.x, p.y, false)) this.s.onDefeated(c);
      this.s.eat(c);
      this.crushKill();
      return;
    }
    c.stun(2);
    if (!c.fighter) return;
    // Venom III: the bite poisons what it can't kill
    if (this.upgraded()) c.bleed(8, 4, 2);
    const dmg = shareDamage(c, CRUSH_HP_SHARE, 30);
    const defeated = c.takeDamage(dmg, p.x, p.y);
    this.s.floatText(c.x, c.y - c.radius, `-${Math.round(dmg)}`, '#ffab40');
    this.afterBite(c, dmg, defeated);
    if (defeated) {
      this.s.onDefeated(c);
      this.crushKill();
    }
  }

  /** Bone Collector: counts Bone-Crush kills over the run. */
  private crushKill(): void {
    if (++GameState.crushKills >= CRUSH_KILLS) Achievements.unlock('bone_collector');
  }

  /** Called for every kill you make (eaten alive or defeated): Blood in the Water counts them. */
  countKill(): void {
    // long signatures charge up as you hunt
    const charge = SIGNATURES[this.s.stage.signature].killCharge;
    if (charge && !this.byAlly) GameState.cooldowns.signature = Math.max(0, GameState.cooldowns.signature - charge);
    // Adrenaline II: kills speed up the dash recharge
    if (GameState.rank('adrenaline') >= 2 && this.dashCharges < this.maxDashCharges()) GameState.cooldowns.dash = Math.max(0, GameState.cooldowns.dash - 1);
    if (this.scentTime > 0 && ++this.scentKills >= SCENT_KILLS) Achievements.unlock('blood_in_water');
  }

  /** Lets go of everything being carried, each falling where it hangs. */
  private dropCarried(): void {
    const lift = this.lift;
    if (!lift) return;
    this.lift = null;
    for (const c of lift.targets) if (c.alive) this.dropLifted(c, lift.carry);
  }

  /** Talon Lift drop: the victim crashes down and everything around it is stunned (Carry Off: and hurt). */
  private dropLifted(c: Creature, carry: boolean): void {
    const p = this.p;
    const r = c.radius * (carry ? 3 : 2.5) + p.radius;
    Sfx.play('slam', 1.1);
    this.s.cameras.main.shake(140, 0.006);
    this.rings.push({ x: c.x, y: c.y, r, life: 0.35, maxLife: 0.35, color: 0xffcc80 });
    for (const o of this.s.creatures) {
      if (o === c || !o.alive || o.def.behavior === 'host') continue;
      if (Phaser.Math.Distance.Between(c.x, c.y, o.x, o.y) > r + o.radius) continue;
      o.stun(1.5);
      if (carry) Achievements.unlock('air_mail');
      if (carry && o.fighter && o.takeDamage(shareDamage(o, CARRY_SPLASH_SHARE, 20), c.x, c.y)) this.s.onDefeated(o);
    }
    if (c.defeated || !c.fighter) {
      this.s.eat(c);
      return;
    }
    const dmg = shareDamage(c, carry ? CARRY_HP_SHARE : LIFT_HP_SHARE, 30);
    const defeated = c.takeDamage(dmg, p.x, p.y);
    this.s.floatText(c.x, c.y - c.radius, `-${Math.round(dmg)}`, '#ff8a65');
    this.afterBite(c, dmg, defeated);
    if (defeated) this.s.onDefeated(c);
    else c.stun(1.5);
  }

  /** Tidal Wave: a cone ahead sweeps small prey into your mouth and shoves the rest. */
  private tidalWave(angle: number): void {
    const p = this.p;
    const len = p.radius * WAVE_LENGTH;
    Sfx.play('breath', 0.6);
    this.s.cameras.main.shake(160, 0.005);
    this.waves.push({ x: p.x, y: p.y, angle, r: p.radius, maxR: len, life: 0.5 });
    for (const c of [...this.s.creatures]) {
      if (!c.alive || c.def.behavior === 'host') continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y);
      if (d > len + c.radius) continue;
      if (Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(c.y - p.y, c.x - p.x) - angle)) > WAVE_HALF) continue;
      if (c.edibleBy(p)) {
        this.s.eat(c, AOE_MEAL_SHARE);
        continue;
      }
      c.stun(1.5);
      c.push(p.x, p.y, 650);
      if (c.fighter) {
        const dmg = shareDamage(c, 0.2, 25);
        this.s.floatText(c.x, c.y - c.radius, `-${Math.round(dmg)}`, '#80deea');
        if (c.takeDamage(dmg, p.x, p.y, false)) this.s.onDefeated(c);
      }
    }
  }

  /** Thunderclap: lightning on the nearest creatures. */
  private thunderclap(): boolean {
    const p = this.p;
    const targets = this.s.creatures
      .filter((c) => c.alive && !c.defeated && c.def.behavior !== 'host')
      .map((c) => ({ c, d: Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) }))
      .filter((t) => t.d < p.radius * 8)
      .sort((a, b) => a.d - b.d)
      .slice(0, STORM_TARGETS);
    if (!targets.length) {
      this.s.floatText(p.x, p.y - p.radius * 1.5, 'no targets', '#b0bec5');
      return false;
    }
    Sfx.play('slam', 1.5);
    Sfx.play('crit');
    this.s.cameras.main.flash(180, 220, 230, 255);
    for (const { c } of targets) {
      this.bolts.push({ x1: c.x + Phaser.Math.Between(-30, 30), y1: c.y - p.radius * 6, x2: c.x, y2: c.y, life: 0.3 });
      if (c.edibleBy(p)) {
        this.s.eat(c, AOE_MEAL_SHARE);
        continue;
      }
      c.stun(2);
      if (c.fighter) {
        const dmg = shareDamage(c, 0.25, 25);
        this.s.floatText(c.x, c.y - c.radius, `-${Math.round(dmg)}`, '#fff59d');
        if (c.takeDamage(dmg, p.x, p.y)) this.s.onDefeated(c);
      }
    }
    return true;
  }

  /** Dive Bomb landing: eat everything small underneath, stun the rest, hurt fighters. */
  private diveImpact(): void {
    const p = this.p;
    const r = p.radius * DIVE_RADIUS;
    Sfx.play('slam', 1.2);
    this.s.cameras.main.shake(150, 0.006);
    this.rings.push({ x: p.x, y: p.y, r, life: 0.35, maxLife: 0.35, color: 0x90caf9 });
    this.s.fx.ring(p.x, p.y, r, 0x90caf9, 20);
    for (const c of [...this.s.creatures]) {
      if (!c.alive || c.def.behavior === 'host') continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > r + c.radius) continue;
      if (c.edibleBy(p)) {
        this.s.eat(c, AOE_MEAL_SHARE);
        continue;
      }
      c.stun(1.5);
      if (c.fighter && c.takeDamage(DIVE_DAMAGE * GameState.stats.biteMul, p.x, p.y)) this.s.onDefeated(c);
    }
  }

  /** Death Roll: clamp onto the closest thing in reach. */
  private startRoll(): boolean {
    const p = this.p;
    let best: Creature | null = null;
    let bd = p.radius * 1.5;
    for (const c of this.s.creatures) {
      if (!c.alive || c.def.behavior === 'host' || c.size > p.size * ROLL_MAX_RATIO) continue;
      const gap = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) - c.radius - p.radius;
      if (gap < bd) {
        bd = gap;
        best = c;
      }
    }
    if (!best) {
      this.s.floatText(p.x, p.y - p.radius * 1.5, 'nothing in reach', '#b0bec5');
      return false;
    }
    this.roll = { target: best, t: 0 };
    p.invuln = Math.max(p.invuln, ROLL_TIME + 0.15);
    best.stun(ROLL_TIME + 0.5);
    Sfx.play('slam', 0.8);
    this.s.floatText(p.x, p.y - p.radius * 1.6, 'DEATH ROLL!', '#aed581');
    return true;
  }

  /** End of a Death Roll: swallow it whole, or tear a chunk out of a fighter. */
  private finishRoll(c: Creature): void {
    const p = this.p;
    if (c.defeated || !c.fighter) {
      this.s.eat(c);
      return;
    }
    Sfx.play('crit');
    const dmg = shareDamage(c, ROLL_HP_SHARE, ROLL_MIN_DAMAGE);
    const defeated = c.takeDamage(dmg, p.x, p.y);
    this.s.floatText(c.x, c.y - c.radius, `-${Math.round(dmg)}`, '#ff8a65');
    this.afterBite(c, dmg, defeated);
    if (defeated) this.s.onDefeated(c);
    else c.stun(1.2);
  }

  private startSnatch(): boolean {
    const p = this.p;
    let best: Creature | null = null;
    let bd = p.radius * 9;
    for (const c of this.s.creatures) {
      if (!c.alive || !c.edibleBy(p)) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) {
      this.s.floatText(p.x, p.y - p.radius * 1.5, 'nothing to snatch', '#b0bec5');
      return false;
    }
    this.snatchTarget = best;
    this.snatchTime = SNATCH_TIME;
    Sfx.play('dash', 1.4);
    return true;
  }

  private updateSignature(dt: number): void {
    const p = this.p;
    // Paralyzing Sting: the first thing you hit mid-lunge is stung
    const sg = this.sting;
    if (sg) {
      sg.t -= dt;
      if (!sg.hit) {
        for (const c of this.s.creatures) {
          if (!c.alive || c.defeated || c.def.behavior === 'host') continue;
          if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > p.radius + c.radius) continue;
          sg.hit = true;
          c.paralyze(PARALYZE_TIME);
          Sfx.play('crit', 1.3);
          this.s.floatText(c.x, c.y - c.radius, 'PARALYZED!', '#fff176');
          if (c.fighter) {
            const dmg = shareDamage(c, 0.15, 25);
            if (c.takeDamage(dmg, p.x, p.y, false)) this.s.onDefeated(c);
          }
          break;
        }
      }
      if (sg.t <= 0) this.sting = null;
    }

    // Bone-Crush Bite: the first thing you hit mid-lunge gets crunched
    const cr = this.crush;
    if (cr) {
      cr.t -= dt;
      if (!cr.hit) {
        for (const c of this.s.creatures) {
          if (!c.alive || c.defeated || c.def.behavior === 'host') continue;
          if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > p.radius + c.radius) continue;
          cr.hit = true;
          this.crushBite(c);
          break;
        }
      }
      if (cr.t <= 0) this.crush = null;
    }

    // Swarm Cloud: sisters sting everything around you
    if (this.swarmCloud > 0) {
      this.swarmCloud -= dt;
      this.swarmTick -= dt;
      const r = p.radius * 3.2;
      for (const c of this.s.creatures) {
        if (!c.alive || c.defeated || c.def.behavior === 'host') continue;
        const d = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y);
        if (d > r + c.radius) continue;
        if (c.edibleBy(p)) c.pull(p.x, p.y, 220 * this.s.growthScale(), dt);
        else if (this.swarmTick <= 0) {
          c.stun(0.6);
          if (c.fighter && c.takeDamage(10 * GameState.stats.biteMul, p.x, p.y, false)) this.s.onDefeated(c);
        }
      }
      if (this.swarmTick <= 0) this.swarmTick = 0.5;
    }

    // Dive Bomb: swell up as you climb, shrink back as you fall
    if (this.dive !== null) {
      this.dive += dt;
      const k = Math.min(1, this.dive / DIVE_TIME);
      p.sprite.setScale(p.sprite.scaleX * (1 + 0.7 * Math.sin(k * Math.PI)));
      p.sprite.setAlpha(0.75);
      if (this.dive >= DIVE_TIME) {
        this.dive = null;
        this.diveImpact();
      }
    }

    // Talon Lift: carry the victim below you, then drop it
    const lift = this.lift;
    if (lift) {
      lift.t += dt;
      const time = lift.carry ? CARRY_TIME : LIFT_TIME;
      const k = Math.min(1, lift.t / time);
      p.sprite.setScale(p.sprite.scaleX * (1 + 0.5 * Math.sin(k * Math.PI)));
      p.sprite.setAlpha(0.8);
      lift.targets = lift.targets.filter((c) => c.alive);
      // Carry Off sweeps up whatever you fly past until your talons are full
      if (lift.carry && lift.targets.length < CARRY_MAX_PREY) {
        const more = this.nearestLiftable(CARRY_MAX_RATIO, lift.targets);
        if (more) {
          lift.targets.push(more);
          Sfx.play('dash', 0.7 + lift.targets.length * 0.1);
          this.s.floatText(p.x, p.y - p.radius * 1.6, lift.targets.length === CARRY_MAX_PREY ? 'HOARD FULL!' : 'AND YOU!', '#ffcc80');
        }
      }
      lift.targets.forEach((c, i) => {
        c.vx = 0;
        c.vy = 0;
        c.stun(0.3);
        // the hoard hangs in an arc behind you, so each one lands somewhere different
        const a = p.sprite.rotation + Math.PI + (i - (lift.targets.length - 1) / 2) * 1.1;
        if (lift.carry) c.sprite.setPosition(p.x + Math.cos(a) * p.radius * 1.1, p.y + Math.sin(a) * p.radius * 1.1);
        else c.sprite.setPosition(p.x, p.y + p.radius * 0.4);
      });
      if (lift.t >= time || !lift.targets.length) this.dropCarried();
    }
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const w of this.waves) w.life -= dt;
    this.waves = this.waves.filter((w) => w.life > 0);

    // Death Roll: spin in place with the victim in your jaws
    const roll = this.roll;
    if (roll) {
      roll.t += dt;
      const c = roll.target;
      p.vx = 0;
      p.vy = 0;
      p.sprite.rotation += dt * 18;
      if (c.alive) {
        const a = p.sprite.rotation;
        const d = p.radius + c.radius * 0.5;
        c.vx = 0;
        c.vy = 0;
        c.sprite.setPosition(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d).setRotation(a + Math.PI / 2);
      }
      this.splashTimer -= dt;
      if (this.splashTimer <= 0) {
        this.splashTimer = 0.15;
        this.rings.push({ x: p.x, y: p.y, r: p.radius * 2.2, life: 0.25, maxLife: 0.25, color: 0x80deea });
      }
      if (roll.t >= ROLL_TIME || !c.alive) {
        this.roll = null;
        if (c.alive) this.finishRoll(c);
      }
    }

    // Snatch: home in on the target
    if (this.snatchTarget) {
      this.snatchTime -= dt;
      const t = this.snatchTarget;
      if (!t.alive || this.snatchTime <= 0) {
        this.snatchTarget = null;
      } else {
        const a = Math.atan2(t.y - p.y, t.x - p.x);
        const speed = this.s.playerSpeed() * 3.5;
        p.vx = Math.cos(a) * speed;
        p.vy = Math.sin(a) * speed;
        this.afterimageTimer -= dt;
        if (this.afterimageTimer <= 0) {
          this.afterimageTimer = 0.03;
          this.ghost(0x48cae4);
        }
      }
    }

    // Tongue Lash
    const tg = this.tongue;
    if (tg) {
      tg.t += dt;
      if (tg.phase === 'out') {
        const tip = this.tongueTip();
        for (const c of this.s.creatures) {
          if (!c.alive || c.def.behavior === 'host') continue;
          if (Phaser.Math.Distance.Between(tip.x, tip.y, c.x, c.y) > c.radius + p.radius * 0.3) continue;
          if (c.edibleBy(p)) {
            tg.grabbed = c;
            c.stun(1);
          } else {
            c.stun(1.2);
            this.s.floatText(c.x, c.y - c.radius, 'SLAP!', '#ff80ab');
            if (c.fighter && c.takeDamage(10 * GameState.stats.biteMul, p.x, p.y)) this.s.onDefeated(c);
          }
          tg.phase = 'reel';
          tg.reelFrom = Phaser.Math.Distance.Between(p.x, p.y, tip.x, tip.y);
          tg.t = 0;
          break;
        }
        if (tg.phase === 'out' && tg.t >= TONGUE_OUT) {
          tg.phase = 'reel';
          tg.reelFrom = tg.maxLen;
          tg.t = 0;
        }
      } else {
        const tip = this.tongueTip();
        if (tg.grabbed?.alive) tg.grabbed.sprite.setPosition(tip.x, tip.y);
        if (tg.t >= TONGUE_REEL) {
          if (tg.grabbed?.alive) this.s.eat(tg.grabbed);
          this.tongue = null;
        }
      }
    }
  }

  /** Current tongue tip position. */
  private tongueTip(): { x: number; y: number } {
    const p = this.p;
    const tg = this.tongue!;
    const len = tg.phase === 'out' ? tg.maxLen * Math.min(1, tg.t / TONGUE_OUT) : tg.reelFrom * Math.max(0, 1 - tg.t / TONGUE_REEL);
    return { x: p.x + Math.cos(tg.angle) * len, y: p.y + Math.sin(tg.angle) * len };
  }

  private updateLure(dt: number): void {
    if (!this.lure) return;
    this.lure.life -= dt;
    this.lure.sprite.rotation += Math.sin(this.lure.life * 25) * dt * 6;
    if (this.lure.life <= 0) {
      this.lure.sprite.destroy();
      this.lure = null;
    }
  }

  private updateAllies(dt: number): void {
    const speed = this.s.playerSpeed() * 1.05;
    // kills your packmates and drones make don't recharge the signature that summoned them
    this.byAlly = true;
    for (const a of this.allies) {
      a.update(dt, this.s.creatures, this.p, speed, this.s.stage.worldSize);
      const c = a.target;
      if (c?.alive && Phaser.Math.Distance.Between(a.x, a.y, c.x, c.y) < a.radius + c.radius * 0.8) {
        if (c.fighter) {
          if (a.biteCd <= 0) {
            a.biteCd = 0.6;
            this.s.floatText(c.x, c.y - c.radius, '-10', '#ffcc80');
            if (c.takeDamage(10 * GameState.stats.biteMul, a.x, a.y)) {
              this.s.onDefeated(c);
              if (a.rally && c.size > this.p.size) Achievements.unlock('chain_of_command');
            }
          }
        } else {
          // packmates share their kills with you
          this.s.eat(c, 0.5);
        }
      }
      if (a.life <= 0) {
        this.rings.push({ x: a.x, y: a.y, r: a.radius * 1.5, life: 0.25, maxLife: 0.25, color: 0xffcc80 });
        a.destroy();
      }
    }
    this.byAlly = false;
    this.allies = this.allies.filter((a) => a.alive);
  }

  // ------------------------------------------------------------ passive traits

  private updatePassives(dt: number): void {
    const p = this.p;

    // quills
    const qr = GameState.rank('quills');
    if (qr > 0) {
      this.quillTimer -= dt * (GameState.hasFusion('storm') ? 2 : 1);
      if (this.quillTimer <= 0) {
        this.quillTimer = quillInterval(qr);
        const n = quillCount(qr);
        const speed = 520 * this.s.growthScale();
        const off = Math.random() * Math.PI;
        Sfx.play('web');
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          const sprite = this.s.add
            .image(p.x, p.y, 'quill')
            .setRotation(a)
            .setScale(p.radius / 22)
            .setTint(GameState.hasFusion('storm') ? 0xffee58 : 0xffffff)
            .setDepth(24);
          this.quills.push({ sprite, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.45, hit: new Set() });
        }
      }
    }

    // tail whip
    const wr = GameState.rank('tailwhip');
    if (wr > 0) {
      this.whipTimer -= dt;
      if (this.whipTimer <= 0) {
        this.whipTimer = WHIP_INTERVAL;
        const r = whipRadius(wr) * p.radius;
        this.rings.push({ x: p.x, y: p.y, r, life: 0.25, maxLife: 0.25, color: 0xa1887f });
        Sfx.play('swat', 1.3);
        for (const c of this.s.creatures) {
          if (!c.alive || c.defeated || c.def.behavior === 'host') continue;
          if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > r + c.radius) continue;
          if (c.edibleBy(p)) {
            this.s.eat(c);
            continue;
          }
          c.push(p.x, p.y, 420);
          if (wr >= 3) c.stun(0.6);
          if (c.fighter) {
            this.s.floatText(c.x, c.y - c.radius, `-${whipDamage(wr)}`, '#d7ccc8');
            if (c.takeDamage(whipDamage(wr), p.x, p.y)) this.s.onDefeated(c);
          }
        }
      }
    }

    // shell (armor rank 3)
    if (GameState.rank('armor') >= 2 && this.shellCd <= 0 && !this.shellUp) {
      this.shellUp = true;
    }

    // plague aura
    if (GameState.hasFusion('plague')) {
      this.plagueTick -= dt;
      const r = p.radius * 2.5;
      for (const c of this.s.creatures) {
        if (!c.alive || !c.fighter) continue;
        if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > r + c.radius) continue;
        if (c.takeDamage(8 * dt, p.x, p.y, false)) this.s.onDefeated(c);
        else if (this.plagueTick <= 0) this.s.floatText(c.x, c.y - c.radius, '-8', '#9ccc65');
      }
      if (this.plagueTick <= 0) this.plagueTick = 1;
    }

    // pheromones: swarm call (rank 2: more often, rank 3: with a golden snack)
    const pr = GameState.rank('pheromones');
    if (pr >= 1) {
      this.swarmTimer -= dt;
      if (this.swarmTimer <= 0) {
        this.swarmTimer = swarmInterval(pr);
        const def = this.smallestPrey();
        if (def) {
          const swarm = this.s.spawnNear(def, 380 * this.s.growthScale(), 5);
          if (pr >= 3) swarm[0]?.makeGolden();
          this.s.toast('A swarm of snacks is heading your way!');
        }
      }
    }

    this.updateCapstones(dt);

    // golden feast
    if (GameState.hasFusion('golden')) {
      this.goldenTimer -= dt;
      if (this.goldenTimer <= 0) {
        this.goldenTimer = GOLDEN_INTERVAL;
        const def = this.smallestPrey();
        if (def) {
          for (const c of this.s.spawnNear(def, 420 * this.s.growthScale(), 1)) c.makeGolden();
          this.s.toast('A golden snack appeared nearby!');
        }
      }
    }
  }

  /** Per-frame rank-3 (and Silent rank 2) effects. */
  private updateCapstones(dt: number): void {
    const p = this.p;
    const fullSpeed = this.movingTime > 1.5;

    // Speed 3, Stampede: run into creatures at full speed to bowl them over
    if (GameState.rank('speed') >= 3 && fullSpeed) {
      for (const c of this.s.creatures) {
        if (!c.alive || c.defeated || c.def.behavior === 'host' || c.edibleBy(p) || c.size > p.size * 2) continue;
        if (c.stunned || this.trampled.has(c)) continue;
        if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > p.radius + c.radius) continue;
        this.trampled.add(c);
        c.stun(1);
        c.push(p.x, p.y, 500);
        this.s.floatText(c.x, c.y - c.radius, 'TRAMPLED', '#fff59d');
      }
    }
    for (const c of this.trampled) if (!c.alive || !c.stunned) this.trampled.delete(c);

    // Size 3, Quake Step: stomping stuns smaller creatures nearby
    if (GameState.rank('size') >= 3 && this.movingTime > 0.5) {
      this.quakeTimer -= dt;
      if (this.quakeTimer <= 0) {
        this.quakeTimer = QUAKE_INTERVAL;
        const r = p.radius * 3;
        this.rings.push({ x: p.x, y: p.y, r, life: 0.3, maxLife: 0.3, color: 0xff9f43 });
        Sfx.play('slam', 1.6);
        for (const c of this.s.creatures) {
          if (!c.alive || c.defeated || c.def.behavior === 'host' || c.size >= p.size) continue;
          if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) < r + c.radius) c.stun(0.8);
        }
      }
    }

    // Silent 2, Startle: prey that hasn't noticed you freezes when you sneak close
    if (GameState.rank('silent') >= 2) {
      for (const c of this.s.creatures) {
        if (!c.alive || c.noticed || c.startled || !c.edibleBy(p)) continue;
        if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > p.radius * 3 + c.radius) continue;
        c.startled = true;
        c.stun(1);
      }
    }
  }

  /** The stage's smallest harmless prey type (for swarm calls and golden snacks). */
  private smallestPrey() {
    const defs = this.s.stage.spawns
      .map((sp) => creatureDef(sp.creature, this.s.stage))
      .filter((d) => d.damage === 0 && d.behavior === 'wander' && !d.hp);
    defs.sort((a, b) => a.size[1] - b.size[1]);
    // pick something worth chasing but still edible at the start of the stage
    return defs.find((d) => d.size[1] < this.p.size * 0.85) ?? defs[0];
  }

  // ------------------------------------------------------------ projectiles and zones

  private updateProjectiles(dt: number): void {
    const p = this.p;
    for (const g of this.globs) {
      g.life -= dt;
      g.sprite.x += g.vx * dt;
      g.sprite.y += g.vy * dt;
      for (const c of this.s.creatures) {
        if (!c.alive || c.def.behavior === 'host' || g.hit.has(c)) continue;
        if (Phaser.Math.Distance.Between(g.sprite.x, g.sprite.y, c.x, c.y) < c.radius + g.r) {
          g.hit.add(c);
          c.venomStun(venomStunTime(GameState.stats.venomRank));
          this.s.floatText(c.x, c.y - c.radius, 'Stunned!', '#c9a6ff');
          Sfx.play('stun');
          this.s.fx.burst(c.x, c.y, { color: 0xb388ff, count: 8, speed: c.radius * 4, scale: c.radius / 24 });
          if (g.hit.size >= g.pierce) {
            g.life = 0;
            break;
          }
        }
      }
      if (g.life <= 0) g.sprite.destroy();
    }
    this.globs = this.globs.filter((g) => g.life > 0);

    const qr = GameState.rank('quills');
    for (const q of this.quills) {
      q.life -= dt;
      q.sprite.x += q.vx * dt;
      q.sprite.y += q.vy * dt;
      for (const c of this.s.creatures) {
        if (!c.alive || c.defeated || c.def.behavior === 'host' || q.hit.has(c)) continue;
        if (Phaser.Math.Distance.Between(q.sprite.x, q.sprite.y, c.x, c.y) > c.radius) continue;
        q.hit.add(c);
        if (c.edibleBy(p)) {
          this.s.eat(c, SKEWER_SHARE);
        } else if (c.fighter) {
          if (c.takeDamage(quillDamage(qr), p.x, p.y, false)) this.s.onDefeated(c);
        }
        if (GameState.hasFusion('storm') || !c.fighter) c.stun(GameState.hasFusion('storm') ? 1 : 0.6);
        if (qr < 3) {
          q.life = 0;
          break;
        }
      }
      if (q.life <= 0) q.sprite.destroy();
    }
    this.quills = this.quills.filter((q) => q.life > 0);
  }

  private updateZones(dt: number): void {
    for (const c of this.cones) c.life -= dt;
    this.cones = this.cones.filter((c) => c.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const cl of this.clouds) {
      cl.life -= dt;
      for (const c of this.s.creatures) {
        if (!c.alive || c.defeated || c.def.behavior === 'host' || c.stunned || c.venomCd > 0) continue;
        if (Phaser.Math.Distance.Between(cl.x, cl.y, c.x, c.y) < cl.r + c.radius * 0.5) c.venomStun(1.5);
      }
    }
    this.clouds = this.clouds.filter((c) => c.life > 0);
  }

  private stunAround(r: number, seconds: number, color: number): void {
    const p = this.p;
    this.rings.push({ x: p.x, y: p.y, r, life: 0.35, maxLife: 0.35, color });
    for (const c of this.s.creatures) {
      if (!c.alive || c.defeated || c.def.behavior === 'host') continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) < r + c.radius) c.stun(seconds);
    }
  }

  // ------------------------------------------------------------ hooks from the stage

  /** A predator started winding up an attack nearby (Predator Instinct). */
  onThreatWindup(): void {
    if (!GameState.hasFusion('instinct') || this.bulletCd > 0) return;
    this.bulletCd = BULLET_COOLDOWN;
    this.bulletTime = BULLET_TIME;
    this.s.floatText(this.p.x, this.p.y - this.p.radius * 2, 'INSTINCT', '#80deea');
  }

  /** Before damage lands. Returns true if the hit is avoided entirely. */
  blockHit(attacker?: Creature): boolean {
    const p = this.p;
    if (this.shellUp) {
      this.shellUp = false;
      this.shellCd = GameState.rank('armor') >= 3 ? SHELL_COOLDOWN_FAST : SHELL_COOLDOWN;
      this.rings.push({ x: p.x, y: p.y, r: p.radius * 1.6, life: 0.3, maxLife: 0.3, color: 0x90caf9 });
      this.s.floatText(p.x, p.y - p.radius * 1.5, 'BLOCKED!', '#90caf9');
      Sfx.play('shield');
      p.invuln = 0.5;
      return true;
    }
    // speed rank 3: at full momentum some attacks just miss
    if (GameState.rank('speed') >= 2 && this.movingTime > 1.5 && Math.random() < 0.2) {
      this.s.floatText(p.x, p.y - p.radius * 1.5, 'MISS!', '#fff59d');
      p.invuln = 0.3;
      return true;
    }
    // lizard signature: drop your tail and run
    if (this.s.stage.signature === 'tongue' && this.tailDropCd <= 0) {
      this.tailDropCd = TAIL_DROP_COOLDOWN;
      const sprite = this.s.add.image(p.x, p.y, 'tail').setScale(p.radius / 24).setDepth(18);
      this.lure = { x: p.x, y: p.y, life: LURE_TIME, sprite };
      p.invuln = 1;
      this.s.floatText(p.x, p.y - p.radius * 1.5, 'TAIL DROP!', '#c5e1a5');
      Sfx.play('dash', 0.8);
      if (attacker) attacker.onHitPlayer();
      return true;
    }
    return false;
  }

  /** Shield (bloodlust overheal) soaks damage first. Returns what gets through. */
  absorb(damage: number): number {
    const soaked = Math.min(this.shield, damage);
    this.shield -= soaked;
    return damage - soaked;
  }

  /** After damage landed. */
  afterHit(attacker?: Creature): void {
    const p = this.p;
    const tr = GameState.rank('thorns');
    if (attacker && GameState.stats.thornsStun > 0) attacker.stun(GameState.stats.thornsStun);
    if (tr >= 2) this.stunAround(p.radius * 3, 1, 0x9ccc65);
    if (tr >= 3 && attacker?.fighter) {
      this.s.floatText(attacker.x, attacker.y - attacker.radius, '-30', '#9ccc65');
      if (attacker.takeDamage(30, p.x, p.y)) this.s.onDefeated(attacker);
    }
    if (GameState.rank('camo') >= 2) this.vanishTime = 2;
  }

  /** A predator bumped into you (Juggernaut sends it flying). */
  onThreatContact(c: Creature): void {
    if (!GameState.hasFusion('juggernaut') || c.stunned) return;
    c.push(this.p.x, this.p.y, 700);
    c.stun(0.5);
  }

  /** Second Wind just saved you. */
  onSecondWind(): void {
    if (GameState.rank('secondwind') >= 2) this.stunAround(this.p.radius * 5, 2, 0xef9a9a);
  }

  /** Heals; with Bloodlust rank 2 any overflow becomes a shield. */
  heal(amount: number): void {
    const max = GameState.stats.maxHp;
    if (this.bloodRage()) amount *= 2;
    const overflow = GameState.hp + amount - max;
    GameState.heal(amount);
    if (overflow > 0 && GameState.rank('bloodlust') >= 1) this.shield = Math.min(max * 0.25, this.shield + overflow);
  }

  /** Bloodlust rank 3 below half health. */
  private bloodRage(): boolean {
    return GameState.rank('bloodlust') >= 3 && GameState.hp < GameState.stats.maxHp * 0.5;
  }

  /** Camo rank 3 (or Phantom): ambush bonuses while hidden. */
  private ambushing(): boolean {
    // water hides a crocodile, but only camouflage sets up an ambush (no permanent triple DNA in pools)
    return this.stealth && (GameState.rank('camo') >= 3 || GameState.hasFusion('phantom'));
  }

  /** DNA multiplier for eating this creature (ambush bonuses). */
  eatMultiplier(c: Creature): number {
    let m = 1;
    const silent = GameState.rank('silent');
    if (silent >= 1 && !c.noticed) m *= silent >= 3 ? 2 : 1.5;
    if (this.ambushing()) m *= 3;
    return m;
  }

  /** After eating something. `combo` is the current glutton combo count. */
  afterEat(c: Creature, combo: number): void {
    const p = this.p;
    this.rush();
    const sr = GameState.rank('shock');
    if (sr > 0) {
      const r = shockRadius(sr) * p.radius;
      this.rings.push({ x: p.x, y: p.y, r, life: 0.2, maxLife: 0.2, color: 0xffee58 });
      let zapped = false;
      for (const t of this.s.creatures) {
        if (!t.alive || t.defeated || t === c) continue;
        if (Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) > r + t.radius) continue;
        if (t.def.behavior !== 'host') {
          t.stun(shockStun(sr));
          zapped = true;
        }
        if (sr >= 3 && t.fighter && t.takeDamage(15, p.x, p.y, false)) this.s.onDefeated(t);
      }
      // only zap audibly when the pulse actually caught something
      if (zapped) Sfx.play('stun', 1.5);
    }
    if (GameState.rank('glutton') >= 3 && combo >= 10 && this.gluttonFrenzy <= 0) {
      this.gluttonFrenzy = 4;
      this.s.floatText(p.x, p.y - p.radius * 2, 'FEEDING FRENZY!', '#ffb74d');
    }
    if (GameState.rank('jaw') >= 1 && c.defeated) this.heal(GameState.stats.maxHp * 0.25);
    if (GameState.hasFusion('undying')) {
      this.undyingMeals++;
      if (this.undyingMeals >= UNDYING_MEALS) {
        this.undyingMeals = 0;
        GameState.secondWindsLeft++;
        this.s.toast('Undying Hunger: Second Wind restored!');
      }
    }
  }

  /** Bite damage multiplier and crit flag for a bite on `c`. */
  biteBonus(c: Creature): { mul: number; crit: boolean } {
    let mul = 1;
    if (this.frenzyTime > 0) mul *= 2;
    if (GameState.hasFusion('butcher')) mul *= 1.3;
    if (this.ambushing()) mul *= 3;
    if (this.bloodRage()) mul *= 1.5;
    if (GameState.rank('jaw') >= 3 && c.hp < c.maxHp * 0.5) mul *= 1.3;
    if (this.scentTime > 0 && this.scented(c)) mul *= SCENT_BITE;
    const critChance = (GameState.rank('claws') >= 2 ? 0.25 : 0) + (GameState.rank('eyes') >= 3 ? 0.15 : 0);
    const crit = Math.random() < critChance;
    if (crit) mul *= 2;
    return { mul, crit };
  }

  afterBite(c: Creature, damage: number, defeated: boolean): void {
    const claws = GameState.rank('claws');
    if (!defeated && claws >= 1) c.bleed(4, 4, claws >= 3 ? 3 : 1);
    if (!defeated && this.stageIndex >= FANGS_STAGE && GameState.stats.venomRank > 0 && c.fangCd <= 0) {
      c.venomStun(venomStunTime(GameState.stats.venomRank) * 0.35);
      c.fangCd = FANG_STUN_COOLDOWN;
    }
    if (GameState.rank('bloodlust') >= 2) this.heal(damage * 0.3);
    // biting gives away your position
    this.stillTime = 0;
    this.vanishTime = 0;
  }

  carcassMultiplier(): number {
    return (GameState.hasFusion('butcher') ? 2.5 : 1.5) * (GameState.rank('jaw') >= 2 ? 1.5 : 1);
  }

  // ------------------------------------------------------------ drawing

  draw(g: Phaser.GameObjects.Graphics, lw: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const p = this.p;
    if (this.scentTime > 0) this.drawScent(g, lw, cam);

    for (const cl of this.clouds) {
      const k = cl.life / cl.maxLife;
      g.fillStyle(0x7c4dff, 0.25 * k);
      g.fillCircle(cl.x, cl.y, cl.r);
      g.fillStyle(0x76ff03, 0.12 * k);
      g.fillCircle(cl.x, cl.y, cl.r * 0.6);
    }

    for (const b of this.cones) {
      const pts: Phaser.Types.Math.Vector2Like[] = [{ x: b.x, y: b.y }];
      for (let i = 0; i <= 10; i++) {
        const a = b.angle - b.half + (i / 10) * b.half * 2;
        pts.push({ x: b.x + Math.cos(a) * b.len, y: b.y + Math.sin(a) * b.len });
      }
      const k = b.life / BREATH_LIFE;
      g.fillStyle(0x7c4dff, 0.5 * k);
      g.fillPoints(pts, true);
      g.lineStyle(lw * 1.5, 0x76ff03, 0.8 * k);
      g.strokePoints(pts, true);
    }

    if (this.swarmCloud > 0) {
      const r = p.radius * 3.2;
      const t = this.s.time.now / 1000;
      g.fillStyle(0xffd54f, 0.08);
      g.fillCircle(p.x, p.y, r);
      for (let i = 0; i < 28; i++) {
        const a = t * (2 + (i % 3)) + i * 0.9;
        const d = r * (0.35 + ((i * 37) % 60) / 100);
        g.fillStyle(i % 2 ? 0x212121 : 0xffd54f, 0.9);
        g.fillCircle(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, Math.max(1.5, p.radius * 0.08));
      }
    }

    for (const w of this.waves) {
      const k = 1 - w.life / 0.5;
      const r = w.r + (w.maxR - w.r) * k;
      g.lineStyle(lw * 6, 0x4dd0e1, 0.8 * (1 - k));
      g.beginPath();
      g.arc(w.x, w.y, r, w.angle - WAVE_HALF, w.angle + WAVE_HALF);
      g.strokePath();
      g.lineStyle(lw * 2, 0xffffff, 0.8 * (1 - k));
      g.beginPath();
      g.arc(w.x, w.y, r * 0.92, w.angle - WAVE_HALF * 0.9, w.angle + WAVE_HALF * 0.9);
      g.strokePath();
    }

    for (const b of this.bolts) {
      // jagged bolt from the sky
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const j = i === 0 || i === 6 ? 0 : (Math.random() - 0.5) * 30;
        pts.push({ x: b.x1 + (b.x2 - b.x1) * t + j, y: b.y1 + (b.y2 - b.y1) * t });
      }
      g.lineStyle(lw * 4, 0xfff59d, b.life / 0.3);
      g.strokePoints(pts, false);
      g.lineStyle(lw * 1.5, 0xffffff, b.life / 0.3);
      g.strokePoints(pts, false);
    }

    for (const r of this.rings) {
      const k = r.life / r.maxLife;
      g.lineStyle(lw * 3, r.color, 0.8 * k);
      g.strokeCircle(r.x, r.y, r.r * (1.15 - 0.15 * k));
      g.fillStyle(r.color, 0.15 * k);
      g.fillCircle(r.x, r.y, r.r);
    }

    if (this.tongue) {
      const tip = this.tongueTip();
      g.lineStyle(Math.max(2, p.radius * 0.22), 0xe05a7a, 1);
      g.lineBetween(p.x, p.y, tip.x, tip.y);
      g.fillStyle(0xff7f9e, 1);
      g.fillCircle(tip.x, tip.y, Math.max(3, p.radius * 0.2));
    }

    const mag = this.magnet();
    if (mag.range > 0) {
      g.lineStyle(lw, COLORS.edible, 0.12);
      g.strokeCircle(p.x, p.y, mag.range);
      if (GameState.rank('magnet') >= 2) {
        // vortex swirl
        const t = this.s.time.now / 300;
        for (let i = 0; i < 3; i++) {
          const a = t + (i / 3) * Math.PI * 2;
          g.lineStyle(lw, COLORS.edible, 0.25);
          g.beginPath();
          g.arc(p.x, p.y, mag.range * 0.7, a, a + 0.8);
          g.strokePath();
        }
      }
    }

    if (GameState.hasFusion('plague')) {
      g.fillStyle(0x9ccc65, 0.08);
      g.fillCircle(p.x, p.y, p.radius * 2.5);
    }
    if (this.shellUp) {
      g.lineStyle(lw * 2, 0x90caf9, 0.7);
      g.strokeCircle(p.x, p.y, p.radius * 1.35);
    }
    if (this.shield > 0) {
      g.lineStyle(lw * 2, 0xffffff, 0.6);
      g.strokeCircle(p.x, p.y, p.radius * 1.2);
    }
    if (this.frenzyTime > 0 || this.gluttonFrenzy > 0) {
      const pulse = 1.3 + Math.sin(this.s.time.now / 60) * 0.12;
      g.lineStyle(lw * 3, this.frenzyTime > 0 ? 0xff1744 : 0xffb74d, 0.7);
      g.strokeCircle(p.x, p.y, p.radius * pulse);
    }
    if (GameState.rank('speed') >= 1 && this.movingTime > 1.5) {
      // wind streaks behind you
      const back = Math.atan2(p.vy, p.vx) + Math.PI;
      for (let i = -1; i <= 1; i++) {
        const a = back + i * 0.35;
        g.lineStyle(lw, 0xffffff, 0.35);
        g.lineBetween(p.x + Math.cos(a) * p.radius, p.y + Math.sin(a) * p.radius, p.x + Math.cos(a) * p.radius * 2.6, p.y + Math.sin(a) * p.radius * 2.6);
      }
    }
    if (this.lure) {
      g.lineStyle(lw * 2, 0xc5e1a5, 0.6);
      g.strokeCircle(this.lure.sprite.x, this.lure.sprite.y, p.radius * 1.2);
    }
    for (const a of this.allies) {
      g.lineStyle(lw, 0xffcc80, 0.8);
      g.strokeCircle(a.x, a.y, a.radius + 3 / cam.zoom);
    }

    this.drawArrows(g, cam);
  }

  /** Blood Scent: a pulsing mark on every wounded creature, and an edge arrow for those off screen. */
  private drawScent(g: Phaser.GameObjects.Graphics, lw: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const p = this.p;
    const view = cam.worldView;
    const fade = Math.min(1, this.scentTime);
    const pulse = 0.5 + 0.5 * Math.sin(this.s.time.now / 150);
    const margin = 26 / cam.zoom;
    for (const c of this.s.creatures) {
      if (!this.scented(c)) continue;
      if (view.contains(c.x, c.y)) {
        g.lineStyle(lw * 3, 0xff1744, (0.5 + 0.4 * pulse) * fade);
        g.strokeCircle(c.x, c.y, c.radius + 8 * lw);
        continue;
      }
      const a = Math.atan2(c.y - p.y, c.x - p.x);
      const hx = view.width / 2 - margin;
      const hy = view.height / 2 - margin;
      const t = Math.min(Math.abs(hx / Math.cos(a)), Math.abs(hy / Math.sin(a)));
      const x = view.centerX + Math.cos(a) * t;
      const y = view.centerY + Math.sin(a) * t;
      const s = 10 / cam.zoom;
      g.fillStyle(0xff1744, 0.85 * fade);
      g.fillTriangle(
        x + Math.cos(a) * s, y + Math.sin(a) * s,
        x + Math.cos(a + 2.5) * s, y + Math.sin(a + 2.5) * s,
        x + Math.cos(a - 2.5) * s, y + Math.sin(a - 2.5) * s,
      );
    }
  }

  /** Eyes rank 2/3: arrows at the screen edge pointing to off-screen predators (and prey). */
  private drawArrows(g: Phaser.GameObjects.Graphics, cam: Phaser.Cameras.Scene2D.Camera): void {
    const er = GameState.rank('eyes');
    if (er < 1) return;
    const p = this.p;
    const view = cam.worldView;
    const margin = 26 / cam.zoom;
    const reach = Math.max(view.width, view.height) * 1.2;
    let shown = 0;
    for (const c of this.s.creatures) {
      if (shown >= 8 || !c.alive || view.contains(c.x, c.y)) continue;
      const threat = c.threatTo(p);
      const food = er >= 2 && c.edibleBy(p) && c.dnaValue >= p.size * 0.6;
      if (!threat && !food) continue;
      if (Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y) > reach) continue;
      const a = Math.atan2(c.y - p.y, c.x - p.x);
      // clamp a ray from the player to the inner edge of the view
      const hx = view.width / 2 - margin;
      const hy = view.height / 2 - margin;
      const t = Math.min(Math.abs(hx / Math.cos(a)), Math.abs(hy / Math.sin(a)));
      const x = view.centerX + Math.cos(a) * t;
      const y = view.centerY + Math.sin(a) * t;
      const s = 9 / cam.zoom;
      g.fillStyle(threat ? COLORS.danger : COLORS.edible, 0.85);
      g.fillTriangle(
        x + Math.cos(a) * s, y + Math.sin(a) * s,
        x + Math.cos(a + 2.5) * s, y + Math.sin(a + 2.5) * s,
        x + Math.cos(a - 2.5) * s, y + Math.sin(a - 2.5) * s,
      );
      shown++;
    }
  }

  destroy(): void {
    for (const g of this.globs) g.sprite.destroy();
    for (const q of this.quills) q.sprite.destroy();
    for (const a of this.allies) a.destroy();
    this.lure?.sprite.destroy();
    this.roll = null;
    this.dive = null;
    this.lift = null;
    this.sting = null;
    this.crush = null;
    this.scentTime = 0;
    this.swarmCloud = 0;
    this.bolts = [];
    this.waves = [];
    this.globs = [];
    this.quills = [];
    this.allies = [];
    this.lure = null;
  }
}
