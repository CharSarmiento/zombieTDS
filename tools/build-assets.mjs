// Asset pipeline: reads the original CraftPix PNGs from assets/ (never modified),
// cleans, aligns, rescales and packs them into Phaser multiatlases in public/atlases/.
//
//   npm run assets            build everything
//   npm run assets -- man zombies   build only the given groups
//
// Output:
//   public/atlases/<group>.json + <group>-N.png   Phaser multiatlas (frames carry custom pivots)
//   public/atlases/manifest.json                  atlas list, animation frame lists, muzzle points, tileset info
//   public/tilesets/ground.png                    extruded 100px ground tileset for Tiled / Phaser tilemaps
//   .cache/asset-debug/*.png                      pivot alignment sheets for visual review

import sharp from 'sharp';
import { MaxRectsPacker } from 'maxrects-packer';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets');
const PUBLIC = path.join(ROOT, 'public');
const ATLAS_DIR = path.join(PUBLIC, 'atlases');
const DEBUG_DIR = path.join(ROOT, '.cache', 'asset-debug');

/** Scale applied to every world sprite (characters, enemies, props). */
const WORLD = 0.29;
/** Ground tile size in the game (source tiles are 89px). */
const TILE = 100;
const TILE_EXTRUDE = 2;
const PAGE = 4096;
const PAD = 2;

sharp.concurrency(1);
const POOL = Math.max(2, os.cpus().length - 1);

// ---------------------------------------------------------------------------
// Source definitions
// ---------------------------------------------------------------------------

const CHAR = 'Characters/PNG_Bodyparts&Animations/PNG Animations';
const ZOMB = 'Zombies/PNG Animations';
const MONS = 'Monsters/PNG Animations';
const PARTS = 'Characters/PNG_Bodyparts&Animations/Spriter_Animations&Bodyparts';

/**
 * Animated entities. `ref` is the animation whose frame 0 defines the pivot (rotation / physics
 * centre); every other animation is registered against `align` (default: ref) so the body stays
 * put when switching animations. `stripFire` removes muzzle flash and bullets baked into frames.
 * `chain` registers each frame against the previous one (frames with inconsistent canvases).
 */
function player(gender, flameWalkDir) {
  const g = gender === 'man' ? 'Man' : 'Girl';
  return {
    group: gender,
    scale: gender === 'man' ? WORLD : WORLD * 1.12,
    ref: 'walk_gun',
    anims: {
      walk_gun: { dir: `${CHAR}/${g}/Walk_gun` },
      walk_knife: { dir: `${CHAR}/${g}/Walk_knife` },
      walk_bat: { dir: `${CHAR}/${g}/Walk_bat` },
      walk_rifle: { dir: `${CHAR}/${g}/Walk_riffle` },
      walk_flame: { dir: `${CHAR}/${g}/${flameWalkDir}` },
      attack_gun: { dir: `${CHAR}/${g}/Gun_Shot`, align: 'walk_gun', stripFire: true },
      attack_knife: { dir: `${CHAR}/${g}/Knife`, align: 'walk_knife' },
      attack_bat: { dir: `${CHAR}/${g}/Bat`, align: 'walk_bat' },
      attack_rifle: { dir: `${CHAR}/${g}/Riffle`, align: 'walk_rifle', stripFire: true },
      attack_flame: { dir: `${CHAR}/${g}/FlameThrower`, align: 'walk_flame' },
      death: { dir: `${CHAR}/${g}/Death`, chain: true },
    },
    muzzles: ['walk_gun', 'walk_rifle', 'walk_flame', 'attack_gun', 'attack_rifle'],
  };
}

function zombie(dir, group = 'zombies') {
  return {
    group,
    scale: WORLD,
    ref: 'walk',
    anims: {
      walk: { dir: `${dir}/Walk` },
      attack: { dir: `${dir}/Attack` },
      death: { dir: `${dir}/Death` },
    },
  };
}

