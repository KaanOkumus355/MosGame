import { CREATURES } from './creatures';
import { BRANCH_STAGES, STAGES, stageIndexOf } from './stages';

export interface CreatureGroup {
  name: string;
  keys: string[];
  /** Biome of the earliest zone it lives in. */
  home: string;
}

let cache: CreatureGroup[] | null = null;

/**
 * Creatures as the Bestiary lists them: grouped by display name (both rabbits are one entry),
 * each with its home zone. Creatures that never spawn anywhere are left out.
 */
export function creatureGroups(): CreatureGroup[] {
  if (cache) return cache;
  const zones = [...STAGES, ...BRANCH_STAGES].sort((a, b) => stageIndexOf(a.id) - stageIndexOf(b.id));
  const groups = new Map<string, CreatureGroup>();
  for (const def of Object.values(CREATURES)) {
    const home = zones.find((z) => z.spawns.some((sp) => sp.creature === def.key));
    if (!home) continue;
    const g = groups.get(def.name) ?? { name: def.name, keys: [], home: home.biome };
    g.keys.push(def.key);
    groups.set(def.name, g);
  }
  cache = [...groups.values()];
  return cache;
}
