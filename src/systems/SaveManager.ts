import type { CharacterId } from '../data/player';

/** Persistent progress. Grows in M7 (money, unlocks, skills, level progress). */
export interface SaveData {
  version: 1;
  character: CharacterId;
}

const KEY = 'zombies-tds-save';
const DEFAULTS: SaveData = { version: 1, character: 'man' };

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
