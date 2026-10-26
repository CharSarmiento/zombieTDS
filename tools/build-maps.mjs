// Map generator: writes Tiled JSON maps (public/maps/<id>.json) from small layout scripts.
// The output opens and edits normally in Tiled; once a map was edited by hand, the generator
// leaves it alone unless run with --force.
//
//   npm run maps              generate missing maps
//   npm run maps -- --force   regenerate all (overwrites manual edits!)
//
// Requires `npm run assets` first (reads the atlas manifest and tools/props-ids.json).

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const T = 100; // tile size
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/atlases/manifest.json'), 'utf8'));
const propIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/props-ids.json'), 'utf8'));
const envAtlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/atlases/env.json'), 'utf8'));
const frameSize = {};
for (const t of envAtlas.textures) for (const f of t.frames) frameSize[f.filename] = { w: f.sourceSize.w, h: f.sourceSize.h };

const GROUND_FIRSTGID = 1;
const PROPS_FIRSTGID = GROUND_FIRSTGID + manifest.tileset.count;

/** Wall sets: corners, straight horizontal / vertical variants, thickness (px). */
const WALLS = {
  wood: { tl: 2, tr: 7, bl: 4, br: 9, h: [5, 6], v: [3, 8], t: 29 },
  plank: { tl: 16, tr: 13, bl: 14, br: 11, h: [17, 18], v: [12, 15], t: 29 },
  block: { tl: 21, tr: 27, bl: 24, br: 29, h: [25, 26], v: [22, 28], t: 30 },
  stone: { tl: 38, tr: 35, bl: 36, br: 34, h: [31, 32], v: [33, 37], t: 27 },
  brick: { tl: 40, tr: 45, bl: 44, br: 47, h: [48, 49], v: [43, 46], t: 32 },
};
const wf = (n) => `walls/${String(n).padStart(4, '0')}`;

class MapBuilder {
  constructor(id, cols, rows) {
    this.id = id;
    this.cols = cols;
    this.rows = rows;
    this.ground = new Array(cols * rows).fill(this.tile('grass/00'));
    this.layers = { decals: [], props: [], markers: [] };
    this.nextId = 1;
    this.seed = 1234;
  }

  rand() {
    // deterministic, so regenerating gives the same map
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  tile(name) {
    const i = manifest.tileset.names.indexOf(name);
    if (i < 0) throw new Error(`unknown tile ${name}`);
    return GROUND_FIRSTGID + i;
  }

  fill(name, c0 = 0, r0 = 0, w = this.cols, h = this.rows) {
    const gid = this.tile(name);
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) this.ground[r * this.cols + c] = gid;
  }

  /** Horizontal road with curbs on both edges; `skip` = column ranges left without curb (crossings). */
  roadH(r0, h, skip = []) {
    this.fill('asphalt/12', 0, r0, this.cols, h);
    for (let c = 0; c < this.cols; c++) {
      if (skip.some(([a, b]) => c >= a && c <= b)) continue;
      this.fill('asphalt/01', c, r0, 1, 1);
      this.fill('asphalt/02', c, r0 + h - 1, 1, 1);
    }
  }

  roadV(c0, w, skip = []) {
    this.fill('asphalt/12', c0, 0, w, this.rows);
    for (let r = 0; r < this.rows; r++) {
      if (skip.some(([a, b]) => r >= a && r <= b)) continue;
      this.fill('asphalt/04', c0, r, 1, 1);
      this.fill('asphalt/03', c0 + w - 1, r, 1, 1);
    }
  }

  /** Places a frame centred at (cx, cy), rotation in degrees (clockwise, like Tiled). */
  place(layer, frame, cx, cy, rotation = 0) {
    const size = frameSize[frame];
    if (!size || !(frame in propIds)) throw new Error(`unknown prop ${frame}`);
    // Tiled tile objects are anchored at their bottom-left corner and rotate around it
    const a = (rotation * Math.PI) / 180;
    const ox = -size.w / 2, oy = size.h / 2;
    const x = cx + ox * Math.cos(a) - oy * Math.sin(a);
    const y = cy + ox * Math.sin(a) + oy * Math.cos(a);
    this.layers[layer].push({
      id: this.nextId++, gid: PROPS_FIRSTGID + propIds[frame], name: '', type: '',
      x: +x.toFixed(2), y: +y.toFixed(2), width: size.w, height: size.h, rotation, visible: true,
    });
  }

  prop(frame, cx, cy, rotation = 0) {
    this.place('props', frame, cx, cy, rotation);
  }

  decal(frame, cx, cy, rotation = 0) {
    this.place('decals', frame, cx, cy, rotation);
  }

  marker(name, x, y) {
    this.layers.markers.push({ id: this.nextId++, name, type: '', point: true, x, y, width: 0, height: 0, rotation: 0, visible: true });
  }

  area(name, x, y, width, height) {
    this.layers.markers.push({ id: this.nextId++, name, type: '', x, y, width, height, rotation: 0, visible: true });
  }

