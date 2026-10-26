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
    /** overlay tile layer (water); 0 = empty */
    this.water = new Array(cols * rows).fill(0);
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

  /**
   * Deep water on tile cells, drawn on its own layer over the ground (shore tiles are transparent
   * outside the water): 9-slice of the pack's water tiles. Impassable (block marker slightly
   * inside the shore); bullets fly over it.
   */
  pond(c0, r0, w, h) {
    const tile = (r, c) => {
      const top = r === r0, bottom = r === r0 + h - 1, left = c === c0, right = c === c0 + w - 1;
      if (top) return left ? 'water/00' : right ? 'water/02' : 'water/01';
      if (bottom) return left ? 'water/04' : right ? 'water/08' : 'water/06';
      return left ? 'water/03' : right ? 'water/07' : 'water/05';
    };
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) this.water[r * this.cols + c] = this.tile(tile(r, c));
    this.area('block', c0 * T + 45, r0 * T + 45, w * T - 90, h * T - 90);
    // reeds and leaves soften the square edge
    for (let i = 0; i < (w + h) * 2; i++) {
      const edge = this.rand() < 0.5;
      const x = edge ? (c0 + this.rand() * w) * T : (this.rand() < 0.5 ? c0 : c0 + w) * T;
      const y = edge ? (this.rand() < 0.5 ? r0 : r0 + h) * T : (r0 + this.rand() * h) * T;
      this.decal(this.rand() < 0.5 ? 'leaf/0003' : 'leaf/0006', x, y, Math.round(this.rand() * 360));
    }
  }

  /** Free-standing straight wall from cell (c, r) over `n` cells; `gaps` = cell offsets left open. */
  wallLine(set, c, r, n, horizontal, gaps = []) {
    const S = WALLS[set];
    for (let i = 0; i < n; i++) {
      if (gaps.includes(i)) continue;
      if (horizontal) this.prop(wf(S.h[i % 2]), (c + i + 0.5) * T, r * T + S.t / 2);
      else this.prop(wf(S.v[i % 2]), c * T + S.t / 2, (r + i + 0.5) * T);
    }
  }

  /** Props from [frame, x, y, rotation?] tuples. */
  props(list) {
    for (const [f, x, y, rot = 0] of list) this.prop(f, x, y, rot);
  }

  /** Spawn markers along the map border (every `step` px), skipping blocked corners is up to the map. */
  borderSpawns(step = 900) {
    const W = this.cols * T, H = this.rows * T;
    for (let x = step / 2; x < W; x += step) { this.marker('spawn', x, 80); this.marker('spawn', x, H - 80); }
    for (let y = step / 2; y < H; y += step) { this.marker('spawn', 80, y); this.marker('spawn', W - 80, y); }
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
      nextlayerid: 6, nextobjectid: this.nextId,
      layers: [
        { id: 1, name: 'ground', type: 'tilelayer', width: this.cols, height: this.rows, x: 0, y: 0, opacity: 1, visible: true, data: this.ground },
        ...(this.water.some((g) => g) ? [{ id: 5, name: 'water', type: 'tilelayer', width: this.cols, height: this.rows, x: 0, y: 0, opacity: 1, visible: true, data: this.water }] : []),
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

const car = (n) => `veh_car/${String(n).padStart(4, '0')}`;
const pickup = (n) => `veh_pickup/${String(n).padStart(4, '0')}`;
const armored = (n) => `veh_armored_car/${String(n).padStart(4, '0')}`;
const ctank = (n) => `veh_compact_tank/${String(n).padStart(4, '0')}`;
const tank = (n) => `veh_tank/${String(n).padStart(4, '0')}`;
const trees = (m, list) => m.props(list.map(([x, y], i) => [o(9 + (i % 3)), x, y]));
const bushes = (m, list) => m.props(list.map(([x, y], i) => [o(6 + (i % 3)), x, y]));

/** Level 2 · Parque: open park with a pond and paths, wooden houses on the east side. */
LEVELS.level02 = () => {
  const m = new MapBuilder('level02', 48, 36);
  m.seed = 202;
  m.fill('grass/00');
  m.roadV(3, 4);
  // dirt paths crossing the park
  m.fill('ground/12', 7, 17, 26, 2);
  m.fill('ground/12', 19, 4, 2, 28);
  m.pond(22, 8, 7, 5);
  m.pond(10, 23, 5, 4);
  // wooden houses
  m.building(35, 3, 9, 7, 'wood', [{ side: 'left', at: 2, len: 2 }, { side: 'bottom', at: 4, len: 2 }]);
  m.building(35, 14, 9, 7, 'plank', [{ side: 'left', at: 3, len: 2 }]);
  m.building(35, 25, 9, 8, 'wood', [{ side: 'top', at: 3, len: 2 }, { side: 'left', at: 4, len: 2 }]);
  m.props([[hs(1), 3900, 500], [hs(28), 4100, 800], [hs(45), 3800, 800], [hs(51), 4000, 1700], [hs(26), 3800, 1950], [hs(34), 4200, 2800], [hs(54), 3700, 3100]]);
  trees(m, [[900, 600], [1500, 400], [1300, 1200], [2700, 600], [3200, 1500], [1000, 2100], [2500, 2300], [3100, 2700], [1700, 3100], [2400, 3300], [800, 3300], [3200, 400]]);
  bushes(m, [[1600, 900], [2300, 1450], [2900, 1950], [1250, 1550], [1800, 2650], [3300, 3200], [2150, 750]]);
  m.props([[o(4), 1500, 2000, 30], [o(5), 2650, 1300, -20], [o(0), 3100, 1000], [o(1), 1100, 2700], [o(13), 2050, 2050], [o(13), 3300, 2300], [o(12), 3350, 2350], [car(2), 550, 1100, 90], [car(4), 550, 2600, 85]]);
  m.scatter(['leaf', 'crack_ground'], 140, 700, 0, 4100, 3600);
  m.scatter(['crack_asphalt'], 14, 300, 0, 400, 3600);
  m.marker('player', 550, 3300);
  m.borderSpawns();
  m.area('exit', 4500, 3300, 300, 300);
  return m;
};

/** Level 3 · Comisaría: police station (lobby + offices) over a parking lot full of cars. */
LEVELS.level03 = () => {
  const m = new MapBuilder('level03', 50, 38);
  m.seed = 303;
  m.fill('ground/12');
  m.fill('asphalt/12', 0, 21, 50, 17);
  m.roadH(33, 4);
  // station: lobby and offices share a wall (two buildings side by side)
  m.building(6, 4, 17, 12, 'block', [{ side: 'bottom', at: 7, len: 3 }, { side: 'right', at: 4, len: 2 }]);
  m.building(23, 4, 15, 12, 'block', [{ side: 'bottom', at: 6, len: 2 }]);
  m.props([[hs(41), 1100, 700], [hs(42), 1500, 700], [hs(24), 1300, 1100], [hs(30), 900, 1300], [hs(31), 1900, 1300], [hs(40), 2700, 700], [hs(35), 3200, 700], [hs(36), 3500, 1100], [hs(25), 3000, 1300], [hs(55), 2400, 1450], [hs(57), 700, 500]]);
  // parking lot rows
  const rows = [[2300, 0], [2800, 0]];
  for (const [y] of rows) for (let x = 700; x < 4700; x += 620) m.prop(m.rand() < 0.35 ? pickup(1 + Math.floor(m.rand() * 3)) : car(1 + Math.floor(m.rand() * 4)), x, y, 90 + Math.round((m.rand() - 0.5) * 16));
  m.props([[armored(2), 4300, 1300, 0], [car(4), 4400, 600, 40], [o(13), 2350, 1900], [o(13), 4000, 2550], [o(15), 1200, 2550], [o(12), 1250, 2600], [o(14), 4050, 2600]]);
  trees(m, [[4600, 2000], [300, 1900], [4600, 400]]);
  m.scatter(['crack_asphalt'], 50, 0, 2100, 5000, 1700);
  m.scatter(['crack_ground', 'leaf'], 60, 0, 0, 5000, 2000);
  m.marker('player', 2400, 3100);
  m.borderSpawns();
  m.area('exit', 1200, 650, 400, 300); // the evidence room, deep inside the station
  return m;
};

/** Level 4 · Checkpoint militar: highway blocked by a walled checkpoint, armour everywhere. */
LEVELS.level04 = () => {
  const m = new MapBuilder('level04', 52, 36);
  m.seed = 404;
  m.fill('ground/12');
  m.roadH(14, 8);
  // checkpoint walls across the highway, with a single lane open, and side bunkers
  m.wallLine('stone', 24, 3, 11, false);
  m.wallLine('stone', 24, 14, 8, false, [3, 4]);
  m.wallLine('stone', 24, 22, 11, false);
  m.building(10, 3, 8, 6, 'stone', [{ side: 'bottom', at: 3, len: 2 }]);
  m.building(34, 26, 8, 6, 'stone', [{ side: 'top', at: 3, len: 2 }]);
  m.props([
    [tank(9), 1600, 1650, 0], [tank(12), 3400, 2000, 180], [armored(3), 2100, 2050, 8], [armored(6), 3200, 1550, -5],
    [ctank(2), 4300, 1700, 0], [ctank(4), 900, 2050, 180], [tank(13), 4200, 600, 20], [armored(10), 800, 3000, -30],
    [o(13), 2300, 1500], [o(13), 2700, 2000], [o(15), 2200, 2250], [o(12), 2750, 2050], [o(14), 4400, 1450],
    [hs(59), 1300, 500], [hs(59), 3800, 2900], [o(4), 3000, 900, 90], [o(5), 1800, 2800, 10],
  ]);
  trees(m, [[500, 500], [4900, 400], [600, 3300], [4800, 3200], [3000, 3300]]);
  m.scatter(['crack_asphalt'], 40, 0, 1400, 5200, 800);
  m.scatter(['crack_ground'], 60, 0, 0, 5200, 3600);
  m.marker('player', 600, 1800);
  m.borderSpawns();
  m.area('exit', 4900, 1450, 300, 700);
  return m;
};

/** Level 6 · Pantano: wet ground, several ponds, a fishing shack and fallen logs. */
LEVELS.level06 = () => {
  const m = new MapBuilder('level06', 50, 38);
  m.seed = 606;
  m.fill('ground/12');
  m.fill('grass/00', 0, 0, 50, 8);
  m.fill('grass/00', 0, 30, 50, 8);
  m.pond(8, 10, 8, 6);
  m.pond(22, 16, 10, 6);
  m.pond(36, 9, 6, 8);
  m.pond(34, 24, 9, 4);
  m.pond(10, 25, 6, 4);
  m.building(17, 4, 7, 5, 'plank', [{ side: 'bottom', at: 3, len: 1 }]);
  m.props([[hs(59), 1950, 600], [o(12), 2200, 750], [o(14), 1850, 850]]);
  m.props([[o(4), 2000, 1300, 10], [o(5), 3400, 2000, 70], [o(4), 1500, 2300, -40], [o(5), 4500, 2000, 100], [o(3), 3000, 1100], [o(3), 1200, 3300], [o(0), 2700, 2700], [o(1), 4600, 3400], [o(2), 600, 1900], [o(13), 3200, 2900], [o(13), 1900, 2000], [pickup(4), 4200, 700, 25]]);
  trees(m, [[500, 400], [1500, 500], [2900, 400], [4300, 300], [700, 3500], [2300, 3400], [3800, 3500], [4800, 1500], [300, 2600]]);
  bushes(m, [[1800, 1700], [3300, 1400], [2100, 2400], [4100, 2900], [700, 1200], [3000, 3300], [1200, 900], [4700, 2500]]);
  m.scatter(['water_spot'], 40, 0, 800, 5000, 2200);
  m.scatter(['leaf', 'crack_ground'], 120, 0, 0, 5000, 3800);
  m.marker('player', 400, 1700);
  m.borderSpawns();
  m.area('exit', 4650, 3350, 300, 400);
  return m;
};

/** Level 7 · Ruinas del pueblo: half-collapsed stone houses with many breaches. */
LEVELS.level07 = () => {
  const m = new MapBuilder('level07', 48, 36);
  m.seed = 707;
  m.fill('ground/12');
  m.roadV(22, 4, [[16, 19]]);
  m.roadH(16, 4, [[22, 25]]);
  const ruin = (c, r, w, h, doors) => m.building(c, r, w, h, 'stone', doors, 'ground/12');
  ruin(4, 3, 9, 7, [{ side: 'bottom', at: 2, len: 3 }, { side: 'right', at: 2, len: 2 }]);
  ruin(30, 3, 10, 8, [{ side: 'left', at: 1, len: 3 }, { side: 'bottom', at: 5, len: 3 }]);
  ruin(4, 23, 10, 8, [{ side: 'top', at: 3, len: 3 }, { side: 'right', at: 4, len: 2 }]);
  ruin(31, 23, 9, 9, [{ side: 'top', at: 1, len: 2 }, { side: 'left', at: 3, len: 3 }]);
  // collapsed walls in the open
  m.wallLine('brick', 14, 10, 5, true, [2]);
  m.wallLine('brick', 28, 26, 5, true, [1]);
  m.props([[hs(59), 800, 500], [hs(24), 1000, 700], [hs(28), 3500, 600], [hs(59), 3600, 900], [hs(45), 900, 2700], [hs(31), 3500, 2700], [hs(54), 3800, 3000]]);
  m.props([[car(4), 1700, 1700, 75], [pickup(4), 3100, 1900, -20], [o(13), 2050, 1500], [o(13), 2650, 2100], [o(15), 1400, 1500], [o(12), 2700, 2150], [o(0), 1600, 2700], [o(2), 3000, 1200], [o(1), 4400, 1700]]);
  trees(m, [[300, 1500], [4600, 600], [4600, 3200], [1800, 3400], [2700, 400]]);
  bushes(m, [[1600, 1200], [3100, 2600], [2000, 2900], [4200, 2100]]);
  m.scatter(['crack_ground'], 90, 0, 0, 4800, 3600);
  m.scatter(['crack_asphalt'], 25, 2200, 0, 400, 3600);
  m.marker('player', 2400, 3300);
  m.borderSpawns();
  m.area('exit', 1000, 600, 300, 300);
  return m;
};

/** Level 8 · Horda: city block, four buildings around a crossroads full of wrecks. */
LEVELS.level08 = () => {
  const m = new MapBuilder('level08', 52, 40);
  m.seed = 808;
  m.fill('asphalt/12');
  m.roadH(17, 6, [[23, 28]]);
  m.roadV(23, 6, [[17, 22]]);
  m.building(4, 3, 14, 11, 'brick', [{ side: 'bottom', at: 6, len: 2 }, { side: 'right', at: 4, len: 2 }]);
  m.building(33, 3, 15, 11, 'block', [{ side: 'bottom', at: 3, len: 2 }, { side: 'left', at: 5, len: 2 }]);
  m.building(4, 26, 14, 11, 'block', [{ side: 'top', at: 6, len: 2 }, { side: 'right', at: 5, len: 2 }]);
  m.building(33, 26, 15, 11, 'brick', [{ side: 'top', at: 7, len: 2 }]);
  m.props([[hs(41), 900, 600], [hs(24), 1300, 900], [hs(36), 3800, 700], [hs(42), 4300, 1000], [hs(28), 900, 3100], [hs(30), 1500, 3300], [hs(51), 4000, 3100], [hs(45), 4400, 3400]]);
  m.props([
    [car(4), 1200, 1850, 15], [car(3), 2000, 2200, -10], [pickup(4), 3300, 1800, 160], [car(2), 4300, 2150, 5],
    [armored(4), 2600, 1100, 85], [car(1), 2550, 3100, -80], [car(4), 2700, 1500, 30], [pickup(2), 2250, 2900, 100],
    [o(13), 2400, 2050], [o(13), 2850, 2250], [o(15), 1600, 2300], [o(15), 3700, 2300], [o(13), 2400, 1550], [o(12), 2450, 1600], [o(14), 3650, 1750],
  ]);
  m.scatter(['crack_asphalt'], 120, 0, 0, 5200, 4000);
  m.scatter(['water_spot'], 20, 0, 1500, 5200, 1000);
  m.marker('player', 2600, 2000);
  m.borderSpawns(1000);
  m.area('exit', 2450, 3700, 400, 280);
  return m;
};

/** Level 9 · Base militar: walled compound with barracks, parked armour and a motor pool. */
LEVELS.level09 = () => {
  const m = new MapBuilder('level09', 50, 38);
  m.seed = 909;
  m.fill('ground/12');
  m.fill('asphalt/12', 12, 8, 26, 22); // parade ground
  // perimeter wall with gates
  m.wallLine('stone', 6, 4, 38, true, [18, 19, 20]);
  m.wallLine('stone', 6, 33, 38, true, [18, 19, 20]);
  m.wallLine('stone', 6, 4, 29, false, [13, 14]);
  m.wallLine('stone', 43, 4, 29, false, [13, 14]);
  m.building(8, 6, 8, 6, 'block', [{ side: 'right', at: 2, len: 2 }]);
  m.building(34, 26, 8, 6, 'block', [{ side: 'left', at: 2, len: 2 }]);
  m.props([[hs(28), 1000, 800], [hs(28), 1300, 800], [hs(59), 3700, 2900], [hs(28), 3900, 2900]]);
  m.props([
    [tank(10), 1700, 2700, 0], [tank(11), 1700, 3050, 0], [armored(1), 3500, 900, 180], [armored(7), 3500, 1250, 180],
    [ctank(1), 3700, 1700, 90], [ctank(3), 1300, 1600, 270], [tank(13), 2900, 2900, 30], [armored(10), 2200, 900, -15],
    [o(13), 2000, 1700], [o(13), 3000, 1700], [o(15), 2500, 2300], [o(12), 2050, 1750], [o(14), 2950, 1750], [o(13), 2500, 1300],
  ]);
  trees(m, [[300, 300], [4700, 300], [300, 3500], [4700, 3500], [2500, 3700]]);
  m.scatter(['crack_asphalt'], 60, 1200, 800, 2600, 2200);
  m.scatter(['crack_ground'], 60, 0, 0, 5000, 3800);
  m.marker('player', 2500, 3600);
  m.marker('boss', 2500, 1600);
  m.borderSpawns();
  m.area('exit', 2350, 100, 300, 250);
  return m;
};

/** Level 10 · Extracción: ruined outskirts leading to a helipad; the final boss guards it. */
LEVELS.level10 = () => {
  const m = new MapBuilder('level10', 52, 40);
  m.seed = 1010;
  m.fill('ground/12');
  m.fill('grass/00', 0, 0, 52, 6);
  m.roadV(8, 4);
  m.fill('asphalt/12', 30, 6, 16, 12); // helipad
  m.building(14, 26, 10, 8, 'stone', [{ side: 'top', at: 2, len: 3 }, { side: 'right', at: 3, len: 2 }], 'ground/12');
  m.wallLine('brick', 28, 24, 8, true, [3, 4]);
  m.pond(40, 26, 7, 6);
  m.props([['outside/helicopter', 3800, 1200], [hs(59), 1600, 2900], [hs(24), 2000, 3100]]);
  m.props([
    [tank(13), 2500, 1300, -20], [armored(10), 2800, 2600, 40], [car(4), 1000, 1500, 90], [pickup(4), 1000, 3200, 80],
    [ctank(5), 4600, 2200, 10], [o(13), 3000, 2000], [o(13), 4500, 1900], [o(15), 2600, 2200], [o(13), 3300, 900], [o(12), 3350, 950],
    [o(0), 2000, 2000], [o(1), 3600, 3400], [o(2), 1700, 1000], [o(4), 2600, 3500, 20],
  ]);
  trees(m, [[300, 300], [1500, 300], [2700, 300], [4000, 300], [5000, 300], [400, 3700], [4800, 3700]]);
  bushes(m, [[1500, 2300], [2300, 3700], [4200, 3100], [600, 2500]]);
  m.scatter(['crack_ground', 'leaf'], 120, 0, 0, 5200, 4000);
  m.scatter(['crack_asphalt'], 30, 3000, 600, 1600, 1200);
  m.marker('player', 1000, 3700);
  m.marker('boss', 3000, 1600);
  m.borderSpawns(1000);
  m.area('exit', 3100, 1450, 1300, 300); // the free strip of the helipad, in front of the crashed chopper
  return m;
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
