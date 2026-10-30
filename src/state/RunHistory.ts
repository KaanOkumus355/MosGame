import type { Difficulty } from '../data/difficulty';
import { STAGES, TOTAL_STAGES } from '../data/stages';
import { GameState, damageKey, type BossKill, type TraitEntry } from './GameState';

const STORAGE_KEY = 'swarm-to-sovereign-history';
/** How many past runs are kept. */
export const HISTORY_SIZE = 20;

export type Ending = 'normal' | 'aerial' | 'abyssal' | 'hive';

/** Everything the run report shows, frozen when a run ends. */
export interface RunRecord {
  date: number;
  won: boolean;
  ending?: Ending;
  /** Ending label for a win ("HIVE ENDING"). */
  label?: string;
  difficulty: Difficulty;
  /** Difficulty with mutators ("Normal + Famine"). */
  diffName: string;
  killedBy: string;
  time: number;
  /** Last stage index reached, and the form and stage id at each index up to it. */
  last: number;
  forms: string[];
  stageIds: string[];
  stageTimes: number[];
  stageEaten: number[];
  traits: TraitEntry[];
  stats: { maxHp: number; armor: number; speed: number; dna: number };
  bossKills: BossKill[];
  damageBy: Record<string, number>;
  lossesBy: Record<string, number>;
  genes: number;
}

interface BestTime {
  time: number;
  date: number;
}

/** The four evolution lines, told apart by the form a run branched into. */
export type RunLine = 'Main' | 'Hive' | 'Sky' | 'Deep';

export const runLine = (stageIds: readonly string[]): RunLine =>
  stageIds.includes('meadow') ? 'Hive' : stageIds.includes('canopy') ? 'Sky' : stageIds.includes('delta') ? 'Deep' : 'Main';

/** Lifetime numbers, kept even after a run drops off the last-20 list. */
export interface RunTotals {
  runs: number;
  wins: number;
  /** Seconds played, over every finished run. */
  time: number;
  eaten: number;
  bosses: number;
  /** Furthest stage reached (1-based). */
  deepest: number;
  lines: Partial<Record<RunLine, number>>;
  /** What ended each lost run (by damage source name). */
  killers: Record<string, number>;
}

interface HistoryData {
  runs: RunRecord[];
  /** Fastest win per `${ending}:${difficulty}`. */
  best: Record<string, BestTime>;
  totals: RunTotals;
}

const emptyTotals = (): RunTotals => ({ runs: 0, wins: 0, time: 0, eaten: 0, bosses: 0, deepest: 0, lines: {}, killers: {} });

/** Adds one finished run to the lifetime numbers. */
function addToTotals(t: RunTotals, r: RunRecord): void {
  t.runs++;
  if (r.won) t.wins++;
  t.time += r.time;
  t.eaten += r.stageEaten.reduce((a, b) => a + b, 0);
  t.bosses += r.bossKills.length;
  t.deepest = Math.max(t.deepest, r.last + 1);
  const line = runLine(r.stageIds);
  t.lines[line] = (t.lines[line] ?? 0) + 1;
  if (!r.won && r.killedBy) {
    const k = damageKey(r.killedBy);
    t.killers[k] = (t.killers[k] ?? 0) + 1;
  }
}

/** What saving a run changed, for the Victory screen. */
export interface SaveResult {
  record: RunRecord;
  /** The best time before this run, if there was one. */
  previousBest?: number;
  newBest: boolean;
}

/**
 * Best times are kept per game length: the game grew from 6 stages to 7, and those older times
 * aren't comparable. Keys without an era prefix are from the 6-stage era.
 */
const ERA = 'v7';
/** Runs with mutators keep their own best times, one per combination ("v7:normal:hard:famine+glass"). */
const bestKey = (ending: Ending, difficulty: Difficulty, mutators: readonly string[] = []): string =>
  [ERA, ending, difficulty, ...(mutators.length ? [[...mutators].sort().join('+')] : [])].join(':');

/** A best time set with mutators on. */
export interface MutatorBest {
  ending: Ending;
  difficulty: Difficulty;
  mutators: string[];
  time: number;
}

/** A best time from the 6-stage era (kept, shown apart). */
export interface OldBest {
  ending: Ending;
  difficulty: Difficulty;
  time: number;
}

/** The last runs and the best win times, kept across sessions in localStorage. */
class RunHistoryStore {
  private data: HistoryData = this.load();