const ENTITIES = {
  man: player('man', 'Walk_firethrower'),
  girl: player('girl', 'Walk_FireThrhrower'),
  zombie1: zombie(`${ZOMB}/1LVL/Zombie1_female`),
  zombie2: zombie(`${ZOMB}/1LVL/Zombie2_female`),
  zombie3: zombie(`${ZOMB}/1LVL/Zombie3_male`),
  zombie4: zombie(`${ZOMB}/1LVL/Zombie4_male`),
  cop: zombie(`${ZOMB}/2LVL/Cop_Zombie`),
  army: zombie(`${ZOMB}/2LVL/Army_zombie`),
  bighands: {
    group: 'elites',
    scale: WORLD,
    ref: 'walk',
    anims: {
      walk: { dir: `${MONS}/3LVL/Zombie_big_hands/Walk` },
      attack1: { dir: `${MONS}/3LVL/Zombie_big_hands/Attack1` },
      attack2: { dir: `${MONS}/3LVL/Zombie_big_hands/Attcak2` },
      attack2b: { dir: `${MONS}/3LVL/Zombie_big_hands/Attcak2v2` },
      death: { dir: `${MONS}/3LVL/Zombie_big_hands/Death` },
    },
  },
  bighead: {
    group: 'elites',
    scale: WORLD,
    ref: 'walk',
    anims: {
      walk: { dir: `${MONS}/3LVL/Zpmbie_big_head/Walk` },
      attack1: { dir: `${MONS}/3LVL/Zpmbie_big_head/Attack` },
      attack2: { dir: `${MONS}/3LVL/Zpmbie_big_head/Attack2` },
      attack2b: { dir: `${MONS}/3LVL/Zpmbie_big_head/Attack2v2` },
      death: { dir: `${MONS}/3LVL/Zpmbie_big_head/Death` },
    },
  },
  boss1: {
    group: 'bosses',
    scale: WORLD,
    ref: 'walk',
    anims: {
      walk: { dir: `${MONS}/4LVL/Boss1/Walk` },
      attack1: { dir: `${MONS}/4LVL/Boss1/Attack_1` },
      attack2: { dir: `${MONS}/4LVL/Boss1/Attack_2` },
      death: { dir: `${MONS}/4LVL/Boss1/Death` },
    },
  },
  boss2: {
    group: 'bosses',
    scale: WORLD,
    ref: 'walk',
    anims: {
      walk: { dir: `${MONS}/4LVL/Boss2/Walk` },
      attack1: { dir: `${MONS}/4LVL/Boss2/Attack1` },
      attack2: { dir: `${MONS}/4LVL/Boss2/Attack2` },
      death: { dir: `${MONS}/4LVL/Boss2/Death` },
    },
  },
  megaboss: {
    group: 'megaboss',
    scale: WORLD,
    ref: 'walk',
    anims: {
      walk: { dir: `${MONS}/5LVL/Walk` },
      attack1: { dir: `${MONS}/5LVL/Attack1` },
      attack2: { dir: `${MONS}/5LVL/Attack2` },
      attack3: { dir: `${MONS}/5LVL/Attack3` },
      attack4: { dir: `${MONS}/5LVL/Attack4` },
      death: { dir: `${MONS}/5LVL/Death` },
    },
  },
};

/**
 * Manual corrections, in source pixels of the entity's ref animation (pivot) or of the
 * animation itself (offset, added to the automatic registration). Tuned with the debug sheets.
 */
const PIVOT_OVERRIDES = {};
const OFFSET_OVERRIDES = {};

/** Simple animations: frames keep their own canvas, pivot at the centre. */
const SIMPLE_ANIMS = [
  { group: 'fx', key: 'fx/explosion', dir: 'Explosion/PNG', scale: 0.6 },
  { group: 'fx', key: 'fx/flame', dir: PARTS + '/shots&fire', match: /^flamethrower/i, scale: WORLD },
];

const stripLayer = (s) => s.replace(/_Layer-\d+$/i, '');