  /**
   * Rectangular building on tile cells [c0..c0+w-1] x [r0..r0+h-1] with walls on the cell borders.
   * doors: { side: 'top'|'bottom'|'left'|'right', at: offset along the side, len: cells }.
   */
  building(c0, r0, w, h, set, doors = [], floor = 'asphalt/12') {
    const S = WALLS[set];
    this.fill(floor, c0, r0, w, h);
    const isDoor = (side, i) => doors.some((d) => d.side === side && i >= d.at && i < d.at + (d.len ?? 2));
    const pick = (list, i) => wf(list[i % list.length]);
    const c1 = c0 + w - 1, r1 = r0 + h - 1;
    const cell = (c, r) => ({ x: (c + 0.5) * T, y: (r + 0.5) * T });
    // corners occupy their whole cell
    for (const [key, c, r] of [['tl', c0, r0], ['tr', c1, r0], ['bl', c0, r1], ['br', c1, r1]]) {
      const p = cell(c, r);
      this.prop(wf(S[key]), p.x, p.y);
    }
    for (let i = 1; i < w - 1; i++) {
      const c = c0 + i;
      if (!isDoor('top', i)) this.prop(pick(S.h, i), (c + 0.5) * T, r0 * T + S.t / 2);
      if (!isDoor('bottom', i)) this.prop(pick(S.h, i + 1), (c + 0.5) * T, (r1 + 1) * T - S.t / 2);
    }
    for (let i = 1; i < h - 1; i++) {
      const r = r0 + i;
      if (!isDoor('left', i)) this.prop(pick(S.v, i), c0 * T + S.t / 2, (r + 0.5) * T);
      if (!isDoor('right', i)) this.prop(pick(S.v, i + 1), (c1 + 1) * T - S.t / 2, (r + 0.5) * T);
    }
  }

  /** Scatters decals of the given prefixes inside a pixel rectangle. */
  scatter(prefixes, n, x, y, w, h) {
    const frames = Object.keys(propIds).filter((f) => prefixes.some((p) => f.startsWith(p + '/')));
    for (let i = 0; i < n; i++) {
      const f = frames[Math.floor(this.rand() * frames.length)];
      this.decal(f, x + this.rand() * w, y + this.rand() * h, Math.round(this.rand() * 360));
    }
  }

