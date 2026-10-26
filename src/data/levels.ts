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
  | { type: 'reach'; /** marker rectangle name in the map */ marker: 'exit'; trickle?: Trickle }
  | BossStep;

/**
 * Boss fight: the boss never comes alone. It arrives with an escort, common enemies keep
 * trickling in, and each phase (crossed hp fraction) summons reinforcements and speeds it up.
 */
export interface BossStep {
  type: 'boss';
  boss: EnemyId;
  escort: Partial<Record<EnemyId, number>>;
  trickle: Trickle;
  phases: { at: number; summon: Partial<Record<EnemyId, number>>; enrage: number }[];
}

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

/**
 * Dev-only test levels (not in the campaign map): `?scene=Game&level=test_boss1`.
 * The campaign levels of M9 reuse these fights.
 */
export const TEST_LEVELS: LevelDef[] = [
  {
    id: 'test_elites', name: 'Prueba: élites', map: 'arena', reward: 0,
    steps: [{ type: 'waves', breakTime: 4, waves: [{ spawn: { bighands: 2, bighead: 2, zombie1: 8, cop: 4 }, maxAlive: 12, interval: 0.8 }] }],
  },
  {
    id: 'test_boss1', name: 'Prueba: El Cosido', map: 'arena', reward: 0,
    steps: [{
      type: 'boss', boss: 'boss1', escort: { zombie1: 4, zombie3: 4 },
      trickle: { weights: { ...WALKERS, cop: 1 }, maxAlive: 8, interval: 2.5 },
      phases: [{ at: 0.5, summon: { army: 3, cop: 4 }, enrage: 1.2 }],
    }],
  },
  {
    id: 'test_boss2', name: 'Prueba: La Tenaza', map: 'arena', reward: 0,
    steps: [{
      type: 'boss', boss: 'boss2', escort: { cop: 4, army: 2 },
      trickle: { weights: { ...WALKERS, cop: 2, army: 1 }, maxAlive: 9, interval: 2.2 },
      phases: [{ at: 0.6, summon: { bighands: 1, cop: 4 }, enrage: 1.15 }, { at: 0.3, summon: { bighead: 1, army: 3 }, enrage: 1.3 }],
    }],
  },
  {
    id: 'test_megaboss', name: 'Prueba: La Abominación', map: 'arena', reward: 0,
    steps: [{
      type: 'boss', boss: 'megaboss', escort: { bighands: 1, army: 3, cop: 3 },
      trickle: { weights: { ...WALKERS, cop: 2, army: 2 }, maxAlive: 12, interval: 1.8 },
      phases: [
        { at: 0.66, summon: { bighead: 2, cop: 4 }, enrage: 1.15 },
        { at: 0.33, summon: { bighands: 2, army: 4 }, enrage: 1.3 },
      ],
    }],
  },
];

export const findLevel = (id?: string): LevelDef => [...LEVELS, ...TEST_LEVELS].find((l) => l.id === id) ?? LEVELS[0];

export const mapKey =(map: string) => `map:${map}`;
export const PROPS_TILESET_KEY = 'props-tileset';