/** Static images packed as single frames, named `${prefix}/${name}`. */
const STATICS = [
  // world: environment
  { group: 'env', prefix: 'walls', dir: 'Tiles/PNG/Walls', scale: WORLD, name: (b) => stripLayer(b).replace(/^walls_/, '') },
  { group: 'env', prefix: 'roof', dir: 'Tiles/PNG/Roof', scale: WORLD, name: (b) => stripLayer(b).replace(/^roof_/i, '') },
  { group: 'env', prefix: 'house', dir: 'Objects/PNG', scale: WORLD, name: (b) => stripLayer(b).replace(/^objects_house_/, '') },
  { group: 'env', prefix: 'house_shadow', dir: 'Objects/PNG/Shadows', scale: WORLD, name: (b) => stripLayer(b).replace(/^shadows_house_/, '') },
  { group: 'env', prefix: 'outside', dir: 'Objects/PNG/Objects_outside', scale: WORLD, name: (b) => stripLayer(b).replace(/^objects_outside_/, '').toLowerCase() },
  { group: 'env', prefix: 'outside_shadow', dir: 'Objects/PNG/Objects_outside/Shadows', scale: WORLD, name: (b) => stripLayer(b).replace(/^shadows_outside_/, '') },
  { group: 'env', prefix: 'crack_asphalt', dir: 'Tiles&Details/PNG/Cracks_asphalt', scale: WORLD, name: (b) => stripLayer(b).replace(/^\D+_/, '') },
  { group: 'env', prefix: 'crack_ground', dir: 'Tiles&Details/PNG/Cracks_ground', scale: WORLD, name: (b) => stripLayer(b).replace(/^\D+_/, '') },
  { group: 'env', prefix: 'leaf', dir: 'Tiles&Details/PNG/Grass_leafs', scale: WORLD, name: (b) => stripLayer(b).replace(/^\D+_/, '') },
  { group: 'env', prefix: 'water_spot', dir: 'Tiles&Details/PNG/Water_spots', scale: WORLD, name: (b) => stripLayer(b).toLowerCase().replace(/^water_spots?_/, '') },
  ...['Armored_car', 'Car', 'Compact_tank', 'Pickup', 'Tank'].map((v) => ({
    group: 'env', prefix: 'veh_' + v.toLowerCase(), dir: 'PNG/' + v, scale: WORLD,
    name: (b) => stripLayer(b).toLowerCase().replace(/^[a-z_]+?_(?=\d)/, ''),
  })),
  { group: 'env', prefix: 'shadow', dir: PARTS + '/shadows', scale: WORLD, name: (b) => b.toLowerCase() },
  // world: combat fx
  { group: 'fx', prefix: 'fx', dir: PARTS + '/shots&fire', match: /^(?!flamethrower)/i, scale: WORLD, name: (b) => b.toLowerCase().replace('&', '_') },
  { group: 'fx', prefix: 'cannon', dir: 'PNG/Shots', scale: WORLD, name: (b) => stripLayer(b).replace(/^\D+_/, '') },
  // ui
  { group: 'ui', prefix: 'el', dir: 'PNG', match: /^element_/, scale: 1, name: (b) => stripLayer(b).replace(/^element_/, '') },
  { group: 'ui', prefix: 'win', dir: 'PNG_Window', scale: 1, name: (b) => b.toLowerCase().replace(/\s+/g, '_') },
  { group: 'ui', prefix: 'items', dir: 'Items/PNG', scale: 1, name: (b) => b.replace(/^items_/, '') },
  { group: 'ui', prefix: 'skills', dir: 'PNG/Icons', match: /^skills_/, scale: 0.5, name: (b) => stripLayer(b).replace(/^skills_/, '') },
  { group: 'ui', prefix: 'icons', dir: 'Icons/PNG', scale: 0.5, name: (b) => stripLayer(b).toLowerCase().replace(/\s+/g, '_') },
  { group: 'ui', prefix: 'ava', dir: 'AVAs', match: /_original/, scale: 0.25, name: (b) => b.replace(/^ava_|_original$/g, '') },
];

