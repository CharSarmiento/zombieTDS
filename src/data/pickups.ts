import type { EnemyDef } from './enemies';

export type PickupKind = 'money' | 'health' | 'armor' | 'ammoRifle' | 'fuel' | 'ammoBox' | 'speed' | 'slow' | 'superpower';
export type BuffId = 'speed' | 'slow' | 'superpower';

export interface PickupDef {
  /** frame in the ui atlas */
  icon: string;
  /** floating text when collected */
  label: string;
  color: string;
}

export const PICKUPS: Record<PickupKind, PickupDef> = {
  money: { icon: 'items/0013_money', label: '+$', color: '#c8e04a' },
  health: { icon: 'items/0005_health', label: '+VIDA', color: '#ff6060' },
  armor: { icon: 'items/0010_armor', label: '+ARMADURA', color: '#6ab4ff' },
  ammoRifle: { icon: 'items/0004_magazine_riffle', label: '+BALAS RIFLE', color: '#ffffff' },
  fuel: { icon: 'items/0012_cylinder', label: '+COMBUSTIBLE', color: '#ffa040' },
  ammoBox: { icon: 'items/0009_magazine_machine_gun', label: '+MUNICIÓN', color: '#ffffff' },
  speed: { icon: 'items/0006_speed', label: 'VELOCIDAD', color: '#7dff7d' },
  slow: { icon: 'items/0007_slow_enemies', label: 'ZOMBIES LENTOS', color: '#9fc3ff' },
  superpower: { icon: 'items/0008_superpower', label: 'DAÑO x2', color: '#ffcc40' },
};

/** Effect sizes. */
export const PICKUP_VALUES = {
  health: 35,
  armor: 50,
  ammoRifle: 60,
  fuel: 40,
  ammoBox: { rifle: 30, fuel: 20 },
};

export const BUFFS: Record<BuffId, { seconds: number; icon: string }> = {
  speed: { seconds: 8, icon: 'items/0006_speed' },
  slow: { seconds: 8, icon: 'items/0007_slow_enemies' },
  superpower: { seconds: 10, icon: 'items/0008_superpower' },
};

export const BUFF_EFFECT = {
  speedMultiplier: 1.35,
  slowMultiplier: 0.5,
  damageMultiplier: 2,
};

/** Drop chances per kill (independent rolls for money; one roll for an item). */
export const DROPS = {
  moneyChance: 0.45,
  /** item table: kind and weight; 'none' fills the rest */
  items: [
    ['none', 76],
    ['health', 6],
    ['ammoRifle', 5],
    ['fuel', 4],
    ['ammoBox', 3],
    ['armor', 2.5],
    ['speed', 1.3],
    ['slow', 1.2],
    ['superpower', 1],
  ] as [PickupKind | 'none', number][],
  /** tougher enemies drop more often */
  tierBonus: (def: EnemyDef) => (def.tier - 1) * 0.12,
  /** seconds on the ground before vanishing */
  lifetime: 20,
  magnetRadius: 150,
};
