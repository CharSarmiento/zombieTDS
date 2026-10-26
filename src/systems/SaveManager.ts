import type { CharacterId } from '../data/player';

/** Persistent progress. Grows in M7 (unlocks, skills, loadout). */
export interface SaveData {
  version: 1;
  character: CharacterId;
  money: number;
  /** ids of completed levels */
  completed: string[];
  /** best run per level */
  best: Record<string, { time: number; kills: number }>;
}

const KEY = 'zombies-tds-save';
const DEFAULTS: SaveData = { version: 1, character: 'man', money: 0, completed: [], best: {} };

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SaveData>) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function updateSave(patch: Partial<SaveData>): SaveData {
  cache = { ...loadSave(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable (private mode): keep in memory only
  }
  return cache;
}

/** Records the outcome of a run: money is banked, a win marks the level completed. */
export function recordRun(levelId: string, run: { victory: boolean; money: number; time: number; kills: number }): SaveData {
  const save = loadSave();
  const completed = run.victory && !save.completed.includes(levelId) ? [...save.completed, levelId] : save.completed;
  const prev = save.best[levelId];
  const best = run.victory && (!prev || run.time < prev.time) ? { ...save.best, [levelId]: { time: run.time, kills: run.kills } } : save.best;
  return updateSave({ money: save.money + run.money, completed, best });
}
