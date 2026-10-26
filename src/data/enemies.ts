export type EnemyId =
  | 'zombie1' | 'zombie2' | 'zombie3' | 'zombie4' | 'cop' | 'army'
  | 'bighands' | 'bighead'
  | 'boss1' | 'boss2' | 'megaboss';

/** Area an attack hits, relative to where the attacker stood and faced when it started. */
export type AttackShape =
  | { type: 'arc'; radius: number; /** total angle, degrees */ angle: number }
  | { type: 'line'; length: number; width: number }
  | { type: 'circle'; radius: number; /** distance ahead of the attacker */ offset: number };

export interface AttackDef {
  /** animation name (entity/<anim>) */
  anim: string;
  /** starts when the gap between bodies is within [minRange, range] */
  range: number;
  minRange?: number;
  shape: AttackShape;
  damage: number;
  /** moment the hit lands, as a fraction of the attack */
  hitAt: number;
  /** seconds the attack lasts (animation is time-scaled to fit); default: the animation's own length */
  duration?: number;
  /** seconds before this attack can be used again */
  cooldown: number;
  knockback: number;
  /** draw the hit area on the ground before it lands; also locks position and aim at the start */
  telegraph?: boolean;
  /** dash forward at this speed (px/s) until the hit */
  lunge?: number;
  /** leaves a burning area for this many seconds after the hit */
  linger?: { seconds: number; dps: number };
  /** relative pick chance among the attacks available at that moment */
  weight?: number;
}

export interface EnemyDef {
  name: string;
  /** 1-2 common, 3 elite, 4 boss, 5 final boss */
  tier: number;
  hp: number;
  /** px/s */
  speed: number;
  /** physics circle radius, px */
  radius: number;
  attacks: AttackDef[];
  /** 0 = full knockback, 1 = immovable */
  knockbackResist: number;
  /** seconds without control after a strong hit */
  stagger: number;
  /** physics mass relative to the player (pushing in crowds) */
  mass: number;
  /** money per coin dropped on death */
  reward: number;
  /** coins dropped (default: one, by chance) */
  coins?: number;
  /** walk speed the walk cycle was drawn for (animation time-scale reference) */
  animSpeed?: number;
}

/** Plain swipe of the common zombies. */
const swipe = (damage: number, cooldown = 1.1): AttackDef => ({
  anim: 'attack', range: 34, shape: { type: 'arc', radius: 110, angle: 180 }, damage, hitAt: 0.4, cooldown, knockback: 180,
});

