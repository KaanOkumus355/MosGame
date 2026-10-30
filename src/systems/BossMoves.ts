import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import type { Creature } from '../entities/Creature';
import type { StageScene } from '../scenes/StageScene';
import type { BossMoveId } from '../data/zones';
import { Sfx } from '../audio/Sfx';

/** Seconds between signature moves (enraged bosses use them 40% more often). */
const MOVE_COOLDOWN: Record<BossMoveId, number> = {
  frenzy: 7, dive: 8, constrict: 9, feathers: 6, roar: 9, wallow: 10, gale: 8, quake: 8, lightning: 8, ink: 11,
  stampede: 9, updraft: 8, ambush: 10, lure: 11,
};
const ENRAGE_COOLDOWN = 0.6;
const ENRAGE_SPEED = 1.3;

export const NIGHT_TEX = 'night_vignette';
export const NIGHT_TEX_SIZE = 512;
/** Fully transparent radius of the darkness texture (px of the texture). */
export const NIGHT_HOLE = 40;

/** Radial darkness texture shared by Nightfall and the Kraken's ink. */
export function ensureDarkTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(NIGHT_TEX)) return;
  const tex = scene.textures.createCanvas(NIGHT_TEX, NIGHT_TEX_SIZE, NIGHT_TEX_SIZE)!;
  const ctx = tex.getContext();
  const c = NIGHT_TEX_SIZE / 2;
  const grd = ctx.createRadialGradient(c, c, NIGHT_HOLE, c, c, c);
  grd.addColorStop(0, 'rgba(0,0,10,0)');
  grd.addColorStop(0.12, 'rgba(0,0,10,0.55)');
  grd.addColorStop(0.4, 'rgba(0,0,10,0.93)');
  grd.addColorStop(1, 'rgba(0,0,10,0.95)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, NIGHT_TEX_SIZE, NIGHT_TEX_SIZE);
  tex.refresh();
}

interface Lunge { tx: number; ty: number; warn: number; dash: number }
interface Ring { r: number; hit: boolean }
interface Strike { x: number; y: number; r: number; t: number; color: number }
interface Feather { x: number; y: number; vx: number; vy: number; life: number }
interface Mud { x: number; y: number; r: number; t: number; life: number }
/** Updraft: a column of air that spins up under you, then hurls whatever is inside. */
interface Column { x: number; y: number; r: number; t: number }

/**
 * A zone boss's signature move and its enraged second phase. Moves only happen while you are
 * in its lair, and each is telegraphed before it hurts.
 */
export class BossMoves {
  private timer = 3;
  private enraged = false;
  // move state
  private lunges: Lunge[] = [];
  private dive: { t: number; lockT: number; tx: number; ty: number; hx: number; hy: number } | null = null;
  private grip: { t: number; presses: number; need: number; hint: number } | null = null;
  private roar: { t: number; r: number } | null = null;
  private gale = 0;
  private rings: Ring[] = [];
  private ringOrigin = { x: 0, y: 0 };
  private ringQueue = 0;
  private ringDelay = 0;
  private strikes: Strike[] = [];
  private strikeQueue = 0;
  private strikeDelay = 0;
  private feathers: Feather[] = [];
  private volleys = 0;
  private volleyDelay = 0;
  private muds: Mud[] = [];
  private ink = 0;
  private inkImg: Phaser.GameObjects.Image | null = null;
  private inkFrame: Phaser.GameObjects.Graphics | null = null;
  private flashes: { x: number; y: number; r: number; life: number }[] = [];
  private columns: Column[] = [];
  private columnQueue = 0;
  private columnDelay = 0;
  /** Scythe Ambush: seconds left hidden. */
  private hide = 0;
  /** Lure: the fake food light, with the boss lurking just behind it. */
  private lure: { x: number; y: number; t: number } | null = null;

  /** The move in use right now: the first, or (once enraged) taking turns with the second. */
  private move: BossMoveId;
  private moveName: string;
  private useSecond = false;

