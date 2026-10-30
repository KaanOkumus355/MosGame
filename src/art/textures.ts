import Phaser from 'phaser';

/**
 * All placeholder art lives here. Every texture is generated from shapes under a string key.
 * To swap in real art, load an image with the same key in BootScene.preload(): generation
 * skips any key that already exists.
 *
 * Creatures are drawn facing +x, centred in a TEX_SIZE square. BODY_RADIUS px of that
 * square is the creature's "body", so a sprite is scaled by size / BODY_RADIUS.
 */
export const TEX_SIZE = 128;
export const BODY_RADIUS = 48;

type G = Phaser.GameObjects.Graphics;

/** Tiny drawing helper that works in coordinates relative to the texture centre. */
class Pen {
  constructor(readonly g: G, readonly ox: number, readonly oy: number) {}

  ellipse(x: number, y: number, rx: number, ry: number, color: number, alpha = 1, rot = 0): void {
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      pts.push({ x: this.ox + x + px * cos - py * sin, y: this.oy + y + px * sin + py * cos });
    }
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(pts, true);
  }

  circle(x: number, y: number, r: number, color: number, alpha = 1): void {
    this.g.fillStyle(color, alpha);
    this.g.fillCircle(this.ox + x, this.oy + y, r);
  }

  line(x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha = 1): void {
    this.g.lineStyle(width, color, alpha);
    this.g.lineBetween(this.ox + x1, this.oy + y1, this.ox + x2, this.oy + y2);
  }

  /** Open polyline through the given points. */
  path(points: [number, number][], width: number, color: number, alpha = 1): void {
    this.g.lineStyle(width, color, alpha);
    this.g.strokePoints(points.map(([x, y]) => ({ x: this.ox + x, y: this.oy + y })), false);
  }

  poly(points: [number, number][], color: number, alpha = 1): void {
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(points.map(([x, y]) => ({ x: this.ox + x, y: this.oy + y })), true);
  }
}

/** Calls fn for the top (-1) and bottom (+1) side, for symmetric parts. */
const mirrored = (fn: (s: number) => void) => {
  fn(-1);
  fn(1);
};

// ---------------------------------------------------------------- creatures

interface QuadOpts {
  body: number;
  dark: number;
  len?: number;
  wid?: number;
  head?: number;
  tail?: [number, number][];
}

/** Generic top-down four-legged animal facing +x: legs, optional tail, body, head. */
function quad(p: Pen, o: QuadOpts): void {
  const L = o.len ?? 44;
  const W = o.wid ?? 26;
  const H = o.head ?? 15;
  mirrored((s) => {
    p.ellipse(L * 0.5, s * W * 0.85, 10, 6, o.dark, 1, s * 0.5);
    p.ellipse(-L * 0.6, s * W * 0.85, 11, 6, o.dark, 1, -s * 0.5);
  });
  if (o.tail) p.path(o.tail, 4, o.dark);
  p.ellipse(-4, 0, L, W, o.body);
  p.ellipse(L * 0.72 + H * 0.4, 0, H * 1.2, H * 0.85, o.body);
}

