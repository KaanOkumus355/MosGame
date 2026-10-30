import Phaser from 'phaser';
import { Settings } from '../state/Settings';

export interface BurstOpts {
  color: number;
  count?: number;
  /** World units per second at max. */
  speed?: number;
  /** Particle scale at spawn. */
  scale?: number;
  lifespan?: number;
  /** Additive glow (true) or normal blending. */
  glow?: boolean;
  /** Pull particles downward (droplets, debris). */
  gravity?: number;
}

/** Ambient particles drifting through a biome. */
export interface AmbientParticles {
  colors: number[];
  /** Particles spawned per second across the visible area. */
  rate: number;
  /** Base velocity (world units/s, before zoom scaling). */
  vx: [number, number];
  vy: [number, number];
  scale: [number, number];
  lifespan: number;
  glow: boolean;
  /** Flicker alpha like fireflies. */
  twinkle?: boolean;
}

/**
 * Particle bursts and ambient biome particles, all made from the shared 'spark' texture.
 * One reconfigurable emitter per blend mode keeps it cheap.
 */
export class Fx {
  private glow: Phaser.GameObjects.Particles.ParticleEmitter;
  private flat: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private ambientDef: AmbientParticles | null = null;
  private ambientAcc = 0;
  private ambientZoom = 0;

  constructor(private readonly scene: Phaser.Scene, depth = 35) {
    const base = { lifespan: 400, speed: { min: 20, max: 100 }, scale: { start: 0.6, end: 0 }, alpha: { start: 1, end: 0 }, emitting: false };
    this.glow = scene.add.particles(0, 0, 'spark', { ...base, blendMode: 'ADD' }).setDepth(depth);
    this.flat = scene.add.particles(0, 0, 'spark', base).setDepth(depth);
  }

  burst(x: number, y: number, o: BurstOpts): void {
    const em = o.glow === false ? this.flat : this.glow;
    const speed = o.speed ?? 120;
    const scale = o.scale ?? 0.6;
    em.updateConfig({
      speed: { min: speed * 0.25, max: speed },
      scale: { start: scale, end: 0 },
      lifespan: { min: (o.lifespan ?? 450) * 0.6, max: o.lifespan ?? 450 },
      tint: o.color,
      gravityY: o.gravity ?? 0,
      alpha: { start: 1, end: 0 },
    });
    const count = o.count ?? 10;
    em.explode(Settings.flag('reducedParticles') ? Math.ceil(count / 3) : count, x, y);
  }

  /** Evenly spaced particles flying outward in a ring. */
  ring(x: number, y: number, radius: number, color: number, count = 18): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.burst(x + Math.cos(a) * radius * 0.3, y + Math.sin(a) * radius * 0.3, { color, count: 1, speed: radius * 2.4, scale: 0.5, lifespan: 420 });
    }
  }

  setAmbient(def: AmbientParticles | null): void {
    this.ambient?.destroy();
    this.ambient = null;
    this.ambientDef = def;
    if (!def) return;
    this.ambient = this.scene.add
      .particles(0, 0, 'spark', {
        emitting: false,
        lifespan: def.lifespan,
        speedX: { min: def.vx[0], max: def.vx[1] },
        speedY: { min: def.vy[0], max: def.vy[1] },
        scale: { min: def.scale[0], max: def.scale[1] },
        // fireflies pulse; everything else just fades out
        alpha: def.twinkle
          ? { onUpdate: (_p: Phaser.GameObjects.Particles.Particle, _k: string, t: number) => (1 - t) * (0.55 + 0.45 * Math.sin(t * 30)) }
          : { start: 0.8, end: 0 },
        tint: def.colors,
        blendMode: def.glow ? 'ADD' : 'NORMAL',
      })
      .setDepth(3);
  }

  /** Spawns ambient particles across the camera view; call every frame. */
  updateAmbient(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const def = this.ambientDef;
    if (!def || !this.ambient) return;
    const z = cam.zoom;
    // keep particles the same size and drift on screen whatever the zoom (zoom changes slowly)
    if (Math.abs(z - this.ambientZoom) > 0.03) {
      this.ambientZoom = z;
      this.ambient.updateConfig({
        speedX: { min: def.vx[0] / z, max: def.vx[1] / z },
        speedY: { min: def.vy[0] / z, max: def.vy[1] / z },
        scale: { min: def.scale[0] / z, max: def.scale[1] / z },
      });
    }
    this.ambientAcc += dt * def.rate * (Settings.flag('reducedParticles') ? 0.35 : 1);
    const v = cam.worldView;
    while (this.ambientAcc >= 1) {
      this.ambientAcc -= 1;
      this.ambient.emitParticleAt(v.x + Math.random() * v.width, v.y + Math.random() * v.height, 1);
    }
  }
}