  get runs(): readonly RunRecord[] {
    return this.data.runs;
  }

  get totals(): Readonly<RunTotals> {
    return this.data.totals;
  }

  /** Any win at all for this ending and difficulty, with or without mutators. */
  hasWon(ending: Ending, difficulty: Difficulty): boolean {
    const key = bestKey(ending, difficulty);
    return Object.keys(this.data.best).some((k) => k === key || k.startsWith(`${key}:`));
  }

  /** The best time for an ending and difficulty, with when it was set. */
  bestEntry(ending: Ending, difficulty: Difficulty): BestTime | undefined {
    return this.data.best[bestKey(ending, difficulty)];
  }

  best(ending: Ending, difficulty: Difficulty): number | undefined {
    return this.data.best[bestKey(ending, difficulty)]?.time;
  }

  /** Best times set with mutators on, fastest first. */
  mutatorBests(): MutatorBest[] {
    return Object.entries(this.data.best)
      .map(([key, b]) => ({ parts: key.split(':'), time: b.time }))
      .filter(({ parts }) => parts.length === 4 && parts[0] === ERA)
      .map(({ parts, time }) => ({ ending: parts[1] as Ending, difficulty: parts[2] as Difficulty, mutators: parts[3].split('+'), time }))
      .sort((a, b) => a.time - b.time);
  }

  /** Best times set when the game had 6 stages. */
  oldEraBests(): OldBest[] {
    return Object.entries(this.data.best)
      .filter(([key]) => key.split(':').length === 2)
      .map(([key, b]) => {
        const [ending, difficulty] = key.split(':') as [Ending, Difficulty];
        return { ending, difficulty, time: b.time };
      });
  }

  /** The current run as a record (what the run report shows). */
  fromState(won: boolean, ending?: Ending, label?: string): RunRecord {
    const s = GameState;
    const last = Math.min(s.stageIndex, TOTAL_STAGES - 1);
    const upTo = Array.from({ length: last + 1 }, (_, i) => i);
    return structuredClone({
      date: Date.now(),
      won,
      ending,
      label,
      difficulty: s.difficulty,
      diffName: s.diff.name,
      killedBy: s.killedBy,
      time: s.timeAlive,
      last,
      forms: upTo.map((i) => s.stageDef(i).creatureName),
      stageIds: upTo.map((i) => s.stageDef(i).id),
      stageTimes: upTo.map((i) => s.stageTimes[i] ?? 0),
      stageEaten: upTo.map((i) => s.stageEaten[i] ?? 0),
      traits: s.traitEntries(Math.min(last, STAGES.length - 1)),
      stats: { maxHp: s.stats.maxHp, armor: s.stats.armor, speed: s.stats.speedMul, dna: s.dnaTotal },
      bossKills: s.bossKills,
      damageBy: s.damageBy,
      lossesBy: s.lossesBy,
      genes: s.genesBanked,
    });
  }

  /** Saves the run that just ended (once per run) and updates the best time on a win. */
  save(won: boolean, ending?: Ending, label?: string): SaveResult {
    const s = GameState;
    if (s.historySaved) return s.historySaved;
    const record = this.fromState(won, ending, label);
    this.data.runs = [record, ...this.data.runs].slice(0, HISTORY_SIZE);
    addToTotals(this.data.totals, record);
    let previousBest: number | undefined;
    let newBest = false;
    if (won && ending) {
      const key = bestKey(ending, record.difficulty, s.mutators);
      previousBest = this.data.best[key]?.time;
      if (previousBest === undefined || record.time < previousBest) {
        this.data.best[key] = { time: record.time, date: record.date };
        newBest = true;
      }
    }
    this.persist();
    s.historySaved = { record, previousBest, newBest };
    return s.historySaved;
  }

  private load(): HistoryData {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<HistoryData> | null;
      const runs = raw?.runs ?? [];
      // saves from before lifetime totals start from the runs they still have
      let totals = raw?.totals;
      if (!totals) {
        totals = emptyTotals();
        for (const r of [...runs].reverse()) addToTotals(totals, r);
      }
      return { runs, best: raw?.best ?? {}, totals };
    } catch {
      return { runs: [], best: {}, totals: emptyTotals() };
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage full or blocked: history lasts this session only
    }
  }
}

export const RunHistory = new RunHistoryStore();

/** m:ss */
export const formatTime = (t: number): string => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
