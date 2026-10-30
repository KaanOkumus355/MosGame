import Phaser from 'phaser';
import { showBanners } from '../systems/Banners';
import { Codex } from '../state/Codex';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LINKS, OWNER_COLOR, REGIONS, TERRAIN_COLOR, empireBriefing, empireStats, type EmpireStats, type Owner, type RegionDef } from '../data/world';
import { RunSave } from '../state/RunSave';
import { GameState } from '../state/GameState';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';
import { Fx } from '../systems/Fx';
import { showdownBanner, winMoment } from '../systems/Finale';
import { BODY_RADIUS } from '../art/textures';
import { WORLD_MUSIC } from '../data/atmosphere';

interface Region extends RegionDef {
  troops: number;
  points: Phaser.Types.Math.Vector2Like[];
  poly: Phaser.Geom.Polygon;
  neighbors: Region[];
  nameText: Phaser.GameObjects.Text;
  troopText: Phaser.GameObjects.Text;
  /** Seconds of Bioweapon plague left (no regrowth). */
  plagued: number;
  /** Blight spreading through this region once it is yours. */
  veins: Phaser.Types.Math.Vector2Like[][];
}

interface Army {
  from: Region;
  to: Region;
  owner: 'you' | 'humans';
  count: number;
  t: number;
  dur: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  color: number;
}

type PowerId = 'surge' | 'bio' | 'roar';

/** Troops each of your regions grows per second (before bonuses). */
const BASE_GROWTH = 1.0;
const REGION_CAP = 250;
const BASE_INFLUENCE = 0.8;
const INFLUENCE_PER_REGION = 0.1;
/** Seconds for human research to finish if nothing slows it. */
const RESEARCH_TIME = 300;
const ARMY_SPEED = 110;
const SURGE_TIME = 12;
const ROAR_TIME = 15;
const PLAGUE_TIME = 20;
/** Fraction of defenders Bioweapons wipe out. */
const BIOWEAPON_KILL = 0.35;
const POWER_COOLDOWN: Record<PowerId, number> = { surge: 40, bio: 40, roar: 50 };
const SEND_FRACTIONS = [0.5, 1];
/** Humanity's last fortress: it appears once you hold everything else. */
const BASTION: RegionDef = { id: 'bastion', name: 'The Last Bastion', x: 880, y: 585, rx: 92, ry: 46, terrain: 'ice', owner: 'humans', level: 3 };
const BASTION_TROOPS = 420;
/** Troops a second the Overlord itself tears from the Bastion. */
const OVERLORD_DRAIN = 5;
/** Seconds between the Bastion's strikes, and the share of a region's troops one takes. */
const BASTION_STRIKE = 7;
const BASTION_STRIKE_SHARE = 0.4;
const MAP_TOP = 56;
const MAP_BOTTOM = 648;

/** Stage 6: the strategy layer. Spread your swarm across the world and take every region. */
export class WorldMapScene extends Phaser.Scene {
  private regions: Region[] = [];
  private armies: Army[] = [];
  private rings: Ring[] = [];
  private emp!: EmpireStats;
  private selected: Region | null = null;
  private hovered: Region | null = null;
  private mode: 'attack' | 'convert' = 'attack';
  private sendFrac = 0.75;
  private influence = 0;
  private research = 0;
  private initialHumans = 0;
  private humanTimer = 8;
  private cooldowns: Record<PowerId, number> = { surge: 0, bio: 0, roar: 0 };
  private surgeTime = 0;
  private roarTime = 0;
  private aimingBio = false;
  private started = false;
  private paused = false;
  private over = false;
  private conquered = 0;
  private converted = 0;
  private mapTime = 0;
  /** The fortress, once the showdown has begun. */
  private bastion: Region | null = null;
  private strikeCd = 0;
  private overlord!: Phaser.GameObjects.Image;

