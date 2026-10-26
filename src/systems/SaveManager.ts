import type { CharacterId } from '../data/player';
import { STARTING_WEAPONS, type Progress } from '../data/progression';

export interface Options {
  /** 0..1 */
  music: number;
  sfx: number;
  shake: boolean;
  damageNumbers: boolean;
}

export const DEFAULT_OPTIONS: Options = { music: 0.6, sfx: 0.8, shake: true, damageNumbers: true };

/** Persistent progress and settings. */
export interface SaveData extends Progress {
  options: Options;
  version: 1;
  character: CharacterId;
  money: number;
  /** ids of completed levels */
  completed: string[];
  /** best run per level */
  best: Record<string, { time: number; kills: number }>;
}

const KEY = 'zombies-tds-save';
const defaults = (): SaveData => ({
  version: 1,
  character: 'man',
  money: 0,
  completed: [],
  best: {},
  owned: [...STARTING_WEAPONS],
  upgrades: {},
  skills: {},
  options: { ...DEFAULT_OPTIONS },
});

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<SaveData>) : {};
    // older saves have no (or partial) options: fill in the defaults
    cache = { ...defaults(), ...stored, options: { ...DEFAULT_OPTIONS, ...stored.options } };
  } catch {
    cache = defaults();
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

export function updateOptions(patch: Partial<Options>): Options {
  return updateSave({ options: { ...loadSave().options, ...patch } }).options;
}

/** Spends money if there is enough; returns false otherwise. */
export function spend(amount: number, apply: (save: SaveData) => Partial<SaveData>): boolean {
  const save = loadSave();
  if (save.money < amount) return false;
  updateSave({ ...apply(save), money: save.money - amount });
  return true;
}

/** Wipes all progress but keeps the settings (options menu, dev). */
export function resetSave(): SaveData {
  cache = { ...defaults(), options: loadSave().options };
  return updateSave({});
}

/** Records the outcome of a run: money is banked, a win marks the level completed. */
export function recordRun(levelId: string, run: { victory: boolean; money: number; time: number; kills: number }): SaveData {
  const save = loadSave();
  const completed = run.victory && !save.completed.includes(levelId) ? [...save.completed, levelId] : save.completed;
  const prev = save.best[levelId];
  const best = run.victory && (!prev || run.time < prev.time) ? { ...save.best, [levelId]: { time: run.time, kills: run.kills } } : save.best;
  return updateSave({ money: save.money + run.money, completed, best });
}
