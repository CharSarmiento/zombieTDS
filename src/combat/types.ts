export type DamageSource = 'bullet' | 'melee' | 'fire' | 'explosion';

export interface Hit {
  amount: number;
  source: DamageSource;
  /** where the hit came from (knockback pushes away from it) */
  fromX: number;
  fromY: number;
  knockback: number;
  /** applies/refreshes a burning effect */
  burn?: { dps: number; duration: number };
}

/** Anything weapons can hurt (zombies, practice dummies, later barrels). */
export interface Damageable {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alive: boolean;
  takeDamage(hit: Hit): void;
}