const CREATURE_ART: Record<string, (p: Pen) => void> = {
  mosquito(p) {
    mirrored((s) => {
      for (let i = -1; i <= 1; i++) p.path([[i * 9, 0], [i * 12 - 4, s * 26], [i * 16 - 10, s * 46]], 2, 0x2a2a2a);
    });
    mirrored((s) => p.ellipse(-8, s * 22, 30, 10, 0xeaf4ff, 0.7, s * 0.35));
    p.ellipse(-24, 0, 26, 10, 0x6a6a78);
    for (let k = 0; k < 4; k++) p.ellipse(-38 + k * 9, 0, 2.4, 9, 0xffffff, 0.9);
    p.ellipse(4, 0, 13, 12, 0x80808e);
    p.circle(19, 0, 7, 0x55555f);
    mirrored((s) => p.circle(22, s * 4, 3, 0xc0392b));
    p.line(25, 0, 52, 0, 2.5, 0x1a1a1a);
  },

  gnat(p) {
    mirrored((s) => p.ellipse(-12, s * 30, 30, 13, 0xe8f1ff, 0.5, s * 0.45));
    p.ellipse(-4, 0, 40, 30, 0x6b5a3a);
    p.ellipse(-10, -8, 18, 9, 0x8f7b55, 0.6);
    p.circle(32, 0, 16, 0x4e4129);
    mirrored((s) => p.circle(38, s * 8, 5, 0x1a1a1a));
  },

  aphid(p) {
    mirrored((s) => {
      for (let i = -1; i <= 1; i++) p.line(i * 16, s * 20, i * 20 - 4, s * 46, 3, 0x4c7d25);
      p.line(40, s * 6, 60, s * 26, 2, 0x4c7d25);
    });
    p.ellipse(-4, 0, 44, 34, 0x7fbf3f);
    p.ellipse(-12, -10, 20, 10, 0xb5e27a, 0.6);
    p.circle(36, 0, 14, 0x5f9f2f);
    mirrored((s) => p.circle(42, s * 6, 3, 0x1a1a1a));
  },

  fly(p) {
    mirrored((s) => p.ellipse(-16, s * 28, 34, 14, 0xcfe3ff, 0.5, s * 0.5));
    p.ellipse(-8, 0, 40, 28, 0x223344);
    p.ellipse(-16, -8, 18, 8, 0x5577aa, 0.5);
    p.circle(28, 0, 18, 0x1a2530);
    mirrored((s) => p.circle(34, s * 10, 10, 0xb22222));
  },

  dragonfly(p) {
    mirrored((s) => {
      p.ellipse(8, s * 32, 9, 28, 0xbfefff, 0.45, s * -0.25);
      p.ellipse(-8, s * 32, 9, 28, 0xbfefff, 0.45, s * 0.25);
    });
    p.ellipse(-30, 0, 32, 5, 0x2a9d8f);
    for (let k = 0; k < 5; k++) p.ellipse(-52 + k * 10, 0, 1.5, 4.5, 0x1d6b62);
    p.ellipse(6, 0, 15, 10, 0x1f7a70);
    p.circle(24, 0, 10, 0x264653);
    mirrored((s) => p.circle(28, s * 7, 7, 0x48cae4));
  },

  frog(p) {
    mirrored((s) => {
      p.ellipse(-30, s * 32, 24, 10, 0x2e7d32, 1, s * 0.6);
      p.ellipse(22, s * 34, 14, 7, 0x2e7d32, 1, s * -0.5);
    });
    p.ellipse(0, 0, 46, 38, 0x4caf50);
    p.circle(-14, -14, 7, 0x2e7d32);
    p.circle(-4, 16, 5, 0x2e7d32);
    p.circle(-26, 6, 6, 0x2e7d32);
    mirrored((s) => {
      p.circle(26, s * 20, 12, 0x66bb6a);
      p.circle(29, s * 21, 6, 0x111111);
      p.circle(31, s * 19, 2, 0xffffff);
    });
    p.path([[38, -12], [44, 0], [38, 12]], 2, 0x1b5e20);
  },

  rat(p) {
    p.path([[-44, 0], [-54, 8], [-60, 0], [-64, -10]], 4, 0xd8a7a7);
    p.ellipse(-6, 0, 46, 28, 0x8d8d8d);
    p.ellipse(-12, -8, 26, 10, 0xa8a8a8, 0.6);
    p.ellipse(34, 0, 22, 16, 0x9e9e9e);
    mirrored((s) => {
      p.circle(26, s * 15, 8, 0xd7a7a7);
      p.circle(42, s * 7, 3, 0x111111);
      p.line(54, s * 2, 62, s * 10, 1, 0x333333);
    });
    p.circle(55, 0, 4, 0xff9aa2);
  },

  capybara(p) {
    p.ellipse(-4, 0, 50, 36, 0x9c6b3e);
    p.ellipse(-12, -10, 30, 14, 0xb07d4c, 0.5);
    p.ellipse(36, 0, 24, 20, 0x8b5a2b);
    p.ellipse(52, 0, 10, 14, 0x6d4422);
    mirrored((s) => {
      p.circle(26, s * 17, 6, 0x6d4422);
      p.circle(42, s * 11, 3, 0x111111);
    });
  },

  // ---- stage 2: pond
  strider(p) {
    mirrored((s) => {
      p.path([[10, s * 4], [38, s * 28], [58, s * 32]], 2.5, 0x3e2723);
      p.path([[0, s * 5], [-8, s * 44], [-16, s * 60]], 2.5, 0x3e2723);
      p.path([[-8, s * 4], [-38, s * 34], [-54, s * 40]], 2.5, 0x3e2723);
    });
    p.ellipse(-2, 0, 26, 7, 0x5d4037);
    p.ellipse(-6, -2, 14, 3, 0x8d6e63, 0.7);
    p.circle(24, 0, 6, 0x4e342e);
  },

  moth(p) {
    mirrored((s) => {
      p.ellipse(-2, s * 26, 24, 30, 0x8d6e63, 1, s * 0.3);
      p.ellipse(-22, s * 22, 16, 20, 0xa1887f, 1, s * -0.3);
      p.circle(-2, s * 32, 8, 0x5d4037);
      p.circle(-2, s * 32, 4, 0xffcc80);
      p.path([[24, s * 3], [36, s * 12], [44, s * 24]], 2, 0x4e342e);
    });
    p.ellipse(0, 0, 26, 9, 0x6d4c41);
    p.circle(22, 0, 8, 0x5d4037);
  },

  bird(p) {
    mirrored((s) => {
      p.poly([[12, s * 6], [-10, s * 62], [-30, s * 52], [-20, s * 6]], 0x1e88e5);
      p.poly([[-10, s * 62], [-30, s * 52], [-24, s * 40]], 0x0d47a1);
      p.circle(28, s * 8, 4, 0xff8a3d);
      p.circle(31, s * 5, 2.5, 0x111111);
    });
    p.poly([[-26, -8], [-56, -14], [-56, 14], [-26, 8]], 0x1565c0);
    p.ellipse(0, 0, 32, 16, 0x1976d2);
    p.ellipse(-4, 0, 22, 6, 0x64b5f6);
    p.circle(26, 0, 13, 0x1e88e5);
    p.poly([[36, -4], [62, 0], [36, 4]], 0x333333);
  },

  // ---- stage 3: jungle floor
  lizard(p) {
    for (let i = 10; i >= 0; i--) p.circle(-30 - i * 3.3, Math.sin(i * 0.45) * 7, 11 - i * 0.85, 0x5aa83c);
    mirrored((s) => {
      p.ellipse(16, s * 22, 12, 5, 0x4e9433, 1, s * 0.7);
      p.ellipse(-18, s * 22, 12, 5, 0x4e9433, 1, s * -0.7);
      p.circle(22, s * 31, 4, 0x4e9433);
      p.circle(-24, s * 31, 4, 0x4e9433);
    });
    p.ellipse(-4, 0, 34, 20, 0x6abf4b);
    for (let i = 0; i < 4; i++) p.circle(-22 + i * 11, 0, 3.5, 0x3d7a28);
    p.ellipse(32, 0, 17, 13, 0x7fd35c);
    mirrored((s) => {
      p.circle(37, s * 8, 4.5, 0xf5e663);
      p.circle(38, s * 8, 2.2, 0x111111);
    });
  },

  ant(p) {
    mirrored((s) => {
      for (let i = -1; i <= 1; i++) p.path([[i * 8, 0], [i * 10, s * 22], [i * 16 - 6, s * 40]], 3, 0x3e1a10);
      p.path([[30, s * 4], [44, s * 16], [54, s * 12]], 2, 0x3e1a10);
    });
    p.ellipse(-26, 0, 22, 16, 0x5d1f12);
    p.ellipse(2, 0, 13, 8, 0x6d2a18);
    p.circle(24, 0, 12, 0x5d1f12);
  },

  cricket(p) {
    mirrored((s) => {
      p.path([[-4, s * 10], [-30, s * 32], [-52, s * 20]], 6, 0x5b6b2a);
      p.path([[14, s * 8], [22, s * 26], [12, s * 36]], 3, 0x5b6b2a);
      p.path([[34, s * 4], [52, s * 26], [62, s * 50]], 1.5, 0x3d4a1a);
    });
    p.ellipse(-6, 0, 36, 16, 0x7c8c3a);
    p.ellipse(-10, -5, 22, 5, 0x9aab52, 0.7);
    p.circle(30, 0, 13, 0x6b7a30);
  },

  beetle(p) {
    mirrored((s) => {
      for (let i = -1; i <= 1; i++) p.path([[i * 14, s * 20], [i * 18, s * 40], [i * 22 - 6, s * 48]], 4, 0x1a1a2e);
      p.line(48, s * 4, 58, s * 10, 3, 0x1a1a2e);
    });
    p.ellipse(-6, 0, 38, 32, 0x283593);
    p.line(-44, 0, 30, 0, 2, 0x0d1240);
    p.ellipse(-14, -14, 16, 6, 0x7986cb, 0.6, -0.2);
    p.ellipse(30, 0, 13, 18, 0x1a237e);
    p.circle(44, 0, 9, 0x111133);
  },

  caterpillar(p) {
    for (let i = 0; i < 6; i++) {
      const x = -44 + i * 15;
      p.circle(x, Math.sin(i * 0.9) * 4, 15, i % 2 ? 0x8bc34a : 0x7cb342);
      p.circle(x, Math.sin(i * 0.9) * 4 - 8, 3, 0xffeb3b);
    }
    p.circle(42, 0, 16, 0x558b2f);
    mirrored((s) => p.circle(48, s * 7, 3, 0x111111));
  },

  spider(p) {
    mirrored((s) => {
      for (let i = 0; i < 4; i++) {
        const a = -0.9 + i * 0.6;
        const kx = 8 + Math.cos(a) * 34;
        const ky = s * (14 + Math.abs(Math.sin(a)) * 20 + 8);
        p.path([[8, s * 6], [kx, ky], [kx + Math.cos(a) * 20, ky + s * 16]], 5, 0x3e2723);
      }
    });
    p.circle(-22, 0, 24, 0x4e342e);
    p.circle(-22, 0, 9, 0xff7043, 0.7);
    p.circle(12, 0, 16, 0x5d4037);
    mirrored((s) => p.circle(26, s * 5, 3, 0xff5252));
  },

  // ---- stage 4: forest
  raptor(p) {
    for (let i = 12; i >= 0; i--) p.circle(-26 - i * 3, Math.sin(i * 0.35) * 5, 12 - i * 0.8, i % 3 === 0 ? 0xa85d1c : 0xd9822b);
    mirrored((s) => {
      p.ellipse(-4, s * 22, 14, 7, 0xa85d1c, 1, s * 0.4);
      p.path([[4, s * 28], [10, s * 34], [16, s * 32]], 3, 0xf5f5f5);
      p.path([[16, s * 12], [26, s * 18], [30, s * 14]], 3, 0xa85d1c);
    });
    p.ellipse(0, 0, 30, 18, 0xd9822b);
    for (let i = 0; i < 4; i++) p.ellipse(-16 + i * 9, 0, 2.5, 12, 0x8a4a14, 0.8);
    p.ellipse(34, 0, 18, 11, 0xe39540);
    p.line(40, 0, 52, 0, 2, 0x5d2e0a);
    mirrored((s) => {
      p.circle(38, s * 6, 3.5, 0xffeb3b);
      p.circle(39, s * 6, 1.6, 0x111111);
      for (let t = 0; t < 3; t++) p.circle(44 + t * 4, s * 7, 1.5, 0xffffff);
    });
  },

  // ---- stage 3 branch: canopy
  swift(p) {
    p.poly([[-18, 0], [-46, -13], [-34, 0], [-46, 13]], 0x37474f);
    mirrored((s) => {
      p.poly([[10, s * 4], [-4, s * 20], [-30, s * 52], [-14, s * 48], [4, s * 24], [16, s * 8]], 0x455a64);
      p.path([[8, s * 8], [-6, s * 26], [-24, s * 46]], 2, 0x263238);
    });
    p.ellipse(0, 0, 24, 10, 0x546e7a);
    p.circle(16, 0, 6, 0xeceff1);
    p.circle(21, 0, 8, 0x455a64);
    p.poly([[28, -2.5], [36, 0], [28, 2.5]], 0xffb300);
    mirrored((s) => p.circle(23, s * 4, 1.8, 0x111111));
  },

  eagle(p) {
    p.poly([[-20, 0], [-44, -12], [-48, 0], [-44, 12]], 0x5d4037);
    mirrored((s) => {
      p.poly([[12, s * 6], [0, s * 26], [-14, s * 54], [-26, s * 50], [-20, s * 30], [-8, s * 8]], 0x6d4c41);
      for (let i = 0; i < 4; i++) p.line(-12 - i * 4, s * (34 + i * 4), -20 - i * 4, s * (48 + i * 3), 3, 0x4e342e);
    });
    p.ellipse(-4, 0, 26, 12, 0x6d4c41);
    p.circle(18, 0, 10, 0xfafafa);
    p.poly([[26, -4], [36, 0], [30, 5], [26, 4]], 0xffb300);
    mirrored((s) => p.circle(21, s * 4, 2, 0x111111));
  },

  thunderbird(p) {
    p.poly([[-22, 0], [-52, -16], [-44, 0], [-52, 16]], 0x283593);
    mirrored((s) => {
      p.poly([[14, s * 8], [2, s * 26], [-10, s * 58], [-26, s * 54], [-22, s * 30], [-8, s * 10]], 0x3949ab);
      p.path([[4, s * 20], [-4, s * 30], [2, s * 36], [-8, s * 50]], 3, 0xffeb3b);
    });
    p.ellipse(-4, 0, 28, 14, 0x303f9f);
    p.circle(20, 0, 11, 0x3f51b5);
    p.poly([[28, -4], [40, 0], [28, 4]], 0xffd54f);
    mirrored((s) => p.circle(23, s * 5, 2.4, 0xfff59d));
  },

  sovereign(p) {
    p.circle(0, 0, 58, 0x7c4dff, 0.15);
    p.poly([[-22, 0], [-54, -18], [-46, 0], [-54, 18]], 0x1a237e);
    mirrored((s) => {
      p.poly([[14, s * 8], [2, s * 28], [-10, s * 60], [-28, s * 56], [-22, s * 30], [-8, s * 10]], 0x283593);
      p.path([[4, s * 20], [-4, s * 30], [2, s * 36], [-8, s * 52]], 3.5, 0xffeb3b);
    });
    p.ellipse(-4, 0, 28, 14, 0x1a237e);
    p.circle(20, 0, 12, 0x303f9f);
    for (let i = -1; i <= 1; i++) p.poly([[14, i * 8 - 3], [6, i * 9], [14, i * 8 + 3]], 0xffd54f);
    p.poly([[29, -4], [42, 0], [29, 4]], 0xffd54f);
    mirrored((s) => p.circle(24, s * 5, 2.6, 0xffffff));
  },

  pigeon(p) {
    p.poly([[-16, 0], [-32, -9], [-32, 9]], 0x78909c);
    mirrored((s) => p.ellipse(-2, s * 16, 18, 8, 0x90a4ae, 1, s * 0.4));
    p.ellipse(0, 0, 20, 12, 0xb0bec5);
    p.circle(14, 0, 8, 0x607d8b);
    p.circle(10, 0, 5, 0x80cbc4, 0.7);
    p.poly([[21, -2], [27, 0], [21, 2]], 0xffcc80);
  },

  goose(p) {
    p.poly([[-18, 0], [-32, -8], [-32, 8]], 0x5d4037);
    mirrored((s) => p.ellipse(-2, s * 20, 22, 9, 0x8d6e63, 1, s * 0.35));
    p.ellipse(-2, 0, 24, 14, 0xa1887f);
    p.line(14, 0, 30, 0, 7, 0x212121);
    p.circle(32, 0, 7, 0x212121);
    mirrored((s) => p.circle(31, s * 3, 2, 0xfafafa));
    p.poly([[38, -2], [45, 0], [38, 2]], 0x424242);
  },

  // ---- the hive line
  wasp(p) {
    mirrored((s) => {
      p.ellipse(4, s * 20, 24, 8, 0xe3f2fd, 0.65, s * 0.35);
      for (let i = -1; i <= 1; i++) p.path([[i * 8 + 6, s * 6], [i * 10 + 2, s * 18]], 2, 0x212121);
    });
    p.ellipse(-24, 0, 22, 12, 0xffca28);
    for (let k = 0; k < 3; k++) p.ellipse(-34 + k * 9, 0, 3, 11, 0x212121);
    p.poly([[-46, 0], [-54, -2], [-54, 2]], 0x212121);
    p.ellipse(4, 0, 12, 9, 0x424242);
    p.circle(20, 0, 9, 0xffca28);
    mirrored((s) => {
      p.circle(23, s * 5, 3.5, 0x212121);
      p.path([[26, s * 3], [36, s * 8], [40, s * 6]], 1.5, 0x212121);
    });
  },

  hornet(p) {
    mirrored((s) => {
      p.ellipse(2, s * 24, 28, 9, 0xfff8e1, 0.6, s * 0.35);
      for (let i = -1; i <= 1; i++) p.path([[i * 9 + 6, s * 8], [i * 12 + 2, s * 22]], 3, 0x3e2723);
    });
    p.ellipse(-26, 0, 26, 15, 0xffa000);
    for (let k = 0; k < 3; k++) p.ellipse(-36 + k * 10, 0, 3.5, 14, 0x3e2723);
    p.poly([[-52, 0], [-62, -3], [-62, 3]], 0x3e2723);
    p.ellipse(4, 0, 14, 11, 0x6d4c41);
    p.circle(22, 0, 11, 0xff8f00);
    mirrored((s) => {
      p.circle(25, s * 6, 4, 0x3e2723);
      p.poly([[30, s * 2], [38, s * 6], [32, s * 7]], 0x3e2723);
    });
  },

  warden(p) {
    mirrored((s) => {
      p.ellipse(0, s * 26, 30, 10, 0xfff3e0, 0.55, s * 0.3);
      for (let i = -1; i <= 1; i++) p.path([[i * 10 + 6, s * 9], [i * 13, s * 25]], 4, 0x263238);
    });
    p.ellipse(-26, 0, 28, 17, 0xffb300);
    for (let k = 0; k < 4; k++) p.ellipse(-40 + k * 9, 0, 3, 16, 0x263238);
    p.poly([[-54, 0], [-66, -4], [-66, 4]], 0x263238);
    // armored thorax plates
    p.ellipse(4, 0, 16, 13, 0x455a64);
    p.ellipse(4, -4, 10, 4, 0x78909c, 0.7);
    p.circle(24, 0, 12, 0xffb300);
    mirrored((s) => {
      p.circle(27, s * 6, 4.5, 0x263238);
      p.poly([[32, s * 2], [42, s * 8], [34, s * 9]], 0x263238);
    });
  },

  broodmother(p) {
    mirrored((s) => {
      p.ellipse(4, s * 26, 30, 10, 0xfff8e1, 0.5, s * 0.3);
      for (let i = -1; i <= 1; i++) p.path([[i * 10 + 8, s * 9], [i * 12 + 2, s * 24]], 4, 0x3e2723);
    });
    // a huge egg-laying abdomen
    p.ellipse(-28, 0, 34, 22, 0xffc107);
    for (let k = 0; k < 4; k++) p.ellipse(-46 + k * 11, 0, 3.5, 21, 0x5d4037);
    p.ellipse(6, 0, 14, 12, 0x6d4c41);
    p.circle(24, 0, 11, 0xffa000);
    mirrored((s) => p.circle(27, s * 5, 4, 0x3e2723));
  },

  hivequeen(p) {
    p.circle(0, 0, 58, 0xffd54f, 0.14);
    mirrored((s) => {
      p.ellipse(6, s * 28, 34, 11, 0xfffde7, 0.55, s * 0.3);
      for (let i = -1; i <= 1; i++) p.path([[i * 10 + 8, s * 10], [i * 12 + 2, s * 26]], 4, 0x3e2723);
    });
    p.ellipse(-28, 0, 36, 24, 0xffb300);
    for (let k = 0; k < 4; k++) p.ellipse(-48 + k * 11, 0, 3.5, 23, 0x4e342e);
    p.ellipse(6, 0, 15, 13, 0x5d4037);
    p.circle(26, 0, 12, 0xffa000);
    // crown
    for (let i = -1; i <= 1; i++) p.poly([[20, i * 7 - 3], [12, i * 8], [20, i * 7 + 3]], 0xffeb3b);
    mirrored((s) => p.circle(29, s * 5, 4, 0x3e2723));
  },

  bee(p) {
    mirrored((s) => p.ellipse(0, s * 18, 18, 8, 0xe3f2fd, 0.7, s * 0.3));
    p.ellipse(-10, 0, 22, 14, 0xffd54f);
    for (let k = 0; k < 3; k++) p.ellipse(-20 + k * 9, 0, 3, 13, 0x212121);
    p.circle(16, 0, 10, 0x212121);
    mirrored((s) => p.path([[22, s * 3], [32, s * 9]], 1.5, 0x212121));
  },

  ladybug(p) {
    p.circle(0, 0, 26, 0xe53935);
    p.line(-26, 0, 22, 0, 2.5, 0x212121);
    for (const [x, y] of [[-12, -12], [-12, 12], [4, -14], [4, 14], [-4, 0]]) p.circle(x, y, 5, 0x212121);
    p.circle(24, 0, 10, 0x212121);
    mirrored((s) => p.circle(28, s * 5, 2.5, 0xfafafa));
  },

  butterfly(p) {
    mirrored((s) => {
      p.ellipse(8, s * 22, 18, 22, 0xff7043, 1, s * 0.3);
      p.ellipse(-12, s * 18, 14, 16, 0xffa726, 1, -s * 0.3);
      p.circle(10, s * 26, 5, 0x212121);
      p.circle(-12, s * 20, 4, 0xfff176);
    });
    p.ellipse(0, 0, 22, 4, 0x3e2723);
    mirrored((s) => p.path([[20, 0], [30, s * 8]], 1.5, 0x3e2723));
  },

  monkey(p) {
    p.path([[-40, 0], [-56, 12], [-62, 0], [-56, -8], [-50, -2]], 4, 0x6d4c41);
    quad(p, { body: 0x8d6e63, dark: 0x6d4c41, len: 34, wid: 22, head: 16 });
    mirrored((s) => p.circle(38, s * 16, 6, 0xd7ccc8));
    p.circle(48, 0, 10, 0xd7ccc8);
    mirrored((s) => p.circle(48, s * 5, 2.5, 0x111111));
  },

  // ---- stage 4 branch: river delta
  croc(p) {
    for (let i = 11; i >= 0; i--) p.circle(-28 - i * 3.3, Math.sin(i * 0.4) * 3, 11 - i * 0.8, 0x4e6b2e);
    for (let i = 0; i < 6; i++) p.circle(-32 - i * 5.5, Math.sin((i * 5.5) / 3.3 * 0.4) * 3, 2, 0x2e4219);
    mirrored((s) => {
      p.ellipse(-16, s * 20, 11, 6, 0x3f5a24, 1, -s * 0.6);
      p.ellipse(16, s * 20, 11, 6, 0x3f5a24, 1, s * 0.6);
    });
    p.ellipse(0, 0, 30, 16, 0x5b7a34);
    for (let i = 0; i < 6; i++) mirrored((s) => p.circle(-20 + i * 8, s * 5, 2.6, 0x3a5220));
    p.ellipse(32, 0, 12, 11, 0x5b7a34);
    p.poly([[34, -8], [60, -5], [63, 0], [60, 5], [34, 8]], 0x5b7a34);
    mirrored((s) => {
      for (let t = 0; t < 4; t++) p.circle(42 + t * 5, s * 6, 1.3, 0xf5f5f5);
      p.circle(32, s * 8, 4, 0x6f8f3e);
      p.circle(33, s * 8, 2.6, 0xffd54f);
      p.circle(33.5, s * 8, 1.2, 0x111111);
      p.circle(60, s * 2, 1.2, 0x1a1a1a);
    });
  },

  mosasaur(p) {
    p.poly([[-30, 0], [-58, -16], [-50, 0], [-58, 16]], 0x1e4d5c);
    for (let i = 8; i >= 0; i--) p.circle(-24 - i * 3, 0, 12 - i * 0.9, 0x2b6475);
    mirrored((s) => {
      p.ellipse(10, s * 22, 16, 7, 0x1e4d5c, 1, s * 0.7);
      p.ellipse(-20, s * 18, 12, 6, 0x1e4d5c, 1, s * 0.6);
    });
    p.ellipse(0, 0, 32, 16, 0x2b6475);
    p.ellipse(-4, 0, 26, 7, 0x8fb8c4, 0.5);
    p.poly([[26, -10], [62, -5], [64, 0], [62, 5], [26, 10]], 0x2b6475);
    mirrored((s) => {
      for (let t = 0; t < 5; t++) p.circle(36 + t * 5, s * 6, 1.4, 0xf5f5f5);
      p.circle(30, s * 7, 2.6, 0xffeb3b);
    });
  },

  leviathan(p) {
    p.circle(0, 0, 60, 0x00acc1, 0.12);
    for (let i = 0; i < 14; i++) p.circle(-20 - i * 3, Math.sin(i * 0.5) * 6, 14 - i * 0.8, 0x0d47a1);
    mirrored((s) => {
      p.poly([[10, s * 10], [-4, s * 34], [-20, s * 40], [-12, s * 14]], 0x1565c0);
      for (let i = 0; i < 4; i++) p.poly([[-10 + i * 9, s * 12], [-6 + i * 9, s * 22], [-2 + i * 9, s * 12]], 0x4dd0e1);
    });
    p.ellipse(4, 0, 32, 17, 0x0d47a1);
    p.poly([[28, -12], [62, -6], [64, 0], [62, 6], [28, 12]], 0x1565c0);
    mirrored((s) => {
      for (let t = 0; t < 5; t++) p.circle(38 + t * 5, s * 7, 1.6, 0xffffff);
      p.circle(32, s * 8, 3, 0x76ff03);
    });
  },

  fish(p) {
    p.poly([[-20, 0], [-36, -12], [-36, 12]], 0x90a4ae);
    p.ellipse(0, 0, 24, 10, 0xb0bec5);
    p.ellipse(2, -3, 16, 3, 0xeceff1, 0.7);
    p.circle(16, -2, 2.5, 0x111111);
  },

  turtle(p) {
    mirrored((s) => {
      p.ellipse(18, s * 22, 14, 6, 0x8d6e63, 1, s * 0.6);
      p.ellipse(-18, s * 18, 10, 5, 0x8d6e63, 1, -s * 0.6);
    });
    p.circle(32, 0, 9, 0x8d6e63);
    p.ellipse(0, 0, 28, 24, 0x2e7d32);
    for (const [x, y] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, 0]]) p.circle(x, y, 6, 0x43a047);
  },

  seal(p) {
    p.poly([[-26, 0], [-40, -12], [-40, 12]], 0x546e7a);
    mirrored((s) => p.ellipse(6, s * 16, 12, 5, 0x546e7a, 1, s * 0.6));
    p.ellipse(0, 0, 28, 14, 0x78909c);
    p.circle(26, 0, 11, 0x78909c);
    mirrored((s) => {
      p.circle(30, s * 5, 2.4, 0x111111);
      p.line(36, s * 2, 44, s * 6, 1, 0xeceff1);
    });
  },

  shark(p) {
    p.poly([[-30, 0], [-56, -18], [-48, 0], [-56, 14]], 0x607d8b);
    mirrored((s) => p.poly([[8, s * 8], [-8, s * 30], [-14, s * 10]], 0x546e7a));
    p.ellipse(0, 0, 36, 13, 0x78909c);
    p.ellipse(4, 0, 26, 6, 0xeceff1, 0.6);
    p.poly([[30, -8], [48, 0], [30, 8]], 0x78909c);
    mirrored((s) => p.circle(32, s * 5, 2, 0x111111));
  },

  orca(p) {
    p.poly([[-30, 0], [-54, -18], [-46, 0], [-54, 18]], 0x212121);
    mirrored((s) => p.ellipse(4, s * 20, 14, 6, 0x212121, 1, s * 0.6));
    p.ellipse(0, 0, 36, 16, 0x212121);
    p.ellipse(-6, 0, 18, 6, 0xfafafa, 0.9);
    mirrored((s) => p.ellipse(22, s * 8, 6, 3, 0xfafafa));
    p.circle(34, 0, 10, 0x212121);
  },

  squid(p) {
    for (let i = 0; i < 8; i++) {
      const s = i % 2 ? 1 : -1;
      const k = Math.floor(i / 2);
      p.path([[10, s * k * 4], [30, s * (6 + k * 8)], [48, s * (4 + k * 12)], [60, s * (10 + k * 10)]], 4, 0xc62828);
    }
    p.ellipse(-12, 0, 34, 18, 0xd84315);
    p.poly([[-40, 0], [-60, -16], [-56, 0], [-60, 16]], 0xbf360c);
    mirrored((s) => {
      p.circle(8, s * 9, 6, 0xfff59d);
      p.circle(9, s * 9, 3, 0x111111);
    });
  },

  hippo(p) {
    quad(p, { body: 0x8d7b9a, dark: 0x6d5c78, len: 46, wid: 34, head: 20 });
    p.ellipse(-10, -10, 30, 8, 0xa594b0, 0.5);
    p.ellipse(60, 0, 12, 22, 0xa58fb3);
    mirrored((s) => {
      p.circle(66, s * 9, 2.5, 0x3e2f48);
      p.circle(36, s * 18, 5, 0x6d5c78);
      p.circle(44, s * 11, 3, 0x111111);
    });
  },

  mudskipper(p) {
    p.poly([[-28, 0], [-46, -13], [-41, 0], [-46, 13]], 0x8d6e63);
    mirrored((s) => p.ellipse(4, s * 14, 9, 5, 0x795548, 1, s * 0.5));
    p.ellipse(-4, 0, 30, 12, 0xa1887f);
    for (let i = 0; i < 4; i++) p.circle(-16 + i * 8, i % 2 ? 3 : -3, 2, 0x5d4037);
    mirrored((s) => {
      p.circle(22, s * 6, 5, 0xbcaaa4);
      p.circle(23, s * 6, 2.4, 0x111111);
    });
  },

  mouse(p) {
    p.path([[-40, 0], [-52, 8], [-60, 2], [-64, -8]], 3, 0xf8bbd0);
    quad(p, { body: 0x9e9e9e, dark: 0x757575, len: 40, wid: 24, head: 16 });
    mirrored((s) => {
      p.circle(30, s * 16, 9, 0xf8bbd0);
      p.circle(46, s * 6, 3, 0x111111);
    });
    p.circle(58, 0, 3.5, 0xff8a80);
  },

  rabbit(p) {
    quad(p, { body: 0xd7ccc8, dark: 0xbcaaa4, len: 38, wid: 28, head: 17 });
    p.circle(-42, 0, 11, 0xffffff);
    mirrored((s) => {
      p.ellipse(20, s * 10, 20, 6, 0xbcaaa4, 1, s * 0.25);
      p.ellipse(20, s * 10, 14, 3, 0xf8bbd0, 1, s * 0.25);
      p.circle(46, s * 7, 3, 0x111111);
    });
  },

  squirrel(p) {
    p.ellipse(-44, 0, 22, 18, 0xc57b3f);
    p.ellipse(-48, 0, 14, 10, 0xe0a26b, 0.8);
    quad(p, { body: 0xa1592d, dark: 0x7b4220, len: 34, wid: 20, head: 15 });
    mirrored((s) => {
      p.circle(32, s * 12, 5, 0x7b4220);
      p.circle(42, s * 6, 3, 0x111111);
    });
  },

  deer(p) {
    quad(p, { body: 0xa0703f, dark: 0x7a5530, len: 46, wid: 24, head: 15, tail: [[-46, 0], [-54, 0]] });
    for (const [x, y] of [[-20, -8], [-6, 10], [8, -10], [-30, 6], [16, 6]]) p.circle(x, y, 3, 0xf5e6d0);
    mirrored((s) => {
      p.path([[38, s * 6], [30, s * 22], [36, s * 34]], 3, 0xe0d0b0);
      p.path([[32, s * 18], [22, s * 26]], 3, 0xe0d0b0);
      p.circle(50, s * 6, 3, 0x111111);
    });
  },

  boar(p) {
    quad(p, { body: 0x5d4037, dark: 0x3e2723, len: 46, wid: 32, head: 18, tail: [[-46, 0], [-56, 4]] });
    p.ellipse(-6, 0, 36, 5, 0x3e2723);
    p.ellipse(60, 0, 8, 10, 0x8d6e63);
    mirrored((s) => {
      p.poly([[54, s * 10], [64, s * 18], [52, s * 14]], 0xfafafa);
      p.circle(44, s * 9, 3, 0x111111);
      p.circle(34, s * 14, 5, 0x3e2723);
    });
  },

  wolf(p) {
    p.ellipse(-48, 0, 16, 9, 0x607d8b);
    quad(p, { body: 0x78909c, dark: 0x546e7a, len: 44, wid: 24, head: 16 });
    p.ellipse(-6, 0, 30, 9, 0x90a4ae, 0.7);
    p.poly([[52, -6], [66, 0], [52, 6]], 0x78909c);
    mirrored((s) => {
      p.poly([[34, s * 8], [30, s * 22], [42, s * 12]], 0x546e7a);
      p.circle(48, s * 6, 3, 0xffeb3b);
    });
  },

  bear(p) {
    quad(p, { body: 0x4e342e, dark: 0x3e2723, len: 48, wid: 38, head: 20 });
    p.ellipse(-8, -8, 30, 14, 0x6d4c41, 0.6);
    mirrored((s) => {
      p.circle(38, s * 18, 7, 0x3e2723);
      p.circle(52, s * 8, 3, 0x111111);
      for (let i = 0; i < 3; i++) p.line(36 + i * 4, s * 34, 40 + i * 4, s * 40, 2, 0xeeeeee);
    });
    p.ellipse(62, 0, 6, 8, 0x8d6e63);
  },

  // ---- stage 5: continent
  bison(p) {
    quad(p, { body: 0x6d4c41, dark: 0x3e2723, len: 48, wid: 32, head: 17, tail: [[-48, 0], [-58, 0]] });
    p.ellipse(20, 0, 26, 30, 0x3e2723);
    mirrored((s) => {
      p.path([[46, s * 12], [54, s * 22], [62, s * 18]], 4, 0xeeeeee);
      p.circle(52, s * 7, 3, 0x111111);
    });
  },

  horse(p) {
    p.path([[-46, 0], [-56, 6], [-62, 0]], 7, 0x3e2723);
    quad(p, { body: 0x8d6e63, dark: 0x6d4c41, len: 50, wid: 22, head: 14 });
    p.line(-20, 0, 50, 0, 6, 0x3e2723);
    p.ellipse(56, 0, 14, 10, 0x8d6e63);
    mirrored((s) => p.circle(52, s * 7, 2.5, 0x111111));
  },

  lion(p) {
    p.path([[-46, 0], [-58, 8], [-64, 4]], 4, 0xc49340);
    p.circle(-64, 4, 5, 0x8d5a2b);
    quad(p, { body: 0xd4a24c, dark: 0xb5853a, len: 46, wid: 26, head: 15 });
    p.circle(40, 0, 25, 0x8d5a2b);
    p.ellipse(48, 0, 14, 12, 0xe0b25e);
    mirrored((s) => p.circle(52, s * 5, 2.5, 0x111111));
  },

  apex(p) {
    for (let i = 8; i >= 0; i--) p.circle(-40 - i * 2.6, Math.sin(i * 0.5) * 4, 12 - i * 0.9, 0x4527a0);
    p.poly([[-64, -8], [-72, 0], [-64, 8]], 0xb39ddb);
    quad(p, { body: 0x5e35b1, dark: 0x311b92, len: 46, wid: 34, head: 20 });
    for (let i = 0; i < 5; i++) {
      const x = -30 + i * 13;
      p.poly([[x - 5, 0], [x, -16 + (i % 2) * 4], [x + 5, 0]], 0xb39ddb);
    }
    mirrored((s) => {
      p.path([[44, s * 12], [40, s * 30], [52, s * 40]], 5, 0xeeeeee);
      p.circle(56, s * 7, 4, 0xffeb3b);
    });
  },

  // ---- the late forms: Tyrant, Swarm General, Roc, Dreadjaw
  tyrant(p) {
    for (let i = 10; i >= 0; i--) p.circle(-30 - i * 3.2, Math.sin(i * 0.4) * 4, 13 - i * 0.9, 0x6d4c41);
    mirrored((s) => {
      p.ellipse(-12, s * 24, 15, 8, 0x5d4037, 1, s * 0.4);
      p.path([[14, s * 12], [20, s * 18]], 3, 0x5d4037);
    });
    p.ellipse(0, 0, 30, 20, 0x795548);
    for (let i = 0; i < 5; i++) p.ellipse(-20 + i * 9, 0, 2.5, 14, 0x4e342e, 0.7);
    p.ellipse(34, 0, 22, 16, 0x8d6e63);
    p.ellipse(44, 0, 14, 12, 0x8d6e63);
    mirrored((s) => {
      for (let t = 0; t < 5; t++) p.poly([[36 + t * 4.5, s * 11], [38 + t * 4.5, s * 15], [40 + t * 4.5, s * 11]], 0xfafafa);
      p.circle(34, s * 9, 3.5, 0xff7043);
      p.circle(35, s * 9, 1.6, 0x111111);
    });
  },

  general(p) {
    mirrored((s) => {
      p.ellipse(-4, s * 30, 30, 11, 0xfff8e1, 0.55, s * 0.4);
      p.ellipse(-18, s * 24, 22, 8, 0xfff8e1, 0.45, s * 0.7);
      for (let i = -1; i <= 1; i++) p.path([[i * 10, s * 10], [i * 12 - 4, s * 22], [i * 14 - 8, s * 32]], 3, 0x3e2723);
    });
    p.ellipse(-28, 0, 26, 15, 0xffb300);
    for (let k = 0; k < 4; k++) p.ellipse(-42 + k * 9, 0, 3, 14, 0x3e2723);
    p.poly([[-54, -3], [-66, 0], [-54, 3]], 0x3e2723);
    p.ellipse(4, 0, 16, 13, 0x6d4c41);
    p.circle(22, 0, 11, 0xffca28);
    mirrored((s) => {
      p.circle(26, s * 6, 5, 0xb71c1c);
      p.path([[28, s * 3], [38, s * 6], [42, s * 2]], 3, 0x3e2723);
    });
    p.poly([[14, -10], [22, -22], [30, -10]], 0xffd54f);
  },

  roc(p) {
    // a storm-grey giant: long tail plumes, vast ragged wings with ember tips, a bone crest
    p.poly([[-18, 0], [-46, -20], [-40, -8], [-56, -7], [-48, 0], [-56, 7], [-40, 8], [-46, 20]], 0x263238);
    mirrored((s) => {
      p.poly([[18, s * 6], [14, s * 34], [6, s * 62], [-6, s * 52], [-12, s * 62], [-22, s * 50], [-30, s * 58], [-38, s * 38], [-26, s * 26], [-10, s * 8]], 0x37474f);
      p.poly([[18, s * 8], [14, s * 34], [8, s * 54], [2, s * 40], [4, s * 12]], 0x546e7a);
      p.line(6, s * 58, 2, s * 48, 4, 0xffb300);
      p.line(-12, s * 58, -13, s * 48, 4, 0xffb300);
      p.line(-29, s * 54, -26, s * 44, 4, 0xffb300);
    });
    p.ellipse(-6, 0, 32, 18, 0x37474f);
    p.ellipse(-8, 0, 20, 7, 0x607d8b, 0.5);
    p.circle(14, 0, 15, 0x263238);
    p.circle(24, 0, 11, 0x78909c);
    mirrored((s) => p.poly([[20, s * 4], [4, s * 16], [10, s * 6]], 0x90a4ae));
    p.poly([[10, -3], [-4, 0], [10, 3]], 0x90a4ae);
    p.poly([[30, -7], [44, -4], [47, 4], [41, 2], [34, 7], [30, 6]], 0xffb300);
    mirrored((s) => p.circle(27, s * 5, 2.4, 0xffd54f));
  },

  dreadjaw(p) {
    p.poly([[-30, 0], [-60, -18], [-52, 0], [-60, 18]], 0x263238);
    for (let i = 8; i >= 0; i--) p.circle(-24 - i * 3, 0, 13 - i * 0.9, 0x37474f);
    mirrored((s) => {
      p.ellipse(6, s * 22, 18, 7, 0x263238, 1, s * 0.7);
      p.ellipse(-22, s * 16, 12, 6, 0x263238, 1, s * 0.6);
    });
    p.ellipse(0, 0, 32, 18, 0x37474f);
    p.ellipse(-4, 0, 24, 7, 0x90a4ae, 0.35);
    p.poly([[22, -16], [64, -9], [66, 0], [64, 9], [22, 16]], 0x455a64);
    mirrored((s) => {
      for (let t = 0; t < 7; t++) p.poly([[30 + t * 5, s * 10], [32 + t * 5, s * 3], [34 + t * 5, s * 10]], 0xeceff1);
      p.circle(26, s * 11, 3, 0xff1744);
    });
  },

  grazer(p) {
    quad(p, { body: 0x8d6e63, dark: 0x5d4037, len: 46, wid: 30, head: 17, tail: [[-46, 0], [-60, 0]] });
    p.ellipse(42, 0, 10, 30, 0xa1887f);
    mirrored((s) => {
      p.path([[50, s * 10], [64, s * 16], [72, s * 12]], 5, 0xeeeeee);
      p.circle(54, s * 6, 2.5, 0x111111);
    });
    p.poly([[56, -3], [70, 0], [56, 3]], 0xeeeeee);
  },

  duckbill(p) {
    quad(p, { body: 0x7cb342, dark: 0x558b2f, len: 46, wid: 26, head: 14, tail: [[-46, 0], [-62, 4]] });
    for (let i = 0; i < 5; i++) p.circle(-26 + i * 12, 0, 4, 0x9ccc65);
    p.ellipse(60, 0, 10, 7, 0xc5e1a5);
    p.path([[40, 0], [30, -8], [20, -12]], 4, 0xe57373);
    mirrored((s) => p.circle(48, s * 6, 2.5, 0x111111));
  },

  sheep(p) {
    mirrored((s) => {
      p.ellipse(22, s * 18, 8, 5, 0x424242);
      p.ellipse(-22, s * 18, 8, 5, 0x424242);
    });
    for (const [x, y] of [[-20, -12], [-4, -16], [12, -12], [-24, 6], [-8, 2], [10, 6], [-14, 16], [4, 16]]) p.circle(x, y, 13, 0xf5f5f5);
    p.ellipse(34, 0, 12, 9, 0x424242);
    mirrored((s) => {
      p.ellipse(32, s * 11, 6, 3, 0x424242, 1, s * 0.6);
      p.circle(38, s * 4, 2, 0xffffff);
    });
  },

  cat(p) {
    p.path([[-40, 0], [-54, 8], [-62, 2], [-66, -6]], 5, 0xe65100);
    quad(p, { body: 0xfb8c00, dark: 0xe65100, len: 40, wid: 20, head: 14 });
    for (let i = 0; i < 4; i++) p.ellipse(-20 + i * 11, 0, 2.5, 14, 0xe65100, 0.8);
    mirrored((s) => {
      p.poly([[38, s * 8], [42, s * 20], [48, s * 9]], 0xfb8c00);
      p.circle(52, s * 5, 2.6, 0x7cb342);
      p.line(58, s * 3, 70, s * 8, 1, 0xffffff);
    });
  },

  mantis(p) {
    mirrored((s) => {
      p.path([[-10, s * 6], [-20, s * 30], [-34, s * 44]], 3, 0x558b2f);
      p.path([[4, s * 6], [0, s * 28], [-8, s * 46]], 3, 0x558b2f);
      // the raptorial forelegs
      p.path([[30, s * 5], [44, s * 22], [58, s * 14], [50, s * 6]], 6, 0x7cb342);
      p.ellipse(-24, s * 10, 26, 8, 0xc5e1a5, 0.5, s * 0.2);
    });
    p.ellipse(-24, 0, 30, 10, 0x8bc34a);
    p.ellipse(10, 0, 24, 6, 0x7cb342);
    p.poly([[34, 0], [42, -10], [50, 0], [42, 10]], 0x9ccc65);
    mirrored((s) => p.circle(44, s * 8, 4, 0x33691e));
  },

  goat(p) {
    quad(p, { body: 0xeeeeee, dark: 0xbdbdbd, len: 40, wid: 22, head: 13, tail: [[-40, 0], [-46, 0]] });
    p.ellipse(-6, 0, 30, 10, 0xe0e0e0, 0.6);
    mirrored((s) => {
      p.path([[44, s * 6], [36, s * 16], [26, s * 18]], 4, 0x8d6e63);
      p.circle(50, s * 5, 2.2, 0x111111);
    });
    p.ellipse(58, 0, 5, 3, 0xbdbdbd);
  },

  sunfish(p) {
    p.ellipse(0, 0, 38, 32, 0x90a4ae);
    p.ellipse(-6, -6, 26, 18, 0xb0bec5, 0.7);
    mirrored((s) => p.poly([[-10, s * 28], [0, s * 52], [10, s * 28]], 0x78909c));
    p.poly([[-34, -18], [-44, 0], [-34, 18]], 0x78909c);
    p.circle(24, -8, 4, 0x111111);
    p.ellipse(34, 0, 3, 5, 0x546e7a);
  },

  anglerfish(p) {
    mirrored((s) => p.poly([[-14, s * 18], [-30, s * 34], [-24, s * 14]], 0x37474f));
    p.poly([[-32, 0], [-52, -16], [-52, 16]], 0x37474f);
    p.circle(0, 0, 32, 0x455a64);
    p.ellipse(-6, -8, 20, 12, 0x546e7a, 0.6);
    p.path([[14, -20], [30, -34], [48, -24]], 3, 0x37474f);
    p.circle(48, -24, 7, 0xfff59d);
    p.circle(48, -24, 14, 0xfff59d, 0.25);
    p.poly([[24, -18], [40, 0], [24, 18]], 0x263238);
    mirrored((s) => {
      for (let t = 0; t < 4; t++) p.poly([[26 + t * 3, s * (14 - t * 3)], [34 + t * 2, s * (12 - t * 3)], [28 + t * 3, s * (10 - t * 3)]], 0xeceff1);
      p.circle(14, s * 14, 3, 0xe0f7fa);
    });
  },

  // ---- stage 6: the Overlord (world map / victory screen)
  overlord(p) {
    // tentacles
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const pts: [number, number][] = [];
      for (let k = 0; k <= 6; k++) {
        const r = 30 + k * 5;
        const bend = Math.sin(k * 0.9 + i) * 0.25;
        pts.push([Math.cos(a + bend) * r, Math.sin(a + bend) * r]);
      }
      p.path(pts, 7, 0x4527a0);
    }
    p.circle(0, 0, 40, 0x311b92);
    p.circle(-8, -10, 26, 0x5e35b1, 0.7);
    // crown
    for (let i = -2; i <= 2; i++) p.poly([[i * 12 - 6, -30], [i * 12, -50 - (i === 0 ? 8 : 0)], [i * 12 + 6, -30]], 0xffd54f);
    // one big eye
    p.circle(0, 4, 20, 0xfafafa);
    p.circle(4, 4, 11, 0xd50000);
    p.circle(5, 4, 5, 0x111111);
    p.circle(0, -2, 4, 0xffffff, 0.8);
  },

  hunter(p) {
    p.line(-40, 30, 56, -12, 4, 0x6d4c41);
    p.poly([[56, -12], [68, -18], [62, -8]], 0xb0bec5);
    p.ellipse(-2, 0, 20, 34, 0xa1662f);
    p.ellipse(-2, 0, 12, 26, 0x8a5426);
    mirrored((s) => p.circle(14, s * 30, 9, 0xe0ac69));
    p.circle(4, 0, 15, 0xe0ac69);
    p.ellipse(0, 0, 12, 14, 0x3e2723);
  },

  snake(p) {
    const n = 22;
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const x = 40 - t * 100;
      const y = Math.sin(t * Math.PI * 2.2) * 22;
      p.circle(x, y, 14 * (1 - t * 0.6), i % 3 === 0 ? 0x4f6b26 : 0x6d8b3a);
    }
    p.ellipse(46, 0, 16, 12, 0x7a9a42);
    mirrored((s) => {
      p.circle(52, s * 7, 3, 0xffeb3b);
      p.circle(53, s * 7, 1.5, 0x111111);
      p.line(62, 0, 66, s * 4, 1.5, 0xe53935);
    });
  },
};

