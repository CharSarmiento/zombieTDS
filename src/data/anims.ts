/** Playback settings per animation. Keys match by the animation name (after the entity), or full key. */
interface AnimSettings {
  fps: number;
  repeat: number;
}

const BY_NAME: Record<string, AnimSettings> = {
  walk: { fps: 12, repeat: -1 },
  attack: { fps: 15, repeat: 0 },
  death: { fps: 10, repeat: 0 },
};

const BY_KEY: Record<string, AnimSettings> = {
  'fx/explosion': { fps: 18, repeat: 0 },
  'fx/flame': { fps: 20, repeat: -1 },
  'man/attack_rifle': { fps: 24, repeat: 0 },
  'girl/attack_rifle': { fps: 24, repeat: 0 },
  'man/attack_flame': { fps: 20, repeat: -1 },
  'girl/attack_flame': { fps: 20, repeat: -1 },
  'megaboss/death': { fps: 8, repeat: 0 },
};

export function animSettings(key: string): AnimSettings {
  if (BY_KEY[key]) return BY_KEY[key];
  const name = key.split('/')[1] ?? '';
  const family = Object.keys(BY_NAME).find((n) => name.startsWith(n));
  return family ? BY_NAME[family] : { fps: 12, repeat: 0 };
}