  private dreadG!: Phaser.GameObjects.Graphics;
  private mapG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private uiG!: Phaser.GameObjects.Graphics;
  private topText!: Phaser.GameObjects.Text;
  private researchText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private powerButtons: { id: PowerId; x: number; y: number; w: number; h: number; label: Phaser.GameObjects.Text }[] = [];
  private fracButtons: { frac: number; rect: Phaser.GameObjects.Rectangle }[] = [];
  private modeButtons: { mode: 'attack' | 'convert'; rect: Phaser.GameObjects.Rectangle }[] = [];
  private toasts: Phaser.GameObjects.Text[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;
  private fx!: Fx;

  constructor() {
    super('WorldMap');
  }

  create(): void {
    Codex.becomeForm('world');
    RunSave.checkpoint();
    this.regions = [];
    this.armies = [];
    this.rings = [];
    this.selected = null;
    this.hovered = null;
    this.mode = 'attack';
    this.sendFrac = 0.5;
    this.bastion = null;
    this.strikeCd = 0;
    this.research = 0;
    this.humanTimer = 8;
    this.cooldowns = { surge: 0, bio: 0, roar: 0 };
    this.surgeTime = 0;
    this.roarTime = 0;
    this.aimingBio = false;
    this.started = false;
    this.paused = false;
    this.over = false;
    this.conquered = 0;
    this.converted = 0;
    this.mapTime = 0;
    this.powerButtons = [];
    this.fracButtons = [];
    this.modeButtons = [];
    this.toasts = [];
    this.overlay = null;

    this.emp = empireStats();
    this.influence = this.emp.startInfluence;
    this.cameras.main.setBackgroundColor(0x0b2a4a);

    this.drawOcean();
    this.dreadG = this.add.graphics().setDepth(0.5);
    this.buildRegions();
    this.mapG = this.add.graphics().setDepth(2);
    this.fxG = this.add.graphics().setDepth(4);
    this.fx = new Fx(this, 6);
    // you are still you: the Overlord watches over its strongest region
    const home = this.regions.find((r) => r.owner === 'you') ?? this.regions[0];
    this.overlord = this.add.image(home.x, home.y - 30, 'overlord').setScale(26 / BODY_RADIUS).setAngle(-90).setDepth(6);
    Sfx.startAmbient(WORLD_MUSIC);
    this.buildUi();
    this.setupInput();
    this.showBriefing();
  }

  // ------------------------------------------------------------ setup

  private drawOcean(): void {
    const g = this.add.graphics().setDepth(0);
    // gentle wave lines across the ocean
    const rng = new Phaser.Math.RandomDataGenerator(['ocean']);
    g.lineStyle(2, 0x1c4f7a, 0.5);
    for (let i = 0; i < 70; i++) {
      const x = rng.between(0, GAME_WIDTH);
      const y = rng.between(MAP_TOP, MAP_BOTTOM);
      g.beginPath();
      g.arc(x, y, 14, Math.PI * 1.15, Math.PI * 1.85);
      g.strokePath();
    }
  }

  /** Organic blob outline for a region, deterministic per region. */
  private blob(def: RegionDef): Phaser.Types.Math.Vector2Like[] {
    const rng = new Phaser.Math.RandomDataGenerator([def.id]);
    const p1 = rng.realInRange(0, Math.PI * 2);
    const p2 = rng.realInRange(0, Math.PI * 2);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wobble = 1 + 0.12 * Math.sin(a * 3 + p1) + 0.07 * Math.sin(a * 5 + p2);
      pts.push({ x: def.x + Math.cos(a) * def.rx * wobble, y: def.y + Math.sin(a) * def.ry * wobble });
    }
    return pts;
  }

  /** Blight: a few branching lines from the middle of a region out toward its edge. */
  private veins(def: RegionDef): Phaser.Types.Math.Vector2Like[][] {
    const rng = new Phaser.Math.RandomDataGenerator([`veins-${def.id}`]);
    return Array.from({ length: 7 }, (_, i) => {
      let a = (i / 7) * Math.PI * 2 + rng.realInRange(-0.3, 0.3);
      const line: Phaser.Types.Math.Vector2Like[] = [{ x: def.x, y: def.y }];
      for (let k = 1; k <= 4; k++) {
        a += rng.realInRange(-0.45, 0.45);
        line.push({ x: def.x + Math.cos(a) * def.rx * 0.22 * k, y: def.y + Math.sin(a) * def.ry * 0.22 * k });
      }
      return line;
    });
  }

