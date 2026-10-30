import Phaser from 'phaser';
import { BODY_RADIUS } from '../art/textures';
import type { Creature } from './Creature';
import type { Player } from './Player';

/** Pack Call: a temporary raptor packmate that hunts prey and fights rivals for you. */
export class Ally {
  readonly sprite: Phaser.GameObjects.Image;
  alive = true;
  vx = 0;
  vy = 0;
  target: Creature | null = null;
  /** Rally: the creature it was ordered to attack (it hunts freely once that one is gone). */
  focus: Creature | null = null;
  /** Hatched by Rally (for Chain of Command). */
  rally = false;
  biteCd = 0;
  private retarget = 0;
  private t = Math.random() * 10;

  constructor(scene: Phaser.Scene, texture: string, x: number, y: number, readonly size: number, public life: number) {
    this.sprite = scene.add.image(x, y, texture).setTint(0xffcc80).setDepth(19).setScale(size / BODY_RADIUS);
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }
  get radius(): number { return this.size; }

  /** Picks the nearest prey it could eat or fighter it could gang up on. */
  private pickTarget(creatures: Creature[]): void {
    let best: Creature | null = null;
    let bd = 650;
    for (const c of creatures) {
      if (!c.alive || c.defeated || c.def.behavior === 'host') continue;
      const ok = c.fighter || c.size < this.size * 1.1;
      if (!ok) continue;
      const d = Math.hypot(c.x - this.x, c.y - this.y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    this.target = best;
  }

  update(dt: number, creatures: Creature[], player: Player, speed: number, worldSize: number): void {
    this.t += dt;
    this.life -= dt;
    this.biteCd -= dt;
    this.retarget -= dt;
    if (this.focus && (!this.focus.alive || this.focus.defeated)) this.focus = null;
    if (this.focus) this.target = this.focus;
    else if (this.retarget <= 0 || (this.target && (!this.target.alive || this.target.defeated))) {
      this.pickTarget(creatures);
      this.retarget = 0.5;
    }

    let tx = player.x + Math.cos(this.t) * player.radius * 3;
    let ty = player.y + Math.sin(this.t) * player.radius * 3;
    if (this.target) {
      tx = this.target.x;
      ty = this.target.y;
    }
    const a = Math.atan2(ty - this.y, tx - this.x);
    const k = Math.min(1, dt * 6);
    this.vx += (Math.cos(a) * speed - this.vx) * k;
    this.vy += (Math.sin(a) * speed - this.vy) * k;
    const r = this.radius;
    this.sprite.x = Phaser.Math.Clamp(this.x + this.vx * dt, r, worldSize - r);
    this.sprite.y = Phaser.Math.Clamp(this.y + this.vy * dt, r, worldSize - r);
    this.sprite.rotation = Phaser.Math.Angle.RotateTo(this.sprite.rotation, Math.atan2(this.vy, this.vx), dt * 10);
    // fade out over the last second
    this.sprite.setAlpha(Phaser.Math.Clamp(this.life, 0.2, 1));
  }

  destroy(): void {
    this.alive = false;
    this.sprite.destroy();
  }
}