// ---------------------------------------------------------------- ground tiles & decor

/** Draws `n` soft blotches into a seamless square tile. */
function blotchTile(g: G, size: number, base: number, blotches: { color: number; alpha: number; n: number; r: [number, number] }[], seed: string) {
  const rng = new Phaser.Math.RandomDataGenerator([seed]);
  g.fillStyle(base, 1);
  g.fillRect(0, 0, size, size);
  for (const b of blotches) {
    for (let i = 0; i < b.n; i++) {
      const x = rng.between(0, size);
      const y = rng.between(0, size);
      const rx = rng.realInRange(b.r[0], b.r[1]);
      const ry = rx * rng.realInRange(0.5, 1);
      g.fillStyle(b.color, b.alpha);
      // draw wrapped copies so the tile has no seams
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) g.fillEllipse(x + dx, y + dy, rx * 2, ry * 2);
    }
  }
}

const TILE_ART: Record<string, { size: number; draw: (g: G, size: number) => void }> = {
  tile_swamp: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x223b27, [
        { color: 0x1a2e1e, alpha: 0.5, n: 30, r: [10, 40] },
        { color: 0x2f4f2f, alpha: 0.35, n: 40, r: [6, 24] },
        { color: 0x3d5a2e, alpha: 0.25, n: 60, r: [2, 6] },
      ], 'swamp'),
  },
  tile_pond: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x1f4f5a, [
        { color: 0x163c45, alpha: 0.5, n: 26, r: [14, 44] },
        { color: 0x2a6470, alpha: 0.4, n: 36, r: [8, 28] },
        { color: 0x7fc8d0, alpha: 0.15, n: 50, r: [1, 3] },
      ], 'pond'),
  },
  tile_jungle: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x3b2f1f, [
        { color: 0x2a2015, alpha: 0.5, n: 30, r: [10, 40] },
        { color: 0x3f5a2a, alpha: 0.5, n: 34, r: [10, 34] },
        { color: 0x6b5a45, alpha: 0.4, n: 70, r: [1, 4] },
      ], 'jungle'),
  },
  tile_forest: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x26361f, [
        { color: 0x1c2917, alpha: 0.5, n: 30, r: [12, 44] },
        { color: 0x3a4a26, alpha: 0.45, n: 40, r: [8, 26] },
        { color: 0x6b5233, alpha: 0.35, n: 60, r: [1, 4] },
      ], 'forest'),
  },
  tile_canopy: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x24461a, [
        { color: 0x1a3512, alpha: 0.55, n: 30, r: [14, 44] },
        { color: 0x3f6b28, alpha: 0.5, n: 40, r: [10, 30] },
        { color: 0xa5d66b, alpha: 0.25, n: 50, r: [2, 6] },
      ], 'canopy'),
  },
  tile_cliffs: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x4a4f55, [
        { color: 0x3b4046, alpha: 0.55, n: 30, r: [14, 46] },
        { color: 0x6b7178, alpha: 0.4, n: 36, r: [8, 26] },
        { color: 0x7c9a5a, alpha: 0.3, n: 30, r: [4, 12] },
      ], 'cliffs'),
  },
  tile_peaks: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x37474f, [
        { color: 0x263238, alpha: 0.55, n: 30, r: [14, 46] },
        { color: 0x546e7a, alpha: 0.4, n: 34, r: [8, 26] },
        { color: 0xeceff1, alpha: 0.35, n: 40, r: [3, 10] },
      ], 'peaks'),
  },
  tile_reef: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x0d3b5c, [
        { color: 0x0a2f4a, alpha: 0.55, n: 26, r: [16, 48] },
        { color: 0x146a85, alpha: 0.4, n: 34, r: [8, 28] },
        { color: 0xe6d3a3, alpha: 0.25, n: 20, r: [6, 16] },
        { color: 0xb2ebf2, alpha: 0.15, n: 50, r: [1, 3] },
      ], 'reef'),
  },
  tile_meadow: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x6a8f35, [
        { color: 0x5a7d2c, alpha: 0.5, n: 30, r: [14, 44] },
        { color: 0x8fb34a, alpha: 0.45, n: 36, r: [8, 26] },
        { color: 0xfff59d, alpha: 0.35, n: 30, r: [2, 4] },
        { color: 0xf8bbd0, alpha: 0.35, n: 20, r: [2, 4] },
      ], 'meadow'),
  },
  tile_hive: {
    size: 256,
    draw: (g, s) => {
      g.fillStyle(0x8d6e2a, 1);
      g.fillRect(0, 0, s, s);
      // honeycomb
      const r = 22;
      const h = r * Math.sqrt(3);
      for (let row = -1; row < s / h + 1; row++) {
        for (let col = -1; col < s / (r * 1.5) + 1; col++) {
          const cx = col * r * 1.5;
          const cy = row * h + (col % 2 ? h / 2 : 0);
          const pts = [];
          for (let i = 0; i < 6; i++) pts.push({ x: cx + Math.cos((i / 6) * Math.PI * 2) * (r - 2), y: cy + Math.sin((i / 6) * Math.PI * 2) * (r - 2) });
          g.fillStyle(((row + col) & 3) === 0 ? 0xffb300 : 0xc49a3a, 1);
          g.fillPoints(pts, true);
        }
      }
    },
  },
  tile_delta: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x3a4528, [
        { color: 0x4f4130, alpha: 0.5, n: 28, r: [14, 44] },
        { color: 0x4f6b35, alpha: 0.45, n: 36, r: [8, 26] },
        { color: 0x6fa3a8, alpha: 0.2, n: 40, r: [1, 4] },
      ], 'delta'),
  },
  tile_ash: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x3a2a24, [
        { color: 0x2a1d19, alpha: 0.55, n: 30, r: [14, 46] },
        { color: 0x5d4a40, alpha: 0.4, n: 34, r: [8, 26] },
        { color: 0xff6e40, alpha: 0.35, n: 30, r: [1, 3] },
        { color: 0x9e9e9e, alpha: 0.2, n: 40, r: [2, 5] },
      ], 'ash'),
  },
  tile_outskirts: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x6b7a30, [
        { color: 0x8d7a3a, alpha: 0.5, n: 26, r: [16, 48] },
        { color: 0x7f9a3a, alpha: 0.45, n: 36, r: [8, 28] },
        { color: 0xe6d38a, alpha: 0.35, n: 40, r: [2, 5] },
      ], 'outskirts'),
  },
  tile_spires: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x5a4c44, [
        { color: 0x463a33, alpha: 0.55, n: 30, r: [14, 46] },
        { color: 0x8d7466, alpha: 0.4, n: 36, r: [8, 26] },
        { color: 0xd7ccc8, alpha: 0.3, n: 40, r: [2, 6] },
      ], 'spires'),
  },
  tile_trench: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x081a2a, [
        { color: 0x050f1a, alpha: 0.6, n: 30, r: [16, 48] },
        { color: 0x10324a, alpha: 0.4, n: 30, r: [8, 28] },
        { color: 0x80deea, alpha: 0.2, n: 40, r: [1, 2] },
      ], 'trench'),
  },
  tile_plains: {
    size: 256,
    draw: (g, s) =>
      blotchTile(g, s, 0x6f8a3a, [
        { color: 0x5f7a30, alpha: 0.5, n: 30, r: [14, 46] },
        { color: 0x8aa04a, alpha: 0.45, n: 40, r: [8, 28] },
        { color: 0xa69a5a, alpha: 0.3, n: 50, r: [2, 6] },
      ], 'plains'),
  },
};

