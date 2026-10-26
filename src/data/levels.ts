import type { EnemyId } from './enemies';

/** A batch of enemies: counts per type, how many may be alive at once, seconds between spawns. */
export interface Wave {
  spawn: Partial<Record<EnemyId, number>>;
  maxAlive: number;
  interval: number;
}

/** Continuous spawning (survive / reach steps): weights per type instead of counts. */
export interface Trickle {
  weights: Partial<Record<EnemyId, number>>;
  maxAlive: number;
  interval: number;
}

/** Objectives run in order; the level is won when the last one completes. */
export type LevelStep =
  | { type: 'waves'; waves: Wave[]; /** seconds of calm between waves */ breakTime: number }
  | { type: 'survive'; seconds: number; trickle: Trickle }
  | { type: 'reach'; /** marker rectangle name in the map */ marker: 'exit'; trickle?: Trickle };

export interface LevelDef {
  id: string;
  name: string;
  /** Tiled map in public/maps/<map>.json */
  map: string;
  steps: LevelStep[];
  /** money for completing the level */
  reward: number;
}

const WALKERS = { zombie1: 1, zombie2: 1, zombie3: 1, zombie4: 1 };

export const LEVELS: LevelDef[] = [
  {
    id: 'level01',
    name: 'Suburbio',
    map: 'level01',
    reward: 150,
    steps: [
      {
        type: 'waves',
        breakTime: 6,
        waves: [
          { spawn: { zombie1: 5, zombie2: 5, zombie3: 4 }, maxAlive: 10, interval: 0.9 },
          { spawn: { zombie1: 7, zombie2: 6, zombie3: 6, zombie4: 6 }, maxAlive: 14, interval: 0.7 },
          { spawn: { zombie1: 8, zombie2: 8, zombie3: 8, zombie4: 8, cop: 5 }, maxAlive: 18, interval: 0.55 },
        ],
      },
      { type: 'reach', marker: 'exit', trickle: { weights: { ...WALKERS, cop: 1 }, maxAlive: 10, interval: 1.6 } },
    ],
  },
];

export const mapKey = (map: string) => `map:${map}`;
export const PROPS_TILESET_KEY = 'props-tileset';
