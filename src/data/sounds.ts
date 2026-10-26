/**
 * Every sound the game can play. A file assets/audio/<key>.ogg (or <key>_1.ogg, <key>_2.ogg… for
 * random variants) is picked up by `npm run assets`; keys without files stay silent.
 * See AUDIO.md for the descriptions handed to whoever provides the sounds.
 */
export interface SoundDef {
  /** relative volume (0..1) before the player's sfx/music volume */
  volume: number;
  /** minimum ms between two plays of this key (bursts: rifle fire, hits) */
  throttle?: number;
  /** random pitch variation, ± fraction (0.08 = ±8%) */
  pitch?: number;
}

export const MUSIC = {
  music_menu: { volume: 0.7 },
  music_level: { volume: 0.55 },
  music_boss: { volume: 0.65 },
} satisfies Record<string, SoundDef>;

export const SFX = {
  // weapons
  gun_shot: { volume: 0.55, pitch: 0.06 },
  rifle_shot: { volume: 0.45, throttle: 60, pitch: 0.06 },
  flame_loop: { volume: 0.5 },
  knife_swing: { volume: 0.5, pitch: 0.1 },
  bat_swing: { volume: 0.6, pitch: 0.08 },
  melee_hit: { volume: 0.6, throttle: 60, pitch: 0.1 },
  reload: { volume: 0.55 },
  empty_click: { volume: 0.5, throttle: 200 },
  weapon_switch: { volume: 0.4 },
  bullet_hit: { volume: 0.35, throttle: 40, pitch: 0.12 },
  bullet_wall: { volume: 0.3, throttle: 60, pitch: 0.12 },
  // zombies
  zombie_groan: { volume: 0.35, pitch: 0.12 },
  zombie_attack: { volume: 0.45, throttle: 150, pitch: 0.1 },
  zombie_death: { volume: 0.5, throttle: 80, pitch: 0.12 },
  elite_roar: { volume: 0.7, pitch: 0.05 },
  boss_roar: { volume: 0.9 },
  boss_attack: { volume: 0.75, pitch: 0.05 },
  boss_slam: { volume: 0.85, pitch: 0.05 },
  fire_breath: { volume: 0.75 },
  boss_death: { volume: 1 },
  // player
  player_hurt: { volume: 0.6, throttle: 250, pitch: 0.06 },
  player_death: { volume: 0.8 },
  footstep: { volume: 0.25, throttle: 320, pitch: 0.1 },
  // world
  explosion: { volume: 0.9, pitch: 0.08 },
  pickup_money: { volume: 0.45, throttle: 50, pitch: 0.08 },
  pickup_item: { volume: 0.55 },
  powerup: { volume: 0.65 },
  // flow and UI
  wave_start: { volume: 0.7 },
  wave_clear: { volume: 0.7 },
  level_complete: { volume: 0.8 },
  game_over: { volume: 0.8 },
  ui_move: { volume: 0.35, throttle: 40 },
  ui_select: { volume: 0.5 },
  ui_buy: { volume: 0.6 },
  ui_error: { volume: 0.5 },
} satisfies Record<string, SoundDef>;

export type MusicKey = keyof typeof MUSIC;
export type SfxKey = keyof typeof SFX;