const DECOR_ART: Record<string, { size: number; draw: (p: Pen) => void }> = {
  coral: {
    size: 96,
    draw(p) {
      const colors = [0xff8a80, 0xf48fb1, 0xffcc80];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const c = colors[i % 3];
        p.path([[0, 0], [Math.cos(a) * 18, Math.sin(a) * 18], [Math.cos(a + 0.3) * 32, Math.sin(a + 0.3) * 32]], 5, c);
        p.circle(Math.cos(a + 0.3) * 32, Math.sin(a + 0.3) * 32, 4, c);
      }
      p.circle(0, 0, 7, 0xff7043);
    },
  },
  puddle: {
    size: 160,
    draw(p) {
      p.ellipse(0, 0, 74, 52, 0x13261f, 0.9);
      p.ellipse(-6, 4, 60, 40, 0x183329, 1);
      p.ellipse(-22, -14, 22, 8, 0x3a6b5c, 0.35, -0.3);
    },
  },
  lilypad: {
    size: 96,
    draw(p) {
      const pts: [number, number][] = [[0, 0]];
      for (let i = 0; i <= 24; i++) {
        const a = 0.35 + (i / 24) * (Math.PI * 2 - 0.7);
        pts.push([Math.cos(a) * 44, Math.sin(a) * 44]);
      }
      p.poly(pts, 0x3f8f3a);
      for (let i = 0; i < 6; i++) {
        const a = 0.8 + i * 0.95;
        p.line(0, 0, Math.cos(a) * 38, Math.sin(a) * 38, 2, 0x5fae4f, 0.7);
      }
    },
  },
  reeds: {
    size: 96,
    draw(p) {
      const rng = new Phaser.Math.RandomDataGenerator(['reeds']);
      for (let i = 0; i < 9; i++) {
        const a = rng.rotation();
        const r = rng.realInRange(6, 34);
        p.ellipse(Math.cos(a) * r, Math.sin(a) * r, 14, 5, 0x4f7a2a, 0.95, a);
      }
      for (let i = 0; i < 5; i++) {
        const a = rng.rotation();
        const r = rng.realInRange(4, 26);
        p.ellipse(Math.cos(a) * r, Math.sin(a) * r, 7, 4, 0x6b4423, 1, a);
      }
    },
  },
  spark: {
    size: 16,
    draw(p) {
      p.circle(0, 0, 7, 0xffffff);
    },
  },
  rock: {
    size: 128,
    draw(p) {
      p.ellipse(4, 6, 54, 44, 0x000000, 0.25);
      p.ellipse(0, 0, 54, 44, 0x6b6f73);
      p.ellipse(-8, -6, 40, 30, 0x80858a);
      p.ellipse(-18, -16, 14, 8, 0xa5abb0, 0.7, -0.4);
    },
  },
  leaf_big: {
    size: 160,
    draw(p) {
      p.ellipse(0, 0, 72, 30, 0x2f7d32);
      p.line(-70, 0, 72, 0, 3, 0x66bb6a, 0.8);
      for (let i = -3; i <= 3; i++) {
        p.line(i * 16, 0, i * 16 + 14, -22, 2, 0x4caf50, 0.7);
        p.line(i * 16, 0, i * 16 + 14, 22, 2, 0x4caf50, 0.7);
      }
    },
  },
  fern: {
    size: 128,
    draw(p) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        p.ellipse(Math.cos(a) * 30, Math.sin(a) * 30, 30, 8, i % 2 ? 0x388e3c : 0x2e7d32, 1, a);
      }
      p.circle(0, 0, 8, 0x1b5e20);
    },
  },
  flower: {
    size: 64,
    draw(p) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        p.circle(Math.cos(a) * 14, Math.sin(a) * 14, 11, 0xf06292);
      }
      p.circle(0, 0, 8, 0xffd54f);
    },
  },
  tree: {
    size: 192,
    draw(p) {
      p.circle(8, 10, 80, 0x000000, 0.25);
      for (const [x, y, r] of [[0, 0, 60], [-34, -24, 44], [32, -28, 42], [-30, 30, 42], [34, 28, 44]]) p.circle(x, y, r, 0x2e5e2a);
      for (const [x, y, r] of [[-12, -14, 34], [20, -20, 26], [-24, 18, 24]]) p.circle(x, y, r, 0x3f7a35, 0.9);
      p.circle(-20, -24, 12, 0x5a9a4a, 0.6);
    },
  },
  bush: {
    size: 96,
    draw(p) {
      for (const [x, y, r] of [[0, 0, 30], [-20, -10, 20], [18, -12, 20], [-14, 18, 18], [16, 16, 20]]) p.circle(x, y, r, 0x33691e);
      for (const [x, y] of [[-8, -6], [10, 4], [-2, 14], [14, -14]]) p.circle(x, y, 4, 0x7e57c2);
    },
  },
  log: {
    size: 160,
    draw(p) {
      p.ellipse(0, 0, 70, 18, 0x6d4c41);
      p.ellipse(-10, -6, 50, 4, 0x8d6e63, 0.7);
      p.circle(66, 0, 16, 0xa1887f);
      p.circle(66, 0, 9, 0x8d6e63);
      p.circle(66, 0, 3, 0x6d4c41);
    },
  },
  mushroom: {
    size: 48,
    draw(p) {
      p.circle(0, 0, 18, 0xa1887f);
      p.circle(-4, -4, 9, 0xbcaaa4);
      for (const [x, y] of [[-6, -6], [7, -3], [-2, 8], [8, 9]]) p.circle(x, y, 3, 0xefebe9);
    },
  },
  grass: {
    size: 64,
    draw(p) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        p.line(0, 0, Math.cos(a) * 24, Math.sin(a) * 24, 3, i % 2 ? 0x9ccc65 : 0x7cb342);
      }
    },
  },
  tent: {
    size: 128,
    draw(p) {
      p.poly([[0, -52], [46, 0], [0, 52], [-46, 0]], 0xd7b98e);
      p.poly([[0, -52], [46, 0], [0, 0]], 0xc4a073);
      p.poly([[0, 52], [-46, 0], [0, 0]], 0xc4a073);
      p.line(0, -52, 0, 52, 3, 0x8d6e63);
      p.circle(0, 0, 5, 0x5d4037);
    },
  },
  campfire: {
    size: 64,
    draw(p) {
      p.line(-18, -10, 18, 10, 6, 0x5d4037);
      p.line(-18, 10, 18, -10, 6, 0x5d4037);
      p.circle(0, 0, 12, 0xff9800);
      p.circle(0, 0, 6, 0xffeb3b);
    },
  },
  spear: {
    size: 64,
    draw(p) {
      p.line(-30, 0, 18, 0, 4, 0x6d4c41);
      p.poly([[16, -6], [30, 0], [16, 6]], 0xb0bec5);
    },
  },
  quill: {
    size: 48,
    draw(p) {
      p.line(-16, 0, 14, 0, 3, 0xd7ccc8);
      p.poly([[12, -4], [22, 0], [12, 4]], 0xeceff1);
    },
  },
  tail: {
    size: 96,
    draw(p) {
      for (let i = 10; i >= 0; i--) p.circle(-30 + i * 6, Math.sin(i * 0.7) * 6, 10 - i * 0.6, i % 2 ? 0x5aa83c : 0x6abf4b);
    },
  },
  web_glob: {
    size: 48,
    draw(p) {
      p.circle(0, 0, 14, 0xffffff, 0.35);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        p.line(0, 0, Math.cos(a) * 18, Math.sin(a) * 18, 2, 0xffffff, 0.9);
      }
    },
  },
  net: {
    size: 64,
    draw(p) {
      for (let i = -2; i <= 2; i++) {
        p.line(i * 10, -24, i * 10, 24, 2, 0xb3e5fc);
        p.line(-24, i * 10, 24, i * 10, 2, 0xb3e5fc);
      }
      p.circle(0, 0, 28, 0xb3e5fc, 0.15);
    },
  },
  venom_glob: {
    size: 32,
    draw(p) {
      p.circle(0, 0, 13, 0x9b59ff, 0.5);
      p.circle(0, 0, 9, 0x9b59ff);
      p.circle(-3, -3, 4, 0xe1ccff);
    },
  },
};

