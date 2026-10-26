/**
 * How each environment frame behaves when placed in a map. Rules match frame names
 * (e.g. "walls/0043", "outside/0013"); the first matching rule wins. Collision is derived
 * from the frame size, so moving or rotating a prop in Tiled moves its collision with it.
 */
export interface PropRule {
  /** collision shape; omitted = walk-through */
  solid?: 'box' | 'circle' | 'corner';
  /** box: fraction of the image used as collider (centred) */
  inset?: number;
  /** circle: radius as a fraction of half the smaller image side */
  radius?: number;
  /** corner pieces: which corner the L-shape occupies, and the wall thickness (px) */
  corner?: 'tl' | 'tr' | 'bl' | 'br';
  thickness?: number;
  /** bullets fly over it (furniture, low cover) */
  low?: boolean;
  /** drawn above actors (tree canopies, bushes) */
  overhead?: boolean;
  /** red barrels: can be shot and explode */
  explosive?: boolean;
  /** flat on the ground under everything */
  decal?: boolean;
  /** casts a soft drop shadow */
  shadow?: boolean;
}

const ids = (prefix: string, nums: number[]) => nums.map((n) => `${prefix}/${String(n).padStart(4, '0')}`);

/** Wall sets: corner frames by orientation, wall thickness in px at game scale. */
const WALL_CORNERS: [string[], PropRule['corner']][] = [
  [ids('walls', [2, 16, 21, 38, 40]), 'tl'],
  [ids('walls', [7, 13, 27, 35, 45]), 'tr'],
  [ids('walls', [4, 14, 24, 36, 44]), 'bl'],
  [ids('walls', [9, 11, 29, 34, 47]), 'br'],
];
const WALL_THICKNESS: Record<string, number> = {
  ...Object.fromEntries(ids('walls', [2, 4, 7, 9]).map((f) => [f, 29])),
  ...Object.fromEntries(ids('walls', [11, 13, 14, 16]).map((f) => [f, 29])),
  ...Object.fromEntries(ids('walls', [21, 24, 27, 29]).map((f) => [f, 30])),
  ...Object.fromEntries(ids('walls', [34, 35, 36, 38]).map((f) => [f, 27])),
  ...Object.fromEntries(ids('walls', [40, 44, 45, 47]).map((f) => [f, 32])),
};

const RULES: [RegExp | string[], PropRule][] = [
  // walls: corners as L-shapes, straight pieces and door posts as full boxes, floor slabs flat
  ...WALL_CORNERS.map(([frames, corner]): [string[], PropRule] => [frames, { solid: 'corner', corner }]),
  [ids('walls', [10, 30, 50]), {}],
  [ids('walls', [39, 42, 51]), { decal: true }],
  [/^walls\//, { solid: 'box', inset: 1 }],
  // outdoors
  [ids('outside', [0, 1, 2]), { solid: 'circle', radius: 0.8, shadow: true }], // rocks
  [ids('outside', [3]), { solid: 'circle', radius: 0.55, shadow: true }], // stump
  [ids('outside', [4, 5]), { solid: 'box', inset: 0.7, shadow: true }], // logs
  [ids('outside', [6, 7, 8]), { overhead: true }], // bushes: hide you, do not block
  [ids('outside', [9, 10, 11]), { solid: 'circle', radius: 0.12, overhead: true }], // trees: trunk only
  [ids('outside', [13, 15]), { solid: 'circle', radius: 0.9, explosive: true, shadow: true }], // red barrels
  [ids('outside', [12, 14]), { solid: 'circle', radius: 0.9, shadow: true }], // wooden barrels
  [/^outside\/00(1[6-9])$/, { solid: 'box', inset: 0.8, shadow: true }], // car wrecks
  [/^outside\/helicopter$/, { solid: 'box', inset: 0.55, shadow: true }],
  [/^outside\/tank$/, { solid: 'box', inset: 0.75, shadow: true }],
  [/^veh_[a-z_]+\/shadow$/, { decal: true }],
  [/^veh_/, { solid: 'box', inset: 0.8, shadow: true }],
  // indoors: furniture blocks walking but not bullets
  [ids('house', [54, 55, 56, 57]), { solid: 'circle', radius: 0.6, low: true, shadow: true }], // plants
  [/^house\//, { solid: 'box', inset: 0.85, low: true, shadow: true }],
  // flat details
  [/^(crack_asphalt|crack_ground|leaf|water_spot|house_shadow|outside_shadow)\//, { decal: true }],
];

const cache = new Map<string, PropRule>();

export function propRule(frame: string): PropRule {
  let rule = cache.get(frame);
  if (!rule) {
    const found = RULES.find(([m]) => (Array.isArray(m) ? m.includes(frame) : m.test(frame)));
    rule = { ...(found?.[1] ?? {}) };
    if (rule.solid === 'corner') rule.thickness = WALL_THICKNESS[frame] ?? 30;
    cache.set(frame, rule);
  }
  return rule;
}
