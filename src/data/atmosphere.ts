import type { AmbientDef } from '../audio/Sfx';
import type { AmbientParticles } from '../systems/Fx';

/** Music bed and drifting particles per stage id. */
export const ATMOSPHERE: Record<string, { music: AmbientDef; particles: AmbientParticles }> = {
  swamp: {
    music: { root: 98, wave: 'sine', pluckEvery: [2.5, 5] },
    // fireflies
    particles: { colors: [0xd4ff7a, 0xfff59d], rate: 6, vx: [-8, 8], vy: [-10, 4], scale: [0.25, 0.45], lifespan: 3000, glow: true, twinkle: true },
  },
  pond: {
    music: { root: 110, wave: 'triangle', pluckEvery: [2, 4] },
    // glints on the water
    particles: { colors: [0xffffff, 0xb2ebf2], rate: 10, vx: [-3, 3], vy: [-3, 3], scale: [0.15, 0.3], lifespan: 900, glow: true, twinkle: true },
  },
  jungle: {
    music: { root: 82, wave: 'sine', pluckEvery: [2, 4.5] },
    // floating spores
    particles: { colors: [0xf1f8e9, 0xdcedc8], rate: 6, vx: [-6, 6], vy: [-14, -4], scale: [0.2, 0.35], lifespan: 3500, glow: true },
  },
  forest: {
    music: { root: 73, wave: 'triangle', pluckEvery: [3, 6] },
    // falling leaves
    particles: { colors: [0x8d6e63, 0xffb74d, 0x9ccc65], rate: 4, vx: [6, 18], vy: [10, 24], scale: [0.35, 0.6], lifespan: 4500, glow: false },
  },
  canopy: {
    music: { root: 98, wave: 'triangle', pluckEvery: [1.5, 3.5] },
    // sunbeams through the leaves
    particles: { colors: [0xfff9c4, 0xf1f8e9], rate: 6, vx: [-4, 4], vy: [6, 16], scale: [0.2, 0.4], lifespan: 3000, glow: true, twinkle: true },
  },
  cliffs: {
    music: { root: 87, wave: 'triangle', pluckEvery: [2.5, 5] },
    // wind-blown dust
    particles: { colors: [0xeceff1, 0xcfd8dc], rate: 6, vx: [20, 40], vy: [-4, 4], scale: [0.15, 0.3], lifespan: 2500, glow: false },
  },
  peaks: {
    music: { root: 58, wave: 'sawtooth', pluckEvery: [2, 4] },
    // rain
    particles: { colors: [0xb3e5fc, 0xe1f5fe], rate: 14, vx: [-30, -10], vy: [160, 220], scale: [0.1, 0.25], lifespan: 1200, glow: false },
  },
  reef: {
    music: { root: 62, wave: 'sine', pluckEvery: [2.5, 5] },
    // rising bubbles
    particles: { colors: [0xe0f7fa, 0xb2ebf2], rate: 8, vx: [-4, 4], vy: [-30, -14], scale: [0.15, 0.35], lifespan: 2500, glow: true },
  },
  meadow: {
    music: { root: 104, wave: 'triangle', pluckEvery: [1.5, 3.5] },
    // drifting pollen
    particles: { colors: [0xfff59d, 0xffffff], rate: 8, vx: [4, 14], vy: [-6, 4], scale: [0.15, 0.3], lifespan: 3000, glow: true },
  },
  orchard: {
    music: { root: 92, wave: 'triangle', pluckEvery: [2, 4] },
    // falling blossoms
    particles: { colors: [0xf8bbd0, 0xffffff], rate: 5, vx: [6, 16], vy: [10, 22], scale: [0.3, 0.5], lifespan: 4000, glow: false },
  },
  woodland: {
    music: { root: 78, wave: 'sine', pluckEvery: [2.5, 5] },
    particles: { colors: [0x8d6e63, 0xffb74d, 0x9ccc65], rate: 4, vx: [6, 18], vy: [10, 24], scale: [0.35, 0.6], lifespan: 4500, glow: false },
  },
  greathive: {
    music: { root: 66, wave: 'sawtooth', pluckEvery: [1.5, 3] },
    // honey-gold motes
    particles: { colors: [0xffd54f, 0xffb300], rate: 7, vx: [-6, 6], vy: [-12, -2], scale: [0.15, 0.3], lifespan: 3000, glow: true },
  },
  delta: {
    music: { root: 69, wave: 'triangle', pluckEvery: [3, 6] },
    // mist over the water
    particles: { colors: [0xe0f7fa, 0xffffff], rate: 5, vx: [-5, 5], vy: [-6, 2], scale: [0.2, 0.4], lifespan: 3500, glow: true },
  },
  ashlands: {
    music: { root: 61, wave: 'sawtooth', pluckEvery: [2, 4.5] },
    // embers rising off the ground
    particles: { colors: [0xff7043, 0xffab40, 0x9e9e9e], rate: 8, vx: [-6, 6], vy: [-26, -10], scale: [0.15, 0.35], lifespan: 2600, glow: true, twinkle: true },
  },
  outskirts: {
    music: { root: 87, wave: 'triangle', pluckEvery: [2, 4] },
    // chaff blowing off the fields
    particles: { colors: [0xfff3c4, 0xe6d38a], rate: 6, vx: [10, 24], vy: [-4, 6], scale: [0.15, 0.3], lifespan: 3200, glow: false },
  },
  spires: {
    music: { root: 77, wave: 'triangle', pluckEvery: [2.5, 5] },
    // dust carried up on the warm air
    particles: { colors: [0xfff3e0, 0xd7ccc8], rate: 7, vx: [-6, 6], vy: [-24, -8], scale: [0.15, 0.3], lifespan: 2800, glow: false },
  },
  trench: {
    music: { root: 49, wave: 'sine', pluckEvery: [3, 6] },
    // drifting marine snow, and the odd glow
    particles: { colors: [0xe0f7fa, 0x80deea], rate: 6, vx: [-3, 3], vy: [4, 12], scale: [0.1, 0.25], lifespan: 4000, glow: true, twinkle: true },
  },
  continent: {
    music: { root: 65, wave: 'sawtooth', pluckEvery: [2.5, 5] },
    // pollen on the wind
    particles: { colors: [0xfff9c4, 0xffffff], rate: 7, vx: [8, 20], vy: [-4, 4], scale: [0.15, 0.3], lifespan: 3000, glow: true },
  },
};

export const WORLD_MUSIC: AmbientDef = { root: 55, wave: 'sawtooth', pluckEvery: [1.5, 3] };
