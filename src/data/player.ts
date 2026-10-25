export type CharacterId = 'man' | 'girl';

/** Characters differ only in looks: same stats, same hitbox. */
export const CHARACTERS: Record<CharacterId, { name: string; portrait: string; shadow: string }> = {
  man: { name: 'Hombre', portrait: 'icons/man_icon', shadow: 'shadow/man' },
  girl: { name: 'Mujer', portrait: 'icons/girl_icon', shadow: 'shadow/girl' },
};

export const PLAYER = {
  /** physics circle radius, px */
  radius: 28,
  /** px/s */
  walkSpeed: 260,
  sprintMultiplier: 1.45,
  /** velocity smoothing, 1/s (higher = snappier) */
  acceleration: 14,
  /** gamepad aim turn rate, rad/s */
  padTurnSpeed: 16,
  maxHp: 100,
  maxArmor: 100,
  /** fraction of each hit absorbed by armor while it lasts */
  armorAbsorb: 0.6,
  /** invulnerability after being hit, ms */
  invulnerableMs: 450,
  /** knockback received is multiplied by this */
  knockbackTaken: 0.5,
};

export const CAMERA = {
  /** follow smoothing (0..1 per frame at 60fps) */
  lerp: 0.12,
  /** max look-ahead towards the aim, px */
  lookAhead: 190,
  /** fraction of the mouse distance used as look-ahead */
  mouseLookFactor: 0.28,
};