const COPIES = [
  { from: 'PNG/background.png', to: 'images/bg1.png' },
  { from: 'PNG/background2.png', to: 'images/bg2.png' },
  { from: 'AVAs/Ava_AppStore_man.png', to: 'favicon.png' },
];

const TILESETS = [
  { prefix: 'asphalt', dir: 'Tiles&Details/PNG/Asphalt_tiles' },
  { prefix: 'grass', dir: 'Tiles&Details/PNG/Grass_tiles' },
  { prefix: 'ground', dir: 'Tiles&Details/PNG/Ground_tiles' },
  { prefix: 'water', dir: 'Tiles&Details/PNG/Water_tiles' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const lastNumber = (s) => {
  const m = s.match(/(\d+)(?!.*\d)/);
  return m ? parseInt(m[1], 10) : 0;
};

function listPngs(dir, match) {
  const abs = path.join(SRC, dir);
  return fss
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.png') && (!match || match.test(e.name)))
    .map((e) => e.name)
    .sort((a, b) => lastNumber(a) - lastNumber(b) || a.localeCompare(b))
    .map((n) => path.join(abs, n));
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(POOL, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function loadRaw(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function bbox(img, thr = 8) {
  const { data, w, h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > thr) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const isFire = (r, g, b) => r > 190 && b < 140 && r - b > 110 && g > 60;

/** Removes baked muzzle flash and bullets: fire-coloured pixels (+halo) and detached blobs. */
function stripFire(img) {
  const { data, w, h } = img;
  const R = 6;
  const kill = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 8 && isFire(data[i], data[i + 1], data[i + 2])) {
        for (let yy = Math.max(0, y - R); yy <= Math.min(h - 1, y + R); yy++)
          for (let xx = Math.max(0, x - R); xx <= Math.min(w - 1, x + R); xx++) kill[yy * w + xx] = 1;
      }
    }
  for (let p = 0; p < w * h; p++) {
    if (!kill[p]) continue;
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dark = Math.max(r, g, b) < 120 && Math.max(r, g, b) - Math.min(r, g, b) < 45;
    if (!dark) data[i + 3] = 0;
  }
  keepMainComponents(img, 0.03);
}

/** Clears connected components (8-connectivity) smaller than `ratio` of the largest one. */
function keepMainComponents(img, ratio) {
  const { data, w, h } = img;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== -1 || data[p * 4 + 3] <= 8) continue;
    const id = sizes.length;
    let sp = 0, n = 0;
    stack[sp++] = p;
    label[p] = id;
    while (sp) {
      const q = stack[--sp];
      n++;
      const qx = q % w, qy = (q / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r = ny * w + nx;
          if (label[r] === -1 && data[r * 4 + 3] > 8) {
            label[r] = id;
            stack[sp++] = r;
          }
        }
    }
    sizes.push(n);
  }
  const max = Math.max(0, ...sizes);
  for (let p = 0; p < w * h; p++) if (label[p] >= 0 && sizes[label[p]] < max * ratio) data[p * 4 + 3] = 0;
}

function centroid(img) {
  const { data, w, h } = img;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 8) { sx += x * a; sy += y * a; n += a; }
    }
  return n ? { x: sx / n, y: sy / n } : { x: w / 2, y: h / 2 };
}

/** Samples an image on a grid of `step` px: alpha mask + luminance. */
function sample(img, step) {
  const gw = Math.ceil(img.w / step), gh = Math.ceil(img.h / step);
  const a = new Uint8Array(gw * gh), l = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      const i = ((gy * step) * img.w + gx * step) * 4;
      if (img.data[i + 3] > 64) {
        a[gy * gw + gx] = 1;
        l[gy * gw + gx] = (img.data[i] * 3 + img.data[i + 1] * 6 + img.data[i + 2]) / 10;
      }
    }
  return { a, l, gw, gh };
}