  constructor(
    private readonly s: StageScene,
    private readonly boss: Creature,
    private readonly first: { move: BossMoveId; name: string },
    private readonly second: { move: BossMoveId; name: string },
  ) {
    this.move = first.move;
    this.moveName = first.name;
    // Nightmare: bosses are enraged from the start (quietly, it's not news yet)
    if (GameState.diff.bossEnrageAt >= 1) this.enrage(true);
  }

  /** While the Kraken's ink is up: how far you can still see (0 when not blinded). */
  get blindRadius(): number {
    return this.ink > 0 ? this.s.player.radius * 2.6 * 1.6 : 0;
  }

  /** Hidden (Scythe Ambush or Lure): the scene draws no boss ring while this is true. */
  get hiding(): boolean {
    return this.hide > 0 || !!this.lure;
  }

  /** `inLair`: whether you are inside its lair right now. */
  update(dt: number, inLair: boolean): void {
    const b = this.boss;
    const alive = b.alive && !b.defeated;
    if (!alive) {
      this.release();
      this.updateHazards(dt);
      return;
    }
    if (!this.enraged && b.hp < b.maxHp * GameState.diff.bossEnrageAt) this.enrage();

    const busy = this.lunges.length > 0 || !!this.dive || !!this.grip || !!this.roar || this.gale > 0 || this.hiding;
    if (!busy) {
      if (!inLair) this.timer = Math.max(this.timer, 2);
      else if (!b.stunned) {
        this.timer -= dt * (this.enraged ? 1 / ENRAGE_COOLDOWN : 1);
        if (this.timer <= 0) this.start();
      }
    }
    this.updateMove(dt);
    this.updateHazards(dt);
  }

  // ------------------------------------------------------------ phase two

  private enrage(quiet = false): void {
    this.enraged = true;
    const d = this.boss.def as { speed: number; chaseSpeed?: number; chargeSpeed?: number; stalkSpeed?: number };
    d.speed *= ENRAGE_SPEED;
    if (d.chaseSpeed) d.chaseSpeed *= ENRAGE_SPEED;
    if (d.chargeSpeed) d.chargeSpeed *= ENRAGE_SPEED;
    if (d.stalkSpeed) d.stalkSpeed *= ENRAGE_SPEED;
    (this.boss.def as { tint?: number }).tint = 0xff6e6e;
    this.boss.sprite.setTint(0xff6e6e);
    if (quiet) return;
    Sfx.play('roar');
    this.s.cameras.main.shake(500, 0.008);
    this.s.cameras.main.flash(300, 255, 60, 60);
    this.s.floatText(this.boss.x, this.boss.y - this.boss.radius * 1.6, 'ENRAGED!', '#ff5252');
    this.s.toast(`${this.boss.name} is ENRAGED! Faster, angrier, and now it also uses ${this.second.name.toUpperCase()}.`);
  }

  // ------------------------------------------------------------ starting a move

