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
  | { type: 'reach'; /** marker rectangle name in the map */ marker: 'exit'; trickle?: Trickle; /** objective text */ label?: string }
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

/**
 * The campaign, in map order (node 1..10). Difficulty climbs through enemy mix, crowd size
 * (maxAlive) and spawn rate; each new enemy type debuts in a smaller dose before it is mixed in.
 * Unlocks (data/progression.ts): bat after level 1, rifle after level 3, flamethrower after level 7.
 */
export const LEVELS: LevelDef[] = [
  {
    id: 'level01', name: 'Suburbio', map: 'level01', reward: 150,
    steps: [
      {
        type: 'waves', breakTime: 6,
        waves: [
          { spawn: { zombie1: 5, zombie2: 5, zombie3: 4 }, maxAlive: 10, interval: 0.9 },
          { spawn: { zombie1: 7, zombie2: 6, zombie3: 6, zombie4: 6 }, maxAlive: 14, interval: 0.7 },
          { spawn: { zombie1: 8, zombie2: 8, zombie3: 8, zombie4: 8, cop: 5 }, maxAlive: 18, interval: 0.55 },
        ],
      },
      { type: 'reach', marker: 'exit', trickle: { weights: { ...WALKERS, cop: 1 }, maxAlive: 10, interval: 1.6 } },
    ],
  },
  {
    id: 'level02', name: 'Parque', map: 'level02', reward: 200,
    steps: [
      {
        type: 'waves', breakTime: 6,
        waves: [
          { spawn: { zombie1: 8, zombie2: 8, zombie3: 6, cop: 3 }, maxAlive: 14, interval: 0.7 },
          { spawn: { zombie1: 10, zombie2: 10, zombie4: 8, cop: 6 }, maxAlive: 18, interval: 0.55 },
        ],
      },
      { type: 'survive', seconds: 60, trickle: { weights: { ...WALKERS, cop: 1.5 }, maxAlive: 20, interval: 0.6 } },
      { type: 'reach', marker: 'exit', trickle: { weights: { ...WALKERS, cop: 1 }, maxAlive: 12, interval: 1.4 } },
    ],
  },
  {
    id: 'level03', name: 'Comisaría', map: 'level03', reward: 250,
    steps: [
      {
        type: 'waves', breakTime: 6,
        waves: [
          { spawn: { cop: 10, zombie1: 6, zombie3: 6 }, maxAlive: 16, interval: 0.6 },
          { spawn: { cop: 14, zombie2: 8, zombie4: 8 }, maxAlive: 20, interval: 0.5 },
          { spawn: { cop: 18, zombie1: 8, zombie3: 8, army: 2 }, maxAlive: 22, interval: 0.45 },
        ],
      },
      { type: 'reach', marker: 'exit', label: 'BUSCA LA SALA DE EVIDENCIAS', trickle: { weights: { cop: 3, ...WALKERS }, maxAlive: 14, interval: 1.2 } },
    ],
  },
  {
    id: 'level04', name: 'Checkpoint militar', map: 'level04', reward: 300,
    steps: [
      { type: 'survive', seconds: 75, trickle: { weights: { ...WALKERS, army: 2, cop: 1 }, maxAlive: 20, interval: 0.6 } },
      {
        type: 'waves', breakTime: 6,
        waves: [
          { spawn: { army: 8, zombie1: 8, zombie3: 8 }, maxAlive: 18, interval: 0.55 },
          { spawn: { army: 14, cop: 8, zombie2: 8, zombie4: 8 }, maxAlive: 22, interval: 0.45 },
        ],
      },
      { type: 'reach', marker: 'exit', trickle: { weights: { army: 2, cop: 2, ...WALKERS }, maxAlive: 14, interval: 1.2 } },
    ],
  },
  {
    id: 'level05', name: 'Plaza · El Cosido', map: 'arena', reward: 450,
    steps: [
      { type: 'waves', breakTime: 5, waves: [{ spawn: { zombie1: 8, zombie3: 8, cop: 6, army: 4 }, maxAlive: 18, interval: 0.5 }] },
      {
        type: 'boss', boss: 'boss1', escort: { zombie1: 4, zombie3: 4, army: 2 },
        trickle: { weights: { ...WALKERS, cop: 1, army: 0.5 }, maxAlive: 10, interval: 2 },
        phases: [{ at: 0.5, summon: { army: 4, cop: 4 }, enrage: 1.2 }],
      },
    ],
  },
  {
    id: 'level06', name: 'Pantano', map: 'level06', reward: 350,
    steps: [
      {
        type: 'waves', breakTime: 7,
        waves: [
          { spawn: { zombie1: 10, zombie2: 10, army: 4, bighands: 1 }, maxAlive: 18, interval: 0.55 },
          { spawn: { zombie3: 10, zombie4: 10, cop: 8, army: 6, bighands: 2 }, maxAlive: 22, interval: 0.45 },
        ],
      },
      { type: 'survive', seconds: 60, trickle: { weights: { ...WALKERS, cop: 1.5, army: 1, bighands: 0.15 }, maxAlive: 22, interval: 0.55 } },
      { type: 'reach', marker: 'exit', trickle: { weights: { ...WALKERS, army: 1 }, maxAlive: 14, interval: 1.2 } },
    ],
  },
  {
    id: 'level07', name: 'Ruinas', map: 'level07', reward: 400,
    steps: [
      {
        type: 'waves', breakTime: 7,
        waves: [
          { spawn: { zombie1: 10, zombie2: 10, cop: 8, bighead: 1 }, maxAlive: 20, interval: 0.5 },
          { spawn: { army: 10, cop: 10, zombie3: 10, bighead: 2, bighands: 1 }, maxAlive: 24, interval: 0.45 },
        ],
      },
      { type: 'survive', seconds: 75, trickle: { weights: { ...WALKERS, cop: 2, army: 1.5, bighead: 0.15, bighands: 0.1 }, maxAlive: 24, interval: 0.5 } },
      { type: 'reach', marker: 'exit', trickle: { weights: { ...WALKERS, cop: 1, army: 1 }, maxAlive: 16, interval: 1 } },
    ],
  },
  {
    id: 'level08', name: 'La Horda', map: 'level08', reward: 450,
    steps: [
      { type: 'survive', seconds: 120, trickle: { weights: { ...WALKERS, cop: 2, army: 2, bighands: 0.15, bighead: 0.15 }, maxAlive: 30, interval: 0.4 } },
      {
        type: 'waves', breakTime: 8,
        waves: [{ spawn: { zombie1: 12, zombie2: 12, zombie3: 12, cop: 12, army: 12, bighands: 2, bighead: 2 }, maxAlive: 30, interval: 0.35 }],
      },
      { type: 'reach', marker: 'exit', trickle: { weights: { ...WALKERS, cop: 2, army: 2 }, maxAlive: 18, interval: 0.9 } },
    ],
  },
  {
    id: 'level09', name: 'Base militar · La Tenaza', map: 'level09', reward: 600,
    steps: [
      { type: 'waves', breakTime: 6, waves: [{ spawn: { army: 14, cop: 10, zombie1: 8, bighands: 1, bighead: 1 }, maxAlive: 24, interval: 0.45 }] },
      {
        type: 'boss', boss: 'boss2', escort: { army: 4, cop: 4 },
        trickle: { weights: { ...WALKERS, cop: 2, army: 2 }, maxAlive: 12, interval: 1.8 },
        phases: [
          { at: 0.6, summon: { bighands: 1, cop: 5 }, enrage: 1.15 },
          { at: 0.3, summon: { bighead: 1, army: 5 }, enrage: 1.3 },
        ],
      },
      { type: 'reach', marker: 'exit', trickle: { weights: { cop: 2, army: 2 }, maxAlive: 12, interval: 1.2 } },
    ],
  },
  {
    id: 'level10', name: 'Extracción · La Abominación', map: 'level10', reward: 1000,
    steps: [
      {
        type: 'waves', breakTime: 7,
        waves: [
          { spawn: { army: 12, cop: 12, zombie2: 10, bighands: 2 }, maxAlive: 26, interval: 0.4 },
          { spawn: { army: 14, cop: 12, zombie4: 10, bighead: 2, bighands: 1 }, maxAlive: 28, interval: 0.35 },
        ],
      },
      {
        type: 'boss', boss: 'megaboss', escort: { bighands: 1, army: 4, cop: 4 },
        trickle: { weights: { ...WALKERS, cop: 2, army: 2 }, maxAlive: 14, interval: 1.6 },
        phases: [
          { at: 0.66, summon: { bighead: 2, cop: 5 }, enrage: 1.15 },
          { at: 0.33, summon: { bighands: 2, army: 5 }, enrage: 1.3 },
        ],
      },
      { type: 'reach', marker: 'exit', label: '¡LLEGA AL HELIPUERTO!', trickle: { weights: { ...WALKERS, cop: 3, army: 3 }, maxAlive: 24, interval: 0.5 } },
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