function matchScore(ref, mov, dx, dy) {
  // dx,dy in grid cells: mov cell (x,y) lands on ref cell (x+dx, y+dy)
  let sim = 0, overlap = 0, movN = 0, refN = 0;
  for (let i = 0; i < ref.a.length; i++) refN += ref.a[i];
  for (let y = 0; y < mov.gh; y++) {
    const ry = y + dy;
    for (let x = 0; x < mov.gw; x++) {
      const m = y * mov.gw + x;
      if (!mov.a[m]) continue;
      movN++;
      const rx = x + dx;
      if (rx < 0 || ry < 0 || rx >= ref.gw || ry >= ref.gh) continue;
      const r = ry * ref.gw + rx;
      if (!ref.a[r]) continue;
      overlap++;
      const d = 1 - Math.abs(ref.l[r] - mov.l[m]) / 255;
      sim += d * d;
    }
  }
  return sim - 0.5 * (movN - overlap + (refN - overlap));
}

/** Finds where `mov`'s origin sits inside `ref` (pixels) so that their content overlaps best. */
function register(ref, mov) {
  const maxDim = Math.max(ref.w, ref.h, mov.w, mov.h);
  const coarse = Math.max(2, Math.ceil(maxDim / 100));
  const cr = sample(ref, coarse), cm = sample(mov, coarse);
  const range = Math.ceil(Math.max(cr.gw, cr.gh, cm.gw, cm.gh) * 0.45);
  let best = -Infinity, bx = 0, by = 0;
  for (let dy = -range; dy <= range; dy++)
    for (let dx = -range; dx <= range; dx++) {
      const s = matchScore(cr, cm, dx, dy);
      if (s > best) { best = s; bx = dx; by = dy; }
    }
  // refine at a finer grid, searching ±1 coarse cell
  const fine = Math.max(1, Math.ceil(maxDim / 300));
  const fr = sample(ref, fine), fm = sample(mov, fine);
  const cx = Math.round((bx * coarse) / fine), cy = Math.round((by * coarse) / fine);
  const fr2 = Math.ceil(coarse / fine) + 1;
  best = -Infinity;
  let fx = cx, fy = cy;
  for (let dy = cy - fr2; dy <= cy + fr2; dy++)
    for (let dx = cx - fr2; dx <= cx + fr2; dx++) {
      const s = matchScore(fr, fm, dx, dy);
      if (s > best) { best = s; fx = dx; fy = dy; }
    }
  return { dx: fx * fine, dy: fy * fine };
}

/** Bottom-most opaque point (weapon tip for sprites facing down). */
function bottomPoint(img) {
  const { data, w, h } = img;
  for (let y = h - 1; y >= 0; y--) {
    let sx = 0, n = 0;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 64) { sx += x; n++; }
    if (n >= 2) return { x: sx / n, y };
  }
  return { x: w / 2, y: h };
}

