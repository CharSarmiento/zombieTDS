export type WeaponId = 'knife' | 'gun' | 'bat' | 'rifle' | 'flame';

/** Slot order: keys 1-5, wheel and LB/RB cycle through this list. */
export const WEAPON_ORDER: WeaponId[] = ['knife', 'gun', 'bat', 'rifle', 'flame'];

/** `anim` is the suffix of the character animations (walk_<anim>, attack_<anim>). Combat stats arrive in M3. */
export const WEAPONS: Record<WeaponId, { name: string; anim: string; icon: string }> = {
  knife: { name: 'Cuchillo', anim: 'knife', icon: 'items/0015_knife' },
  gun: { name: 'Pistola', anim: 'gun', icon: 'items/0014_gun' },
  bat: { name: 'Bate', anim: 'bat', icon: 'items/0002_bat' },
  rifle: { name: 'Rifle', anim: 'rifle', icon: 'items/0000_gun' },
  flame: { name: 'Lanzallamas', anim: 'flame', icon: 'items/0001_fire' },
};
