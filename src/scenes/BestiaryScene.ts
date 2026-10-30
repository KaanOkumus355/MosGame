import Phaser from 'phaser';
import { DANGER_RATIO, EDIBLE_RATIO, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { BRANCH_STAGES, OVERLORDS, STAGES, STAGE_NAMES, formMotion, stageById, stageIndexOf, stageInfo, type StageDef } from '../data/stages';
import { ZONE_PEAKS } from '../data/zones';
import { ACHIEVEMENTS, Achievements, CATEGORIES, type AchievementCategory, type AchievementDef } from '../state/Achievements';
import { COLLECTOR_COUNT, FORM_COUNT } from '../state/Codex';
import { RunHistory, formatTime } from '../state/RunHistory';
import { creatureGroups, type CreatureGroup } from '../data/creatureGroups';
import { CREATURES, type Behavior, type CreatureDef } from '../data/creatures';
import { creatureDef } from '../data/scaling';
import { TRAITS, TRAIT_ROLES, traitName, traitRole, type TraitId, type TraitRole } from '../data/traits';
import { FUSIONS, fusionsWith, type FusionId } from '../data/fusions';
import { SIGNATURES, SIGNATURE_UPGRADES } from '../data/signatures';
import { FORM_UNLOCKS, MUTATION_ODDS, formUnlock, type FormUnlock } from '../data/forms';
import { BODY_RADIUS } from '../art/textures';
import { Codex } from '../state/Codex';
import { GeneBank } from '../state/GeneBank';
import { PAD, onPadButton } from '../systems/Controls';
import { Sfx } from '../audio/Sfx';

type Tab = 'forms' | 'creatures' | 'traits' | 'achievements';
const TABS: { id: Tab; label: string }[] = [
  { id: 'forms', label: 'Forms' },
  { id: 'creatures', label: 'Creatures' },
  { id: 'traits', label: 'Traits' },
  { id: 'achievements', label: 'Achievements' },
];
const TOP = 150;
const LOCKED = '#6f6a7d';
/** Evolution lines the Traits tab can follow. */
type TraitLine = 'main' | 'hive' | 'sky' | 'deep';
const TRAIT_LINES: { id: TraitLine; name: string }[] = [
  { id: 'main', name: 'Main' },
  { id: 'hive', name: 'Hive' },
  { id: 'sky', name: 'Sky' },
  { id: 'deep', name: 'Deep' },
];
/** Each evolution line's colour on the Forms tree. */
const LINE_COLORS: Record<TraitLine, number> = { main: 0xd4ff7a, hive: 0xffd54f, sky: 0x81d4fa, deep: 0x4dd0e1 };
const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** What a creature is to you, for its card border and detail header. */
const creatureKind = (d: CreatureDef): { name: string; color: number } =>
  d.behavior === 'host' ? { name: 'Blood host', color: 0xff77b0 }
    : !d.damage ? { name: 'Prey', color: 0x9dff6a }
      : d.behavior === 'ranged' ? { name: 'Human', color: 0xffd54f }
        : d.behavior === 'rival' ? { name: 'Rival fighter', color: 0xffa726 }
          : { name: 'Predator', color: 0xff5252 };

const BEHAVIOUR_TEXT: Record<Behavior, string> = {
  wander: 'Wanders around and runs from anything that could eat it.',
  chase: 'Chases you down once it is big enough to hurt you, then tires out.',
  tongue: 'Sits still and snaps its tongue at anything that comes in range.',
  host: 'A big, harmless animal. Land on it to drink its blood, but it swats if you linger.',
  charge: 'Winds up, then lunges in a straight line. Dash sideways during the wind-up.',
  rival: 'Picks fights with you, even when it is a little smaller. Bite back.',
  ranged: 'Keeps its distance and throws things at you.',
};

/** Its behaviour, then each special move, in plain words. */
function creatureMoves(d: CreatureDef): string[] {
  const out = [BEHAVIOUR_TEXT[d.behavior]];
  if (d.behavior === 'ranged') out.push(d.projectile === 'net' ? 'Throws nets that pin you in place' : 'Throws spears');
  if (d.stalkSpeed) out.push('Stalks you from far away before it strikes');
  if (d.leap) out.push('Leaps at you from mid range');
  if (d.slam) out.push(`Slams everything around it ("${d.slam.shout}")${d.slam.slow ? ' and slows you' : ''}`);
  if (d.spit) out.push(d.spit.kind === 'web' ? 'Spits webs that slow you and leave sticky patches' : d.spit.kind === 'net' ? 'Throws nets that pin you in place' : 'Stabs at you from just out of reach');
  if (d.poison) out.push('Its bite poisons you');
  if (d.pack) out.push('Hunts in packs, and calls the others when it spots you');
  if (d.keenNose) out.push('Smells you out even when you hide');
  return out;
}

/**
 * What a creature is to you in one zone, from its size there against yours at the start and end
 * of that stage (sizes rescale between stages, so a threat often ends up as food).
 */
function zoneVerdict(d: CreatureDef, st: StageDef): { text: string; color: number } {
  if (d.behavior === 'host') return { text: 'Drink its blood', color: 0xff77b0 };
  const size = (d.size[0] + d.size[1]) / 2;
  const edible = (you: number) => size < you * EDIBLE_RATIO;
  const threat = (you: number) => d.damage > 0 && size > you * DANGER_RATIO;
  const [start, end] = [st.startSize, st.evolveSize];
  if (!d.damage) return edible(start) ? { text: 'Food', color: 0x9dff6a } : edible(end) ? { text: 'Food once you grow', color: 0xc5e1a5 } : { text: 'Too big to eat', color: 0x90a4ae };
  if (!threat(start)) return edible(start) ? { text: 'Food', color: 0x9dff6a } : { text: 'A fair fight', color: 0xffd54f };
  if (edible(end)) return { text: 'Threat, then food', color: 0xffa726 };
  return threat(end) ? { text: 'Threat all stage', color: 0xff5252 } : { text: 'Threat, then a fair fight', color: 0xffab40 };
}
/** Achievement categories shown on each page of the Achievements tab. */
const ACHIEVEMENT_PAGES: AchievementCategory[][] = [
  ['ending', 'evolution'],
  ['combat', 'appetite'],
  ['collection', 'challenge'],
];

/** Forms in path order, secret forms and their lines next to the forms they replace. */
const FORM_ORDER = [
  'swamp', 'pond', 'meadow', 'jungle', 'canopy', 'orchard', 'forest', 'delta', 'cliffs', 'woodland', 'ashlands', 'spires',
  'outskirts', 'reef', 'continent', 'peaks', 'greathive', 'trench', 'world', 'sky', 'abyss', 'queen',
];

/**
 * Everything discovered across runs. Undiscovered entries show as silhouettes or "???", and
 * never say how to unlock them (except secret form hints bought in the Gene Bank).
 */
export class BestiaryScene extends Phaser.Scene {
  private tab: Tab = 'forms';
  private content: Phaser.GameObjects.GameObject[] = [];
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private selectedTrait: TraitId | null = null;
  /** A secret mutation picked on the Traits tab (its form's stage id); replaces the trait detail. */
  private selectedMutation: string | null = null;
  /** Creatures tab: the entry shown in the detail panel (by display name). */
  private selectedCreature: string | null = null;
  /** Forms tab: the form shown in the detail panel (stage id). */
  private selectedForm: string | null = null;
  /** Traits tab: the role filter, and which evolution line the per-form strip follows. */
  private traitRole: TraitRole | 'all' = 'all';
  private traitLine: TraitLine = 'main';
  /** Current page of each tab, and how many pages the shown tab has. */
  private pages: Record<Tab, number> = { forms: 0, creatures: 0, traits: 0, achievements: 0 };
  private pageCount = 1;

  constructor() {
    super('Bestiary');
  }

  create(): void {
    this.content = [];
    this.tabTexts = [];
    this.cameras.main.setBackgroundColor(0x0d1410);
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'tile_jungle').setOrigin(0).setAlpha(0.25);
    const cx = GAME_WIDTH / 2;
    this.add
      .text(cx, 48, 'BESTIARY', { fontFamily: FONT, fontSize: '48px', color: '#d4ff7a', stroke: '#000', strokeThickness: 8, fontStyle: 'bold' })
      .setOrigin(0.5);

    TABS.forEach((t, i) => {
      const text = this.add
        .text(cx + (i - 1.5) * 250, 106, '', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.show(t.id));
      this.tabTexts.push(text);
    });

    const back = this.add
      .text(24, 20, '◀ Back (ESC)', { fontFamily: FONT, fontSize: '18px', color: '#c8e6c9', stroke: '#000', strokeThickness: 4 })
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.leave());
    kb.on('keydown-B', () => this.leave());
    onPadButton(this, (b) => {
      if (b === PAD.B) this.leave();
      else if (b === PAD.LB || b === PAD.RB) this.turnPage(b === PAD.RB ? 1 : -1);
    });
    kb.on('keydown-ONE', () => this.show('forms'));
    kb.on('keydown-TWO', () => this.show('creatures'));
    kb.on('keydown-THREE', () => this.show('traits'));
    kb.on('keydown-FOUR', () => this.show('achievements'));
    const step = (d: number) => this.show(TABS[(TABS.findIndex((t) => t.id === this.tab) + d + TABS.length) % TABS.length].id);
    kb.on('keydown-LEFT', () => step(-1));
    kb.on('keydown-RIGHT', () => step(1));
    kb.on('keydown-Q', () => this.turnPage(-1));
    kb.on('keydown-E', () => this.turnPage(1));
    kb.on('keydown-PAGE_UP', () => this.turnPage(-1));
    kb.on('keydown-PAGE_DOWN', () => this.turnPage(1));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.turnPage(dy > 0 ? 1 : -1));

    this.show(this.tab);
  }

  private leave(): void {
    Sfx.play('ui');
    this.scene.start('Menu');
  }

  private show(tab: Tab): void {
    if (tab !== this.tab) Sfx.play('ui');
    this.tab = tab;
    this.content.forEach((o) => o.destroy());
    this.content = [];
    this.pageCount = 1;
    const counts = this.counts();
    TABS.forEach((t, i) => {
      const [found, total] = counts[t.id];
      this.tabTexts[i].setText(`${i + 1}. ${t.label} (${found}/${total})`).setColor(t.id === tab ? '#d4ff7a' : '#8f9a8a');
    });
    if (tab === 'forms') this.showForms();
    else if (tab === 'creatures') this.showCreatures();
    else if (tab === 'traits') this.showTraits();
    else this.showAchievements();
  }

  private counts(): Record<Tab, [number, number]> {
    const forms = this.forms();
    const groups = this.creatureGroups();
    const traits = Object.keys(TRAITS) as TraitId[];
    return {
      forms: [forms.filter((f) => Codex.hasForm(f.id)).length, forms.length],
      creatures: [groups.filter((g) => g.keys.some((k) => Codex.hasCreature(k))).length, groups.length],
      traits: [
        traits.filter((id) => Codex.rank(id) > 0).length + FORM_UNLOCKS.filter((f) => Codex.hasForm(f.stageId)).length,
        traits.length + FORM_UNLOCKS.length,
      ],
      achievements: [Achievements.count, ACHIEVEMENTS.length],
    };
  }

  /**
   * Splits a list into pages: returns the [start, end) slice for the current page and draws
   * "◀ Page x / y ▶" at the bottom when there is more than one.
   */
  private pager(total: number, perPage: number): [number, number] {
    const count = Math.max(1, Math.ceil(total / perPage));
    const page = Phaser.Math.Clamp(this.pages[this.tab], 0, count - 1);
    this.pages[this.tab] = page;
    this.pageCount = count;
    if (count > 1) {
      const y = GAME_HEIGHT - 42;
      const cx = GAME_WIDTH / 2;
      const arrow = (x: number, label: string, d: number) => {
        const t = this.text(x, y, label, { fontSize: '26px', color: '#d4ff7a', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });
        t.on('pointerdown', () => this.turnPage(d));
      };
      arrow(cx - 120, '◀', -1);
      arrow(cx + 120, '▶', 1);
      this.text(cx, y, `Page ${page + 1} / ${count}`, { fontSize: '18px', color: '#e8f5e9', fontStyle: 'bold' }).setOrigin(0.5);
      this.text(cx, y + 22, 'Q / E or mouse wheel', { fontSize: '11px', color: '#8f9a8a' }).setOrigin(0.5);
    }
    return [page * perPage, Math.min(total, (page + 1) * perPage)];
  }

  private turnPage(d: number): void {
    if (this.pageCount <= 1) return;
    this.pages[this.tab] = (this.pages[this.tab] + d + this.pageCount) % this.pageCount;
    Sfx.play('ui');
    this.show(this.tab);
  }

  private add2<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.content.push(o);
    return o;
  }

  private text(x: number, y: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text {
    return this.add2(this.add.text(x, y, s, { fontFamily: FONT, ...style }));
  }

  /** A creature picture, or its black silhouette while undiscovered. */
  private picture(x: number, y: number, texture: string, radius: number, known: boolean, tint?: number): void {
    const img = this.add2(this.add.image(x, y, texture).setScale(radius / BODY_RADIUS).setAngle(-90));
    if (!known) img.setTintFill(0x000000).setAlpha(0.75);
    else if (tint !== undefined) img.setTint(tint);
  }

  // ------------------------------------------------------------ forms

  private forms(): StageDef[] {
    return FORM_ORDER.map((id) => stageById(id)!);
  }

  /** The Forms tab: every form as an evolution tree (stages across, one row per line). */
  private showForms(): void {
    const x0 = 112;
    const treeW = 640;
    const colW = treeW / STAGE_NAMES.length;
    const rowH = 118;
    const top = TOP + 40;
    const pos = new Map<string, { x: number; y: number }>();
    const edges: { from: string; to: string; color: number; secret: boolean }[] = [];
    const seen = new Set<string>();
    TRAIT_LINES.forEach((line, row) => {
      const forms = this.lineForms(line.id);
      forms.forEach((st, i) => {
        if (!pos.has(st.id)) pos.set(st.id, { x: x0 + i * colW + colW / 2, y: top + row * rowH });
        const prev = forms[i - 1];
        const key = `${prev?.id}>${st.id}`;
        if (prev && !seen.has(key)) {
          seen.add(key);
          edges.push({ from: prev.id, to: st.id, color: LINE_COLORS[line.id], secret: !!formUnlock(st.id) });
        }
      });
      this.text(40, top + row * rowH - 8, line.name.toUpperCase(), { fontSize: '13px', color: hexColor(LINE_COLORS[line.id]), fontStyle: 'bold' });
    });
    for (let i = 0; i < STAGE_NAMES.length; i++) {
      this.text(x0 + i * colW + colW / 2, TOP - 4, `Stage ${i + 1}`, { fontSize: '11px', color: '#8f9a8a' }).setOrigin(0.5, 0);
    }

    // connections: a line follows its forms; secret branches are dashed and name their mutation
    const g = this.add2(this.add.graphics());
    for (const e of edges) {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const reached = Codex.hasForm(e.from) && Codex.hasForm(e.to);
      const color = e.secret ? 0x64ffda : e.color;
      g.lineStyle(3, color, reached ? 0.8 : 0.22);
      if (!e.secret) {
        g.lineBetween(a.x + 26, a.y, b.x - 26, b.y);
        continue;
      }
      // an elbow between the columns: down to the branch's row, then across, so it never crosses a node
      const mx = (a.x + b.x) / 2;
      const dashed = (x1: number, y1: number, x2: number, y2: number) => {
        const len = Phaser.Math.Distance.Between(x1, y1, x2, y2);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        for (let d = 0; d < len; d += 12) {
          const d2 = Math.min(d + 7, len);
          g.lineBetween(x1 + Math.cos(ang) * d, y1 + Math.sin(ang) * d, x1 + Math.cos(ang) * d2, y1 + Math.sin(ang) * d2);
        }
      };
      dashed(mx, a.y, mx, b.y);
      dashed(mx, b.y, b.x - 26, b.y);
      const f = formUnlock(e.to)!;
      // just below where the branch leaves, clear of the rows it passes
      this.text(mx + 6, a.y + 58, Codex.hasForm(e.to) ? f.mutation : '???', { fontSize: '10px', color: '#64ffda', fontStyle: 'italic', backgroundColor: '#0d1410' }).setOrigin(0, 0.5);
    }

    // nodes
    if (!this.selectedForm || !Codex.hasForm(this.selectedForm)) this.selectedForm = [...pos.keys()].find((id) => Codex.hasForm(id)) ?? null;
    for (const [id, p] of pos) {
      const st = stageById(id)!;
      const known = Codex.hasForm(id);
      const played = Codex.hasBecome(id);
      const sel = id === this.selectedForm;
      g.fillStyle(sel ? 0x2a3a24 : 0x151d18, 1);
      g.fillCircle(p.x, p.y, 26);
      g.lineStyle(sel ? 4 : 2, sel ? 0xd4ff7a : played ? 0xc5e1a5 : known ? 0x6b7f62 : 0x2b332e, 1);
      g.strokeCircle(p.x, p.y, 26);
      this.picture(p.x, p.y, st.playerTexture, 19, known);
      this.text(p.x, p.y + 30, known ? st.creatureName : '???', {
        fontSize: '11px', color: sel ? '#d4ff7a' : known ? '#ffffff' : LOCKED, fontStyle: 'bold', align: 'center', wordWrap: { width: colW - 4 },
      }).setOrigin(0.5, 0);
      if (known) {
        const zone = this.add2(this.add.zone(p.x - 28, p.y - 28, 56, 56).setOrigin(0).setInteractive({ useHandCursor: true }));
        zone.on('pointerdown', () => {
          this.selectedForm = id;
          this.show('forms');
        });
      }
    }
    let ly = TOP + 4 * rowH + 34;
    this.text(x0 + treeW / 2, ly, 'Bright ring: played  ·  dim ring: discovered  ·  dashed: secret branch', { fontSize: '11px', color: '#8f9a8a' }).setOrigin(0.5, 0);
    // hints bought in the Gene Bank for secret forms still to find
    for (const f of FORM_UNLOCKS) {
      const bought = GeneBank.hintLevel(f.stageId);
      if (Codex.hasForm(f.stageId) || !bought) continue;
      ly += 16;
      this.text(40, ly, `Stage ${f.index + 1} secret, hint: ${f.hints[bought - 1]}`, { fontSize: '11px', color: '#64ffda', fontStyle: 'italic' });
    }
    this.formDetail(this.selectedForm ? stageById(this.selectedForm)! : null, x0 + treeW + 24);
  }

  /** The right-hand panel for one form: how it plays, its zone, and how you've done as it. */
  private formDetail(st: StageDef | null, px: number): void {
    const pw = GAME_WIDTH - px - 40;
    const g = this.add2(this.add.graphics());
    g.fillStyle(0x151d18, 0.95);
    g.fillRoundedRect(px, TOP - 6, pw, 512, 12);
    const x = px + 18;
    const tw = pw - 36;
    let y = TOP + 8;
    if (!st) {
      this.text(x, y, 'No forms discovered yet.', { fontSize: '15px', color: LOCKED, fontStyle: 'italic' });
      return;
    }
    const idx = stageIndexOf(st.id);
    const finale = OVERLORDS.includes(st);
    const secret = formUnlock(st.id);
    this.picture(x + 30, y + 30, st.playerTexture, 28, true);
    this.text(x + 70, y + 2, st.creatureName, { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' });
    this.text(x + 70, y + 32, `Stage ${idx + 1}  ·  ${st.biome}${secret ? '  ·  SECRET' : ''}`, { fontSize: '12px', color: secret ? '#64ffda' : '#c8e6c9', fontStyle: 'bold' });
    y += 66;
    const para = (s: string, style: Phaser.Types.GameObjects.Text.TextStyle, gap = 6) => {
      y += this.text(x, y, s, { fontSize: '13px', wordWrap: { width: tw }, lineSpacing: 2, ...style }).height + gap;
    };
    if (st.arrival) para(st.arrival, { color: '#d7d2e0', fontStyle: 'italic' }, 8);
    const sig = SIGNATURES[st.signature];
    para(`${sig.name}${sig.key ? ` (${sig.key})` : ''}`, { fontSize: '14px', color: '#ffd54f', fontStyle: 'bold' }, 2);
    para(sig.description, { fontSize: '12px', color: '#e8f5e9' }, 10);
    if (secret) para(`Mutation: ${secret.mutation}. Found by: ${secret.how}`, { fontSize: '12px', color: '#64ffda' }, 8);

    if (!finale) {
      // how it moves, against every arena form
      const arenas = [...STAGES, ...BRANCH_STAGES];
      const bar = (label: string, v: number, lo: number, hi: number, color: number) => {
        this.text(x, y, label, { fontSize: '12px', color: '#cfd8dc' });
        const bw = tw - 90;
        g.fillStyle(0x263238, 1);
        g.fillRoundedRect(x + 90, y + 4, bw, 8, 4);
        g.fillStyle(color, 1);
        g.fillRoundedRect(x + 90, y + 4, Math.max(8, bw * Phaser.Math.Clamp((v - lo) / (hi - lo), 0.05, 1)), 8, 4);
        y += 18;
      };
      const speeds = arenas.map((s) => s.baseSpeed);
      const turns = arenas.map((s) => s.accel ?? 9);
      bar('Speed', st.baseSpeed, Math.min(...speeds) - 10, Math.max(...speeds), 0x81d4fa);
      bar('Turning', st.accel ?? 9, Math.min(...turns) - 0.5, Math.max(...turns), 0xaed581);
      const moves = { buzz: 'Buzzes about', glide: 'Glides on the wind', walk: 'Walks', swim: 'Swims' }[formMotion(st)];
      const tags = [moves, st.aerial && 'dash goes 50% farther', st.submerge && 'hides and speeds up in water'].filter(Boolean).join('  ·  ');
      para(tags, { fontSize: '12px', color: '#b2ebf2' }, 8);
      if (st.affinity?.length) {
        this.text(x, y + 2, 'Favours', { fontSize: '12px', color: '#cfd8dc' });
        st.affinity.forEach((t, i) => this.add2(this.add.image(x + 104 + i * 30, y + 9, `icon_${t}`).setScale(0.36).setAlpha(Codex.rank(t) > 0 ? 1 : 0.35)));
        y += 26;
      }
      const peak = ZONE_PEAKS[st.id];
      if (peak) para(`Boss: ${peak.boss.name} (${peak.boss.moveName}, then ${peak.boss.phase2Name})  ·  Event: ${peak.event.name}`, { fontSize: '12px', color: '#ff8a80' }, 8);
    }

    // your record as this form, from the runs the Records screen keeps
    const runs = RunHistory.runs.filter((r) => r.stageIds.includes(st.id));
    const deaths = runs.filter((r) => !r.won && r.stageIds[r.last] === st.id).length;
    const times = runs.flatMap((r) => r.stageIds.map((sid, i) => (sid === st.id && i < r.last ? r.stageTimes[i] : NaN))).filter((t) => !isNaN(t));
    const record = runs.length
      ? `Reached in ${runs.length} of your last ${RunHistory.runs.length} runs${times.length ? `  ·  fastest stage ${formatTime(Math.min(...times))}` : ''}  ·  died as it ${deaths}x`
      : 'Not reached in your recent runs.';
    para(record, { fontSize: '12px', color: '#9fb39a' }, 6);
    para(deaths ? `"${st.epitaph}"` : 'Die as one to read its epitaph.', { fontSize: '12px', color: deaths ? '#ffcdd2' : LOCKED, fontStyle: 'italic' }, 4);
  }

  // ------------------------------------------------------------ achievements

  /**
   * Progress toward countable achievements, as [have, need]. Run-based ones show your best run.
   * Others have no meaningful count and show none.
   */
  private achievementProgress(id: string): [number, number] | null {
    const runs = RunHistory.runs;
    const best = (f: (r: (typeof runs)[number]) => number) => (runs.length ? Math.max(...runs.map(f)) : 0);
    switch (id) {
      case 'all_forms': return [Codex.formsBecome, FORM_COUNT];
      case 'collector': return [Codex.creatureGroupsSeen, COLLECTOR_COUNT];
      case 'encyclopaedia': return [Codex.creatureGroupsSeen, creatureGroups().length];
      case 'hungry': return [best((r) => r.stageEaten.reduce((a, b) => a + b, 0)), 500];
      case 'boss_hunter': return [best((r) => r.bossKills.length), 3];
      case 'clean_sweep': return [best((r) => r.bossKills.length), STAGES.length];
      case 'three_fusions': return [best((r) => r.traits.filter((t) => t.fusion).length), 3];
      default: return null;
    }
  }

  /** Achievements, two categories a page, with an overall bar and the closest ones to go for. */
  private showAchievements(): void {
    const colW = 600;
    const rowH = 56;
    const x0 = GAME_WIDTH / 2 - colW;
    const [page] = this.pager(ACHIEVEMENT_PAGES.length, 1);

    // summary: overall bar, and the three you're closest to
    const total = ACHIEVEMENTS.length;
    const got = Achievements.count;
    const g0 = this.add2(this.add.graphics());
    const bw = 360;
    g0.fillStyle(0x263238, 1);
    g0.fillRoundedRect(x0 + 10, TOP + 4, bw, 14, 7);
    g0.fillStyle(0xffd54f, 1);
    if (got) g0.fillRoundedRect(x0 + 10, TOP + 4, Math.max(14, bw * (got / total)), 14, 7);
    this.text(x0 + 20 + bw, TOP + 11, `${got} / ${total} unlocked`, { fontSize: '15px', color: '#ffd54f', fontStyle: 'bold' }).setOrigin(0, 0.5);
    const next = ACHIEVEMENTS.filter((a) => !Achievements.has(a.id) && !a.secret)
      .map((a) => ({ a, p: this.achievementProgress(a.id) }))
      .filter((e): e is { a: AchievementDef; p: [number, number] } => !!e.p && e.p[0] > 0 && e.p[0] < e.p[1])
      .sort((u, v) => v.p[0] / v.p[1] - u.p[0] / u.p[1])
      .slice(0, 3);
    if (next.length) {
      this.text(GAME_WIDTH / 2 + colW - 10, TOP + 11, `Next up: ${next.map((e) => `${e.a.name} ${e.p[0]}/${e.p[1]}`).join('  ·  ')}`, {
        fontSize: '13px', color: '#c5e1a5',
      }).setOrigin(1, 0.5);
    }

    let y = TOP + 34;
    for (const catId of ACHIEVEMENT_PAGES[page]) {
      const cat = CATEGORIES.find((c) => c.id === catId)!;
      // unlocked first, then the ones you're furthest along
      const list = ACHIEVEMENTS.filter((a) => a.category === catId).sort((u, v) => {
        const gu = Achievements.has(u.id) ? 1 : 0;
        const gv = Achievements.has(v.id) ? 1 : 0;
        if (gu !== gv) return gv - gu;
        const pu = this.achievementProgress(u.id);
        const pv = this.achievementProgress(v.id);
        return (pv ? pv[0] / pv[1] : 0) - (pu ? pu[0] / pu[1] : 0);
      });
      const done = list.filter((a) => Achievements.has(a.id)).length;
      const hex = `#${cat.color.toString(16).padStart(6, '0')}`;
      this.add2(this.add.image(x0 + 22, y + 10, `badge_${catId}`).setScale(0.36));
      this.text(x0 + 40, y + 10, `${cat.name.toUpperCase()}  ${done}/${list.length}`, { fontSize: '15px', color: hex, fontStyle: 'bold' }).setOrigin(0, 0.5);
      y += 26;
      list.forEach((a, i) => {
        const x = x0 + (i % 2) * colW + 10;
        const cy = y + Math.floor(i / 2) * rowH;
        this.achievementCard(a, x, cy, colW - 20, rowH - 6, cat.color);
      });
      y += Math.ceil(list.length / 2) * rowH + 6;
    }
  }

  private achievementCard(a: AchievementDef, x: number, y: number, w: number, h: number, color: number): void {
    const got = Achievements.has(a.id);
    const hidden = a.secret && !got;
    const g = this.add2(this.add.graphics());
    g.fillStyle(got ? 0x2a2210 : 0x151d18, 0.95);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(2, got ? color : 0x3a4a34, 1);
    g.strokeRoundedRect(x, y, w, h, 10);
    const badge = this.add2(this.add.image(x + 26, y + h / 2, `badge_${a.category}`).setScale(0.62));
    // locked badges are silhouettes, like undiscovered creatures
    if (!got) badge.setTintFill(0x3a4a34).setAlpha(0.8);
    const p = got || hidden ? null : this.achievementProgress(a.id);
    const textW = w - 70 - (p ? 120 : 10);
    this.text(x + 52, y + 5, hidden ? '???' : a.name, { fontSize: '16px', color: got ? '#ffd54f' : '#cfd8dc', fontStyle: 'bold' });
    this.text(x + 52, y + 25, hidden ? 'Secret achievement' : a.description, {
      fontSize: '12px', color: got ? '#e8f5e9' : '#8f9a8a', wordWrap: { width: textW },
    });
    if (!p) return;
    const [have, need] = p;
    const bx = x + w - 112;
    const bw = 96;
    g.fillStyle(0x263238, 1);
    g.fillRoundedRect(bx, y + h / 2 + 2, bw, 8, 4);
    g.fillStyle(color, 1);
    if (have > 0) g.fillRoundedRect(bx, y + h / 2 + 2, Math.max(8, bw * Math.min(1, have / need)), 8, 4);
    this.text(bx + bw, y + h / 2 - 2, `${Math.min(have, need)} / ${need}`, { fontSize: '12px', color: '#cfd8dc', fontStyle: 'bold' }).setOrigin(1, 1);
  }

  // ------------------------------------------------------------ creatures

  /** Creatures grouped by display name (e.g. both rabbits are one entry), with their home zone. */
  private creatureGroups(): CreatureGroup[] {
    return creatureGroups();
  }

  private showCreatures(): void {
    const groups = this.creatureGroups();
    const cols = 5;
    const rows = 4;
    const w = 126;
    const h = 108;
    const x0 = 40;
    const [from, to] = this.pager(groups.length, cols * rows);
    const page = groups.slice(from, to);
    if (!this.selectedCreature || !groups.some((g) => g.name === this.selectedCreature && g.keys.some((k) => Codex.hasCreature(k)))) {
      this.selectedCreature = page.find((g) => g.keys.some((k) => Codex.hasCreature(k)))?.name ?? null;
    }
    page.forEach((grp, i) => {
      const x = x0 + (i % cols) * (w + 4);
      const y = TOP + Math.floor(i / cols) * (h + 4);
      const key = grp.keys.find((k) => Codex.hasCreature(k));
      const def = CREATURES[key ?? grp.keys[0]];
      const kind = creatureKind(def);
      const sel = key && grp.name === this.selectedCreature;
      const g = this.add2(this.add.graphics());
      g.fillStyle(sel ? 0x22301f : 0x151d18, 0.95);
      g.fillRoundedRect(x, y, w, h, 8);
      // the border says what it is to you: food, fighter, predator or blood bank
      g.lineStyle(2, sel ? 0xd4ff7a : key ? kind.color : 0x262e29, key ? 1 : 0.6);
      g.strokeRoundedRect(x, y, w, h, 8);
      const mx = x + w / 2;
      this.picture(mx, y + 30, def.texture, 22, !!key, def.tint);
      const name = this.text(mx, y + 56, key ? grp.name : '???', {
        fontSize: '13px', color: key ? '#ffffff' : LOCKED, fontStyle: 'bold', align: 'center', wordWrap: { width: w - 10 },
      }).setOrigin(0.5, 0);
      if (key) this.text(mx, name.y + name.height + 1, grp.home, { fontSize: '10px', color: '#9fb39a', align: 'center', wordWrap: { width: w - 10 } }).setOrigin(0.5, 0);
      if (key) {
        const zone = this.add2(this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }));
        zone.on('pointerdown', () => {
          this.selectedCreature = grp.name;
          this.show('creatures');
        });
      }
    });
    this.text(x0 + (cols * (w + 4)) / 2, TOP + rows * (h + 4) + 4, 'Eat or defeat a creature to add it. Click one for details.', { fontSize: '13px', color: '#8f9a8a' }).setOrigin(0.5, 0);
    this.creatureDetail(groups.find((g) => g.name === this.selectedCreature) ?? null, x0 + cols * (w + 4) + 16);
  }

  /** The right-hand panel: what it does, and what it is to you in every zone it lives in. */
  private creatureDetail(grp: CreatureGroup | null, px: number): void {
    const pw = GAME_WIDTH - px - 40;
    const g = this.add2(this.add.graphics());
    g.fillStyle(0x151d18, 0.95);
    g.fillRoundedRect(px, TOP - 6, pw, 470, 12);
    const x = px + 20;
    const tw = pw - 40;
    let y = TOP + 8;
    if (!grp) {
      this.text(x, y, 'No creatures discovered yet.', { fontSize: '15px', color: LOCKED, fontStyle: 'italic' });
      return;
    }
    const known = grp.keys.filter((k) => Codex.hasCreature(k));
    const def = CREATURES[known[0]];
    const kind = creatureKind(def);

    // header
    this.picture(x + 34, y + 34, def.texture, 30, true, def.tint);
    this.text(x + 80, y + 6, grp.name, { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' });
    this.text(x + 80, y + 36, `${kind.name}  ·  first seen in ${grp.home}`, { fontSize: '13px', color: hexColor(kind.color), fontStyle: 'bold' });
    y += 76;

    // how it behaves, in plain words
    const lines = creatureMoves(def);
    y += this.text(x, y, lines[0], { fontSize: '14px', color: '#e8f5e9', wordWrap: { width: tw } }).height + 6;
    for (const l of lines.slice(1)) y += this.text(x, y, `•  ${l}`, { fontSize: '13px', color: '#ffcc80', wordWrap: { width: tw } }).height + 3;
    const stats = [def.hp ? `${def.hp} health` : 'no health bar (eat it whole)', def.damage ? `bites for ${def.damage}` : 'harmless'];
    y += 4;
    y += this.text(x, y, stats.join('  ·  '), { fontSize: '12px', color: '#9fb39a' }).height + 12;

    // what it is to you in each zone (sizes rescale as you evolve, so it is often both)
    this.text(x, y, 'THREAT OR FOOD?', { fontSize: '13px', color: '#8be9fd', fontStyle: 'bold' });
    y += 22;
    const zones = [...STAGES, ...BRANCH_STAGES]
      .filter((st) => st.spawns.some((sp) => grp.keys.includes(sp.creature)))
      .sort((a, b) => stageIndexOf(a.id) - stageIndexOf(b.id));
    for (const st of zones.slice(0, 9)) {
      const found = Codex.hasForm(st.id);
      const sp = st.spawns.find((s) => grp.keys.includes(s.creature))!;
      const verdict = found ? zoneVerdict(creatureDef(sp.creature, st), st) : { text: '???', color: 0x546e7a };
      this.text(x, y, found ? `Stage ${stageIndexOf(st.id) + 1} · ${st.creatureName} in ${st.biome}` : `Stage ${stageIndexOf(st.id) + 1} · ???`, {
        fontSize: '12px', color: found ? '#cfd8dc' : LOCKED,
      });
      this.text(x + tw, y, verdict.text, {
        fontSize: '12px', color: '#10140f', backgroundColor: hexColor(verdict.color), padding: { x: 6, y: 1 }, fontStyle: 'bold',
      }).setOrigin(1, 0);
      y += 21;
    }
    if (zones.length > 9) this.text(x, y, `…and ${zones.length - 9} more zones`, { fontSize: '11px', color: '#8f9a8a' });
  }

  // ------------------------------------------------------------ traits

  /** The four evolution lines, as the forms you are at each stage index (for the Traits tab strip). */
  private lineForms(line: TraitLine): StageDef[] {
    const start: Record<TraitLine, Record<number, string>> = { main: {}, hive: { 1: 'meadow' }, sky: { 2: 'canopy' }, deep: { 3: 'delta' } };
    const out: StageDef[] = [];
    for (let i = 0; i < STAGE_NAMES.length; i++) {
      const forced = start[line][i];
      const prev = out[i - 1];
      out.push((forced && stageById(forced)) || (prev?.next && stageById(prev.next)) || stageInfo(i));
    }
    return out;
  }

  private showTraits(): void {
    const ids = TRAIT_ROLES.flatMap((r) => r.traits);
    if (!this.selectedTrait || Codex.rank(this.selectedTrait) === 0) this.selectedTrait = ids.find((id) => Codex.rank(id) > 0) ?? null;
    if (this.selectedMutation && !Codex.hasForm(this.selectedMutation)) this.selectedMutation = null;
    const x0 = 40;
    const gridW = 620;

    // role filter chips
    let cx = x0;
    for (const r of [{ id: 'all' as const, name: 'All', color: 0xe8f5e9 }, ...TRAIT_ROLES]) {
      const on = this.traitRole === r.id;
      const chip = this.text(cx, TOP - 4, r.name, {
        fontSize: '13px', color: on ? '#10140f' : hexColor(r.color), backgroundColor: on ? hexColor(r.color) : '#1b2420', padding: { x: 9, y: 4 }, fontStyle: 'bold',
      }).setInteractive({ useHandCursor: true });
      chip.on('pointerdown', () => {
        this.traitRole = r.id;
        this.show('traits');
      });
      cx += chip.width + 6;
    }

    // trait cards: icon, name, role colour, best rank as pips
    const shown = this.traitRole === 'all' ? ids : TRAIT_ROLES.find((r) => r.id === this.traitRole)!.traits;
    const cols = 4;
    const w = (gridW - (cols - 1) * 6) / cols;
    // room for a two-line name above the rank pips
    const h = 56;
    shown.forEach((id, i) => {
      const t = TRAITS[id];
      const role = traitRole(id);
      const best = Codex.rank(id);
      const known = best > 0;
      const x = x0 + (i % cols) * (w + 6);
      const y = TOP + 26 + Math.floor(i / cols) * (h + 6);
      const sel = id === this.selectedTrait && !this.selectedMutation;
      const g = this.add2(this.add.graphics());
      g.fillStyle(sel ? 0x22301f : 0x151d18, 0.95);
      g.fillRoundedRect(x, y, w, h, 8);
      g.fillStyle(role.color, known ? 0.9 : 0.25);
      g.fillRoundedRect(x, y, 5, h, { tl: 8, bl: 8, tr: 0, br: 0 });
      g.lineStyle(2, sel ? 0xd4ff7a : known ? 0x3a4a34 : 0x262e29, 1);
      g.strokeRoundedRect(x, y, w, h, 8);
      const icon = this.add2(this.add.image(x + 24, y + h / 2, `icon_${id}`).setScale(0.48));
      if (!known) icon.setTintFill(0x000000).setAlpha(0.6);
      this.text(x + 44, y + 6, known ? t.forms[0] : '???', { fontSize: '12px', color: known ? '#ffffff' : LOCKED, fontStyle: 'bold', wordWrap: { width: w - 50 } });
      for (let k = 0; k < t.maxRank; k++) {
        g.fillStyle(k < best ? t.color : 0x37474f, 1);
        g.fillCircle(x + 48 + k * 13, y + h - 11, 4);
      }
      if (known) {
        const zone = this.add2(this.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true }));
        zone.on('pointerdown', () => {
          this.selectedTrait = id;
          this.selectedMutation = null;
          this.show('traits');
        });
      }
    });

    // secret mutations: locked until their form is discovered
    const my = TOP + 26 + 6 * (h + 6) + 8;
    this.text(x0, my, 'SECRET MUTATIONS', { fontSize: '13px', color: '#64ffda', fontStyle: 'bold' });
    const mw = (gridW - 12) / 3;
    FORM_UNLOCKS.forEach((f, i) => {
      const known = Codex.hasForm(f.stageId);
      const x = x0 + i * (mw + 6);
      const y = my + 20;
      const sel = f.stageId === this.selectedMutation;
      const g = this.add2(this.add.graphics());
      g.fillStyle(sel ? 0x143027 : 0x151d18, 0.95);
      g.fillRoundedRect(x, y, mw, 38, 8);
      g.lineStyle(2, sel ? 0x64ffda : 0x2b5f55, known ? 1 : 0.5);
      g.strokeRoundedRect(x, y, mw, 38, 8);
      this.picture(x + 20, y + 19, stageById(f.stageId)!.playerTexture, 13, known);
      this.text(x + 40, y + 11, known ? f.mutation : '???', { fontSize: '14px', color: known ? '#64ffda' : LOCKED, fontStyle: 'bold' });
      if (known) {
        const zone = this.add2(this.add.zone(x, y, mw, 38).setOrigin(0).setInteractive({ useHandCursor: true }));
        zone.on('pointerdown', () => {
          this.selectedMutation = f.stageId;
          this.show('traits');
        });
      }
    });
    const fusions = Object.keys(FUSIONS) as FusionId[];
    const found = fusions.filter((f) => Codex.hasFusion(f));
    this.text(x0, my + 70, `FUSIONS FOUND  ${found.length}/${fusions.length}`, { fontSize: '13px', color: '#ffd54f', fontStyle: 'bold' });
    this.text(x0, my + 88, found.length ? found.map((f) => FUSIONS[f].name).join('  ·  ') : 'None yet. Max two traits that fit together, then beat a boss.', {
      fontSize: '12px', color: found.length ? '#ffe082' : LOCKED, wordWrap: { width: gridW },
    });

    // detail panel
    const px = x0 + gridW + 24;
    const pw = GAME_WIDTH - px - 40;
    const g = this.add2(this.add.graphics());
    g.fillStyle(0x151d18, 0.95);
    g.fillRoundedRect(px, TOP - 6, pw, 512, 12);
    const id = this.selectedTrait;
    const mutation = this.selectedMutation ? formUnlock(this.selectedMutation) : undefined;
    let y = TOP + 10;
    const para = (s: string, style: Phaser.Types.GameObjects.Text.TextStyle, gap = 8) => {
      const t = this.text(px + 20, y, s, { fontSize: '15px', wordWrap: { width: pw - 40 }, lineSpacing: 3, ...style });
      y += t.height + gap;
    };
    if (mutation) this.mutationDetail(mutation, para);
    else if (!id) para('No traits discovered yet. Pick some on the evolution screen.', { color: LOCKED, fontStyle: 'italic' });
    else this.traitDetail(id, px, pw);
  }

  /** The right-hand panel for one trait. */
  private traitDetail(id: TraitId, px: number, pw: number): void {
    const t = TRAITS[id];
    const role = traitRole(id);
    const best = Codex.rank(id);
    const x = px + 20;
    const tw = pw - 40;
    let y = TOP + 8;

    // header: icon, name, role, best rank
    this.add2(this.add.image(x + 22, y + 22, `icon_${id}`).setScale(0.7));
    this.text(x + 52, y + 2, t.forms[0], { fontSize: '22px', color: hexColor(t.color), fontStyle: 'bold' });
    this.text(x + 52, y + 30, `${role.name}  ·  best rank reached: ${['', 'I', 'II', 'III'][best]} of ${['', 'I', 'II', 'III'][t.maxRank]}`, {
      fontSize: '12px', color: hexColor(role.color), fontStyle: 'bold',
    });
    y += 52;
    y += this.text(x, y, t.blurb, { fontSize: '13px', color: '#d7d2e0', fontStyle: 'italic', wordWrap: { width: tw } }).height + 8;

    // rank ladder (in the form you'd have at that point on the chosen line)
    const forms = this.lineForms(this.traitLine);
    const g = this.add2(this.add.graphics());
    for (let r = 1; r <= t.maxRank; r++) {
      const known = r <= best;
      const unlock = known ? t.unlock?.(r, 0) : null;
      g.fillStyle(known ? t.color : 0x37474f, 1);
      g.fillRoundedRect(x, y, 30, 18, 6);
      this.text(x + 15, y + 9, ['', 'I', 'II', 'III'][r], { fontSize: '12px', color: known ? '#10140f' : '#90a4ae', fontStyle: 'bold' }).setOrigin(0.5);
      const line = this.text(x + 40, y + 1, known ? t.effect(r, 0) : '???', { fontSize: '13px', color: known ? '#ffffff' : LOCKED, fontStyle: 'bold', wordWrap: { width: tw - 40 } });
      y += Math.max(20, line.height) + 2;
      if (unlock) y += this.text(x + 40, y, unlock, { fontSize: '12px', color: '#ffd54f', wordWrap: { width: tw - 40 } }).height + 2;
      y += 6;
    }

    // how it changes as you evolve: names along a line, and any stage where it works differently
    y += 2;
    let lx = x;
    this.text(lx, y, 'ALONG YOUR EVOLUTION', { fontSize: '12px', color: '#8be9fd', fontStyle: 'bold' });
    lx += 168;
    for (const l of TRAIT_LINES) {
      const on = this.traitLine === l.id;
      const chip = this.text(lx, y - 2, l.name, { fontSize: '11px', color: on ? '#10140f' : '#8be9fd', backgroundColor: on ? '#8be9fd' : '#1b2420', padding: { x: 6, y: 2 }, fontStyle: 'bold' })
        .setInteractive({ useHandCursor: true });
      chip.on('pointerdown', () => {
        this.traitLine = l.id;
        this.show('traits');
      });
      lx += chip.width + 4;
    }
    y += 22;
    const cw = tw / forms.length;
    forms.forEach((st, i) => {
      const known = Codex.hasForm(st.id);
      const fx = x + i * cw + cw / 2;
      this.picture(fx, y + 14, st.playerTexture, 13, known);
      const name = known ? traitName(id, 0, i, st.traitForms?.[id]) : '???';
      this.text(fx, y + 32, name, { fontSize: '10px', color: known ? '#e8f5e9' : LOCKED, align: 'center', wordWrap: { width: cw - 4 } }).setOrigin(0.5, 0);
    });
    y += 64;
    const changes: string[] = [];
    for (let i = 1; i < forms.length - 1; i++) if (t.effect(1, i) !== t.effect(1, i - 1)) changes.push(`From stage ${i + 1}: ${t.effect(Math.max(1, best), i)}`);
    for (const c of changes.slice(0, 2)) y += this.text(x, y, c, { fontSize: '12px', color: '#b2ebf2', wordWrap: { width: tw } }).height + 4;
    if (changes.length) y += 4;

    // fusions, the signature it powers up, and the forms that favour it
    for (const f of fusionsWith(id, [])) {
      const partner = f.parents.find((p) => p !== id)!;
      const knownPartner = Codex.rank(partner) > 0;
      this.add2(this.add.image(x + 9, y + 8, `icon_${partner}`).setScale(0.28).setAlpha(knownPartner ? 1 : 0.4));
      const has = Codex.hasFusion(f.id);
      y += this.text(x + 24, y, `+ ${knownPartner ? TRAITS[partner].forms[0] : '???'}  →  ${has ? f.name : '??? fusion'}`, { fontSize: '12px', color: has ? '#ffe082' : '#9e95b0', fontStyle: 'bold' }).height + 4;
    }
    // names the form only once you have found it
    const SIGNATURE_FORMS: Record<string, string> = Object.fromEntries([...STAGES, ...BRANCH_STAGES].map((st) => [st.signature, Codex.hasForm(st.id) ? st.creatureName : 'a later form']));
    for (const [sig, up] of Object.entries(SIGNATURE_UPGRADES)) {
      if (up?.trait !== id) continue;
      y += this.text(x, y, `★ At rank III as ${/^a /.test(SIGNATURE_FORMS[sig] ?? '') ? SIGNATURE_FORMS[sig] : `the ${SIGNATURE_FORMS[sig]}`}: ${up.text}`, { fontSize: '12px', color: '#ffd54f', wordWrap: { width: tw } }).height + 4;
    }
    const fans = [...STAGES, ...BRANCH_STAGES].filter((st) => st.affinity?.includes(id));
    if (fans.length) {
      y += 2;
      this.text(x, y + 6, 'FAVOURED BY', { fontSize: '11px', color: '#c5e1a5', fontStyle: 'bold' });
      fans.forEach((st, i) => this.picture(x + 96 + i * 30, y + 12, st.playerTexture, 11, Codex.hasForm(st.id)));
    }
  }

  /** What a discovered mutation does and when it turns up. How it was found stays on the Forms tab. */
  private mutationDetail(f: FormUnlock, para: (s: string, style: Phaser.Types.GameObjects.Text.TextStyle, gap?: number) => void): void {
    const st = stageById(f.stageId)!;
    const sig = SIGNATURES[st.signature];
    para('SECRET MUTATION', { fontSize: '12px', color: '#64ffda', fontStyle: 'bold' }, 2);
    para(f.mutation, { fontSize: '24px', color: '#64ffda', fontStyle: 'bold' }, 4);
    para(f.blurb, { color: '#d7d2e0', fontStyle: 'italic' }, 12);
    para(`Your next metamorphosis makes you a ${st.creatureName} instead of a ${STAGES[f.index].creatureName}.`, { color: '#ffffff', fontStyle: 'bold' });
    para(`Turns up on the evolution screen during stage ${f.index} (the ${STAGES[f.index - 1].creatureName} stage), ${MUTATION_ODDS}. Rerolls give it another chance.`, { color: '#ffd54f' });
    para(`${sig.name}: ${sig.short}`, { fontSize: '14px', color: '#c8e6c9' }, 10);
  }
}
