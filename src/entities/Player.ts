import Phaser from 'phaser';
import { BODY_RADIUS } from '../art/textures';
import type { Motion } from '../data/stages';

/** Forms heavy enough to kick up dust as they walk. */
const HEAVY = ['tyrant', 'apex'];

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  vx = 0;
  vy = 0;
  /** Seconds of invulnerability left after a hit. */
  invuln = 0;
  /** Seconds since last damage (drives regen). */
  sinceHurt = 99;
  /** Seconds left in the current dash (invulnerable, fixed velocity). */
  dashTime = 0;
  /** Set by the abilities each frame: under water (swimmers leave ripples). */
  inWater = false;
  private t = 0;
  /** Swallow squash: 1 right after a gulp, back to 0 over a quarter second. */
  private squash = 0;
  private squashAmount = 0;
  /** Walk cycle: advances with distance moved, so the stride matches the speed. */
  private stride = 0;
  private stepSide = 1;
  private rippleTimer = 0;
  /** Gliders: a soft shadow below them, offset more as they bob up. */
  private readonly shadow: Phaser.GameObjects.Ellipse | null;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    public size: number,
    private worldSize: number,
    private readonly motion: Motion = 'buzz',
  ) {
    this.shadow = motion === 'glide' ? scene.add.ellipse(x, y, 10, 10, 0x000000, 1).setDepth(19.5) : null;
    this.sprite = scene.add.image(x, y, texture).setDepth(20);
    this.updateScale();
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }
  get radius(): number { return this.size; }

  /** dirX/dirY: desired direction (normalised or zero). */
  update(dt: number, dirX: number, dirY: number, speed: number, accel = 9): void {
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.sinceHurt += dt;

    if (this.dashTime > 0) {
      this.dashTime -= dt;
    } else {
      const k = Math.min(1, dt * accel);
      this.vx += (dirX * speed - this.vx) * k;
      this.vy += (dirY * speed - this.vy) * k;
    }

    const r = this.radius;
    const px = this.sprite.x;
    const py = this.sprite.y;
    this.sprite.x = Phaser.Math.Clamp(px + this.vx * dt, r, this.worldSize - r);
    this.sprite.y = Phaser.Math.Clamp(py + this.vy * dt, r, this.worldSize - r);
    const moved = Math.hypot(this.sprite.x - px, this.sprite.y - py);

    if (Math.hypot(this.vx, this.vy) > 15) {
      const target = Math.atan2(this.vy, this.vx);
      this.sprite.rotation = Phaser.Math.Angle.RotateTo(this.sprite.rotation, target, dt * 12);
    }

    this.updateScale(dt, moved, speed);
    // blink while invulnerable
    this.sprite.setAlpha(this.invuln > 0 && Math.floor(this.t * 16) % 2 === 0 ? 0.35 : 1);
  }

  /** Bursts in a direction (falls back to facing direction if none given). */
  dash(dirX: number, dirY: number, speed: number, duration: number): void {
    let a = this.sprite.rotation;
    if (dirX !== 0 || dirY !== 0) a = Math.atan2(dirY, dirX);
    this.vx = Math.cos(a) * speed;
    this.vy = Math.sin(a) * speed;
    this.sprite.rotation = a;
    this.dashTime = duration;
  }

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  knockback(fromX: number, fromY: number, force: number): void {
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.vx = Math.cos(a) * force;
    this.vy = Math.sin(a) * force;
  }

  /** A meal going down: bigger meals bulge more. */
  gulp(amount: number): void {
    this.squash = 1;
    this.squashAmount = Phaser.Math.Clamp(amount, 0.12, 0.45);
  }

  /**
   * Scale each frame: the form's way of moving (insects buzz, gliders bob, walkers stride,
   * swimmers wave), with the gulp squash on top. Rotation is left alone: it is the facing.
   */
  private updateScale(dt = 0, moved = 0, speed = 1): void {
    const base = this.size / BODY_RADIUS;
    // 0 standing still .. 1 at full speed
    const pace = Phaser.Math.Clamp(Math.hypot(this.vx, this.vy) / Math.max(1, speed), 0, 1);
    let sx = 1;
    let sy = 1;
    switch (this.motion) {
      case 'buzz': {
        const buzz = 1 + Math.sin(this.t * 45) * 0.03;
        sx = sy = buzz;
        break;
      }
      case 'glide': {
        // a slow rise and fall; the shadow drifts further out as it rises
        const bob = Math.sin(this.t * 2.2);
        sx = sy = 1 + bob * 0.04;
        if (this.shadow) {
          const off = this.radius * (1 + bob * 0.25);
          this.shadow
            .setPosition(this.sprite.x + off * 0.6, this.sprite.y + off)
            .setSize(this.radius * 2, this.radius * 1.3)
            .setRotation(this.sprite.rotation)
            .setAlpha(0.4 * this.sprite.alpha);
        }
        break;
      }
      case 'walk': {
        // body sways side to side with each step
        this.stride += moved / (this.radius * 1.2);
        if (this.stride >= 1) {
          this.stride -= 1;
          this.stepSide = -this.stepSide;
          if (HEAVY.includes(this.sprite.texture.key) && pace > 0.4) this.dust();
        }
        const step = Math.sin(this.stride * Math.PI) * pace;
        sy = 1 + step * 0.07 * this.stepSide;
        sx = 1 - step * 0.03;
        break;
      }
      case 'swim': {
        // a body wave that quickens with speed, and ripples while under water
        const wave = Math.sin(this.t * (5 + 6 * pace));
        sy = 1 + wave * 0.06 * (0.4 + pace);
        sx = 1 - wave * 0.02;
        this.rippleTimer -= dt;
        if (this.inWater && pace > 0.2 && this.rippleTimer <= 0) {
          this.rippleTimer = 0.35;
          this.ripple();
        }
        break;
      }
    }
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 4);
      // short and wide as it goes down, then a little springy overshoot
      const k = Math.sin(this.squash * Math.PI) * this.squashAmount;
      sx *= 1 - k * 0.55;
      sy *= 1 + k;
    }
    this.sprite.setScale(base * sx, base * sy);
  }

  /** Heavy walkers: a puff of dust from each footfall. */
  private dust(): void {
    const a = this.sprite.rotation + Math.PI + this.stepSide * 0.5;
    const d = this.radius * 0.8;
    const puff = this.scene.add.circle(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, this.radius * 0.3, 0xbcaaa4, 0.35).setDepth(19);
    this.scene.tweens.add({ targets: puff, scale: 2.2, alpha: 0, duration: 500, ease: 'Quad.easeOut', onComplete: () => puff.destroy() });
  }

  /** Swimmers under water: a spreading ring behind them. */
  private ripple(): void {
    const ring = this.scene.add.circle(this.x, this.y, this.radius * 0.8).setStrokeStyle(2, 0xb3e5fc, 0.5).setDepth(19);
    this.scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  }
}
