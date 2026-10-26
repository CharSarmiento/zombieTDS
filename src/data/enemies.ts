export type EnemyId = 'zombie1' | 'zombie2' | 'zombie3' | 'zombie4' | 'cop' | 'army';

export interface EnemyDef {
  name: string;
  tier: number;
  hp: number;
  /** px/s */
  speed: number;
  /** damage per landed hit */
  damage: number;
  /** physics circle radius, px */
  radius: number;
  /** attack reach beyond touching distance, px */
  reach: number;
  /** seconds between attacks */
  attackCooldown: number;
  /** moment the hit lands, as a fraction of the attack animation */
  attackHitAt: number;
  /** 0 = full knockback, 1 = immovable */
  knockbackResist: number;
  /** seconds without control after a strong hit */
  stagger: number;
  /** physics mass relative to the player (pushing in crowds) */
  mass: number;
  /** money dropped on death (used from M6) */
  reward: number;
}

const WALKER = { tier: 1, reach: 34, attackCooldown: 1.1, attackHitAt: 0.4, knockbackResist: 0, stagger: 0.18, mass: 1, reward: 5 };

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  zombie1: { ...WALKER, name: 'Caminante', hp: 70, speed: 115, damage: 10, radius: 28 },
  zombie2: { ...WALKER, name: 'Caminante', hp: 70, speed: 120, damage: 10, radius: 28 },
  zombie3: { ...WALKER, name: 'Caminante', hp: 90, speed: 105, damage: 12, radius: 30 },
  zombie4: { ...WALKER, name: 'Caminante', hp: 90, speed: 108, damage: 12, radius: 30 },
  cop: { ...WALKER, tier: 2, name: 'Policía', hp: 95, speed: 170, damage: 12, radius: 30, attackCooldown: 0.9, reward: 8 },
  army: {
    ...WALKER, tier: 2, name: 'Soldado', hp: 230, speed: 95, damage: 18, radius: 33,
    knockbackResist: 0.6, stagger: 0.08, mass: 2.5, reward: 12,
  },
};

/** Base walk speed the zombie walk cycles were drawn for (animation time-scale reference). */
export const ZOMBIE_ANIM_SPEED = 90;
