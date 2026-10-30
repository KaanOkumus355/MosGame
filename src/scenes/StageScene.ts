import Phaser from 'phaser';
import { COLORS, DANGER_RATIO, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { type CreatureDef, type ProjectileKind } from '../data/creatures';
import { creatureDef, sizeFactor } from '../data/scaling';
import { STAGE_NAMES, formMotion, type StageDef } from '../data/stages';
import { SIGNATURES } from '../data/signatures';
import { FUSIONS, pickChoices, type Choice } from '../data/fusions';
import { TRAITS, BREATH_STAGE } from '../data/traits';
import { RunSave } from '../state/RunSave';
import { Controls, PAD } from '../systems/Controls';
import { Settings } from '../state/Settings';
import { Tutorial } from '../systems/Tutorial';
import { GameState, emptyCounters } from '../state/GameState';
import { GeneBank } from '../state/GeneBank';
import { Codex } from '../state/Codex';
import { Achievements } from '../state/Achievements';
import { FORM_UNLOCKS, formUnlock } from '../data/forms';
import { stageById } from '../data/stages';
import { buildBiome, type Pool } from '../art/biome';
import { Player } from '../entities/Player';
import { Creature, type StageContext } from '../entities/Creature';
import { Abilities } from '../systems/Abilities';
import { ZoneEvents } from '../systems/ZoneEvents';
import { Fx } from '../systems/Fx';
import { Sfx } from '../audio/Sfx';
import { ATMOSPHERE } from '../data/atmosphere';

/** Blood drinking rates while touching a host. */
const DRINK_DNA_PER_SEC = 7;
const DRINK_GROWTH_AREA_PER_SEC = 2;
/** Each trait pick in a stage costs this much more DNA than the last. */
const DNA_COST_GROWTH = 1.25;
const SWAT_WINDUP = 0.65;
const INVULN_TIME = 1;
/** Base bite damage against fighters (scaled by size ratio and biteMul). */
const BITE_BASE = 16;
/** Chance that a predator or fighter spawns as a tougher, more valuable Alpha. */
const ELITE_CHANCE = 0.06;
const WEB_PATCH_LIFE = 6;
/** Extra damage taken per stage index, so later zones stay dangerous as your health grows. */
const LATE_DAMAGE = 0.15;
/** Seconds after its warning before a newly introduced predator (CreatureDef.warning) starts hunting. */
const WARNING_GRACE = 3;
/** Unhurt for this long, you also recover RECOVER_RATE of max health per second (ramping in over 2s). */
const RECOVER_DELAY = 6;
const RECOVER_RATE = 0.025;
/** Difficulty-tuned creature definitions (see tunedDef). */
const TUNED = new Map<string, CreatureDef>();
/** Below this share of max health your heartbeat plays (faster below half of it). */
const LOW_HP = 0.3;
/** Each trait you have already earned makes the first pick of a new stage this much pricier. */
const PICK_COST_RAMP = 0.025;
/** Seconds between mid-stage saves (also saved on pause, after each pick and when the tab closes). */
const SAVE_EVERY = 5;
/** Slow motion speed (boss kills). */
const SLOW_MO_SCALE = 0.25;
/** Most area a single meal can add, as a fraction of your current area. */
const MAX_MEAL_GROWTH = 0.5;
/** States in which a creature is winding up an attack (for Predator Instinct). */
const WINDUP_STATES = new Set(['windup', 'aim', 'spitAim', 'slam']);

interface Swat {
  x: number;
  y: number;
  r: number;
  t: number;
  host: Creature;
}

interface Impact {
  x: number;
  y: number;
  r: number;
  life: number;
}

interface Projectile {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  kind: ProjectileKind;
  owner: Creature;
}

/** Sticky web on the ground: slows you while you are in it. */
interface WebPatch {
  x: number;
  y: number;
  r: number;
  life: number;
}


const PROJECTILE_TEXTURE: Record<ProjectileKind, string> = { spear: 'spear', web: 'web_glob', net: 'net' };

/** A top-down arena stage. Stages 1-5 all run through this scene, configured by StageDef. */
export class StageScene extends Phaser.Scene {
  stage!: StageDef;
  player!: Player;
  creatures: Creature[] = [];
  controls!: Controls;
  abilities!: Abilities;
  /** This zone's event and boss. */
  zone!: ZoneEvents;
  fx!: Fx;
  /** Last movement input, used to aim the dash. */
  inputDir = { x: 0, y: 0 };
  /** Water pools (Crocodile's Submerge). */
  pools: Pool[] = [];

  private overlay!: Phaser.GameObjects.Graphics;
  /** Drawn just under the player (shadow), so you can always find yourself. */
  private underlay!: Phaser.GameObjects.Graphics;
  private ctx!: StageContext;
  private swats: Swat[] = [];
  private impacts: Impact[] = [];
  private projectiles: Projectile[] = [];
  private webs: WebPatch[] = [];
  private spawnTimer = 0;
  private drinkTextAcc = 0;
  private dead = false;
  private stageCompleteAnnounced = false;
  private evolving = false;
  /** Size threshold reached; transition starts once no evolution is pending. */
  private readyToEvolve = false;
  private evolveHeldNoted = false;
  private leaving = false;
  /** Seconds to the next mid-stage save. */
  private saveTimer = 0;
  private combo = 0;
  private comboTimer = 0;
  private biteCd = 0;
  private humansSeen = false;
  private alphasSeen = new Set<Creature>();
  /** Creature keys whose warning has shown this stage. */
  private warned = new Set<string>();
  private heartbeat = 0;
  private slowTime = 0;
  private slowMul = 1;
  private poisonTime = 0;
  private poisonDps = 0;
  private poisonSource = '';
  private poisonTick = 0;

  constructor() {
    super('Stage');
  }

  /** Dead or leaving the stage: no more input or damage. */
  get isOver(): boolean {
    return this.dead || this.leaving;
  }

  create(): void {
    // scene instances are reused on restart, so reset all per-run fields here
    this.creatures = [];
    this.swats = [];
    this.impacts = [];
    this.projectiles = [];
    this.webs = [];
    this.spawnTimer = 0;
    this.drinkTextAcc = 0;
    this.dead = false;
    this.stageCompleteAnnounced = false;
    this.evolving = false;
    this.readyToEvolve = false;
    this.evolveHeldNoted = false;
    this.leaving = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.biteCd = 0;
    this.humansSeen = false;
    this.alphasSeen = new Set();
    this.warned = new Set();
    this.heartbeat = 0;
    this.slowTime = 0;
    this.poisonTime = 0;
    this.hitStop = 0;
    this.slowMo = 0;

    this.stage = GameState.stageDef();
    const W = this.stage.worldSize;
    // a continued save picks up mid-stage: same size, health, DNA and counters, fresh map
    const resume = GameState.resuming;
    GameState.resuming = false;
    if (!resume) {
      GameState.stageCounters = emptyCounters();
      GameState.zoneEventDone = false;
      GameState.gateWaited = 0;
    }
    Codex.becomeForm(this.stage.id);
    // first run: a guided Mosquito stage; later forms get a tip for their own ability
    if (GameState.stageIndex === 0) Tutorial.startGuided();
    else {
      Tutorial.endGuided();
      if (SIGNATURES[this.stage.signature].key) Tutorial.trigger('signature');
    }

    this.cameras.main.setBackgroundColor(this.stage.bgColor);
    this.cameras.main.setBounds(0, 0, W, W);
    this.pools = buildBiome(this, this.stage);

    if (!resume) {
      GameState.size = this.stage.startSize;
      GameState.hp = GameState.stats.maxHp;
      // the trait-pick cost resets each stage so every stage offers a similar number of picks
      GameState.dnaToNext = Math.round(this.stage.dnaBase * (1 + PICK_COST_RAMP * GameState.evolutionsEarned));
      GameState.dna = Math.min(GameState.dna, this.stage.dnaBase * 0.5);
      // Gene Bank perks: a half-full first bar and an extra card on the first pick, every stage
      if (GeneBank.level('headStart') > 0) GameState.dna = Math.max(GameState.dna, GameState.dnaToNext * 0.5);
      GameState.firstPickBonus = GeneBank.level('widerPool');
      GameState.secondWindsLeft = GameState.stats.secondWinds;
    }
    GameState.cooldowns = { venom: 0, dash: 0, signature: 0 };
    RunSave.checkpoint();
    this.saveTimer = SAVE_EVERY;
    this.player = new Player(this, W / 2, W / 2, this.stage.playerTexture, Math.max(this.stage.startSize, GameState.size), W, formMotion(this.stage));
    // brief spawn protection so nothing ambushes you on arrival
    this.player.invuln = 1.5;
    this.abilities = new Abilities(this);
    this.zone = new ZoneEvents(this);

    this.overlay = this.add.graphics().setDepth(30);
    this.underlay = this.add.graphics().setDepth(19);
    this.fx = new Fx(this);
    const atmos = ATMOSPHERE[this.stage.id];
    this.fx.setAmbient(atmos?.particles ?? null);
    if (atmos) Sfx.startAmbient(atmos.music);

    const cam = this.cameras.main;
    cam.setZoom(this.stage.baseZoom);
    cam.startFollow(this.player.sprite, true, 0.12, 0.12);

    const kb = this.input.keyboard!;
    this.controls = new Controls(this);
    this.input.mouse!.disableContextMenu();
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown()) this.abilities.fireVenom(this.aimAngle());
    });
    kb.on('keydown-ESC', () => this.openPause());
    kb.on('keydown-P', () => this.openPause());
    if (import.meta.env.DEV) {
      // dev cheat: G (or ]) = grow to the next stage's threshold
      const skip = () => this.grow(this.stage.evolveSize ** 2);
      kb.on('keydown-G', skip);
      kb.on('keydown-CLOSED_BRACKET', skip);
    }
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    // closing or refreshing the tab saves where you are
    window.addEventListener('pagehide', this.saveProgress);
    // clicking away or switching windows pauses (Options can turn this off)
    this.game.events.on(Phaser.Core.Events.BLUR, this.pauseOnBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('pagehide', this.saveProgress);
      this.game.events.off(Phaser.Core.Events.BLUR, this.pauseOnBlur);
      this.abilities.destroy();
      this.zone.destroy();
    });

    const scene = this;
    this.ctx = {
      player: this.player,
      worldSize: W,
      get lure() { return scene.abilities.lure; },
      get hiddenFromPredators() { return scene.abilities.hiddenFromPredators; },
      get hiddenFromPrey() { return scene.abilities.hiddenFromPrey; },
      pools: this.pools,
      hurtPlayer: (dmg, x, y, source, attacker) => void this.hurtPlayer(dmg, x, y, source, attacker),
      shoot: (from, angle, kind) => this.shoot(from, angle, kind),
      slam: (from) => this.slam(from),
      alertPack: (from) => this.alertPack(from),
      say: (from, text, color) => this.floatText(from.x, from.y - from.radius * 1.4, text, color ?? '#ffffff'),
      defeated: (c) => this.onDefeated(c),
    };

    for (const s of this.stage.spawns) {
      const def = this.tunedDef(creatureDef(s.creature, this.stage));
      const minDist = def.damage > 0 || def.behavior === 'ranged' ? 450 : def.behavior === 'host' ? 220 : 110;
      const group = s.group ?? 1;
      const count = this.spawnCount(def, s.count);
      for (let i = 0; i < count; i += group) this.spawn(def, minDist, Math.min(group, count - i));
    }

    this.scene.launch('HUD');
    this.time.delayedCall(400, () => {
      const sig = SIGNATURES[this.stage.signature];
      this.toast(`STAGE ${GameState.stageIndex + 1}: ${this.stage.creatureName.toUpperCase()}. ${this.stage.intro}`);
      this.toast(`Signature, ${sig.name}${sig.key ? ` (${sig.key})` : ''}: ${sig.short}`);
    });
  }

  /** Seconds of freeze-frame left (big hits), and of slow motion (boss kills). */
  private hitStop = 0;
  private slowMo = 0;
  private lastFreeze = -1000;

  /** A heavy hit: freeze for a moment and shake. */
  impact(freeze: number, shakeMs: number, intensity: number): void {
    // freezes are spaced out so rapid bites don't make the game stutter
    if (Settings.effect('hitStop') && this.time.now - this.lastFreeze > 300) {
      this.hitStop = Math.max(this.hitStop, freeze);
      this.lastFreeze = this.time.now;
    }
    this.cameras.main.shake(shakeMs, intensity);
  }

  slowMotion(seconds: number): void {
    if (!Settings.effect('hitStop')) return;
    this.slowMo = Math.max(this.slowMo, seconds);
  }

  update(_time: number, deltaMs: number): void {
    if (this.isOver) return;
    this.controls.update();
    this.saveTimer -= deltaMs / 1000;
    if (this.saveTimer <= 0) {
      this.saveTimer = SAVE_EVERY;
      this.saveProgress();
    }
    if (this.controls.padPressed(PAD.START)) {
      this.openPause();
      return;
    }
    const real = Math.min(deltaMs / 1000, 0.05);
    if (this.hitStop > 0) {
      this.hitStop -= real;
      this.drawOverlay();
      return;
    }
    let dt = real;
    if (this.slowMo > 0) {
      this.slowMo -= real;
      dt *= SLOW_MO_SCALE;
    }
    this.tweens.timeScale = this.slowMo > 0 ? SLOW_MO_SCALE : 1;
    GameState.tick(dt);

    this.updatePlayer(dt);
    this.abilities.update(dt);
    // Predator Instinct slows everything but you
    const cdt = dt * this.abilities.creatureTimeScale;
    this.updateCreatures(cdt, dt);
    this.updateSwats(cdt);
    this.updateProjectiles(cdt);
    this.updateWebs(dt);
    this.upkeepSpawns(dt);
    this.zone.update(dt);
    this.checkProgress();
    if (GameState.pendingEvolutions > 0 && !this.evolving) this.openEvolution();
    else if (this.readyToEvolve && !this.evolving) {
      // never evolve out of a boss fight by accident: it waits until you win or leave the lair
      if (this.zone.holdsEvolution) {
        if (!this.evolveHeldNoted) {
          this.evolveHeldNoted = true;
          this.toast('Your body is ready to change... finish the fight.');
        }
      } else if (this.zone.gateOpen) this.leaveStage();
    }
    this.tutorialTick(dt);
    this.updateCamera();
    this.fx.updateAmbient(dt, this.cameras.main);
    this.drawOverlay();

    GameState.size = this.player.size;
  }

  // ------------------------------------------------------------ player

  private updatePlayer(dt: number): void {
    let { x: dx, y: dy } = this.controls.move();

    // mouse: hold the left button to move toward the cursor (keyboard wins if both are used)
    const ptr = this.input.activePointer;
    if (dx === 0 && dy === 0 && ptr.leftButtonDown() && Settings.flag('mouseMove')) {
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const mx = wp.x - this.player.x;
      const my = wp.y - this.player.y;
      const md = Math.hypot(mx, my);
      if (md > this.player.radius * 0.6) {
        // ease off when the cursor is very close so we don't jitter around it
        const s = Math.min(1, md / (this.player.radius * 4));
        dx = (mx / md) * s;
        dy = (my / md) * s;
      }
    }

    this.inputDir = { x: dx, y: dy };
    this.player.update(dt, dx, dy, this.playerSpeed(), (this.stage.accel ?? 9) * GameState.stats.accelMul);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.biteCd -= dt;
    this.updateStatuses(dt);

    // Nightmare: no resting back to health
    const recover = !GameState.diff.noRecovery && this.poisonTime <= 0 ? Phaser.Math.Clamp((this.player.sinceHurt - RECOVER_DELAY) / 2, 0, 1) : 0;
    if (this.player.sinceHurt > 3 && this.poisonTime <= 0) {
      GameState.heal(GameState.stats.regen * this.abilities.regenMul() * dt);
      // out of the fight for a while: catch your breath, so one bad fight doesn't doom the next
      if (recover > 0) GameState.heal(GameState.stats.maxHp * RECOVER_RATE * recover * dt);
    }
    GameState.status.recovering = recover > 0 && GameState.hp < GameState.stats.maxHp;
    this.updateHeartbeat(dt);
  }

  /** Low health: a heartbeat (and the HUD's red edge) so it never comes as a surprise. */
  private updateHeartbeat(dt: number): void {
    const share = GameState.hp / GameState.stats.maxHp;
    const low = this.isOver || share >= LOW_HP ? 0 : share < LOW_HP / 2 ? 2 : 1;
    GameState.status.lowHealth = low;
    if (!low) {
      this.heartbeat = 0;
      return;
    }
    this.heartbeat -= dt;
    if (this.heartbeat <= 0) {
      Sfx.play('heartbeat');
      this.heartbeat = low === 2 ? 0.6 : 0.9;
    }
  }

  /** First sight of a predator with a warning: tell the player, then let it hunt after a grace period. */
  private warn(c: Creature): void {
    const key = c.def.key;
    this.warned.add(key);
    this.toast(c.def.warning!);
    this.floatText(c.x, c.y - c.radius * 1.5, `${c.def.name.toUpperCase()}!`, '#ff8a80');
    this.fx.ring(c.x, c.y, c.radius * 2.5, 0xff5252, 22);
    Sfx.play('warn');
    this.time.delayedCall(WARNING_GRACE * 1000, () => {
      for (const o of this.creatures) if (o.def.key === key && !this.zone.tames(key)) o.calm = false;
    });
  }

  private updateStatuses(dt: number): void {
    const p = this.player;
    this.slowTime = Math.max(0, this.slowTime - dt);
    if (this.slowTime <= 0) this.slowMul = 1;
    if (this.poisonTime > 0) {
      this.poisonTime -= dt;
      const tick = this.poisonDps * GameState.diff.damageTaken * dt;
      GameState.hp -= tick;
      GameState.logDamage(this.poisonSource, tick);
      this.poisonTick -= dt;
      if (this.poisonTick <= 0) {
        this.poisonTick = 1;
        this.floatText(p.x, p.y - p.radius, `-${this.poisonDps}`, '#9ccc65');
        p.sprite.setTint(0x9ccc65);
        this.time.delayedCall(200, () => p.sprite.clearTint());
      }
      if (GameState.hp <= 0) this.lethal(this.poisonSource);
    }
    GameState.status.slowed = this.slowTime;
    GameState.status.poisoned = Math.max(0, this.poisonTime);
  }

  /** Slows the player to `mul` of normal speed for `seconds` (strongest slow wins). */
  slowPlayer(mul: number, seconds: number): void {
    this.slowMul = this.slowTime > 0 ? Math.min(this.slowMul, mul) : mul;
    this.slowTime = Math.max(this.slowTime, seconds);
  }

  private poisonPlayer(dps: number, seconds: number, source: string): void {
    this.poisonDps = Math.max(this.poisonTime > 0 ? this.poisonDps : 0, dps);
    this.poisonTime = Math.max(this.poisonTime, seconds);
    this.poisonSource = source;
    this.poisonTick = 0;
  }

  /** True if the point is inside one of the stage's water pools. */
  inPool(x: number, y: number): boolean {
    return this.pools.some((pl) => (x - pl.x) ** 2 + (y - pl.y) ** 2 < pl.r * pl.r);
  }

  playerSpeed(): number {
    const slow = this.slowTime > 0 ? this.slowMul : 1;
    return this.stage.baseSpeed * this.growthScale() * GameState.stats.speedMul * this.abilities.speedMul() * this.zone.speedMul() * slow;
  }

  /** 0 at the start of the stage, 1 when big enough to evolve. */
  /** Reached full size: only the zone boss can still hold you here. */
  get fullyGrown(): boolean {
    return this.readyToEvolve;
  }

  get growthProgress(): number {
    return Phaser.Math.Clamp((this.player.size - this.stage.startSize) / (this.stage.evolveSize - this.stage.startSize), 0, 1);
  }

  /** Damage from the environment (zone events). */
  zoneHurt(damage: number, x: number, y: number, source: string): void {
    this.hurtPlayer(damage, x, y, source);
  }

  /** Grows from 1 as the player gets bigger; scales speeds so movement keeps up with the zoom. */
  growthScale(): number {
    return Math.sqrt(this.player.size / this.stage.startSize);
  }

  /** Where abilities aim: the right stick, else the mouse if it has moved recently, else where you are facing. */
  aimAngle(): number {
    const stick = this.controls.aim();
    if (stick !== null) return stick;
    const ptr = this.input.activePointer;
    if (ptr.moveTime > 0 && this.time.now - ptr.moveTime < 4000) {
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      if (Phaser.Math.Distance.Between(wp.x, wp.y, this.player.x, this.player.y) > this.player.radius) {
        return Math.atan2(wp.y - this.player.y, wp.x - this.player.x);
      }
    }
    return this.player.sprite.rotation;
  }

  grow(area: number): void {
    const p = this.player;
    p.size = Math.min(this.stage.evolveSize, Math.sqrt(p.size * p.size + area * GameState.stats.growthMul));
  }

  /** Returns true if the hit landed. */
  private hurtPlayer(damage: number, fromX: number, fromY: number, source: string, attacker?: Creature, knock = 420): boolean {
    const p = this.player;
    if (this.isOver || p.invuln > 0 || p.dashing) return false;
    if (this.abilities.blockHit(attacker)) return false;
    const late = 1 + LATE_DAMAGE * GameState.stageIndex;
    const dealt = this.abilities.absorb(damage * late * (1 - GameState.stats.armor) * GameState.diff.damageTaken);
    GameState.hp -= dealt;
    GameState.logDamage(attacker?.name ?? source, dealt);
    p.invuln = INVULN_TIME;
    p.sinceHurt = 0;
    const push = knock * this.growthScale() * this.abilities.knockbackMul();
    if (push > 0) p.knockback(fromX, fromY, push);
    p.sprite.setTint(0xff6666);
    this.time.delayedCall(180, () => p.sprite.clearTint());
    this.cameras.main.shake(160, 0.008);
    this.floatText(p.x, p.y - p.radius, `-${Math.round(dealt)}`, '#ff5566');
    Sfx.play('hurt');
    this.fx.burst(p.x, p.y, { color: 0xff3b3b, count: 12, speed: p.radius * 7, scale: p.radius / 18, glow: false });

    this.abilities.afterHit(attacker);
    if (attacker?.def.poison) this.poisonPlayer(attacker.def.poison.dps, attacker.def.poison.time, `${attacker.name} venom`);
    if (GameState.hp <= 0 && attacker && attacker.size < p.size && GameState.secondWindsLeft === 0) Achievements.unlock('brought_low');
    if (GameState.hp <= 0) this.lethal(source);
    return true;
  }

  /** Health hit zero: Second Wind if available, otherwise death. */
  private lethal(source: string): void {
    if (GameState.secondWindsLeft > 0) {
      GameState.secondWindsLeft--;
      GameState.secondWindsUsed++;
      GameState.hp = GameState.stats.maxHp * 0.35;
      this.poisonTime = 0;
      this.player.invuln = 2.2;
      this.cameras.main.flash(300, 255, 200, 200);
      this.toast('SECOND WIND! Death politely declined.');
      Sfx.play('secondwind');
      this.fx.ring(this.player.x, this.player.y, this.player.radius * 4, 0xef9a9a, 24);
      this.abilities.onSecondWind();
    } else {
      this.die(source);
    }
  }

  private die(source: string): void {
    this.dead = true;
    GameState.hp = 0;
    GameState.killedBy = source;
    Sfx.play('death');
    Sfx.stopAmbient();
    const p = this.player;
    this.fx.burst(p.x, p.y, { color: 0xb388ff, count: 40, speed: p.radius * 10, scale: p.radius / 14, lifespan: 900 });
    this.cameras.main.stopFollow();
    this.tweens.add({
      targets: this.player.sprite,
      angle: this.player.sprite.angle + 540,
      scale: 0,
      alpha: 0,
      duration: 900,
      ease: 'Quad.easeIn',
    });
    this.time.delayedCall(1300, () => {
      this.scene.stop('HUD');
      this.scene.start('GameOver');
    });
  }

  // ------------------------------------------------------------ creatures

  private updateCreatures(dt: number, realDt: number): void {
    const p = this.player;
    const mag = this.abilities.magnet();
    for (const c of this.creatures) {
      if (!c.alive) continue;
      const before = c.state;
      c.update(dt, this.ctx);
      if (!c.alive) continue;

      let d = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y);
      const near = this.growthScale();
      if (WINDUP_STATES.has(c.state) && !WINDUP_STATES.has(before) && (c.threatTo(p) || c.def.behavior === 'ranged') && d < 600 * near) {
        this.abilities.onThreatWindup();
        // only warn about attacks that are close and actually aimed at you
        if (d < 400 * near && c.threatTo(p)) Sfx.play('warn');
      }
      if (mag.range > 0 && d < mag.range && this.abilities.pullsCreature(c)) {
        c.pull(p.x, p.y, mag.speed, realDt);
        d = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y);
      }
      if (c.def.behavior === 'host') {
        // must actually be on the animal to drink
        if (!c.drained && d < c.radius * 0.8) this.drink(c, realDt);
        continue;
      }
      if (this.abilities.airborne || d > p.radius + c.radius * 0.85) continue;

      if (c.edibleBy(p)) {
        this.eat(c);
        continue;
      }
      if (c.fighter) this.bite(c);
      if (c.threatTo(p)) {
        this.abilities.onThreatContact(c);
        if (this.hurtPlayer(c.def.damage, c.x, c.y, `a ${c.name}`, c)) c.onHitPlayer();
      } else {
        // same-ish size: shove each other apart
        const a = Math.atan2(p.y - c.y, p.x - c.x);
        const push = p.radius + c.radius * 0.85 - d;
        p.sprite.x += Math.cos(a) * push * 0.5;
        p.sprite.y += Math.sin(a) * push * 0.5;
      }
    }
    this.creatures = this.creatures.filter((c) => c.alive);
  }

  /** Eating makes a scene: small prey nearby squeaks and bolts (quiet Silent eaters startle less). */
  private scatterAround(meal: Creature): void {
    const p = this.player;
    const silent = GameState.rank('silent');
    if (silent >= 3) return;
    const r = p.radius * 5 * (1 - 0.3 * silent);
    let scared = 0;
    for (const c of this.creatures) {
      if (c === meal || !c.alive || c.boss || c.def.behavior === 'host' || c.defeated || !c.edibleBy(p)) continue;
      if (Phaser.Math.Distance.Between(c.x, c.y, meal.x, meal.y) > r) continue;
      c.noticed = true;
      c.push(meal.x, meal.y, 260 * this.growthScale());
      if (scared === 0 && Math.random() < 0.2) this.floatText(c.x, c.y - c.radius, Phaser.Utils.Array.GetRandom(['eek!', 'squeak!', '!!', 'run!']), '#ffffff');
      scared++;
    }
    if (scared > 0) Sfx.play('squeak', Phaser.Math.FloatBetween(0.85, 1.25));
  }

  /** Contact with a fighter: bite it (pounces bite once per dash, at double damage). */
  private bite(c: Creature): void {
    const p = this.player;
    const pounce = this.abilities.consumePounce(c);
    if (this.biteCd > 0 && !pounce) return;
    this.biteCd = this.abilities.biteCooldown();
    const ratio = Phaser.Math.Clamp(p.size / c.size, 0.4, 2);
    const bonus = this.abilities.biteBonus(c);
    const dmg = BITE_BASE * ratio * GameState.stats.biteMul * (pounce ? 2 : 1) * bonus.mul;
    this.floatText(c.x, c.y - c.radius, `-${Math.round(dmg)}${pounce ? '!' : ''}${bonus.crit ? ' CRIT' : ''}`, bonus.crit ? '#ff5252' : '#ffd54f');
    const heavy = bonus.crit || pounce || dmg >= c.maxHp * 0.15;
    if (heavy) this.impact(bonus.crit ? 0.07 : 0.05, 120, 0.006);
    else this.cameras.main.shake(70, 0.003);
    Sfx.play(bonus.crit ? 'crit' : 'bite', Phaser.Math.Clamp(p.size / c.size, 0.7, 1.3));
    this.fx.burst(c.x, c.y, { color: bonus.crit ? 0xff5252 : 0xffd54f, count: bonus.crit ? 14 : 7, speed: c.radius * 5, scale: c.radius / 22 });
    const defeated = c.takeDamage(dmg, p.x, p.y);
    if (defeated) this.onDefeated(c);
    this.abilities.afterBite(c, dmg, defeated);
  }

  /** Discovers any secret form whose hidden condition has just been met. */
  private checkSecretForms(): void {
    for (const f of FORM_UNLOCKS) {
      if (Codex.hasForm(f.stageId) || !f.met()) continue;
      Codex.discoverForm(f.stageId);
      Achievements.unlock(({ canopy: 'secret_swift', delta: 'secret_croc', meadow: 'secret_wasp' } as Record<string, string>)[f.stageId]);
      const name = stageById(f.stageId)?.creatureName ?? '???';
      Sfx.play('fusion');
      this.cameras.main.flash(400, 200, 255, 220);
      this.toast(`SECRET FORM DISCOVERED: ${name}! Look for the ${f.mutation} mutation when you evolve.`);
      if (GameState.pendingEvolutions === 0) this.toast('Added to your Bestiary.');
    }
  }

  onDefeated(c: Creature): void {
    Codex.seeCreature(c.def.key);
    this.zone.onDefeated(c);
    if (c.size >= this.player.size * 2) Achievements.unlock('giant_slayer');
    this.abilities.countKill();
    this.floatText(c.x, c.y - c.radius * 1.4, 'DEFEATED!', '#ffffff');
    Sfx.play('defeat');
    this.fx.burst(c.x, c.y, { color: 0xffa726, count: 24, speed: c.radius * 7, scale: c.radius / 14, lifespan: 700 });
    this.impacts.push({ x: c.x, y: c.y, r: c.radius * 1.2, life: 0.18 });
  }

  /** Eats a creature. `share` < 1 for kills made by packmates. */
  eat(c: Creature, share = 1): void {
    if (!c.alive) return;
    c.alive = false;
    Codex.seeCreature(c.def.key);
    const counters = GameState.stageCounters;
    if (this.abilities.inBurst) counters.burstEats++;
    if (!c.noticed && !c.defeated) counters.ambushEats++;
    // a live meal is a kill too (a carcass was already counted when it was defeated)
    if (!c.defeated) this.abilities.countKill();
    if (c.def.key === 'frog' && GameState.stageIndex >= 1) Achievements.unlock('revenge');
    this.checkSecretForms();
    let comboBonus = 1;
    if (share === 1) {
      this.combo = this.comboTimer > 0 ? Math.min(this.combo + 1, 10) : 1;
      this.comboTimer = this.abilities.comboWindow();
      comboBonus = 1 + 0.05 * GameState.stats.comboRank * (this.combo - 1);
      if (this.combo >= 10) Achievements.unlock('combo');
    }
    if (c.size > this.player.size) Achievements.unlock('big_mouth');
    const carcass = c.defeated ? this.abilities.carcassMultiplier() : 1;
    const gained = GameState.addDna(c.dnaValue * comboBonus * carcass * this.abilities.eatMultiplier(c) * share * this.zone.dnaBonus);
    GameState.countMeal();
    if (Tutorial.current === 'eat' && ++Tutorial.progress >= 3) Tutorial.done('eat');
    if (GameState.eaten >= 500) Achievements.unlock('hungry');
    this.abilities.heal(GameState.stats.healOnEat * (GameState.hasFusion('undying') ? 2 : 1));
    const p = this.player;
    this.grow(Math.min(this.stage.growthRate * c.size * c.size * share, p.size * p.size * MAX_MEAL_GROWTH));
    const comboText = GameState.stats.comboRank > 0 && this.combo > 1 && share === 1 ? `  x${this.combo}` : '';
    this.floatText(c.x, c.y, `+${Math.round(gained)}${comboText}`, c.golden ? '#ffd54f' : '#8be9fd');
    if (share === 1) {
      p.gulp(c.size / p.size * 0.5 + 0.1);
      this.scatterAround(c);
    }
    if (c.golden) Sfx.play('golden');
    else if (c.defeated || c.size > this.player.size * 0.6) {
      Sfx.play('eatBig', Phaser.Math.Clamp(p.size / c.size, 0.7, 1.3));
      this.impact(0.04, 90, 0.004);
    }
    else Sfx.play('eat', Phaser.Math.Clamp(1.4 - c.size / this.player.size, 0.7, 1.4) * (1 + Math.min(this.combo, 10) * 0.03));
    this.fx.burst(c.x, c.y, {
      color: c.golden ? 0xffd54f : c.defeated ? 0xff8a65 : 0x9dff6a,
      count: Math.round(5 + c.size / 4),
      speed: c.radius * 5,
      scale: Math.max(0.15, c.radius / 26),
      lifespan: 350,
    });
    const to = share === 1 ? this.player : { x: c.x, y: c.y };
    this.tweens.add({
      targets: c.sprite,
      x: to.x,
      y: to.y,
      scale: 0,
      duration: 120,
      onComplete: () => c.sprite.destroy(),
    });
    if (share === 1) this.abilities.afterEat(c, this.combo);
  }

  private drink(c: Creature, dt: number): void {
    if (Tutorial.current === 'drink' && (Tutorial.progress += dt) >= 1.5) Tutorial.done('drink');
    const amount = DRINK_DNA_PER_SEC * dt;
    const gained = GameState.addDna(amount);
    c.blood -= amount;
    this.abilities.heal(GameState.stats.healOnEat * dt);
    this.grow(DRINK_GROWTH_AREA_PER_SEC * dt);

    this.drinkTextAcc += gained;
    Sfx.play('drink');
    if (Math.random() < dt * 10) {
      const p = this.player;
      this.fx.burst(p.x, p.y, { color: 0xd50000, count: 2, speed: p.radius * 3, scale: p.radius / 30, glow: false, gravity: p.radius * 8 });
    }
    if (this.drinkTextAcc >= 3) {
      this.floatText(this.player.x, this.player.y - this.player.radius, `+${Math.round(this.drinkTextAcc)}`, '#ff77b0');
      this.drinkTextAcc = 0;
    }

    c.annoyance += dt;
    if (c.annoyance >= c.swatThreshold && !this.swats.some((s) => s.host === c)) {
      c.annoyance = 0;
      c.swatThreshold = Phaser.Math.FloatBetween(1.6, 3);
      this.swats.push({ x: this.player.x, y: this.player.y, r: this.player.radius * 4.5, t: 0, host: c });
      Tutorial.trigger('swat');
    }

    if (c.blood <= 0) {
      c.drain();
      GameState.stageCounters.hostsDrained++;
      this.checkSecretForms();
      this.floatText(c.x, c.y - c.radius, 'Drained!', '#ffb3d1');
    }
  }

  private updateSwats(dt: number): void {
    const p = this.player;
    for (const s of this.swats) {
      s.t += dt;
      if (s.t >= SWAT_WINDUP) {
        this.impacts.push({ x: s.x, y: s.y, r: s.r, life: 0.18 });
        this.floatText(s.x, s.y - s.r, 'SWAT!', '#ffffff');
        Sfx.play('swat');
        if (Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) < s.r + p.radius * 0.5) {
          this.hurtPlayer(s.host.def.swatDamage ?? 25, s.x, s.y, `an annoyed ${s.host.name}`, s.host);
        }
      }
    }
    this.swats = this.swats.filter((s) => s.t < SWAT_WINDUP);
    for (const im of this.impacts) im.life -= dt;
    this.impacts = this.impacts.filter((im) => im.life > 0);
  }

  // ------------------------------------------------------------ predator special moves

  private shoot(from: Creature, angle: number, kind: ProjectileKind): void {
    const def = from.def;
    Sfx.play(kind === 'spear' ? 'spear' : 'web');
    const speed = def.spit?.speed ?? def.projectileSpeed ?? 400;
    const range = def.spit?.range ?? def.range ?? 300;
    const sprite = this.add
      .image(from.x + Math.cos(angle) * from.radius, from.y + Math.sin(angle) * from.radius, PROJECTILE_TEXTURE[kind])
      .setRotation(angle)
      .setScale(kind === 'spear' ? (from.size * 2.6) / 60 : Math.max(0.6, from.size / 20))
      .setDepth(26);
    this.projectiles.push({
      sprite,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: (range * 1.4) / speed,
      damage: def.spit?.damage ?? def.projectileDamage ?? 15,
      kind,
      owner: from,
    });
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.sprite.x += pr.vx * dt;
      pr.sprite.y += pr.vy * dt;
      if (pr.kind !== 'spear') pr.sprite.rotation += dt * 8;
      if (Phaser.Math.Distance.Between(pr.sprite.x, pr.sprite.y, p.x, p.y) < p.radius + 4) {
        const owner = pr.owner.alive ? pr.owner : undefined;
        const what = pr.kind === 'spear' ? 'a spear' : pr.kind === 'web' ? 'a web' : 'a net';
        if (this.hurtPlayer(pr.damage, pr.sprite.x - pr.vx * 0.05, pr.sprite.y - pr.vy * 0.05, `${what} thrown by a ${pr.owner.name}`, owner, 150)) {
          if (pr.kind === 'web') {
            this.slowPlayer(0.5, 2.5);
            this.floatText(p.x, p.y - p.radius * 1.5, 'WEBBED!', '#eceff1');
          } else if (pr.kind === 'net') {
            this.slowPlayer(0.15, 1.4);
            this.floatText(p.x, p.y - p.radius * 1.5, 'NETTED!', '#b3e5fc');
          }
          pr.life = 0;
        }
      }
      if (pr.life <= 0) {
        // webs that miss stick to the ground
        if (pr.kind === 'web') this.webs.push({ x: pr.sprite.x, y: pr.sprite.y, r: pr.owner.radius * 1.4, life: WEB_PATCH_LIFE });
        pr.sprite.destroy();
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
  }

  private updateWebs(dt: number): void {
    const p = this.player;
    for (const w of this.webs) {
      w.life -= dt;
      if (!p.dashing && Phaser.Math.Distance.Between(p.x, p.y, w.x, w.y) < w.r + p.radius * 0.5) this.slowPlayer(0.5, 0.3);
    }
    this.webs = this.webs.filter((w) => w.life > 0);
  }

  /** Area slam centred on a creature (bear slam, bullfrog croak, rival roar). */
  private slam(from: Creature): void {
    const sl = from.def.slam;
    if (!sl) return;
    const p = this.player;
    const r = from.radius * sl.radius;
    this.impacts.push({ x: from.x, y: from.y, r, life: 0.22 });
    this.cameras.main.shake(180, 0.008);
    this.floatText(from.x, from.y - from.radius * 1.3, sl.shout, '#ffffff');
    Sfx.play(sl.shout === 'ROAR!' ? 'roar' : 'slam');
    this.fx.ring(from.x, from.y, r, 0xbcaaa4, 22);
    if (Phaser.Math.Distance.Between(p.x, p.y, from.x, from.y) < r + p.radius * 0.5 && from.threatTo(p)) {
      if (this.hurtPlayer(sl.damage, from.x, from.y, `a ${from.name}'s ${sl.shout.toLowerCase().replace('!', '')}`, from, sl.knock) && sl.slow) {
        this.slowPlayer(0.45, sl.slow);
      }
    }
  }

  private alertPack(from: Creature): void {
    Sfx.play('howl');
    for (const c of this.creatures) {
      if (c !== from && c.alive && c.def.key === from.def.key && Phaser.Math.Distance.Between(c.x, c.y, from.x, from.y) < 800) c.alert();
    }
  }

  // ------------------------------------------------------------ spawning

  /** Spawns `count` creatures (a pack/herd when > 1) somewhere at least minDist from the player. */
  /**
   * A real threat in this zone: it bites and is bigger than you when the stage starts. Returning
   * creatures that bite but are already food don't count (more of those would just be more meals).
   */
  private zoneThreat(def: CreatureDef): boolean {
    return def.damage > 0 && (def.size[0] + def.size[1]) / 2 > this.stage.startSize * DANGER_RATIO;
  }

  /** Predators sped up for the difficulty (one copy per creature and speed, shared across stages). */
  private tunedDef(def: CreatureDef): CreatureDef {
    const k = GameState.diff.predatorSpeed;
    if (k === 1 || !this.zoneThreat(def)) return def;
    const id = `${def.key}@${def.speed}@${k}`;
    let out = TUNED.get(id);
    if (!out) {
      const m = (v?: number) => (v === undefined ? undefined : v * k);
      out = { ...def, speed: def.speed * k, chaseSpeed: m(def.chaseSpeed), chargeSpeed: m(def.chargeSpeed), stalkSpeed: m(def.stalkSpeed) };
      TUNED.set(id, out);
    }
    return out;
  }

  /** How many of a zone's creature to keep around: Pheromones and the difficulty change the prey, the difficulty the predators. */
  private spawnCount(def: CreatureDef, count: number): number {
    const d = GameState.diff;
    const isPrey = def.damage === 0 && def.behavior !== 'host' && def.behavior !== 'ranged' && !def.hp;
    if (isPrey) return Math.round(count * GameState.stats.preyMul * d.preyCount);
    return this.zoneThreat(def) ? Math.round(count * d.predatorCount) : count;
  }

  private spawn(def: CreatureDef, minDist: number, count = 1): Creature[] {
    const W = this.stage.worldSize;
    const pad = def.size[1] * 3 + 10;
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = Phaser.Math.Between(pad, W - pad);
      y = Phaser.Math.Between(pad, W - pad);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) >= minDist) break;
    }
    return this.spawnAt(def, x, y, count);
  }

  /** Spawns a group around a point roughly `dist` away from the player (swarm calls, golden snacks). */
  spawnNear(def: CreatureDef, dist: number, count: number): Creature[] {
    const W = this.stage.worldSize;
    const a = Math.random() * Math.PI * 2;
    const pad = def.size[1] * 3 + 10;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * dist, pad, W - pad);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * dist, pad, W - pad);
    return this.spawnAt(def, x, y, count);
  }

  spawnAt(def: CreatureDef, x: number, y: number, count: number): Creature[] {
    const W = this.stage.worldSize;
    const pad = def.size[1] * 3 + 10;
    x = Phaser.Math.Clamp(x, pad, W - pad);
    y = Phaser.Math.Clamp(y, pad, W - pad);
    const canBeAlpha = (def.damage > 0 || !!def.hp) && def.behavior !== 'host' && !def.key.startsWith('boss_');
    const out: Creature[] = [];
    for (let i = 0; i < count; i++) {
      const spread = i === 0 ? 0 : def.size[1] * 2.5;
      const c = new Creature(
        this,
        def,
        x + Phaser.Math.FloatBetween(-spread, spread),
        y + Phaser.Math.FloatBetween(-spread, spread),
        canBeAlpha && Math.random() < ELITE_CHANCE,
        sizeFactor(def.key, this.stage),
      );
      // pack members fan out to flank
      c.flank = count > 1 ? (i - (count - 1) / 2) * 0.8 : 0;
      // a species whose boss you beat keeps out of your way
      c.calm = (!!def.warning && !this.warned.has(def.key)) || this.zone.tames(def.key);
      this.creatures.push(c);
      out.push(c);
    }
    return out;
  }

  /** Keeps every population topped up, spawning just outside the camera view. */
  private upkeepSpawns(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.5;

    const cam = this.cameras.main;
    const offscreen = Math.hypot(GAME_WIDTH, GAME_HEIGHT) / 2 / cam.zoom + 60;

    // drained hosts wander off once nobody is looking
    for (const c of this.creatures) {
      if (c.drained && Phaser.Math.Distance.Between(c.x, c.y, this.player.x, this.player.y) > offscreen) c.destroy();
    }
    this.creatures = this.creatures.filter((c) => c.alive);

    const counts: Record<string, number> = {};
    for (const c of this.creatures) if (!c.drained && !c.golden) counts[c.def.key] = (counts[c.def.key] ?? 0) + 1;
    for (const s of this.stage.spawns) {
      const def = this.tunedDef(creatureDef(s.creature, this.stage));
      const target = this.spawnCount(def, s.count);
      const missing = target - (counts[s.creature] ?? 0);
      const group = s.group ?? 1;
      if (group > 1) {
        if (missing >= group) this.spawn(def, offscreen, group);
      } else {
        for (let i = 0; i < Math.min(missing, 3); i++) this.spawn(def, offscreen);
      }
    }
  }

  // ------------------------------------------------------------ progression

  private checkProgress(): void {
    while (GameState.dna >= GameState.dnaToNext) {
      GameState.dna -= GameState.dnaToNext;
      GameState.dnaToNext = Math.round(GameState.dnaToNext * DNA_COST_GROWTH);
      GameState.evolutionsEarned++;
      GameState.pendingEvolutions++;
    }
    if (!this.stageCompleteAnnounced && this.player.size >= this.stage.evolveSize) {
      this.stageCompleteAnnounced = true;
      this.onStageComplete();
    }
  }

  /** DNA bar filled: pause and offer a trait. */
  private openEvolution(): void {
    if (pickChoices(GameState.traitRanks, GameState.fusions, 3, {}, [], GameState.trophies).length === 0) {
      // every trait maxed: cash the evolution in as a full heal
      GameState.pendingEvolutions = 0;
      GameState.heal(GameState.stats.maxHp);
      this.toast('Perfect specimen! Mutation converted into a full heal.');
      return;
    }
    this.evolving = true;
    Sfx.play('evolve');
    this.scene.pause();
    this.scene.launch('Evolution');
  }

  /** Reports what you've done to the first-run tips, and opens tips for new abilities. */
  private tutorialTick(dt: number): void {
    const t = Tutorial;
    if (!t.enabled) return;
    const st = GameState.stats;
    const cd = GameState.cooldowns;
    if (t.current === 'move' && (this.inputDir.x || this.inputDir.y) && (t.progress += dt) >= 1.2) t.done('move');
    if (t.current === 'grow' && this.growthProgress >= 0.5) t.done('grow');
    if (st.venomRank > 0) t.trigger('venom');
    if (t.current === 'venom' && cd.venom > 0) t.done('venom');
    if (st.dashRank > 0) t.trigger('dash');
    if (t.current === 'dash' && cd.dash > 0) t.done('dash');
    if (t.current === 'signature' && cd.signature > 0) t.done('signature');
  }

  /** Mid-stage save, unless the run is ending or you are mid-metamorphosis. */
  private saveProgress = (): void => {
    if (this.dead || this.isOver || this.leaving) return;
    RunSave.checkpoint();
  };

  private pauseOnBlur = (): void => {
    if (Settings.flag('pauseOnBlur') && this.scene.isActive()) this.openPause();
  };

  private openPause(): void {
    if (this.isOver || this.evolving || !this.scene.isActive()) return;
    this.saveProgress();
    this.evolving = true; // blocks evolution popups while paused
    Sfx.play('pause');
    this.scene.pause();
    this.scene.pause('HUD');
    // explicit data: Phaser would otherwise reuse a finale's from the last launch
    this.scene.launch('Pause', { from: 'Stage' });
  }

  private onResume(_sys: Phaser.Scenes.Systems, data?: { chosen?: Choice }): void {
    this.evolving = false;
    // a new pick (or anything changed while paused) is saved right away
    this.saveProgress();
    // keys released while paused would otherwise stay "down"
    this.input.keyboard!.resetKeys();
    this.controls.reset();
    const choice = data?.chosen;
    if (!choice) return;
    const p = this.player;
    Sfx.play(choice.kind === 'fusion' ? 'fusion' : 'pick');
    this.fx.ring(p.x, p.y, p.radius * 3, choice.kind === 'fusion' ? 0xffd54f : 0x8be9fd, choice.kind === 'fusion' ? 32 : 20);
    if (choice.kind === 'form') {
      const f = formUnlock(choice.id);
      const name = stageById(choice.id)?.creatureName ?? '???';
      this.toast(`MUTATION: ${f?.mutation}! At your next metamorphosis you become a ${name}.`);
      this.cameras.main.flash(300, 160, 255, 220);
      this.floatText(p.x, p.y - p.radius * 2, f?.mutation ?? '', '#a7ffeb');
      return;
    }
    if (choice.kind === 'fusion') {
      const f = FUSIONS[choice.id];
      this.toast(`FUSION: ${f.name}! ${f.effect}`);
      this.cameras.main.flash(300, 255, 230, 120);
      this.floatText(p.x, p.y - p.radius * 2, f.name, '#ffd54f');
      return;
    }
    const id = choice.id;
    const rank = GameState.rank(id);
    this.toast(`Evolved: ${GameState.traitName(id, rank)}!`);
    const unlock = TRAITS[id].unlock?.(rank, GameState.stageIndex);
    if (unlock) this.toast(`New: ${unlock}`);
    if (rank === 1 && id === 'venom') {
      this.toast(GameState.stageIndex >= BREATH_STAGE ? 'Press SPACE (or right-click to aim) for Toxic Breath' : 'Press SPACE (or right-click to aim) to spit venom');
    }
    if (rank === 1 && id === 'wings') this.toast('Press SHIFT to dash');
    if (rank === 1 && id === 'nimble' && GameState.rank('wings') === 0) this.toast('Press SHIFT to sidestep');
    this.floatText(p.x, p.y - p.radius * 2, GameState.traitName(id, 0), '#8be9fd');
  }

  /** Size threshold reached: metamorphose into the next stage (the Apex Beast becomes the Overlord). */
  private onStageComplete(): void {
    this.readyToEvolve = true;
    this.toast(GameState.stageIndex + 1 === STAGE_NAMES.length - 1 ? 'The world trembles. Something greater awakens...' : 'You feel... strange.');
  }

  private leaveStage(): void {
    this.leaving = true;
    Sfx.stopAmbient();
    Sfx.play('dash');
    this.player.invuln = 99;
    const cam = this.cameras.main;
    cam.zoomTo(cam.zoom * 1.8, 1100, 'Quad.easeIn');
    this.tweens.add({ targets: this.player.sprite, angle: this.player.sprite.angle + 720, duration: 1100, ease: 'Quad.easeIn' });
    cam.fadeOut(1100, 255, 255, 255);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('HUD');
      this.scene.start('Transition', { from: GameState.stageIndex });
    });
  }

  // ------------------------------------------------------------ view

  private updateCamera(): void {
    const cam = this.cameras.main;
    const target = (this.stage.baseZoom * Math.pow(this.stage.startSize / this.player.size, 0.6)) / GameState.stats.viewMul;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, target, 0.04));
  }

  private drawOverlay(): void {
    const g = this.overlay;
    const cam = this.cameras.main;
    const p = this.player;
    const lw = 2 / cam.zoom;
    const view = new Phaser.Geom.Rectangle(cam.worldView.x - 80, cam.worldView.y - 80, cam.worldView.width + 160, cam.worldView.height + 160);
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 150);
    g.clear();

    // player shadow + faint outline for contrast on busy ground
    const u = this.underlay;
    u.clear();
    u.fillStyle(0x000000, 0.3);
    u.fillEllipse(p.x + p.radius * 0.15, p.y + p.radius * 0.3, p.radius * 2.3, p.radius * 1.9);
    g.lineStyle(lw, 0xffffff, 0.3);
    g.strokeCircle(p.x, p.y, p.radius * 1.15);

    for (const w of this.webs) {
      const a = Math.min(1, w.life / 1.5) * 0.5;
      g.lineStyle(lw, 0xffffff, a);
      g.strokeCircle(w.x, w.y, w.r);
      g.strokeCircle(w.x, w.y, w.r * 0.55);
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2;
        g.lineBetween(w.x, w.y, w.x + Math.cos(an) * w.r, w.y + Math.sin(an) * w.r);
      }
    }

    for (const c of this.creatures) {
      if (!c.alive || !view.contains(c.x, c.y) || this.zone.inDarkness(c.x, c.y) || (c.boss && this.zone.bossHiding)) continue;

      if (c.def.human && !this.humansSeen && cam.worldView.contains(c.x, c.y)) {
        this.humansSeen = true;
        this.toast('Wait... are those HUMANS? They have pointy sticks.');
      }
      if (c.calm && !this.warned.has(c.def.key) && !this.zone.tames(c.def.key) && cam.worldView.contains(c.x, c.y)) this.warn(c);
      if (c.elite && !this.alphasSeen.has(c) && cam.worldView.contains(c.x, c.y)) {
        this.alphasSeen.add(c);
        this.floatText(c.x, c.y - c.radius * 1.5, `${c.name.toUpperCase()}!`, '#ffd54f');
      }

      const tip = c.tongueTip();
      if (tip) {
        g.lineStyle(Math.max(2, c.size * 0.18), 0xe05a7a, 1);
        g.lineBetween(tip.mx, tip.my, tip.x, tip.y);
        g.fillStyle(0xff7f9e, 1);
        g.fillCircle(tip.x, tip.y, Math.max(2.5, c.size * 0.16));
      }

      // wind-up telegraphs: the lane it will lunge down / the line it will throw along
      const thin = c.def.behavior === 'ranged' || c.state === 'spitAim';
      if ((c.state === 'aim' || c.state === 'spitAim') && (c.threatTo(p) || c.def.behavior === 'ranged')) {
        const len = c.telegraphLength();
        const ex = c.x + Math.cos(c.aimAngle) * len;
        const ey = c.y + Math.sin(c.aimAngle) * len;
        g.lineStyle(c.radius * (thin ? 0.5 : 1.4), COLORS.danger, 0.16);
        g.lineBetween(c.x, c.y, ex, ey);
        g.lineStyle(lw, COLORS.danger, 0.7);
        g.lineBetween(c.x, c.y, ex, ey);
      }
      // slam telegraph: the area about to be hit fills up
      if (c.state === 'slam' && c.def.slam) {
        const r = c.radius * c.def.slam.radius;
        g.fillStyle(COLORS.danger, 0.08 + 0.3 * c.slamProgress());
        g.fillCircle(c.x, c.y, r * c.slamProgress());
        g.lineStyle(lw * 1.5, COLORS.danger, 0.9);
        g.strokeCircle(c.x, c.y, r);
      }

      // threat / food indicator rings
      let color: number | null = null;
      if (c.def.behavior === 'host') color = c.drained ? null : COLORS.host;
      else if (c.golden) color = 0xffd54f;
      else if (c.edibleBy(p)) color = COLORS.edible;
      else if (c.stunned) color = COLORS.stun;
      else if (c.threatTo(p) || c.def.behavior === 'ranged') color = COLORS.danger;
      else if (c.fighter) color = COLORS.fight;
      if (color === COLORS.danger && this.zone.hidesThreats) color = null;
      if (color === COLORS.danger && cam.worldView.contains(c.x, c.y)) Tutorial.trigger('danger');
      if (color !== null) {
        const active = c.state === 'windup' || c.state === 'chase' || c.state === 'aim' || c.state === 'charging' || c.state === 'slam';
        g.lineStyle(lw, color, active ? 0.95 : 0.55);
        g.strokeCircle(c.x, c.y, c.radius + 3 / cam.zoom);
      }
      if (c.elite || c.golden) {
        g.lineStyle(lw * 1.5, 0xffd54f, 0.4 + 0.5 * pulse);
        g.strokeCircle(c.x, c.y, c.radius + 8 / cam.zoom);
      }

      // health bar once a fighter has been hurt
      if (c.fighter && (c.hp < c.maxHp || c.boss)) {
        const w = c.radius * 1.6;
        const h = 5 / cam.zoom;
        const bx = c.x - w / 2;
        const by = c.y - c.radius - 12 / cam.zoom;
        g.fillStyle(0x000000, 0.6);
        g.fillRect(bx, by, w, h);
        g.fillStyle(c.hp / c.maxHp > 0.4 ? 0xffa726 : 0xff4040, 1);
        g.fillRect(bx, by, w * (c.hp / c.maxHp), h);
      }
    }

    this.zone.draw(g, lw);
    this.abilities.draw(g, lw, cam);

    // status effects on the player
    if (this.slowTime > 0) {
      g.lineStyle(lw, 0xeceff1, 0.7);
      for (let i = 0; i < 4; i++) {
        const an = (i / 4) * Math.PI + this.time.now / 800;
        g.lineBetween(p.x - Math.cos(an) * p.radius * 1.2, p.y - Math.sin(an) * p.radius * 1.2, p.x + Math.cos(an) * p.radius * 1.2, p.y + Math.sin(an) * p.radius * 1.2);
      }
    }
    if (this.poisonTime > 0) {
      g.lineStyle(lw * 2, 0x9ccc65, 0.3 + 0.4 * pulse);
      g.strokeCircle(p.x, p.y, p.radius * 1.15);
    }

    for (const s of this.swats) {
      const k = s.t / SWAT_WINDUP;
      g.fillStyle(0xff3030, 0.1 + 0.3 * k);
      g.fillCircle(s.x, s.y, s.r * k);
      g.lineStyle(lw * 1.5, 0xff3030, 0.9);
      g.strokeCircle(s.x, s.y, s.r);
    }
    for (const im of this.impacts) {
      g.fillStyle(0xffffff, Math.min(1, im.life / 0.18));
      g.fillCircle(im.x, im.y, im.r);
    }
  }

  floatText(x: number, y: number, text: string, color: string): void {
    // damage numbers can be switched off; words (CRUNCH!, DEFEATED!) always show
    if (!Settings.flag('showNumbers') && /^[-+]?\d/.test(text)) return;
    const z = this.cameras.main.zoom;
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '16px', color, stroke: '#000000', strokeThickness: 3, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setResolution(2)
      .setScale(1 / z)
      .setDepth(40);
    this.tweens.add({ targets: t, y: y - 28 / z, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  toast(msg: string): void {
    this.game.events.emit('toast', msg);
  }
}
