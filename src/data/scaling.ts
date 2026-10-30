import { CREATURES, type CreatureDef } from './creatures';
import { BRANCH_STAGES, STAGES, stageIndexOf, type StageDef } from './stages';

/**
 * Creature data is written in the units of its home stage (the first stage that spawns it). When a
 * creature returns in a later stage it keeps its true size, so it is shrunk into that stage's units:
 * a frog threatens a mosquito but is a mouse-sized snack for a raptor.
 */
const HOME_SCALE = new Map<string, number>();
// in stage order across every line, so a branch at stage 5 comes before the main path's stage 6
const byIndex = [...STAGES, ...BRANCH_STAGES].sort((a, b) => stageIndexOf(a.id) - stageIndexOf(b.id));
for (const st of byIndex) {
  for (const sp of st.spawns) if (!HOME_SCALE.has(sp.creature)) HOME_SCALE.set(sp.creature, st.scale);
}

/** How much a creature's numbers shrink in this stage (1 in its home stage, < 1 later). */
export const sizeFactor = (key: string, stage: StageDef): number => (HOME_SCALE.get(key) ?? stage.scale) / stage.scale;

const cache = new Map<string, CreatureDef>();

/** A creature definition with sizes, speeds and distances in the given stage's units. */
export function creatureDef(key: string, stage: StageDef): CreatureDef {
  const id = `${key}@${stage.id}`;
  let def = cache.get(id);
  if (!def) {
    const f = sizeFactor(key, stage);
    def = f === 1 ? CREATURES[key] : scaleDef(CREATURES[key], f);
    cache.set(id, def);
  }
  return def;
}

function scaleDef(d: CreatureDef, k: number): CreatureDef {
  const m = (v: number | undefined) => (v === undefined ? undefined : v * k);
  return {
    ...d,
    size: [d.size[0] * k, d.size[1] * k],
    speed: d.speed * k,
    fleeSpeed: m(d.fleeSpeed),
    chaseSpeed: m(d.chaseSpeed),
    sense: d.sense * k,
    tongueRange: m(d.tongueRange),
    stalkSpeed: m(d.stalkSpeed),
    stalkRange: m(d.stalkRange),
    chargeSpeed: m(d.chargeSpeed),
    range: m(d.range),
    projectileSpeed: m(d.projectileSpeed),
    spit: d.spit && { ...d.spit, range: d.spit.range * k, speed: d.spit.speed * k },
    slam: d.slam && { ...d.slam, knock: d.slam.knock * k },
  };
}
