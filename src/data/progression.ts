import { PLAYER } from './player';
import { WEAPON_ORDER, WEAPONS, type WeaponDef, type WeaponId } from './weapons';

// ---------------------------------------------------------------------------------------------
// Arsenal: buying weapons and upgrading them
// ---------------------------------------------------------------------------------------------

export const STARTING_WEAPONS: WeaponId[] = ['knife', 'gun'];

/** Price and the level that must be completed before a weapon can be bought. */
export const WEAPON_SHOP: Record<WeaponId, { price: number; requires: string | null }> = {
  knife: { price: 0, requires: null },
  gun: { price: 0, requires: null },
  bat: { price: 150, requires: 'level01' },
  rifle: { price: 450, requires: 'level03' },
  flame: { price: 800, requires: 'level07' },
};

export type UpgradeId = 'damage' | 'magazine' | 'fireRate' | 'reload' | 'reserve' | 'attackSpeed' | 'range' | 'tank';

export interface UpgradeDef {
  name: string;
  /** what one level does, for the shop text */
  perLevel: string;
  levels: number;
  /** price of each level, as multiples of the weapon's upgrade base price */
  costs: number[];
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  damage: { name: 'Daño', perLevel: '+15% daño', levels: 3, costs: [1, 2, 3.5] },
  magazine: { name: 'Cargador', perLevel: '+25% balas por cargador', levels: 3, costs: [0.8, 1.6, 2.8] },
  fireRate: { name: 'Cadencia', perLevel: '+12% velocidad de disparo', levels: 3, costs: [1, 2, 3.5] },
  reload: { name: 'Recarga', perLevel: '-15% tiempo de recarga', levels: 3, costs: [0.7, 1.4, 2.5] },
  reserve: { name: 'Munición', perLevel: '+40% munición de reserva', levels: 3, costs: [0.6, 1.2, 2] },
  attackSpeed: { name: 'Velocidad', perLevel: '+12% velocidad de golpe', levels: 3, costs: [1, 2, 3.5] },
  range: { name: 'Alcance', perLevel: '+12% alcance', levels: 3, costs: [0.8, 1.6, 2.8] },
  tank: { name: 'Tanque', perLevel: '+30% combustible', levels: 3, costs: [0.8, 1.6, 2.8] },
};

/** Upgrade tracks per weapon kind, and the base price that scales their costs. */
export const WEAPON_UPGRADES: Record<WeaponId, { tracks: UpgradeId[]; base: number }> = {
  knife: { tracks: ['damage', 'attackSpeed', 'range'], base: 60 },
  gun: { tracks: ['damage', 'magazine', 'fireRate', 'reload'], base: 60 },
  bat: { tracks: ['damage', 'attackSpeed', 'range'], base: 90 },
  rifle: { tracks: ['damage', 'magazine', 'fireRate', 'reload', 'reserve'], base: 120 },
  flame: { tracks: ['damage', 'range', 'tank'], base: 150 },
};

export function upgradeCost(weapon: WeaponId, upgrade: UpgradeId, currentLevel: number): number | null {
  const u = UPGRADES[upgrade];
  if (currentLevel >= u.levels) return null;
  return Math.round((WEAPON_UPGRADES[weapon].base * u.costs[currentLevel]) / 10) * 10;
}

// ---------------------------------------------------------------------------------------------
// Skills: permanent character improvements
// ---------------------------------------------------------------------------------------------

export type SkillId = 'health' | 'armor' | 'damage' | 'speed' | 'reload';

export interface SkillDef {
  name: string;
  description: string;
  icon: string;
  perLevel: string;
  levels: number;
  costs: number[];
}

const SKILL_COSTS = [100, 200, 350, 550, 800];

export const SKILL_ORDER: SkillId[] = ['health', 'armor', 'damage', 'speed', 'reload'];

export const SKILLS: Record<SkillId, SkillDef> = {
  health: { name: 'Vida', description: 'Aumenta tu vida máxima.', icon: 'skills/0001', perLevel: '+15 vida máxima', levels: 5, costs: SKILL_COSTS },
  armor: { name: 'Blindaje', description: 'Empiezas cada nivel con armadura.', icon: 'skills/0000', perLevel: '+20 armadura inicial', levels: 5, costs: SKILL_COSTS },
  damage: { name: 'Fuerza', description: 'Todas tus armas hacen más daño.', icon: 'skills/0002', perLevel: '+8% daño', levels: 5, costs: SKILL_COSTS },
  speed: { name: 'Agilidad', description: 'Te mueves más rápido.', icon: 'skills/0003', perLevel: '+5% velocidad', levels: 5, costs: SKILL_COSTS },
  reload: { name: 'Destreza', description: 'Recargas más rápido.', icon: 'skills/0004', perLevel: '-8% tiempo de recarga', levels: 5, costs: SKILL_COSTS },
};

export function skillCost(skill: SkillId, currentLevel: number): number | null {
  const s = SKILLS[skill];
  return currentLevel >= s.levels ? null : s.costs[currentLevel];
}

// ---------------------------------------------------------------------------------------------
// Effective loadout for a run
// ---------------------------------------------------------------------------------------------

export interface Progress {
  owned: WeaponId[];
  upgrades: Partial<Record<WeaponId, Partial<Record<UpgradeId, number>>>>;
  skills: Partial<Record<SkillId, number>>;
}

export interface Loadout {
  owned: WeaponId[];
  /** weapon stats with upgrades and skills applied */
  weapons: Record<WeaponId, WeaponDef>;
  maxHp: number;
  startArmor: number;
  speedMultiplier: number;
  damageMultiplier: number;
}

export function computeLoadout(p: Progress): Loadout {
  const sk = (id: SkillId) => p.skills[id] ?? 0;
  const reloadSkill = 1 - 0.08 * sk('reload');
  const weapons = {} as Record<WeaponId, WeaponDef>;
  for (const id of WEAPON_ORDER) {
    const lv = (u: UpgradeId) => p.upgrades[id]?.[u] ?? 0;
    const base = WEAPONS[id];
    switch (base.kind) {
      case 'melee':
        weapons[id] = {
          ...base,
          damage: base.damage * (1 + 0.15 * lv('damage')),
          cooldown: base.cooldown / (1 + 0.12 * lv('attackSpeed')),
          range: base.range * (1 + 0.12 * lv('range')),
        };
        break;
      case 'gun': {
        const reserveMul = 1 + 0.4 * lv('reserve');
        weapons[id] = {
          ...base,
          damage: base.damage * (1 + 0.15 * lv('damage')),
          magazine: Math.round(base.magazine * (1 + 0.25 * lv('magazine'))),
          cooldown: base.cooldown / (1 + 0.12 * lv('fireRate')),
          reload: base.reload * (1 - 0.15 * lv('reload')) * reloadSkill,
          reserve: base.reserve * reserveMul,
          maxReserve: base.maxReserve * reserveMul,
        };
        break;
      }
      case 'flame':
        weapons[id] = {
          ...base,
          dps: base.dps * (1 + 0.15 * lv('damage')),
          burnDps: base.burnDps * (1 + 0.15 * lv('damage')),
          range: base.range * (1 + 0.12 * lv('range')),
          fuel: base.fuel * (1 + 0.3 * lv('tank')),
        };
        break;
    }
  }
  return {
    owned: WEAPON_ORDER.filter((w) => p.owned.includes(w)),
    weapons,
    maxHp: PLAYER.maxHp + 15 * sk('health'),
    startArmor: 20 * sk('armor'),
    speedMultiplier: 1 + 0.05 * sk('speed'),
    damageMultiplier: 1 + 0.08 * sk('damage'),
  };
}