// ---------------------------------------------------------------- trait icons (64px, key = icon_<traitId>)

const drop = (p: Pen, color: number) => {
  p.circle(0, 6, 17, color);
  p.poly([[0, -27], [15, -2], [-15, -2]], color);
  p.circle(-6, 4, 5, 0xffffff, 0.5);
};

const ICON_ART: Record<string, (p: Pen) => void> = {
  speed(p) {
    for (let i = 0; i < 3; i++) p.path([[-20 + i * 13, -16], [-6 + i * 13, 0], [-20 + i * 13, 16]], 6, 0xffd54f);
  },
  size(p) {
    p.circle(0, 2, 24, 0xff9f43);
    p.circle(-8, -6, 8, 0xffc58a, 0.8);
    p.circle(20, -20, 7, 0xff9f43, 0.6);
  },
  armor(p) {
    p.poly([[0, -27], [23, -18], [21, 6], [0, 27], [-21, 6], [-23, -18]], 0x90a4ae);
    p.poly([[0, -19], [15, -13], [14, 4], [0, 18], [-14, 4], [-15, -13]], 0xcfd8dc);
  },
  venom(p) {
    drop(p, 0x9b59ff);
  },
  wings(p) {
    p.ellipse(-12, -4, 18, 9, 0xb3e5fc, 0.95, -0.6);
    p.ellipse(12, -4, 18, 9, 0xb3e5fc, 0.95, 0.6);
    p.ellipse(0, 6, 4, 16, 0x455a64);
  },
  intelligence(p) {
    for (const [x, y, r] of [[-10, -7, 13], [9, -9, 13], [-9, 9, 12], [10, 8, 13]]) p.circle(x, y, r, 0xf48fb1);
    p.path([[0, -20], [-4, -8], [4, 0], [-4, 10], [0, 20]], 3, 0xc2185b);
  },
  camo(p) {
    p.ellipse(0, 0, 28, 14, 0x66bb6a, 1, -0.7);
    p.line(-18, 16, 18, -16, 3, 0x2e7d32);
  },
  bloodlust(p) {
    drop(p, 0xe53935);
    p.line(-6, 8, 6, 8, 4, 0xffffff);
    p.line(0, 2, 0, 14, 4, 0xffffff);
  },
  magnet(p) {
    const arc: [number, number][] = [[-16, -20], [-16, 0]];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI - (i / 10) * Math.PI;
      arc.push([Math.cos(a) * 16, Math.sin(a) * 16]);
    }
    arc.push([16, -20]);
    p.path(arc, 10, 0xef5350);
    p.line(-16, -20, -16, -28, 10, 0xcfd8dc);
    p.line(16, -20, 16, -28, 10, 0xcfd8dc);
  },
  thorns(p) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      p.poly([[Math.cos(a - 0.2) * 16, Math.sin(a - 0.2) * 16], [Math.cos(a) * 29, Math.sin(a) * 29], [Math.cos(a + 0.2) * 16, Math.sin(a + 0.2) * 16]], 0x7cb342);
    }
    p.circle(0, 0, 18, 0x9ccc65);
    p.circle(-5, -5, 5, 0xdcedc8, 0.8);
  },
  eyes(p) {
    p.ellipse(0, 0, 28, 17, 0xffffff);
    p.circle(0, 0, 13, 0x4dd0e1);
    p.circle(0, 0, 6, 0x111111);
    p.circle(-4, -4, 3, 0xffffff);
  },
  glutton(p) {
    const pts: [number, number][] = [[0, 0]];
    for (let i = 0; i <= 20; i++) {
      const a = 0.6 + (i / 20) * (Math.PI * 2 - 1.2);
      pts.push([Math.cos(a) * 24, Math.sin(a) * 24]);
    }
    p.poly(pts, 0xffb74d);
    p.circle(2, -12, 3.5, 0x111111);
    p.circle(22, 0, 4, 0xffe0b2);
    p.circle(30, 0, 3, 0xffe0b2);
  },
  nimble(p) {
    p.path([[-24, 16], [-8, -14], [4, 10], [24, -18]], 7, 0xaed581);
    p.poly([[24, -26], [30, -10], [16, -14]], 0xaed581);
  },
  lucky(p) {
    for (const [x, y] of [[0, -12], [12, 0], [0, 12], [-12, 0]]) p.circle(x, y, 11, 0x66bb6a);
    p.circle(0, 0, 6, 0x43a047);
    p.path([[4, 4], [14, 20], [12, 28]], 3, 0x2e7d32);
  },
  secondwind(p) {
    p.circle(-10, -6, 14, 0xef5350);
    p.circle(10, -6, 14, 0xef5350);
    p.poly([[-23, 0], [23, 0], [0, 25]], 0xef5350);
    p.line(-8, -2, 8, -2, 4, 0xffffff);
    p.line(0, -10, 0, 6, 4, 0xffffff);
  },
  silent(p) {
    p.circle(0, 0, 24, 0x9575cd);
    p.circle(10, -8, 21, 0x16121f);
    p.circle(-8, 12, 2, 0xffffff, 0.8);
    p.circle(-14, -4, 1.5, 0xffffff, 0.8);
  },
  pheromones(p) {
    for (const [x, y, r] of [[-14, 8, 9], [0, -6, 11], [14, 10, 8], [-4, 20, 6], [16, -16, 6], [-18, -14, 5]]) p.circle(x, y, r, 0xf06292, 0.85);
  },
  adrenaline(p) {
    p.poly([[-6, -28], [14, -4], [2, -2], [10, 28], [-14, 0], [-2, -2]], 0xff7043);
    p.circle(18, -18, 5, 0xffccbc);
  },
  quills(p) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.line(Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * 28, Math.sin(a) * 28, 4, 0xd7ccc8);
    }
    p.circle(0, 0, 12, 0x8d6e63);
  },
  shock(p) {
    p.poly([[4, -28], [-14, 4], [0, 4], [-6, 28], [16, -6], [2, -6]], 0xffee58);
    p.circle(0, 0, 26, 0xffee58, 0.15);
  },
  tailwhip(p) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const a = -Math.PI * 0.9 + (i / 14) * Math.PI * 1.5;
      const r = 24 - i * 0.6;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    p.path(pts, 8, 0xa1887f);
    p.poly([[pts[14][0] - 6, pts[14][1] - 6], [pts[14][0] + 10, pts[14][1] + 2], [pts[14][0] - 4, pts[14][1] + 8]], 0xd7ccc8);
  },
  claws(p) {
    for (let i = -1; i <= 1; i++) {
      p.path([[i * 14 - 6, 24], [i * 14 - 2, 0], [i * 14 + 6, -24]], 7, 0xeceff1);
      p.path([[i * 14 + 2, -18], [i * 14 + 6, -24]], 4, 0xb0bec5);
    }
  },
  jaw(p) {
    p.poly([[-26, -6], [26, -6], [0, -26]], 0xffe082);
    p.poly([[-26, 6], [26, 6], [0, 26]], 0xffe082);
    for (let i = -2; i <= 2; i++) {
      p.poly([[i * 9 - 4, -6], [i * 9 + 4, -6], [i * 9, 2]], 0xffffff);
      p.poly([[i * 9 - 4, 6], [i * 9 + 4, 6], [i * 9, -2]], 0xffffff);
    }
  },
};

