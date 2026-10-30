import Phaser from 'phaser';
import type { StageDef } from '../data/stages';

export interface Pool {
  x: number;
  y: number;
  r: number;
}

/** Lays down the ground tile, water pools and decor for a stage. Returns the pools (they matter for gameplay). */
export function buildBiome(scene: Phaser.Scene, stage: StageDef): Pool[] {
  const W = stage.worldSize;
  scene.add.tileSprite(0, 0, W, W, stage.groundTexture).setOrigin(0).setDepth(0);

  const rng = new Phaser.Math.RandomDataGenerator([stage.id]);
  const pools: Pool[] = [];
  if (stage.pools) {
    const g = scene.add.graphics().setDepth(0.5);
    for (let i = 0; i < stage.pools.count; i++) {
      const r = rng.realInRange(stage.pools.radius[0], stage.pools.radius[1]);
      const pool = { x: rng.between(r, W - r), y: rng.between(r, W - r), r };
      pools.push(pool);
      if (stage.pools.style === 'kelp') {
        // a dark kelp forest: soft green patch with swaying strands
        g.fillStyle(0x0b3d2a, 0.75);
        g.fillCircle(pool.x, pool.y, r);
        g.lineStyle(6, 0x2e7d32, 0.8);
        for (let k = 0; k < 14; k++) {
          const a = rng.rotation();
          const d = rng.realInRange(0, r * 0.85);
          const sx = pool.x + Math.cos(a) * d;
          const sy = pool.y + Math.sin(a) * d;
          g.beginPath();
          g.moveTo(sx, sy);
          g.lineTo(sx + rng.between(-14, 14), sy - 30);
          g.lineTo(sx + rng.between(-14, 14), sy - 60);
          g.strokePath();
        }
        continue;
      }
      // muddy bank, water, a lighter shallow patch
      g.fillStyle(0x4a3f2a, 1);
      g.fillCircle(pool.x, pool.y, r * 1.1);
      g.fillStyle(0x1a5560, 1);
      g.fillCircle(pool.x, pool.y, r);
      g.fillStyle(0x2a7380, 0.55);
      g.fillCircle(pool.x - r * 0.25, pool.y - r * 0.2, r * 0.55);
    }
  }

  stage.decor.forEach((d, layer) => {
    for (let i = 0; i < d.count; i++) {
      scene.add
        .image(rng.between(0, W), rng.between(0, W), d.texture)
        .setScale(rng.realInRange(d.scale[0], d.scale[1]))
        .setRotation(rng.rotation())
        .setAlpha(d.alpha ?? 1)
        .setDepth(1 + layer * 0.1);
    }
  });

  // darken the world edge so the boundary reads clearly
  const edge = scene.add.graphics().setDepth(2);
  edge.lineStyle(40, 0x000000, 0.35);
  edge.strokeRect(0, 0, W, W);
  return pools;
}