const WALKER = { tier: 1, knockbackResist: 0, stagger: 0.18, mass: 1, reward: 5 };

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  zombie1: { ...WALKER, name: 'Caminante', hp: 70, speed: 115, radius: 28, attacks: [swipe(10)] },
  zombie2: { ...WALKER, name: 'Caminante', hp: 70, speed: 120, radius: 28, attacks: [swipe(10)] },
  zombie3: { ...WALKER, name: 'Caminante', hp: 90, speed: 105, radius: 30, attacks: [swipe(12)] },
  zombie4: { ...WALKER, name: 'Caminante', hp: 90, speed: 108, radius: 30, attacks: [swipe(12)] },
  cop: { ...WALKER, tier: 2, name: 'Policía', hp: 95, speed: 170, radius: 30, attacks: [swipe(12, 0.9)], reward: 8 },
  army: {
    ...WALKER, tier: 2, name: 'Soldado', hp: 230, speed: 95, radius: 33, attacks: [swipe(18)],
    knockbackResist: 0.6, stagger: 0.08, mass: 2.5, reward: 12,
  },

  // --- elites -----------------------------------------------------------------------------
  bighands: {
    name: 'Manos Grandes', tier: 3, hp: 650, speed: 88, radius: 46, mass: 5, knockbackResist: 0.85, stagger: 0.05,
    reward: 15, coins: 3,
    attacks: [
      { anim: 'attack1', range: 60, shape: { type: 'arc', radius: 165, angle: 220 }, damage: 22, hitAt: 0.4, duration: 0.9, cooldown: 1.4, knockback: 380, telegraph: true },
      { anim: 'attack2', range: 150, shape: { type: 'circle', radius: 120, offset: 120 }, damage: 28, hitAt: 0.5, duration: 1.0, cooldown: 3, knockback: 450, telegraph: true },
    ],
  },
  bighead: {
    name: 'Cabezón', tier: 3, hp: 600, speed: 95, radius: 44, mass: 5, knockbackResist: 0.85, stagger: 0.05,
    reward: 15, coins: 3,
    attacks: [
      { anim: 'attack1', range: 60, shape: { type: 'arc', radius: 155, angle: 200 }, damage: 20, hitAt: 0.4, duration: 0.85, cooldown: 1.4, knockback: 350, telegraph: true },
      { anim: 'attack2', range: 420, minRange: 160, shape: { type: 'line', length: 440, width: 100 }, damage: 26, hitAt: 0.55, duration: 1.1, cooldown: 4, knockback: 500, telegraph: true, lunge: 640 },
    ],
  },

  // --- bosses -------------------------------------------------------------------------------
  boss1: {
    name: 'El Cosido', tier: 4, hp: 3200, speed: 95, radius: 72, mass: 12, knockbackResist: 1, stagger: 0,
    reward: 20, coins: 10,
    attacks: [
      { anim: 'attack1', range: 110, shape: { type: 'arc', radius: 270, angle: 300 }, damage: 30, hitAt: 0.45, duration: 1.4, cooldown: 2.4, knockback: 520, telegraph: true },
      { anim: 'attack2', range: 430, minRange: 120, shape: { type: 'line', length: 460, width: 120 }, damage: 34, hitAt: 0.6, duration: 1.3, cooldown: 3.2, knockback: 480, telegraph: true },
    ],
  },
  boss2: {
    name: 'La Tenaza', tier: 4, hp: 3800, speed: 100, radius: 75, mass: 12, knockbackResist: 1, stagger: 0,
    reward: 20, coins: 12,
    attacks: [
      { anim: 'attack1', range: 100, shape: { type: 'arc', radius: 240, angle: 150 }, damage: 36, hitAt: 0.5, duration: 1.0, cooldown: 2, knockback: 500, telegraph: true },
      { anim: 'attack2', range: 440, minRange: 120, shape: { type: 'line', length: 470, width: 120 }, damage: 32, hitAt: 0.6, duration: 1.3, cooldown: 3.2, knockback: 480, telegraph: true },
      { anim: 'attack1', range: 650, minRange: 300, shape: { type: 'line', length: 620, width: 150 }, damage: 40, hitAt: 0.6, duration: 1.3, cooldown: 6, knockback: 650, telegraph: true, lunge: 760, weight: 2 },
    ],
  },
  megaboss: {
    name: 'La Abominación', tier: 5, hp: 10000, speed: 82, radius: 105, mass: 40, knockbackResist: 1, stagger: 0,
    reward: 25, coins: 24,
    attacks: [
      { anim: 'attack1', range: 140, shape: { type: 'arc', radius: 340, angle: 360 }, damage: 34, hitAt: 0.5, duration: 1.7, cooldown: 3, knockback: 600, telegraph: true },
      { anim: 'attack2', range: 520, minRange: 60, shape: { type: 'line', length: 560, width: 150 }, damage: 28, hitAt: 0.55, duration: 1.4, cooldown: 4.5, knockback: 300, telegraph: true, linger: { seconds: 3, dps: 22 } },
      { anim: 'attack3', range: 200, shape: { type: 'circle', radius: 230, offset: 150 }, damage: 40, hitAt: 0.5, duration: 1.2, cooldown: 3.5, knockback: 750, telegraph: true },
      { anim: 'attack4', range: 700, minRange: 260, shape: { type: 'line', length: 720, width: 100 }, damage: 30, hitAt: 0.65, duration: 1.3, cooldown: 4, knockback: 520, telegraph: true },
    ],
  },
};

/** Base walk speed the walk cycles were drawn for, when a def does not say otherwise. */
export const ZOMBIE_ANIM_SPEED = 90;