/** Crops to content and scales. Returns a packable frame (pivot given in source px, optional). */
async function makeFrame(name, img, scale, pivot) {
  const b = bbox(img);
  const tw = Math.max(1, Math.round(b.w * scale));
  const th = Math.max(1, Math.round(b.h * scale));
  const buf = await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract({ left: b.x, top: b.y, width: b.w, height: b.h })
    .resize(tw, th, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer();
  const ox = Math.round(b.x * scale), oy = Math.round(b.y * scale);
  const sw = Math.max(Math.round(img.w * scale), ox + tw);
  const sh = Math.max(Math.round(img.h * scale), oy + th);
  const f = { name, buf, w: tw, h: th, ox, oy, sw, sh };
  if (pivot) f.pivot = { x: (pivot.x * scale) / sw, y: (pivot.y * scale) / sh };
  return f;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

async function buildEntity(key, def, manifest) {
  const t0 = Date.now();
  const anims = {};
  for (const [anim, a] of Object.entries(def.anims)) {
    const files = listPngs(a.dir);
    if (!files.length) throw new Error(`No frames in ${a.dir}`);
    const imgs = await pool(files, loadRaw);
    if (a.stripFire) imgs.forEach(stripFire);
    anims[anim] = { ...a, imgs, files };
  }

  // pivot of the reference animation
  const ref = anims[def.ref];
  const refPivot = PIVOT_OVERRIDES[key] ?? centroid(ref.imgs[0]);

  // per-animation, per-frame pivots (source px of that frame)
  const pivots = {};
  for (const [anim, a] of Object.entries(anims)) {
    let base;
    if (anim === def.ref) base = refPivot;
    else {
      const alignTo = a.align ?? def.ref;
      if (!pivots[alignTo]) {
        // align target processed later in insertion order: compute it now
        const t = anims[alignTo];
        const o = register(ref.imgs[0], t.imgs[0]);
        pivots[alignTo] = t.imgs.map(() => ({ x: refPivot.x - o.dx, y: refPivot.y - o.dy }));
      }
      const target = anims[alignTo];
      const tp = pivots[alignTo][0];
      const o = register(target.imgs[0], a.imgs[0]);
      const man = OFFSET_OVERRIDES[`${key}/${anim}`] ?? { dx: 0, dy: 0 };
      base = { x: tp.x - o.dx + man.dx, y: tp.y - o.dy + man.dy };
    }
    if (pivots[anim] && anim !== def.ref && !a.chain) continue; // already computed as an align target
    const list = [base];
    for (let i = 1; i < a.imgs.length; i++) {
      if (a.chain) {
        const o = register(a.imgs[i - 1], a.imgs[i]);
        list.push({ x: list[i - 1].x - o.dx, y: list[i - 1].y - o.dy });
      } else list.push(base);
    }
    pivots[anim] = list;
  }

  const frames = [];
  for (const [anim, a] of Object.entries(anims)) {
    const names = [];
    const made = await pool(a.imgs, (img, i) => {
      const name = `${key}/${anim}/${String(i).padStart(2, '0')}`;
      names.push(name);
      return makeFrame(name, img, def.scale, pivots[anim][i]);
    });
    frames.push(...made);
    manifest.anims[`${key}/${anim}`] = { atlas: def.group, frames: made.map((f) => f.name) };
  }

  // weapon tips relative to the pivot, in output px, sprite facing +Y
  if (def.muzzles) {
    manifest.muzzles[key] = {};
    for (const anim of def.muzzles) {
      const img = anims[anim].imgs[0];
      const p = pivots[anim][0];
      const tip = bottomPoint(img);
      manifest.muzzles[key][anim] = {
        x: +((tip.x - p.x) * def.scale).toFixed(1),
        y: +((tip.y - p.y) * def.scale).toFixed(1),
      };
    }
  }

  await debugSheet(key, def, frames);
  console.log(`  ${key}: ${frames.length} frames (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  // release source buffers
  for (const a of Object.values(anims)) a.imgs.length = 0;
  return frames;
}

async function buildSimpleAnim(def, manifest) {
  const files = listPngs(def.dir, def.match);
  const frames = await pool(files, async (file, i) => {
    const img = await loadRaw(file);
    return makeFrame(`${def.key}/${String(i).padStart(2, '0')}`, img, def.scale, { x: img.w / 2, y: img.h / 2 });
  });
  manifest.anims[def.key] = { atlas: def.group, frames: frames.map((f) => f.name) };
  return frames;
}

async function buildStatics(def, manifest) {
  const files = listPngs(def.dir, def.match);
  const frames = await pool(files, async (file) => {
    const img = await loadRaw(file);
    const base = path.basename(file, '.png');
    return makeFrame(`${def.prefix}/${def.name(base)}`, img, def.scale);
  });
  (manifest.statics[def.prefix] ??= { atlas: def.group, frames: [] }).frames.push(...frames.map((f) => f.name));
  return frames;
}

async function writeAtlas(group, frames) {
  const seen = new Set();
  for (const f of frames) {
    if (seen.has(f.name)) throw new Error(`Duplicate frame name ${f.name}`);
    seen.add(f.name);
  }
  const packer = new MaxRectsPacker(PAGE, PAGE, PAD, { smart: true, pot: false, square: false, allowRotation: false, border: PAD });
  packer.addArray(frames.map((f) => ({ width: f.w, height: f.h, data: f })));
  const textures = [];
  for (const [bi, bin] of packer.bins.entries()) {
    const file = `${group}-${bi}.png`;
    const composites = bin.rects.map((r) => ({
      input: r.data.buf,
      raw: { width: r.data.w, height: r.data.h, channels: 4 },
      left: r.x,
      top: r.y,
    }));
    await sharp({ create: { width: bin.width, height: bin.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(composites)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(ATLAS_DIR, file));
    textures.push({
      image: file,
      format: 'RGBA8888',
      size: { w: bin.width, h: bin.height },
      scale: 1,
      frames: bin.rects.map((r) => {
        const f = r.data;
        const out = {
          filename: f.name,
          rotated: false,
          trimmed: true,
          sourceSize: { w: f.sw, h: f.sh },
          spriteSourceSize: { x: f.ox, y: f.oy, w: f.w, h: f.h },
          frame: { x: r.x, y: r.y, w: f.w, h: f.h },
        };
        if (f.pivot) out.pivot = { x: +f.pivot.x.toFixed(4), y: +f.pivot.y.toFixed(4) };
        return out;
      }),
    });
  }
  await fs.writeFile(path.join(ATLAS_DIR, `${group}.json`), JSON.stringify({ textures, meta: { app: 'tools/build-assets.mjs' } }));
  console.log(`  -> ${group}: ${frames.length} frames on ${textures.length} page(s) [${textures.map((t) => `${t.size.w}x${t.size.h}`).join(', ')}]`);
}

async function buildTileset(manifest) {
  const cell = TILE + TILE_EXTRUDE * 2;
  const cols = 13;
  const names = [];
  const composites = [];
  let i = 0;
  for (const ts of TILESETS) {
    for (const file of listPngs(ts.dir)) {
      const tile = await sharp(file).ensureAlpha().resize(TILE, TILE, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
      const ext = await sharp(tile, { raw: { width: TILE, height: TILE, channels: 4 } })
        .extend({ top: TILE_EXTRUDE, bottom: TILE_EXTRUDE, left: TILE_EXTRUDE, right: TILE_EXTRUDE, extendWith: 'copy' })
        .png()
        .toBuffer();
      composites.push({ input: ext, left: (i % cols) * cell, top: Math.floor(i / cols) * cell });
      names.push(`${ts.prefix}/${String(lastNumber(path.basename(file, '.png').replace(/_Layer-\d+$/i, ''))).padStart(2, '0')}`);
      i++;
    }
  }
  const rows = Math.ceil(i / cols);
  await fs.mkdir(path.join(PUBLIC, 'tilesets'), { recursive: true });
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, 'tilesets', 'ground.png'));
  manifest.tileset = { image: 'tilesets/ground.png', tileSize: TILE, margin: TILE_EXTRUDE, spacing: TILE_EXTRUDE * 2, columns: cols, count: i, names };
  console.log(`  -> tileset: ${i} tiles`);
}

/** Pivot check: frame 0 of every animation with its pivot on a crosshair, plus an onion overlay. */
async function debugSheet(key, def, frames) {
  const firsts = Object.keys(def.anims).map((anim) => frames.find((f) => f.name === `${key}/${anim}/00`));
  const deaths = frames.filter((f) => f.name.startsWith(`${key}/death/`));
  const cells = [...firsts, null, ...deaths];
  const size = Math.ceil(Math.max(...frames.map((f) => Math.max(f.sw, f.sh))) * 1.1);
  const cols = Math.min(cells.length, 8);
  const rows = Math.ceil(cells.length / cols);
  const comps = [];
  const svg = [];
  const place = (f, ci, alpha = 1) => {
    const cx = (ci % cols) * size + size / 2, cy = Math.floor(ci / cols) * size + size / 2;
    const px = f.pivot.x * f.sw - f.ox, py = f.pivot.y * f.sh - f.oy;
    let input = f.buf;
    if (alpha < 1) {
      input = Buffer.from(f.buf);
      for (let i = 3; i < input.length; i += 4) input[i] = input[i] * alpha;
    }
    comps.push({ input, raw: { width: f.w, height: f.h, channels: 4 }, left: Math.round(cx - px), top: Math.round(cy - py) });
  };
  cells.forEach((f, ci) => {
    const cx = (ci % cols) * size + size / 2, cy = Math.floor(ci / cols) * size + size / 2;
    if (f) place(f, ci);
    else firsts.forEach((g) => place(g, ci, 0.3)); // onion of all first frames
    svg.push(`<line x1="${cx - size / 2}" y1="${cy}" x2="${cx + size / 2}" y2="${cy}" stroke="#ff0" stroke-opacity="0.6"/>`);
    svg.push(`<line x1="${cx}" y1="${cy - size / 2}" x2="${cx}" y2="${cy + size / 2}" stroke="#ff0" stroke-opacity="0.6"/>`);
    svg.push(`<text x="${cx - size / 2 + 4}" y="${cy - size / 2 + 14}" font-size="12" fill="#fff" font-family="Arial">${f ? f.name.replace(`${key}/`, '') : 'onion'}</text>`);
  });
  const W = cols * size, H = rows * size;
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 64, g: 84, b: 64, alpha: 1 } } })
    .composite([...comps, { input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg.join('')}</svg>`), left: 0, top: 0 }])
    .png()
    .toFile(path.join(DEBUG_DIR, `${key}.png`));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const only = process.argv.slice(2);
  const t0 = Date.now();
  await fs.mkdir(ATLAS_DIR, { recursive: true });

  const manifestPath = path.join(ATLAS_DIR, 'manifest.json');
  const manifest = fss.existsSync(manifestPath)
    ? JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    : { atlases: {}, anims: {}, statics: {}, muzzles: {} };
  manifest.worldScale = WORLD;

  const groups = new Set([
    ...Object.values(ENTITIES).map((e) => e.group),
    ...SIMPLE_ANIMS.map((s) => s.group),
    ...STATICS.map((s) => s.group),
  ]);

  for (const group of groups) {
    if (only.length && !only.includes(group)) continue;
    console.log(`[${group}]`);
    // drop stale manifest entries of this group
    for (const [k, v] of Object.entries(manifest.anims)) if (v.atlas === group) delete manifest.anims[k];
    for (const s of STATICS.filter((s) => s.group === group)) delete manifest.statics[s.prefix];

    const frames = [];
    for (const [key, def] of Object.entries(ENTITIES)) if (def.group === group) frames.push(...(await buildEntity(key, def, manifest)));
    for (const def of SIMPLE_ANIMS) if (def.group === group) frames.push(...(await buildSimpleAnim(def, manifest)));
    for (const def of STATICS) if (def.group === group) frames.push(...(await buildStatics(def, manifest)));
    await writeAtlas(group, frames);
    manifest.atlases[group] = `atlases/${group}.json`;
  }

  if (!only.length || only.includes('tileset')) await buildTileset(manifest);

  for (const c of COPIES) {
    const to = path.join(PUBLIC, c.to);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(path.join(SRC, c.from), to);
  }
  const fontDir = path.join(SRC, 'fonts');
  if (fss.existsSync(fontDir)) {
    await fs.mkdir(path.join(PUBLIC, 'fonts'), { recursive: true });
    for (const f of fss.readdirSync(fontDir)) await fs.copyFile(path.join(fontDir, f), path.join(PUBLIC, 'fonts', f));
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 1));
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