  toJSON() {
    const layer = (id, name, objects) => ({ id, name, type: 'objectgroup', draworder: 'topdown', objects, opacity: 1, visible: true, x: 0, y: 0 });
    return {
      type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
      compressionlevel: -1, infinite: false, width: this.cols, height: this.rows, tilewidth: T, tileheight: T,
      nextlayerid: 5, nextobjectid: this.nextId,
      layers: [
        { id: 1, name: 'ground', type: 'tilelayer', width: this.cols, height: this.rows, x: 0, y: 0, opacity: 1, visible: true, data: this.ground },
        layer(2, 'decals', this.layers.decals),
        layer(3, 'props', this.layers.props),
        layer(4, 'markers', this.layers.markers),
      ],
      tilesets: [
        {
          firstgid: GROUND_FIRSTGID, name: 'ground', image: '../tilesets/ground.png',
          imagewidth: manifest.tileset.columns * (T + manifest.tileset.spacing),
          imageheight: Math.ceil(manifest.tileset.count / manifest.tileset.columns) * (T + manifest.tileset.spacing),
          tilewidth: T, tileheight: T, margin: manifest.tileset.margin, spacing: manifest.tileset.spacing,
          columns: manifest.tileset.columns, tilecount: manifest.tileset.count,
        },
        { firstgid: PROPS_FIRSTGID, source: '../tilesets/props.tsj' },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

const o = (n) => `outside/${String(n).padStart(4, '0')}`;
const hs = (n) => `house/${String(n).padStart(4, '0')}`;

const LEVELS = {
  /** Level 1 · Suburbio: crossroads, two houses, a shed, wrecks and barrels. */
  level01() {
    const m = new MapBuilder('level01', 48, 36);
    m.fill('grass/00');
    m.roadH(16, 4, [[30, 33]]);
    m.roadV(30, 4, [[16, 19]]);

    // yards
    m.fill('ground/12', 15, 23, 13, 10);

    // house A (brick): living room + bedroom, door to the road
    m.building(4, 4, 11, 8, 'brick', [{ side: 'bottom', at: 4, len: 2 }, { side: 'left', at: 3, len: 2 }]);
    m.prop(hs(1), 650, 560); m.prop(hs(45), 650, 760); m.prop(hs(28), 520, 760); m.prop(hs(30), 790, 760);
    m.prop(hs(34), 1250, 620); m.prop(hs(54), 1380, 1050); m.prop(hs(58), 1000, 470); m.prop(hs(24), 1100, 950);

    // house B (wooden planks): kitchen and storage, doors to the yard
    m.building(17, 24, 9, 7, 'plank', [{ side: 'top', at: 3, len: 2 }, { side: 'right', at: 2, len: 2 }]);
    m.prop(hs(51), 2000, 2750); m.prop(hs(26), 1880, 2750); m.prop(hs(27), 2120, 2750);
    m.prop(hs(40), 2300, 2950, 90); m.prop(o(12), 1850, 2550); m.prop(o(14), 1830, 2950);

    // shed (stone) with a red barrel inside
    m.building(38, 4, 6, 5, 'stone', [{ side: 'left', at: 2, len: 1 }]);
    m.prop(o(13), 4150, 650); m.prop(o(12), 4250, 650); m.prop(hs(59), 4100, 470);

    // wrecks and barrels on the roads
    m.prop(o(16), 1300, 1790); m.prop(o(17), 2550, 1720, 12); m.prop(o(18), 3200, 900, 90);
    m.prop(o(19), 3170, 2850, -78); m.prop(o(13), 1700, 1650); m.prop(o(15), 2850, 1950);
    m.prop(o(13), 3420, 1400); m.prop(o(12), 3480, 1460); m.prop(o(14), 760, 1980);

    // nature
    for (const [f, x, y] of [[9, 450, 2400], [10, 1250, 3100], [11, 3900, 2600], [9, 4400, 1150], [10, 2300, 600], [11, 4550, 3200], [9, 3800, 3300], [10, 250, 1300]]) m.prop(o(f), x, y);
    for (const [f, x, y] of [[6, 2050, 1150], [7, 3700, 1150], [8, 900, 2900], [6, 4300, 2100], [7, 2700, 3300], [8, 3550, 600]]) m.prop(o(f), x, y);
    for (const [f, x, y] of [[0, 1600, 2300], [1, 3650, 2350], [2, 4350, 1500], [3, 2700, 2500], [4, 600, 3300], [5, 3950, 1050]]) m.prop(o(f), x, y);

    // ground detail
    m.scatter(['crack_asphalt'], 18, 0, 1620, 4800, 360);
    m.scatter(['crack_asphalt'], 10, 3020, 0, 360, 3600);
    m.scatter(['leaf', 'crack_ground'], 90, 0, 0, 4800, 1550);
    m.scatter(['leaf', 'crack_ground'], 90, 0, 2050, 4800, 1550);

    m.marker('player', 2300, 1800);
    for (const [x, y] of [[100, 1800], [4700, 1800], [3200, 100], [3200, 3500], [150, 250], [150, 3400], [4650, 250], [4650, 3400], [2000, 3500], [1500, 120], [4000, 1500], [600, 1500]]) m.marker('spawn', x, y);
    m.area('exit', 4600, 1620, 200, 360);
    return m;
  },
};

/** Open plaza for boss fights: wide space to dodge, scattered cover and explosive barrels. */
LEVELS.arena = () => {
  const m = new MapBuilder('arena', 44, 32);
  m.seed = 77;
  m.fill('ground/12');
  m.fill('asphalt/12', 6, 5, 32, 22);
  m.fill('grass/00', 0, 0, 44, 3);
  m.fill('grass/00', 0, 29, 44, 3);
  // cover: wrecks around the plaza, barrels between them
  m.prop(o(16), 1100, 900, 20); m.prop(o(17), 3300, 950, -15); m.prop(o(18), 1050, 2300, 80);
  m.prop(o(19), 3350, 2250, -70); m.prop('outside/tank', 2200, 600, 90);
  for (const [x, y] of [[1500, 1300], [2900, 1300], [1500, 1950], [2900, 1950], [2200, 2500]]) m.prop(o(13), x, y);
  for (const [x, y] of [[1560, 1340], [2840, 1960], [700, 1600], [3700, 1600]]) m.prop(o(12), x, y);
  for (const [f, x, y] of [[0, 700, 700], [1, 3700, 700], [2, 700, 2600], [0, 3700, 2600]]) m.prop(o(f), x, y);
  for (const [f, x, y] of [[9, 250, 150], [10, 4150, 200], [11, 250, 3050], [9, 4150, 3000], [10, 2200, 3100]]) m.prop(o(f), x, y);
  m.scatter(['crack_asphalt'], 40, 650, 550, 3150, 2150);
  m.scatter(['water_spot'], 14, 650, 550, 3150, 2150);
  m.scatter(['leaf', 'crack_ground'], 60, 0, 0, 4400, 3200);
  m.marker('player', 2200, 2350);
  m.marker('boss', 2200, 1000);
  for (const [x, y] of [[100, 1600], [4300, 1600], [2200, 80], [2200, 3120], [150, 150], [4250, 150], [150, 3050], [4250, 3050]]) m.marker('spawn', x, y);
  return m;
};

const force = process.argv.includes('--force');
const outDir = path.join(ROOT, 'public', 'maps');
fs.mkdirSync(outDir, { recursive: true });
for (const [id, build] of Object.entries(LEVELS)) {
  const file = path.join(outDir, `${id}.json`);
  if (fs.existsSync(file) && !force) {
    console.log(`  ${id}: exists, skipped (use --force to overwrite)`);
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(build().toJSON()));
  console.log(`  ${id}: written`);
}