// ---------------------------------------------------------------- signature ability icons (64px)

const SIGNATURE_ART: Record<string, (p: Pen) => void> = {
  sig_drink(p) {
    drop(p, 0xff4f7a);
    p.line(0, -30, 0, -14, 3, 0x333333);
  },
  sig_snatch(p) {
    p.path([[-24, 16], [-4, -4], [14, -18]], 5, 0x48cae4);
    p.poly([[14, -26], [24, -14], [8, -12]], 0x48cae4);
    p.circle(18, 18, 8, 0x9e9e9e);
  },
  sig_tongue(p) {
    p.circle(-16, 0, 14, 0x6abf4b);
    p.path([[-4, 0], [10, -6], [22, 4]], 5, 0xe05a7a);
    p.circle(24, 4, 6, 0xff7f9e);
  },
  sig_pack(p) {
    for (const [x, y] of [[-14, 10], [14, 10], [0, -12]]) {
      p.ellipse(x, y, 11, 7, 0xd9822b);
      p.circle(x + 9, y, 5, 0xe39540);
    }
  },
  sig_dive(p) {
    p.path([[0, -28], [0, 14]], 5, 0x90caf9);
    p.poly([[-12, 8], [12, 8], [0, 26]], 0x90caf9);
    mirrored((s) => p.poly([[0, -18], [s * 22, -30], [s * 14, -18]], 0x546e7a));
    p.circle(0, -18, 6, 0x455a64);
  },
  sig_wave(p) {
    p.path([[-28, 14], [-16, 2], [-2, -10], [12, -14], [24, -8], [26, 2], [18, 6], [12, 0]], 6, 0x4dd0e1);
    p.path([[-28, 22], [-10, 16], [8, 18], [28, 14]], 4, 0x80deea);
  },
  sig_lift(p) {
    p.path([[0, 20], [0, -16]], 4, 0xffcc80);
    p.poly([[-10, -10], [10, -10], [0, -26]], 0xffcc80);
    mirrored((s) => p.poly([[0, 8], [s * 24, -2], [s * 16, 10]], 0x6d4c41));
    p.circle(0, 24, 7, 0x9e9e9e);
  },
  sig_storm(p) {
    p.ellipse(0, -14, 24, 12, 0x546e7a);
    p.ellipse(-12, -10, 12, 9, 0x607d8b);
    p.poly([[4, -6], [-8, 10], [0, 10], [-6, 28], [12, 4], [4, 4], [10, -6]], 0xffeb3b);
  },
  sig_sting(p) {
    p.ellipse(-8, 0, 18, 10, 0xffca28);
    for (let k = 0; k < 2; k++) p.ellipse(-12 + k * 9, 0, 2.5, 9, 0x212121);
    p.poly([[10, -4], [28, 0], [10, 4]], 0x212121);
    p.path([[-24, -14], [-14, -22]], 2, 0xfff176);
    p.path([[-24, 14], [-14, 22]], 2, 0xfff176);
  },
  sig_brood(p) {
    for (const [x, y] of [[-14, 10], [14, 10], [0, -12]]) {
      p.ellipse(x, y, 9, 6, 0xffca28);
      p.ellipse(x - 2, y, 2, 5, 0x212121);
    }
  },
  sig_swarmcloud(p) {
    p.circle(0, 0, 24, 0xffd54f, 0.25);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      p.circle(Math.cos(a) * 16, Math.sin(a) * 16, 3, i % 2 ? 0x212121 : 0xffd54f);
    }
  },
  sig_royal(p) {
    p.ellipse(0, 6, 18, 12, 0xffb300);
    for (let k = 0; k < 2; k++) p.ellipse(-4 + k * 8, 6, 2.5, 11, 0x4e342e);
    for (let i = -1; i <= 1; i++) p.poly([[i * 9 - 4, -10], [i * 9, -22], [i * 9 + 4, -10]], 0xffeb3b);
  },
  sig_roll(p) {
    const arc: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const a = 0.4 + (i / 20) * 5;
      arc.push([Math.cos(a) * 24, Math.sin(a) * 24]);
    }
    p.path(arc, 5, 0x9ccc65);
    p.poly([[24, 4], [14, -6], [30, -10]], 0x9ccc65);
    p.ellipse(-2, 0, 14, 7, 0x5b7a34);
    p.poly([[8, -5], [20, -3], [20, 3], [8, 5]], 0x5b7a34);
    mirrored((s) => p.circle(0, s * 6, 2, 0xffd54f));
  },
  sig_command(p) {
    p.circle(0, 0, 24, 0x0b2a4a);
    p.ellipse(-8, -4, 12, 9, 0x7c4dff);
    p.ellipse(10, 6, 9, 7, 0x7c4dff);
    p.ellipse(4, -12, 6, 4, 0x9ccc65);
    for (let i = -1; i <= 1; i++) p.poly([[i * 8 - 4, -22], [i * 8, -32], [i * 8 + 4, -22]], 0xffd54f);
  },
  sig_crush(p) {
    p.poly([[-26, -6], [26, -6], [0, -24]], 0xffab40);
    p.poly([[-26, 6], [26, 6], [0, 24]], 0xffab40);
    for (let i = -2; i <= 2; i++) p.poly([[i * 9 - 4, -6], [i * 9 + 4, -6], [i * 9, 4]], 0xffffff);
    p.path([[-14, 0], [-4, -4], [4, 4], [14, 0]], 3, 0xeceff1);
  },
  sig_carry(p) {
    mirrored((s) => p.poly([[0, -6], [s * 28, -18], [s * 20, -2]], 0x6d4c41));
    p.ellipse(0, -8, 8, 6, 0x5d4037);
    p.path([[-6, 0], [-8, 10]], 3, 0xffa000);
    p.path([[6, 0], [8, 10]], 3, 0xffa000);
    p.ellipse(0, 20, 14, 8, 0xeeeeee);
  },
  sig_rally(p) {
    p.poly([[-4, -26], [-4, 20], [0, 20], [0, -26]], 0x8d6e63);
    p.poly([[0, -26], [24, -18], [0, -10]], 0xffd54f);
    for (const [x, y] of [[-18, 12], [16, 14], [12, -2]]) {
      p.ellipse(x, y, 7, 5, 0xffca28);
      p.ellipse(x - 1, y, 1.6, 4, 0x212121);
    }
  },
  sig_scent(p) {
    drop(p, 0xd50000);
    p.path([[-26, -20], [-18, -26], [-10, -20], [-2, -26]], 3, 0xff8a80);
    p.path([[4, -22], [12, -28], [20, -22], [28, -28]], 3, 0xff8a80);
  },
  sig_frenzy(p) {
    p.circle(0, 0, 26, 0xff1744, 0.25);
    for (let i = 0; i < 4; i++) p.path([[-18 + i * 12, -18], [-14 + i * 12, 0], [-18 + i * 12, 18]], 4, 0xff5252);
  },
};