  private start(): void {
    const b = this.boss;
    const p = this.s.player;
    const gs = this.s.growthScale();
    const more = this.enraged ? 1 : 0;
    // phase two: the first and second moves take turns, starting with the new one
    if (this.enraged) this.useSecond = !this.useSecond;
    const next = this.enraged && this.useSecond ? this.second : this.first;
    this.move = next.move;
    this.moveName = next.name;
    this.timer = MOVE_COOLDOWN[this.move];
    this.shout(`${this.moveName.toUpperCase()}!`);
    switch (this.move) {
      case 'frenzy':
        for (let i = 0; i < 3 + more; i++) this.lunges.push({ tx: 0, ty: 0, warn: 0.45, dash: 0.3 });
        break;
      case 'dive':
        b.held = true;
        this.dive = { t: 1.4, lockT: 0.5, tx: p.x, ty: p.y, hx: b.x, hy: b.y };
        b.sprite.setPosition(-9999, -9999);
        Sfx.play('dash', 0.6);
        break;
      case 'constrict':
        // only from up close: otherwise it lunges in first
        if (Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) > b.radius + p.radius + 30 * gs) {
          this.lunges.push({ tx: 0, ty: 0, warn: 0.35, dash: 0.35 });
          this.timer = 1.2;
          break;
        }
        this.grab();
        break;
      case 'feathers':
        this.volleys = 2 + more;
        this.volleyDelay = 0;
        break;
      case 'roar':
        this.roar = { t: 1, r: b.radius * 4 };
        break;
      case 'wallow': {
        // she rolls in the mud (healing) and splatters sticky pools around you
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.06);
        const n = 3 + more;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random();
          const d = i === 0 ? 0 : p.radius * Phaser.Math.FloatBetween(2.5, 5);
          this.muds.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: p.radius * 2.6, t: 0.7, life: 6 });
        }
        Sfx.play('slam', 0.7);
        break;
      }
      case 'gale':
        this.gale = 1.6;
        Sfx.play('breath', 0.5);
        break;
      case 'quake':
        this.ringOrigin = { x: b.x, y: b.y };
        this.ringQueue = 3 + more;
        this.ringDelay = 0;
        b.held = true;
        break;
      case 'lightning':
        this.strikeQueue = 6 + more * 3;
        this.strikeDelay = 0;
        break;
      case 'stampede':
        // it lines up on you and thunders through, again and again
        for (let i = 0; i < 3 + more; i++) this.lunges.push({ tx: 0, ty: 0, warn: 0.7, dash: 0.55 });
        Sfx.play('roar', 0.8);
        break;
      case 'updraft':
        this.columnQueue = 3 + more * 2;
        this.columnDelay = 0;
        Sfx.play('breath', 0.6);
        break;
      case 'ambush': {
        this.hide = 4;
        b.held = true;
        // it slips away into the crops somewhere else in its lair
        const l = b.lair;
        if (l) {
          const a = Math.atan2(l.y - p.y, l.x - p.x) + Phaser.Math.FloatBetween(-0.8, 0.8);
          b.sprite.setPosition(l.x + Math.cos(a) * l.r * 0.5, l.y + Math.sin(a) * l.r * 0.5);
        }
        break;
      }
      case 'lure': {
        const a = Math.random() * Math.PI * 2;
        const d = p.radius * Phaser.Math.FloatBetween(4, 5.5);
        const W = this.s.stage.worldSize;
        this.lure = { x: Phaser.Math.Clamp(p.x + Math.cos(a) * d, 100, W - 100), y: Phaser.Math.Clamp(p.y + Math.sin(a) * d, 100, W - 100), t: 6 + more * 2 };
        // it waits in the dark just behind its light
        b.held = true;
        b.sprite.setPosition(this.lure.x + Math.cos(a) * b.radius * 1.2, this.lure.y + Math.sin(a) * b.radius * 1.2);
        break;
      }
      case 'ink':
        this.ink = 4.5 + more * 1.5;
        ensureDarkTexture(this.s);
        this.inkImg = this.s.add.image(p.x, p.y, NIGHT_TEX).setDepth(29);
        this.inkFrame = this.s.add.graphics().setDepth(29);
        this.strikeQueue = 3 + more * 2;
        this.strikeDelay = 0.6;
        Sfx.play('breath', 0.4);
        break;
    }
  }

  private grab(): void {
    this.boss.held = true;
    this.grip = { t: 3, presses: 0, need: this.enraged ? 9 : 6, hint: 0 };
    Sfx.play('slam', 0.6);
    this.s.toast('CONSTRICTED! Mash the movement keys (or dash) to break free!');
  }

  private shout(text: string): void {
    const b = this.boss;
    this.s.floatText(b.x, b.y - b.radius * 1.5, text, '#ff8a80');
  }

  // ------------------------------------------------------------ running a move

  private updateMove(dt: number): void {
    const b = this.boss;
    const p = this.s.player;
    const gs = this.s.growthScale();

    // lunges: aim (telegraph line), then a fast dash at where you were
    const l = this.lunges[0];
    if (l) {
      if (l.warn > 0) {
        l.warn -= dt;
        l.tx = p.x;
        l.ty = p.y;
        b.held = true;
      } else {
        l.dash -= dt;
        b.pull(l.tx, l.ty, 950 * gs, dt);
        if (l.dash <= 0) {
          this.lunges.shift();
          if (!this.lunges.length) b.held = false;
          // the python's lunge ends in a squeeze if it caught you
          if (this.move === 'constrict' && !this.lunges.length && Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) < b.radius + p.radius + 20 * gs) this.grab();
        }
      }
    }

    // ambush: nearly invisible and still, until you come close (or it gets bored)
    if (this.hide > 0) {
      this.hide -= dt;
      b.sprite.setAlpha(0.12);
      const near = Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) - b.radius - p.radius < p.radius * 3;
      if (near || this.hide <= 0) {
        this.hide = 0;
        b.sprite.setAlpha(1);
        this.shout('SNIKT!');
        Sfx.play('dash', 0.9);
        this.lunges.push({ tx: 0, ty: 0, warn: near ? 0.15 : 0.35, dash: 0.35 });
      }
    }

    // lure: a tasty light; touch it and the jaws behind it snap shut
    const lu = this.lure;
    if (lu) {
      lu.t -= dt;
      b.sprite.setAlpha(0.08);
      const bit = Phaser.Math.Distance.Between(p.x, p.y, lu.x, lu.y) < p.radius * 2;
      if (bit || lu.t <= 0) {
        this.lure = null;
        b.sprite.setAlpha(1);
        if (bit) {
          this.shout('GOTCHA!');
          Sfx.play('slam', 0.7);
          this.lunges.push({ tx: 0, ty: 0, warn: 0.2, dash: 0.3 });
        } else b.held = false;
      }
    }

    // updraft: columns spin up where you are heading
    if (this.columnQueue > 0) {
      this.columnDelay -= dt;
      if (this.columnDelay <= 0) {
        this.columnQueue--;
        this.columnDelay = 0.55;
        this.columns.push({ x: p.x + p.vx * 0.5, y: p.y + p.vy * 0.5, r: p.radius * 2.4, t: 1 });
      }
    }

    // dive: gone from sight, its shadow follows you, locks, then it crashes down
    const dv = this.dive;
    if (dv) {
      if (dv.t > 0) {
        dv.t -= dt;
        dv.tx += (p.x - dv.tx) * Math.min(1, dt * 4);
        dv.ty += (p.y - dv.ty) * Math.min(1, dt * 4);
      } else {
        dv.lockT -= dt;
        if (dv.lockT <= 0) {
          const r = b.radius * 1.3;
          b.sprite.setPosition(dv.tx, dv.ty);
          b.held = false;
          this.dive = null;
          this.flashes.push({ x: dv.tx, y: dv.ty, r, life: 0.35 });
          Sfx.play('slam', 1);
          this.s.cameras.main.shake(250, 0.008);
          if (Phaser.Math.Distance.Between(p.x, p.y, dv.tx, dv.ty) < r + p.radius * 0.5) this.s.zoneHurt(b.def.damage * 1.2, dv.tx, dv.ty, `${b.name}'s dive`);
        }
      }
    }

    // constrict: rooted and squeezed until you mash free
    const gr = this.grip;
    if (gr) {
      gr.t -= dt;
      gr.presses += this.s.controls.movePresses();
      gr.hint -= dt;
      if (gr.hint <= 0) {
        gr.hint = 0.6;
        this.s.floatText(p.x, p.y - p.radius * 1.6, `BREAK FREE ${gr.presses}/${gr.need}`, '#ffcc80');
      }
      if (!p.dashing) {
        p.vx = 0;
        p.vy = 0;
        const squeeze = GameState.stats.maxHp * 0.07 * (1 - GameState.stats.armor) * GameState.diff.damageTaken * dt;
        GameState.hp -= squeeze;
        GameState.logDamage(b.name, squeeze);
      }
      if (gr.presses >= gr.need || p.dashing || gr.t <= 0 || GameState.hp <= 0) {
        this.grip = null;
        b.held = false;
        b.stun(1.2);
        p.knockback(b.x, b.y, 500 * gs);
        if (GameState.hp <= 0) GameState.hp = 1;
      }
    }

    // roar: a ring fills up, then stuns everything inside, you included
    const ro = this.roar;
    if (ro) {
      ro.t -= dt;
      if (ro.t <= 0) {
        this.roar = null;
        Sfx.play('roar');
        this.s.cameras.main.shake(400, 0.01);
        this.flashes.push({ x: b.x, y: b.y, r: ro.r, life: 0.4 });
        for (const c of this.s.creatures) if (c !== b && c.alive && Phaser.Math.Distance.Between(c.x, c.y, b.x, b.y) < ro.r) c.stun(1.5);
        if (!p.dashing && Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < ro.r) {
          this.s.slowPlayer(0.1, this.enraged ? 1.6 : 1.2);
          this.s.floatText(p.x, p.y - p.radius * 1.6, 'TERRIFIED!', '#ff8a80');
        }
      }
    }

    // gale: a gust drags you toward it, then it lunges
    if (this.gale > 0) {
      this.gale -= dt;
      if (!p.dashing) {
        const a = Math.atan2(b.y - p.y, b.x - p.x);
        p.vx += Math.cos(a) * 900 * gs * dt;
        p.vy += Math.sin(a) * 900 * gs * dt;
      }
      if (this.gale <= 0) this.lunges.push({ tx: 0, ty: 0, warn: 0.3, dash: 0.3 });
    }

    // quake: shockwave rings roll out one after another
    if (this.ringQueue > 0) {
      this.ringDelay -= dt;
      if (this.ringDelay <= 0) {
        this.ringQueue--;
        this.ringDelay = 0.6;
        this.rings.push({ r: b.radius, hit: false });
        Sfx.play('slam', 1.2);
        this.s.cameras.main.shake(150, 0.005);
        if (this.ringQueue === 0) b.held = false;
      }
    }

    // feather volleys: fans aimed at you
    if (this.volleys > 0) {
      this.volleyDelay -= dt;
      if (this.volleyDelay <= 0) {
        this.volleys--;
        this.volleyDelay = 0.7;
        const a0 = Math.atan2(p.y - b.y, p.x - b.x);
        const speed = 430 * gs;
        for (let i = -2; i <= 2; i++) {
          const a = a0 + i * 0.2;
          this.feathers.push({ x: b.x + Math.cos(a) * b.radius, y: b.y + Math.sin(a) * b.radius, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 2 });
        }
        Sfx.play('spear');
      }
    }

    // lightning (and the kraken's tentacles): strikes at where you are, with a warning
    if (this.strikeQueue > 0) {
      this.strikeDelay -= dt;
      if (this.strikeDelay <= 0) {
        this.strikeQueue--;
        this.strikeDelay = this.move === 'ink' ? 1 : 0.5;
        const lead = 0.4;
        const tentacle = this.move === 'ink';
        this.strikes.push({
          x: p.x + p.vx * lead,
          y: p.y + p.vy * lead,
          r: p.radius * (tentacle ? 2.6 : 2.2),
          t: tentacle ? 1.1 : 1,
          color: tentacle ? 0xba68c8 : 0xfff176,
        });
      }
    }
  }

  /** Lingering things that keep going even after the boss is gone. */
  private updateHazards(dt: number): void {
    const b = this.boss;
    const p = this.s.player;
    const gs = this.s.growthScale();
    const dmg = b.def.damage;

    for (const r of this.rings) {
      r.r += 380 * gs * dt;
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.ringOrigin.x, this.ringOrigin.y);
      if (!r.hit && !p.dashing && Math.abs(d - r.r) < p.radius * 0.8) {
        r.hit = true;
        this.s.zoneHurt(dmg * 0.7, this.ringOrigin.x, this.ringOrigin.y, `${b.name}'s shockwave`);
      }
    }
    this.rings = this.rings.filter((r) => r.r < b.radius * 9);

    for (const f of this.feathers) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
      if (Phaser.Math.Distance.Between(f.x, f.y, p.x, p.y) < p.radius) {
        this.s.zoneHurt(dmg * 0.45, f.x, f.y, `${b.name}'s feathers`);
        f.life = 0;
      }
    }
    this.feathers = this.feathers.filter((f) => f.life > 0);

    for (const st of this.strikes) {
      st.t -= dt;
      if (st.t > 0) continue;
      Sfx.play('crit');
      this.flashes.push({ x: st.x, y: st.y, r: st.r, life: 0.3 });
      if (Phaser.Math.Distance.Between(p.x, p.y, st.x, st.y) < st.r + p.radius * 0.4) this.s.zoneHurt(dmg * 0.8, st.x, st.y, `${b.name}'s ${this.move === 'ink' ? 'tentacle' : 'lightning'}`);
      for (const c of this.s.creatures) if (c !== b && c.alive && Phaser.Math.Distance.Between(c.x, c.y, st.x, st.y) < st.r) c.stun(1.5);
    }
    this.strikes = this.strikes.filter((st) => st.t > 0);

    for (const col of this.columns) {
      col.t -= dt;
      if (col.t > 0) continue;
      Sfx.play('breath', 1.2);
      this.flashes.push({ x: col.x, y: col.y, r: col.r, life: 0.3 });
      if (!p.dashing && Phaser.Math.Distance.Between(p.x, p.y, col.x, col.y) < col.r + p.radius * 0.4) {
        this.s.zoneHurt(dmg * 0.6, col.x, col.y, `${b.name}'s updraft`);
        p.knockback(col.x + Phaser.Math.FloatBetween(-5, 5), col.y + Phaser.Math.FloatBetween(-5, 5), 900 * gs);
      }
      for (const c of this.s.creatures) {
        if (c === b || !c.alive || Phaser.Math.Distance.Between(c.x, c.y, col.x, col.y) > col.r) continue;
        c.stun(1.2);
        c.push(col.x, col.y, 700 * gs);
      }
    }
    this.columns = this.columns.filter((col) => col.t > 0);

    for (const m of this.muds) {
      m.t -= dt;
      m.life -= dt;
      if (m.t <= 0 && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) < m.r) this.s.slowPlayer(0.4, 0.2);
    }
    this.muds = this.muds.filter((m) => m.life > 0);

    if (this.ink > 0) {
      this.ink -= dt;
      const fade = Math.min(1, this.ink / 0.8);
      const scale = (p.radius * 2.6) / NIGHT_HOLE;
      this.inkImg?.setPosition(p.x, p.y).setScale(scale).setAlpha(fade).setTint(0x8e24aa);
      const half = (NIGHT_TEX_SIZE / 2) * scale;
      const v = this.s.cameras.main.worldView;
      const f = this.inkFrame!;
      f.clear();
      f.fillStyle(0x0a0010, 0.95 * fade);
      const pad = 200;
      f.fillRect(v.x - pad, v.y - pad, v.width + pad * 2, p.y - half - v.y + pad);
      f.fillRect(v.x - pad, p.y + half, v.width + pad * 2, v.bottom - p.y - half + pad);
      f.fillRect(v.x - pad, p.y - half, p.x - half - v.x + pad, half * 2);
      f.fillRect(p.x + half, p.y - half, v.right - p.x - half + pad, half * 2);
      if (this.ink <= 0) this.clearInk();
    }

    for (const fl of this.flashes) fl.life -= dt;
    this.flashes = this.flashes.filter((fl) => fl.life > 0);
  }

  /** The boss is gone: cancel anything that holds you or it. */
  private release(): void {
    this.lunges = [];
    this.dive = null;
    this.grip = null;
    this.roar = null;
    this.gale = 0;
    this.ringQueue = 0;
    this.volleys = 0;
    this.strikeQueue = 0;
    this.columnQueue = 0;
    this.hide = 0;
    this.lure = null;
    this.boss.sprite.setAlpha(1);
    this.boss.held = false;
  }

  private clearInk(): void {
    this.ink = 0;
    this.inkImg?.destroy();
    this.inkFrame?.destroy();
    this.inkImg = null;
    this.inkFrame = null;
  }

  // ------------------------------------------------------------ drawing

  draw(g: Phaser.GameObjects.Graphics, lw: number): void {
    const b = this.boss;
    const l = this.lunges[0];
    if (l && l.warn > 0) {
      g.lineStyle(b.radius * 0.8, 0xff1744, 0.18);
      g.lineBetween(b.x, b.y, l.tx, l.ty);
      g.lineStyle(lw * 2, 0xff1744, 0.85);
      g.lineBetween(b.x, b.y, l.tx, l.ty);
    }
    const dv = this.dive;
    if (dv) {
      const locked = dv.t <= 0;
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(dv.tx, dv.ty, b.radius * 2.2, b.radius * 1.6);
      g.lineStyle(lw * 3, locked ? 0xff1744 : 0xffab40, 0.9);
      g.strokeCircle(dv.tx, dv.ty, b.radius * 1.3);
    }
    if (this.roar) {
      const k = 1 - this.roar.t;
      g.lineStyle(lw * 3, 0xff5252, 0.9);
      g.strokeCircle(b.x, b.y, this.roar.r);
      g.fillStyle(0xff5252, 0.2 * k);
      g.fillCircle(b.x, b.y, this.roar.r * k);
    }
    if (this.gale > 0) {
      const p = this.s.player;
      g.lineStyle(lw * 2, 0xe1f5fe, 0.5);
      for (let i = 0; i < 6; i++) {
        const a = Math.atan2(b.y - p.y, b.x - p.x) + (i - 2.5) * 0.12;
        const off = ((this.s.time.now / 3 + i * 40) % 160) * lw;
        g.lineBetween(p.x - Math.cos(a) * (off + 40 * lw), p.y - Math.sin(a) * (off + 40 * lw), p.x - Math.cos(a) * off, p.y - Math.sin(a) * off);
      }
    }
    for (const r of this.rings) {
      g.lineStyle(this.s.player.radius * 1.2, 0xffab40, 0.55);
      g.strokeCircle(this.ringOrigin.x, this.ringOrigin.y, r.r);
    }
    for (const f of this.feathers) {
      const a = Math.atan2(f.vy, f.vx);
      const len = this.s.player.radius * 0.9;
      g.lineStyle(lw * 3, 0x8d6e63, 1);
      g.lineBetween(f.x, f.y, f.x - Math.cos(a) * len, f.y - Math.sin(a) * len);
    }
    for (const st of this.strikes) {
      const k = 1 - st.t;
      g.lineStyle(lw * 2, st.color, 0.9);
      g.strokeCircle(st.x, st.y, st.r);
      g.fillStyle(st.color, 0.25 * Math.max(0, k));
      g.fillCircle(st.x, st.y, st.r * Math.max(0, k));
    }
    for (const col of this.columns) {
      const k = 1 - col.t;
      const spin = this.s.time.now / 120;
      g.lineStyle(lw * 2, 0xe1f5fe, 0.8);
      g.strokeCircle(col.x, col.y, col.r);
      for (let i = 0; i < 3; i++) {
        const a = spin + (i / 3) * Math.PI * 2;
        g.lineBetween(col.x + Math.cos(a) * col.r * 0.3, col.y + Math.sin(a) * col.r * 0.3, col.x + Math.cos(a + 0.8) * col.r * k, col.y + Math.sin(a + 0.8) * col.r * k);
      }
      g.fillStyle(0xe1f5fe, 0.2 * Math.max(0, k));
      g.fillCircle(col.x, col.y, col.r * Math.max(0, k));
    }
    if (this.lure) {
      const pulse = 0.5 + 0.5 * Math.sin(this.s.time.now / 200);
      const r = this.s.player.radius * 0.5;
      g.fillStyle(0xfff59d, 0.15 + 0.1 * pulse);
      g.fillCircle(this.lure.x, this.lure.y, r * 3);
      g.fillStyle(0xfff59d, 0.9);
      g.fillCircle(this.lure.x, this.lure.y, r * (0.8 + 0.2 * pulse));
    }
    for (const m of this.muds) {
      g.fillStyle(0x5d4037, m.t > 0 ? 0.3 : 0.6 * Math.min(1, m.life));
      g.fillCircle(m.x, m.y, m.r);
    }
    for (const fl of this.flashes) {
      g.fillStyle(0xffffff, fl.life / 0.4);
      g.fillCircle(fl.x, fl.y, fl.r);
    }
  }

  destroy(): void {
    this.release();
    this.clearInk();
  }
}
