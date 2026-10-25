export type WeaponId = 'knife' | 'gun' | 'bat' | 'rifle' | 'flame';

/** Slot order: keys 1-5, wheel and LB/RB cycle through this list. */
export const WEAPON_ORDER: WeaponId[] = ['knife', 'gun', 'bat', 'rifle', 'flame'];

interface WeaponBase {
  name: string;
  /** suffix of the character animations (walk_<anim>, attack_<anim>) */
  anim: string;
  /** frame in the ui atlas */
  icon: string;
}

export interface MeleeWeapon extends WeaponBase {
  kind: 'melee';
  damage: number;
  /** seconds between swings; the attack animation is time-scaled to fit */
  cooldown: number;
  /** reach from the player's centre, px */
  range: number;
  /** total swing arc, degrees */
  arc: number;
  knockback: number;
  /** moment the hit lands, as a fraction of the swing (matches the art) */
  hitAt: number;
  shake: number;
}

export interface GunWeapon extends WeaponBase {
  kind: 'gun';
  damage: number;
  /** seconds between shots */
  cooldown: number;
  /** hold to fire */
  auto: boolean;
  magazine: number;
  /** starting reserve; Infinity = never runs out (only reloads) */
  reserve: number;
  maxReserve: number;
  /** seconds */
  reload: number;
  /** spread cone, degrees (standing / moving) */
  spread: number;
  spreadMoving: number;
  bulletSpeed: number;
  range: number;
  knockback: number;
  /** muzzle flash frames in the fx atlas (one is picked per shot) */
  flashes: string[];
  shake: number;
}

export interface FlameWeapon extends WeaponBase {
  kind: 'flame';
  /** damage per second to everything in the cone */
  dps: number;
  burnDps: number;
  /** seconds of burning after leaving the flame */
  burnTime: number;
  /** reach from the nozzle, px */
  range: number;
  /** cone, degrees */
  arc: number;
  /** tank size (units) and consumption per second */
  fuel: number;
  fuelPerSecond: number;
  knockback: number;
}

export type WeaponDef = MeleeWeapon | GunWeapon | FlameWeapon;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  knife: {
    kind: 'melee', name: 'Cuchillo', anim: 'knife', icon: 'items/0015_knife',
    damage: 34, cooldown: 0.42, range: 92, arc: 110, knockback: 140, hitAt: 0.4, shake: 0.002,
  },
  gun: {
    kind: 'gun', name: 'Pistola', anim: 'gun', icon: 'items/0014_gun',
    damage: 26, cooldown: 0.24, auto: false, magazine: 12, reserve: Infinity, maxReserve: Infinity, reload: 1.1,
    spread: 2, spreadMoving: 6, bulletSpeed: 1700, range: 950, knockback: 90,
    flashes: ['fx/gun_02', 'fx/gun_03'], shake: 0.0025,
  },
  bat: {
    kind: 'melee', name: 'Bate', anim: 'bat', icon: 'items/0002_bat',
    damage: 62, cooldown: 0.8, range: 118, arc: 150, knockback: 460, hitAt: 0.5, shake: 0.006,
  },
  rifle: {
    kind: 'gun', name: 'Rifle', anim: 'rifle', icon: 'items/0000_gun',
    damage: 19, cooldown: 0.095, auto: true, magazine: 30, reserve: 120, maxReserve: 240, reload: 1.8,
    spread: 4, spreadMoving: 9, bulletSpeed: 2000, range: 1150, knockback: 60,
    flashes: ['fx/riffle_02', 'fx/riffle_03', 'fx/gun_rifle_01'], shake: 0.002,
  },
  flame: {
    kind: 'flame', name: 'Lanzallamas', anim: 'flame', icon: 'items/0001_fire',
    dps: 55, burnDps: 14, burnTime: 2.5, range: 250, arc: 34, fuel: 100, fuelPerSecond: 11, knockback: 25,
  },
};