// ---------------------------------------------------------------- Gene Bank perk and mutator icons (64px)

const GENE_ART: Record<string, (p: Pen) => void> = {
  perk_thickSkin(p) {
    p.circle(-9, -6, 13, 0xef5350);
    p.circle(9, -6, 13, 0xef5350);
    p.poly([[-21, 0], [21, 0], [0, 24]], 0xef5350);
    p.poly([[0, -12], [14, -6], [12, 8], [0, 16], [-12, 8], [-14, -6]], 0x90a4ae);
    p.poly([[0, -6], [8, -3], [7, 5], [0, 10], [-7, 5], [-8, -3]], 0xcfd8dc);
  },
  perk_headStart(p) {
    p.poly([[-26, -10], [26, -10], [26, 10], [-26, 10]], 0x263238);
    p.poly([[-23, -7], [0, -7], [0, 7], [-23, 7]], 0x8be9fd);
    p.path([[-26, -10], [26, -10], [26, 10], [-26, 10], [-26, -10]], 3, 0xb0bec5);
    p.poly([[4, -24], [18, -16], [4, -8]], 0xd4ff7a);
  },
  perk_spareReroll(p) {
    p.poly([[-20, -20], [20, -20], [20, 20], [-20, 20]], 0xeceff1);
    for (const [x, y] of [[-10, -10], [10, 10], [0, 0], [10, -10], [-10, 10]]) p.circle(x, y, 4, 0x263238);
    p.path([[24, -2], [28, 10], [20, 22], [8, 26]], 4, 0xd4ff7a);
    p.poly([[8, 20], [8, 32], [0, 26]], 0xd4ff7a);
  },
  perk_widerPool(p) {
    for (const [a, c] of [[-0.45, 0x7e57c2], [0, 0x9575cd], [0.45, 0xb39ddb]] as [number, number][]) {
      const pts: [number, number][] = [[-10, -18], [10, -18], [10, 18], [-10, 18]];
      p.poly(pts.map(([x, y]) => [x * Math.cos(a) - (y - 14) * Math.sin(a), x * Math.sin(a) + (y - 14) * Math.cos(a) + 12] as [number, number]), c);
    }
    p.circle(0, -6, 5, 0xffd54f);
  },
  perk_inherit(p) {
    for (let i = 0; i <= 12; i++) {
      const y = -26 + i * 4.3;
      const k = Math.sin(i * 0.55) * 14;
      if (i % 2 === 0) p.line(-k, y, k, y, 3, 0xb2ebf2);
      p.circle(-k, y, 3.2, 0x26c6da);
      p.circle(k, y, 3.2, 0xd4ff7a);
    }
  },
  perk_mutators(p) {
    p.circle(0, -4, 20, 0xeceff1);
    p.poly([[-12, 10], [12, 10], [10, 22], [-10, 22]], 0xeceff1);
    mirrored((s) => p.circle(s * 8, -4, 6, 0x263238));
    p.poly([[0, 4], [-3, 10], [3, 10]], 0x263238);
    for (let i = -1; i <= 1; i++) p.line(i * 5, 14, i * 5, 22, 2, 0x263238);
  },
  mut_glass(p) {
    p.poly([[-18, -24], [18, -24], [18, 24], [-18, 24]], 0x80deea, 0.55);
    p.path([[-18, -24], [18, -24], [18, 24], [-18, 24], [-18, -24]], 3, 0xe0f7fa);
    p.path([[-4, -24], [2, -6], [-8, 4], [4, 24]], 2, 0xffffff);
    p.path([[2, -6], [18, 2]], 2, 0xffffff);
  },
  mut_senses(p) {
    p.ellipse(0, 0, 28, 15, 0xffcdd2);
    p.circle(0, 0, 12, 0xd32f2f);
    p.circle(0, 0, 5, 0x111111);
    mirrored((s) => p.path([[s * 30, -14], [s * 24, -8]], 3, 0xff8a80));
    p.path([[0, -24], [0, -18]], 3, 0xff8a80);
  },
  mut_famine(p) {
    p.ellipse(0, 8, 26, 12, 0x8d6e63);
    p.ellipse(0, 2, 22, 6, 0x4e342e);
    p.path([[-8, -6], [-4, -16], [-8, -26]], 2, 0xbcaaa4);
    p.path([[6, -6], [10, -16], [6, -26]], 2, 0xbcaaa4);
  },
};