  private addRegion(def: RegionDef, troops: number): Region {
    const points = this.blob(def);
    const style = { fontFamily: FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3 };
    const nameText = this.add.text(def.x, def.y - 20, def.name, { ...style, fontSize: '12px' }).setOrigin(0.5).setDepth(5);
    const troopText = this.add.text(def.x, def.y + 2, '', { ...style, fontSize: '18px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(5);
    const region: Region = {
      ...def,
      troops,
      points,
      poly: new Phaser.Geom.Polygon(points),
      neighbors: [],
      nameText,
      troopText,
      plagued: 0,
      veins: this.veins(def),
    };
    this.regions.push(region);
    return region;
  }

  private buildRegions(): void {
    for (const def of REGIONS) {
      const troops =
        def.owner === 'you' ? this.emp.startTroops : def.owner === 'humans' ? (35 * def.level + Phaser.Math.Between(15, 30)) * GameState.diff.humanStrength : Phaser.Math.Between(8, 22);
      this.addRegion(def, troops);
    }
    const byId = new Map(this.regions.map((r) => [r.id, r]));
    for (const [a, b] of LINKS) {
      byId.get(a)!.neighbors.push(byId.get(b)!);
      byId.get(b)!.neighbors.push(byId.get(a)!);
    }
    this.initialHumans = this.regions.filter((r) => r.owner === 'humans').length;

    // links: solid over land, dashed across the sea
    const g = this.add.graphics().setDepth(1);
    for (const [a, b, sea] of LINKS) {
      const ra = byId.get(a)!;
      const rb = byId.get(b)!;
      g.lineStyle(2, 0xffffff, sea ? 0.25 : 0.18);
      if (!sea) {
        g.lineBetween(ra.x, ra.y, rb.x, rb.y);
        continue;
      }
      const d = Phaser.Math.Distance.Between(ra.x, ra.y, rb.x, rb.y);
      const steps = Math.floor(d / 14);
      for (let i = 0; i < steps; i += 2) {
        const t1 = i / steps;
        const t2 = Math.min(1, (i + 1) / steps);
        g.lineBetween(ra.x + (rb.x - ra.x) * t1, ra.y + (rb.y - ra.y) * t1, ra.x + (rb.x - ra.x) * t2, ra.y + (rb.y - ra.y) * t2);
      }
    }
  }

  private buildUi(): void {
    this.uiG = this.add.graphics().setDepth(10);
    const small = { fontFamily: FONT, fontSize: '15px', color: '#e8f5e9', stroke: '#000', strokeThickness: 3 };
    this.add
      .text(16, 10, 'THE OVERLORD', { ...small, fontSize: '22px', color: '#d4ff7a', fontStyle: 'bold' })
      .setDepth(11);
    this.topText = this.add.text(200, 16, '', small).setDepth(11);
    this.researchText = this.add.text(GAME_WIDTH - 16, 6, '', { ...small, fontSize: '13px' }).setOrigin(1, 0).setDepth(11);

    // powers
    const powers: { id: PowerId; key: string; name: string }[] = [
      { id: 'surge', key: 'Q', name: 'Swarm Surge' },
      { id: 'bio', key: 'W', name: 'Bioweapons' },
      { id: 'roar', key: 'E', name: 'Terror Roar' },
    ];
    powers.forEach((p, i) => {
      const x = 12 + i * 158;
      const y = MAP_BOTTOM + 14;
      const w = 150;
      const h = 46;
      const zone = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true }).setDepth(12);
      zone.on('pointerdown', () => this.usePower(p.id));
      const label = this.add
        .text(x + w / 2, y + h / 2, `${p.key}  ${p.name}`, { ...small, fontSize: '14px', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(12);
      this.powerButtons.push({ id: p.id, x, y, w, h, label });
    });

    // send fraction
    this.add.text(500, MAP_BOTTOM + 8, 'Send (1-2)', { ...small, fontSize: '12px' }).setDepth(11);
    SEND_FRACTIONS.forEach((frac, i) => {
      const rect = this.add
        .rectangle(500 + i * 52 + 24, MAP_BOTTOM + 44, 46, 30, 0x16121f, 0.95)
        .setStrokeStyle(2, 0x8be9fd)
        .setInteractive({ useHandCursor: true })
        .setDepth(11);
      rect.on('pointerdown', () => (this.sendFrac = frac));
      this.add.text(rect.x, rect.y, `${frac * 100}%`, { ...small, fontSize: '13px' }).setOrigin(0.5).setDepth(12);
      this.fracButtons.push({ frac, rect });
    });

    // mode
    (['attack', 'convert'] as const).forEach((mode, i) => {
      const rect = this.add
        .rectangle(740 + i * 112 + 52, MAP_BOTTOM + 36, 104, 40, 0x16121f, 0.95)
        .setStrokeStyle(2, mode === 'attack' ? 0xff5252 : 0xffd54f)
        .setInteractive({ useHandCursor: true })
        .setDepth(11);
      rect.on('pointerdown', () => (this.mode = mode));
      this.add
        .text(rect.x, rect.y, mode === 'attack' ? 'Attack (A)' : 'Convert (C)', { ...small, fontSize: '14px', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(12);
      this.modeButtons.push({ mode, rect });
    });

    this.infoText = this.add
      .text(GAME_WIDTH - 14, MAP_BOTTOM + 10, '', { ...small, fontSize: '13px', align: 'right', wordWrap: { width: 300 } })
      .setOrigin(1, 0)
      .setDepth(11);
  }

  private setupInput(): void {
    this.input.mouse!.disableContextMenu();
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!this.started || this.paused || this.over || over.length) return;
      if (ptr.y < MAP_TOP || ptr.y > MAP_BOTTOM) return;
      this.clickMap(this.regionAt(ptr.x, ptr.y), ptr.rightButtonDown());
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      this.hovered = this.regionAt(ptr.x, ptr.y);
    });
    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (!this.started || this.over) return;
      if (e.code === 'Escape') {
        if (this.aimingBio || this.selected) {
          this.aimingBio = false;
          this.selected = null;
        } else {
          this.togglePause();
        }
        return;
      }
      if (this.paused) {
        if (e.code === 'KeyM') this.toMenu();
        return;
      }
      const digit = /^Digit([1-2])$/.exec(e.code);
      if (digit) this.sendFrac = SEND_FRACTIONS[Number(digit[1]) - 1];
      if (e.code === 'KeyA') this.mode = 'attack';
      if (e.code === 'KeyC') this.mode = 'convert';
      if (e.code === 'KeyQ') this.usePower('surge');
      if (e.code === 'KeyW') this.usePower('bio');
      if (e.code === 'KeyE') this.usePower('roar');
      // dev cheat: ] = take every human region
      if (import.meta.env.DEV && e.code === 'BracketRight') {
        for (const r of this.regions) if (r.owner !== 'you') this.capture(r, 'you', 20);
      }
    });
  }

  private regionAt(x: number, y: number): Region | null {
    let best: Region | null = null;
    let bd = Infinity;
    for (const r of this.regions) {
      if (!Phaser.Geom.Polygon.Contains(r.poly, x, y)) continue;
      const d = Phaser.Math.Distance.Between(x, y, r.x, r.y);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ briefing / pause

  private showBriefing(): void {
    const cx = GAME_WIDTH / 2;
    const items: Phaser.GameObjects.GameObject[] = [this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05020c, 0.85).setOrigin(0)];
    const t = (y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) => {
      const o = this.add.text(cx, y, text, { fontFamily: FONT, align: 'center', ...style }).setOrigin(0.5, 0);
      items.push(o);
      return o;
    };
    t(40, 'THE OVERLORD AWAKENS', { fontSize: '46px', color: '#d4ff7a', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 });
    t(104, 'The food chain is complete. Now for the world. Take every region before humanity finishes its Ultimate Bug Spray, then break its last fortress.', {
      fontSize: '17px', color: '#e0e0e0', wordWrap: { width: 980 },
    });
    t(150, 'Your evolution shapes your empire:', { fontSize: '17px', color: '#8be9fd', fontStyle: 'bold' });
    const lines = empireBriefing();
    const shown = lines.length ? lines : ['No traits... a humble start. Your swarm will have to do.'];
    const cols = shown.length > 9 ? 2 : 1;
    const per = Math.ceil(shown.length / cols);
    for (let c = 0; c < cols; c++) {
      const o = this.add
        .text(cols === 1 ? cx : cx - 300 + c * 600, 178, shown.slice(c * per, (c + 1) * per).join('\n'), {
          fontFamily: FONT, fontSize: '14px', color: '#e8f5e9', align: 'center', lineSpacing: 5, wordWrap: { width: 580 },
        })
        .setOrigin(0.5, 0);
      items.push(o);
    }
    t(500, [
      'Click one of your purple regions, then a neighbour: send half your troops or all of them (keys 1-2).',
      'Attack (A) beats defenders by numbers. Convert (C, or right-click) spends influence to flip a human region peacefully.',
      'Powers: Q Swarm Surge · W Bioweapons · E Terror Roar.   ESC: deselect / pause.',
    ].join('\n'), { fontSize: '15px', color: '#c8e6c9', lineSpacing: 6 });
    const go = t(630, 'Click or press SPACE to begin your reign', { fontSize: '26px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 });
    this.tweens.add({ targets: go, alpha: 0.4, yoyo: true, repeat: -1, duration: 700 });
    this.overlay = this.add.container(0, 0, items).setDepth(50);

    this.time.delayedCall(500, () => {
      const begin = () => {
        if (!this.overlay) return;
        this.overlay?.destroy();
        this.overlay = null;
        // let the click that closed the briefing finish before map clicks count
        this.time.delayedCall(100, () => (this.started = true));
        this.toast('Your reign begins in the Savanna.');
      };
      this.input.once('pointerdown', begin);
      this.input.keyboard!.once('keydown-SPACE', begin);
      onPadButton(this, (b) => (b === PAD.A || b === PAD.START) && begin());
    });
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      const cx = GAME_WIDTH / 2;
      this.overlay = this.add
        .container(0, 0, [
          this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05020c, 0.7).setOrigin(0),
          this.add.text(cx, 260, 'PAUSED', { fontFamily: FONT, fontSize: '60px', color: '#d4ff7a', fontStyle: 'bold', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5),
          this.add.text(cx, 340, 'ESC: resume   ·   M: main menu', { fontFamily: FONT, fontSize: '20px', color: '#e8f5e9' }).setOrigin(0.5),
        ])
        .setDepth(50);
    } else {
      this.overlay?.destroy();
      this.overlay = null;
    }
  }

  private toMenu(): void {
    Sfx.stopAmbient();
    this.scene.start('Menu');
  }

  // ------------------------------------------------------------ player actions

  /** Regions this region's armies can reach. */
  private reachable(from: Region, reach: number): Set<Region> {
    const out = new Set<Region>();
    let frontier = [from];
    for (let i = 0; i < reach; i++) {
      const next: Region[] = [];
      for (const r of frontier) {
        for (const n of r.neighbors) {
          if (n !== from && !out.has(n)) {
            out.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return out;
  }

  private clickMap(r: Region | null, right: boolean): void {
    if (this.aimingBio) {
      if (r?.owner === 'humans') this.plague(r);
      else this.toast('Bioweapons need a human region as a target.');
      return;
    }
    if (!r) {
      this.selected = null;
      return;
    }
    if (right || (this.mode === 'convert' && r.owner === 'humans')) {
      this.convert(r);
      return;
    }
    if (!this.selected) {
      if (r.owner === 'you') this.selected = r;
      return;
    }
    if (r === this.selected) {
      this.selected = null;
      return;
    }
    // in reach: attack it, or reinforce it if it's yours
    if (this.reachable(this.selected, this.emp.reach).has(r)) this.send(this.selected, r, 'you', this.sendFrac);
    else if (r.owner === 'you') this.selected = r;
    else this.toast(`${r.name} is out of reach from ${this.selected.name}.`);
  }

  private send(from: Region, to: Region, owner: 'you' | 'humans', frac: number): void {
    const count = Math.floor(from.troops * frac);
    if (count < 1) return;
    from.troops -= count;
    const speed = ARMY_SPEED * (owner === 'you' ? this.emp.travelMul : 0.9);
    const dur = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y) / speed;
    this.armies.push({ from, to, owner, count, t: 0, dur });
    if (owner === 'you') Sfx.play('march');
    if (owner === 'humans' && to.owner === 'you' && this.emp.intel) this.toast(`Spy Satellites: ${count} humans marching on ${to.name}!`);
  }

  private convertCost(r: Region): number {
    return Math.round((r.troops * 1.5 + 25 * r.level) * (1 - this.emp.convertDiscount));
  }

  /** Converting needs a border with one of your regions; costs influence instead of troops. */
  private convert(r: Region): void {
    if (r.owner !== 'humans') {
      this.toast('Only human regions can be converted.');
      return;
    }
    if (!r.neighbors.some((n) => n.owner === 'you')) {
      this.toast(`${r.name} doesn't border your empire yet.`);
      return;
    }
    const cost = this.convertCost(r);
    if (this.influence < cost) {
      this.toast(`Converting ${r.name} needs ${cost} influence (you have ${Math.floor(this.influence)}).`);
      return;
    }
    this.influence -= cost;
    this.converted++;
    this.capture(r, 'you', 10 + 8 * r.level);
    Sfx.play('convert');
    this.fx.burst(r.x, r.y, { color: 0xffd54f, count: 30, speed: 140, scale: 0.6, lifespan: 800 });
    this.toast(`${r.name} has seen the light. All hail the Overlord!`);
  }

  private usePower(id: PowerId): void {
    if (!this.started || this.paused || this.over) return;
    if (this.cooldowns[id] > 0) {
      this.toast(`Recharging: ${Math.ceil(this.cooldowns[id])}s`);
      return;
    }
    if (id === 'surge') {
      this.surgeTime = SURGE_TIME;
      this.cooldowns.surge = POWER_COOLDOWN.surge * this.emp.cooldownMul;
      this.toast('SWARM SURGE! Your regions breed twice as fast.');
      Sfx.play('surge');
    } else if (id === 'bio') {
      if (!this.emp.hasBioweapons) {
        this.toast('Bioweapons require the Venom trait.');
        return;
      }
      this.aimingBio = true;
      this.toast('Click a human region to release Bioweapons.');
    } else {
      this.roarTime = ROAR_TIME;
      this.cooldowns.roar = POWER_COOLDOWN.roar * this.emp.cooldownMul;
      let scattered = 0;
      for (const a of this.armies) {
        if (a.owner === 'humans') {
          a.count = 0;
          scattered++;
        }
      }
      this.cameras.main.shake(300, 0.006);
      Sfx.play('roar');
      this.toast(`TERROR ROAR! Humans cower for ${ROAR_TIME}s${scattered ? ` and ${scattered} army(s) flee` : ''}.`);
    }
  }

  private plague(r: Region): void {
    this.aimingBio = false;
    r.troops *= 1 - BIOWEAPON_KILL;
    r.plagued = PLAGUE_TIME;
    this.cooldowns.bio = this.emp.bioweaponCooldown * this.emp.cooldownMul;
    this.rings.push({ x: r.x, y: r.y, r: Math.max(r.rx, r.ry), life: 0.6, color: 0x9ccc65 });
    Sfx.play('bioweapon');
    this.fx.burst(r.x, r.y, { color: 0x9ccc65, count: 26, speed: 90, scale: 0.7, lifespan: 1200, glow: false });
    this.toast(`Bioweapons unleashed on ${r.name}! A third of its defenders drop.`);
  }

  // ------------------------------------------------------------ simulation

  update(_time: number, deltaMs: number): void {
    showBanners(this);
    if (!this.started || this.paused || this.over) {
      this.render();
      return;
    }
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.mapTime += dt;
    GameState.tick(dt);
    for (const k of Object.keys(this.cooldowns) as PowerId[]) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    this.surgeTime = Math.max(0, this.surgeTime - dt);
    this.roarTime = Math.max(0, this.roarTime - dt);

    this.growRegions(dt);
    this.updateArmies(dt);
    this.humanAi(dt);
    this.updateResearch(dt);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    this.checkEnd();
    this.render();
  }

  private growRegions(dt: number): void {
    const e = this.emp;
    let owned = 0;
    for (const r of this.regions) {
      r.plagued = Math.max(0, r.plagued - dt);
      if (r.owner === 'you') {
        owned++;
        let g = BASE_GROWTH * e.growthMul * (this.surgeTime > 0 ? 2 : 1);
        if (r.troops < 20) g *= e.emergencyGrowth;
        r.troops = Math.min(REGION_CAP, r.troops + g * dt);
        for (const n of r.neighbors) {
          // Cultural Pull: wild neighbours slowly defect
          if (n.owner === 'wild' && e.wildPull > 0) {
            n.troops -= e.wildPull * dt;
            if (n.troops <= 0) {
              this.capture(n, 'you', 5);
              this.toast(`${n.name} joins you of its own accord.`);
            }
          }
          // Missile Silos: bombard human neighbours
          if (n.owner === 'humans' && e.siloDps > 0) n.troops = Math.max(1, n.troops - e.siloDps * dt);
        }
      } else if (r.owner === 'humans' && r.plagued <= 0 && r !== this.bastion) {
        const cap = 60 + 50 * r.level;
        r.troops = Math.min(cap, r.troops + (0.5 + 0.4 * r.level) * (1 + this.research / 150) * GameState.diff.humanStrength * dt);
      }
    }
    this.influence += ((BASE_INFLUENCE + INFLUENCE_PER_REGION * owned) * e.influenceMul + e.influenceFlat) * dt;
    this.updateOverlord(dt);
  }

  /** The Overlord drifts to your strongest region, or goes to war with the Bastion in person. */
  private updateOverlord(dt: number): void {
    const b = this.bastion?.owner === 'humans' ? this.bastion : null;
    const mine = this.regions.filter((r) => r.owner === 'you');
    const best = mine.reduce<Region | null>((a, r) => (!a || r.troops > a.troops ? r : a), null);
    const target = b ?? best;
    if (!target) return;
    const o = this.overlord;
    const k = Math.min(1, dt * 1.5);
    o.x += (target.x - o.x) * k;
    o.y += (target.y - 34 + Math.sin(this.mapTime * 2) * 4 - o.y) * k;
    if (!b) return;
    b.troops = Math.max(1, b.troops - OVERLORD_DRAIN * dt);
    this.strikeCd -= dt * GameState.diff.humanStrength;
    if (this.strikeCd > 0) return;
    this.strikeCd = BASTION_STRIKE;
    // it answers by shelling whatever is strongest near it
    const hit = b.neighbors.filter((n) => n.owner === 'you').sort((x, y) => y.troops - x.troops)[0];
    if (!hit) return;
    hit.troops = Math.max(1, hit.troops * (1 - BASTION_STRIKE_SHARE));
    this.rings.push({ x: hit.x, y: hit.y, r: Math.max(hit.rx, hit.ry), life: 0.6, color: 0xff1744 });
    this.fx.burst(hit.x, hit.y, { color: 0xff5252, count: 18, speed: 120, scale: 0.6, lifespan: 600 });
    Sfx.play('slam', 0.8);
    this.toast(`The Bastion shells ${hit.name}!`);
  }

  /** You hold the world, so humanity retreats to its last fortress. */
  private startShowdown(): void {
    const def = { ...BASTION };
    const b = this.addRegion(def, BASTION_TROOPS * GameState.diff.humanStrength * GameState.threatLevel);
    const near = this.regions.filter((r) => r !== b).sort((x, y) => Phaser.Math.Distance.Between(x.x, x.y, b.x, b.y) - Phaser.Math.Distance.Between(y.x, y.y, b.x, b.y)).slice(0, 3);
    const g = this.add.graphics().setDepth(1);
    g.lineStyle(2, 0xff8a80, 0.35);
    for (const n of near) {
      b.neighbors.push(n);
      n.neighbors.push(b);
      g.lineBetween(n.x, n.y, b.x, b.y);
    }
    this.bastion = b;
    this.strikeCd = 5;
    this.rings.push({ x: b.x, y: b.y, r: 100, life: 0.8, color: 0xff1744 });
    showdownBanner(this, 'THE LAST BASTION', 'Gather your swarm and break it before the Spray is ready.', '#ff8a80');
  }

  private updateArmies(dt: number): void {
    for (const a of this.armies) {
      a.t += dt;
      if (a.t >= a.dur) this.resolve(a);
    }
    this.armies = this.armies.filter((a) => a.t < a.dur && a.count > 0);
  }

  /** An army arrives: reinforce a friendly region or fight for it. */
  private resolve(a: Army): void {
    const to = a.to;
    if (a.count <= 0) return;
    if (to.owner === a.owner) {
      to.troops = Math.min(REGION_CAP, to.troops + a.count);
      return;
    }
    const atkMul = a.owner === 'you' ? this.emp.attackMul : 1 + this.research / 200;
    const defMul = to.owner === 'you' ? this.emp.defenseMul : to.owner === 'humans' ? 1 + 0.2 * to.level : 1;
    // Biohazard Zones: attackers on your land take extra losses
    const atk = a.count * atkMul * (to.owner === 'you' ? 1 - this.emp.biohazard : 1);
    const def = to.troops * defMul;
    this.rings.push({ x: to.x, y: to.y, r: 30, life: 0.35, color: a.owner === 'you' ? 0xb388ff : 0xff5252 });
    if (atk > def) {
      const left = (atk - def) / atkMul;
      const wasHuman = to.owner === 'humans';
      const wasYours = to.owner === 'you';
      this.capture(to, a.owner, a.owner === 'you' ? left * this.emp.rallyMul : left);
      if (a.owner === 'you') {
        Sfx.play('capture');
        if (wasHuman) {
          this.conquered++;
          this.toast(`${to.name} has fallen to the swarm!`);
        }
      } else if (wasYours) {
        this.toast(`Humans retook ${to.name}!`);
        GameState.logLoss('Regions retaken by humans');
        Sfx.play('lostRegion');
        if (this.selected === to) this.selected = null;
      }
    } else {
      to.troops = Math.max(1, (def - atk) / defMul);
    }
  }

  private capture(r: Region, owner: Owner, troops: number): void {
    r.owner = owner;
    this.fx.burst(r.x, r.y, { color: owner === 'you' ? 0xb388ff : 0x90a4ae, count: 20, speed: 120, scale: 0.6, lifespan: 700 });
    r.troops = Math.max(1, troops);
    r.plagued = 0;
    this.rings.push({ x: r.x, y: r.y, r: Math.max(r.rx, r.ry), life: 0.5, color: owner === 'you' ? 0x7c4dff : 0x90a4ae });
  }

  /** Humans counterattack your borders and shuffle troops toward the front. */
  private humanAi(dt: number): void {
    this.humanTimer -= dt;
    if (this.humanTimer > 0) return;
    this.humanTimer = Phaser.Math.FloatBetween(5.5, 8) - 3.5 * (this.research / 100);
    if (this.roarTime > 0) return;

    let best: { from: Region; to: Region; score: number } | null = null;
    for (const h of this.regions) {
      // the Bastion holds its garrison back
      if (h.owner !== 'humans' || h.plagued > 0 || h === this.bastion) continue;
      for (const n of h.neighbors) {
        if (n.owner !== 'you') continue;
        const score = h.troops * 0.55 * (1 + this.research / 200) - n.troops * this.emp.defenseMul;
        if (!best || score > best.score) best = { from: h, to: n, score };
      }
    }
    if (best && (best.score > 0 || Math.random() < 0.25)) this.send(best.from, best.to, 'humans', 0.55);

    // rear cities send reinforcements to a frontline neighbour
    for (const h of this.regions) {
      if (h.owner !== 'humans' || h.troops < 60 || h.neighbors.some((n) => n.owner === 'you')) continue;
      const front = h.neighbors.find((n) => n.owner === 'humans' && n.neighbors.some((m) => m.owner === 'you'));
      if (front && Math.random() < 0.5) this.send(h, front, 'humans', 0.4);
    }
  }

  private updateResearch(dt: number): void {
    const humans = this.regions.filter((r) => r.owner === 'humans').length;
    if (humans === 0) return;
    const share = 0.4 + 0.6 * (humans / this.initialHumans);
    this.research += ((100 / (RESEARCH_TIME * GameState.diff.researchTime)) * share * (1 - this.emp.researchSlow) * GameState.threatLevel) * dt;
  }

  private checkEnd(): void {
    const mine = this.regions.filter((r) => r.owner === 'you').length;
    if (mine === this.regions.length) {
      if (!this.bastion) {
        this.startShowdown();
        return;
      }
      this.over = true;
      this.overlord.setPosition(this.bastion.x, this.bastion.y).setScale(40 / BODY_RADIUS);
      winMoment(this, this.bastion.x, this.bastion.y, 'THE WORLD IS YOURS.', '#d4ff7a', () =>
        this.scene.start('Victory', { conquered: this.conquered, converted: this.converted, mapTime: this.mapTime }),
      );
      return;
    }
    const marching = this.armies.some((a) => a.owner === 'you' && a.count > 0);
    if (mine === 0 && !marching) this.lose('the united armies of humanity');
    else if (this.research >= 100) this.lose("humanity's Ultimate Bug Spray");
  }

  private lose(source: string): void {
    this.over = true;
    Sfx.stopAmbient();
    GameState.killedBy = source;
    this.cameras.main.fadeOut(1200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('GameOver'));
  }

  // ------------------------------------------------------------ drawing

  private render(): void {
    const g = this.mapG;
    const fx = this.fxG;
    g.clear();
    fx.clear();
    const now = this.time.now;
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    const targets = this.selected ? this.reachable(this.selected, this.emp.reach) : new Set<Region>();
    // the sea sickens as your empire grows
    const held = this.regions.filter((r) => r.owner === 'you').length / this.regions.length;
    this.dreadG.clear().fillStyle(0x2a0a45, 0.65 * held).fillRect(0, MAP_TOP, GAME_WIDTH, MAP_BOTTOM - MAP_TOP);

    for (const r of this.regions) {
      const fill = r.owner === 'wild' ? TERRAIN_COLOR[r.terrain] : OWNER_COLOR[r.owner];
      g.fillStyle(fill, r.owner === 'wild' ? 0.85 : 0.92);
      g.fillPoints(r.points, true);
      // terrain shows through as a rim
      g.lineStyle(4, TERRAIN_COLOR[r.terrain], 0.9);
      g.strokePoints(r.points, true);
      if (r.owner === 'you') {
        // blight pulsing out from the heart of the region
        g.lineStyle(3, 0xd1a6ff, 0.35 + 0.3 * Math.sin(now / 400 + r.x));
        for (const v of r.veins) g.strokePoints(v, false);
        g.fillStyle(0xe1bee7, 0.5 + 0.3 * Math.sin(now / 400 + r.x));
        g.fillCircle(r.x, r.y, 6);
      }
      if (r.plagued > 0) {
        g.fillStyle(0x9ccc65, 0.25 + 0.15 * pulse);
        g.fillPoints(r.points, true);
      }
      if (r.owner === 'humans') {
        // city blocks
        for (let i = 0; i < r.level; i++) {
          const bx = r.x - (r.level - 1) * 9 + i * 18 - 6;
          g.fillStyle(0xeceff1, 0.9);
          g.fillRect(bx, r.y + 16, 12, 10 + (i % 2) * 4);
          g.fillStyle(0xffd54f, 0.9);
          g.fillRect(bx + 3, r.y + 19, 3, 3);
        }
      }
      if (r === this.selected) {
        g.lineStyle(4, 0xffffff, 1);
        g.strokePoints(r.points, true);
      } else if (targets.has(r)) {
        g.lineStyle(3, r.owner === 'you' ? 0x8be9fd : 0xffd54f, 0.4 + 0.5 * pulse);
        g.strokePoints(r.points, true);
      }
      if (this.aimingBio && r.owner === 'humans') {
        g.lineStyle(3, 0x9ccc65, 0.4 + 0.5 * pulse);
        g.strokePoints(r.points, true);
      }
      if (r === this.hovered && r !== this.selected) {
        g.lineStyle(2, 0xffffff, 0.6);
        g.strokePoints(r.points, true);
      }
      const exact = r.owner === 'you' || this.emp.intel;
      r.troopText.setText(exact ? `${Math.floor(r.troops)}` : `~${Math.max(10, Math.round(r.troops / 10) * 10)}`);
      r.troopText.setColor(r.owner === 'you' ? '#e1d5ff' : r.owner === 'humans' ? '#ffffff' : '#1b1b1b');
      r.troopText.setStroke(r.owner === 'wild' ? '#ffffff' : '#000000', 3);
    }

    const b = this.bastion;
    if (b?.owner === 'humans') {
      // walls around the fortress, and the Overlord's beam tearing at them
      g.lineStyle(5, 0xff5252, 0.5 + 0.4 * pulse);
      g.strokePoints(b.points, true);
      fx.lineStyle(3 + 2 * pulse, 0xd1a6ff, 0.8);
      fx.lineBetween(this.overlord.x, this.overlord.y, b.x, b.y);
    }
    for (const a of this.armies) {
      if (a.count <= 0) continue;
      const k = a.t / a.dur;
      const x = a.from.x + (a.to.x - a.from.x) * k;
      const y = a.from.y + (a.to.y - a.from.y) * k;
      const rad = 5 + Math.sqrt(a.count) * 0.9;
      fx.fillStyle(a.owner === 'you' ? 0xb388ff : 0xff5252, 0.95);
      fx.fillCircle(x, y, rad);
      fx.lineStyle(2, 0x000000, 0.6);
      fx.strokeCircle(x, y, rad);
      // a swarm of little dots around the army
      for (let i = 0; i < 5; i++) {
        const an = now / 200 + i * 1.3;
        fx.fillStyle(a.owner === 'you' ? 0xd1c4e9 : 0xffcdd2, 0.8);
        fx.fillCircle(x + Math.cos(an) * rad * 1.6, y + Math.sin(an) * rad * 1.6, 2);
      }
    }
    for (const r of this.rings) {
      fx.lineStyle(4, r.color, Math.min(1, r.life * 2));
      fx.strokeCircle(r.x, r.y, r.r * (1.4 - r.life));
    }
    this.renderUi(pulse);
  }

  private renderUi(pulse: number): void {
    const g = this.uiG;
    g.clear();
    g.fillStyle(0x000000, 0.6);
    g.fillRect(0, 0, GAME_WIDTH, MAP_TOP - 6);
    g.fillRect(0, MAP_BOTTOM, GAME_WIDTH, GAME_HEIGHT - MAP_BOTTOM);

    const mine = this.regions.filter((r) => r.owner === 'you');
    const troops = mine.reduce((s, r) => s + r.troops, 0);
    const infRate = (BASE_INFLUENCE + INFLUENCE_PER_REGION * mine.length) * this.emp.influenceMul + this.emp.influenceFlat;
    this.topText.setText(
      `${GameState.diff.name}   ·   Regions ${mine.length}/${this.regions.length}   ·   Swarm ${Math.floor(troops)}   ·   Influence ◆ ${Math.floor(this.influence)} (+${infRate.toFixed(1)}/s)` +
        (this.surgeTime > 0 ? `   ·   SURGE ${Math.ceil(this.surgeTime)}s` : '') +
        (this.roarTime > 0 ? `   ·   HUMANS COWER ${Math.ceil(this.roarTime)}s` : ''),
    );

    // research bar
    const bw = 260;
    const bx = GAME_WIDTH - bw - 16;
    g.fillStyle(0x000000, 0.7);
    g.fillRoundedRect(bx, 26, bw, 14, 5);
    g.fillStyle(this.research > 75 ? 0xff1744 : 0x4fc3f7, this.research > 75 ? 0.6 + 0.4 * pulse : 1);
    g.fillRoundedRect(bx, 26, Math.max(8, (bw * Math.min(100, this.research)) / 100), 14, 5);
    this.researchText.setText(`Humanity's Ultimate Bug Spray: ${Math.floor(this.research)}%`);

    // power buttons
    for (const b of this.powerButtons) {
      const locked = b.id === 'bio' && !this.emp.hasBioweapons;
      const cd = this.cooldowns[b.id];
      const max = (b.id === 'bio' ? this.emp.bioweaponCooldown : POWER_COOLDOWN[b.id]) * this.emp.cooldownMul;
      g.fillStyle(0x16121f, 0.95);
      g.fillRoundedRect(b.x, b.y, b.w, b.h, 8);
      if (cd > 0) {
        g.fillStyle(0x000000, 0.6);
        g.fillRect(b.x, b.y, b.w * (cd / max), b.h);
      }
      const active = (b.id === 'surge' && this.surgeTime > 0) || (b.id === 'roar' && this.roarTime > 0) || (b.id === 'bio' && this.aimingBio);
      g.lineStyle(2, locked ? 0x555555 : active ? 0xffffff : 0xffd54f, active ? 0.6 + 0.4 * pulse : 1);
      g.strokeRoundedRect(b.x, b.y, b.w, b.h, 8);
      b.label.setColor(locked ? '#777777' : '#ffffff');
    }
    for (const fb of this.fracButtons) fb.rect.setStrokeStyle(fb.frac === this.sendFrac ? 3 : 1, fb.frac === this.sendFrac ? 0xffffff : 0x8be9fd);
    for (const mb of this.modeButtons) {
      mb.rect.setFillStyle(mb.mode === this.mode ? (mb.mode === 'attack' ? 0x5a1a1a : 0x5a4a10) : 0x16121f, 0.95);
    }

    const r = this.hovered ?? this.selected;
    let info = this.selected ? `Selected: ${this.selected.name} (${Math.floor(this.selected.troops)} troops)\n` : 'Click one of your purple regions.\n';
    if (r && r.owner === 'humans') {
      const lvl = ['', 'town', 'city', 'megacity'][r.level];
      info += `${r.name}: human ${lvl}. Convert for ◆ ${this.convertCost(r)}`;
    } else if (r && r.owner === 'wild') {
      info += `${r.name}: untamed wilderness`;
    } else if (r) {
      info += `${r.name}: yours`;
    }
    this.infoText.setText(info);
  }

  private toast(msg: string): void {
    while (this.toasts.length >= 4) this.toasts.shift()?.destroy();
    const t = this.add
      .text(GAME_WIDTH / 2, 0, msg, {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
        // dark backing so messages stay readable over the map
        backgroundColor: 'rgba(5, 2, 12, 0.75)',
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setDepth(20);
    this.toasts.push(t);
    this.layoutToasts();
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 3000,
      duration: 500,
      onComplete: () => {
        this.toasts = this.toasts.filter((x) => x !== t);
        t.destroy();
        this.layoutToasts();
      },
    });
  }

  private layoutToasts(): void {
    let y = MAP_TOP + 4;
    for (const t of this.toasts) {
      if (!t.active) continue;
      t.setY(y);
      y += t.height + 3;
    }
  }
}