// ---------------------------------------------------------------- achievement badges (64px, key = badge_<category>)

/** A medal on a ribbon in the category's colour, with the symbol drawn on top. */
const medal = (p: Pen, color: number, dark: number, symbol: () => void) => {
  p.poly([[-14, 8], [-4, 8], [-10, 30], [-16, 24]], dark);
  p.poly([[14, 8], [4, 8], [10, 30], [16, 24]], dark);
  p.circle(0, -4, 24, dark);
  p.circle(0, -4, 20, color);
  p.circle(-7, -12, 6, 0xffffff, 0.35);
  symbol();
};

const BADGE_ART: Record<string, (p: Pen) => void> = {
  badge_ending(p) {
    medal(p, 0xffd54f, 0xb28704, () => {
      p.poly([[-12, 4], [-12, -10], [-6, -4], [0, -14], [6, -4], [12, -10], [12, 4]], 0x5d4037);
    });
  },
  badge_evolution(p) {
    medal(p, 0x64ffda, 0x00897b, () => {
      for (let i = 0; i <= 6; i++) {
        const y = -16 + i * 4.5;
        const k = Math.sin(i * 0.9) * 8;
        p.circle(-k, y, 2.6, 0x004d40);
        p.circle(k, y, 2.6, 0x004d40);
      }
    });
  },
  badge_combat(p) {
    medal(p, 0xff8a65, 0xbf360c, () => {
      for (let i = -1; i <= 1; i++) p.path([[i * 7 - 4, 8], [i * 7, -4], [i * 7 + 5, -16]], 4, 0x3e2723);
    });
  },
  badge_appetite(p) {
    medal(p, 0x9dff6a, 0x558b2f, () => {
      p.poly([[-13, -8], [13, -8], [0, -18]], 0x1b5e20);
      p.poly([[-13, 0], [13, 0], [0, 10]], 0x1b5e20);
      for (let i = -1; i <= 1; i++) p.poly([[i * 7 - 3, -8], [i * 7 + 3, -8], [i * 7, -3]], 0xffffff);
    });
  },
  badge_collection(p) {
    medal(p, 0x8be9fd, 0x0277bd, () => {
      p.poly([[-13, -14], [0, -10], [0, 8], [-13, 4]], 0x01579b);
      p.poly([[13, -14], [0, -10], [0, 8], [13, 4]], 0x0288d1);
      p.line(0, -10, 0, 8, 2, 0xe1f5fe);
    });
  },
  badge_challenge(p) {
    medal(p, 0xff5252, 0xb71c1c, () => {
      p.poly([[0, -18], [9, -4], [5, 8], [-5, 8], [-9, -4]], 0xffd54f);
      p.poly([[0, -8], [4, 0], [2, 6], [-2, 6], [-4, 0]], 0xff6f00);
    });
  },
};

function makeTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

export function generateTextures(scene: Phaser.Scene): void {
  for (const [key, draw] of Object.entries(CREATURE_ART)) {
    makeTexture(scene, key, TEX_SIZE, TEX_SIZE, (g) => draw(new Pen(g, TEX_SIZE / 2, TEX_SIZE / 2)));
  }
  for (const [key, t] of Object.entries(TILE_ART)) {
    makeTexture(scene, key, t.size, t.size, (g) => t.draw(g, t.size));
  }
  for (const [key, d] of Object.entries(DECOR_ART)) {
    makeTexture(scene, key, d.size, d.size, (g) => d.draw(new Pen(g, d.size / 2, d.size / 2)));
  }
  for (const [id, draw] of Object.entries(ICON_ART)) {
    makeTexture(scene, `icon_${id}`, 64, 64, (g) => draw(new Pen(g, 32, 32)));
  }
  for (const [id, draw] of Object.entries(SIGNATURE_ART)) {
    makeTexture(scene, id, 64, 64, (g) => draw(new Pen(g, 32, 32)));
  }
  for (const [id, draw] of Object.entries(BADGE_ART)) {
    makeTexture(scene, id, 64, 64, (g) => draw(new Pen(g, 32, 32)));
  }
  for (const [id, draw] of Object.entries(GENE_ART)) {
    makeTexture(scene, id, 64, 64, (g) => draw(new Pen(g, 32, 32)));
  }
}
