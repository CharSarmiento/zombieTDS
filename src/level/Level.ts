import Phaser from 'phaser';
import { TILE_SIZE } from '../config';
import { mapKey, PROPS_TILESET_KEY } from '../data/levels';
import { propRule, type PropRule } from '../data/props';
import { DEPTH } from '../entities/Actor';
import { FlowField } from '../systems/FlowField';

const FIELD_CELL = 50;
/** solids grow by this much in the flow field so zombies path with some clearance */
const FIELD_INFLATE = 12;
const BUCKET = 200;
const TILED_FLIP_H = 0x80000000;
const TILED_FLIP_V = 0x40000000;
const TILED_GID_MASK = 0x1fffffff;

/** A collidable shape: blocks movement; blocks bullets unless `low`. */
export interface Solid {
  shape: 'rect' | 'circle';
  /** rect: AABB; circle: centre in x/y and radius in r */
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  low: boolean;
  zone: Phaser.GameObjects.Zone;
  removed?: boolean;
}

/** A placed explosive prop, turned into a Barrel entity by the scene. */
export interface ExplosivePlacement {
  image: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  solid: Solid;
}

interface TiledObject {
  id: number;
  name: string;
  gid?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  point?: boolean;
}

interface TiledLayer {
  name: string;
  type: 'tilelayer' | 'objectgroup';
  objects?: TiledObject[];
}

interface TiledMap {
  width: number;
  height: number;
  layers: TiledLayer[];
  tilesets: { firstgid: number; source?: string; image?: string }[];
}

/**
 * Builds a playable level from a Tiled map: ground tile layers, props (with depth, shadows and
 * collision derived from data/props.ts), the flow field, and markers (player, spawn, exit).
 */
export class Level {
  readonly width: number;
  readonly height: number;
  readonly field: FlowField;
  readonly statics: Phaser.Physics.Arcade.StaticGroup;
  readonly solids: Solid[] = [];
  readonly explosives: ExplosivePlacement[] = [];
  playerStart = new Phaser.Math.Vector2();
  readonly spawnPoints: Phaser.Math.Vector2[] = [];
  readonly exits: Phaser.Geom.Rectangle[] = [];
  private buckets = new Map<number, Solid[]>();

  constructor(
    private scene: Phaser.Scene,
    map: string,
  ) {
    const raw = scene.cache.json.get(mapKey(map)) as TiledMap;
    if (!raw) throw new Error(`Map ${map} not loaded`);
    this.width = raw.width * TILE_SIZE;
    this.height = raw.height * TILE_SIZE;
    this.field = new FlowField(this.width, this.height, FIELD_CELL);
    this.statics = scene.physics.add.staticGroup();

    this.buildGround(map, raw);
    const frameOf = this.propLookup(raw);
    for (const layer of raw.layers) {
      if (layer.type !== 'objectgroup') continue;
      for (const obj of layer.objects ?? []) {
        if (obj.gid) this.placeProp(obj, frameOf, layer.name === 'decals');
        else this.placeMarker(obj);
      }
    }
    this.rebuildField();
  }

  /** First solid crossed by a bullet segment (x0,y0)+t*(dx,dy); returns t in [0,1] or null. */
  raycast(x0: number, y0: number, dx: number, dy: number): number | null {
    let best: number | null = null;
    const seen = new Set<Solid>();
    const bx0 = Math.floor(Math.min(x0, x0 + dx) / BUCKET), bx1 = Math.floor(Math.max(x0, x0 + dx) / BUCKET);
    const by0 = Math.floor(Math.min(y0, y0 + dy) / BUCKET), by1 = Math.floor(Math.max(y0, y0 + dy) / BUCKET);
    for (let by = by0; by <= by1; by++)
      for (let bx = bx0; bx <= bx1; bx++)
        for (const s of this.buckets.get(bx + by * 10007) ?? []) {
          if (s.low || s.removed || seen.has(s)) continue;
          seen.add(s);
          const t = s.shape === 'rect' ? segRect(x0, y0, dx, dy, s) : segCircle(x0, y0, dx, dy, s);
          if (t !== null && (best === null || t < best)) best = t;
        }
    return best;
  }

  /** Removes a solid (destroyed barrel) from physics, bullets and pathing. */
  removeSolid(s: Solid): void {
    s.removed = true;
    s.zone.destroy();
    this.rebuildField();
  }

  // --- building ---------------------------------------------------------------------------

  private buildGround(map: string, raw: TiledMap): void {
    // Phaser cannot read external tilesets (the props collection); give it the map without them
    const data = { ...raw, tilesets: raw.tilesets.filter((t) => t.image) };
    const key = `tilemap:${map}`;
    if (!this.scene.cache.tilemap.exists(key)) this.scene.cache.tilemap.add(key, { format: Phaser.Tilemaps.Formats.TILED_JSON, data });
    const tilemap = this.scene.make.tilemap({ key });
    const tileset = tilemap.addTilesetImage('ground', 'ground')!;
    for (const layer of raw.layers) if (layer.type === 'tilelayer') tilemap.createLayer(layer.name, tileset)?.setDepth(DEPTH.ground);
  }

  /** gid -> env frame name, through the external props tileset. */
  private propLookup(raw: TiledMap): (gid: number) => string | null {
    const ref = raw.tilesets.find((t) => t.source?.includes('props'));
    const tsj = this.scene.cache.json.get(PROPS_TILESET_KEY) as { tiles: { id: number; image: string }[] };
    if (!ref || !tsj) return () => null;
    const byId = new Map(tsj.tiles.map((t) => [t.id, t.image.replace(/^props\//, '').replace(/\.png$/, '')]));
    return (gid) => byId.get(gid - ref.firstgid) ?? null;
  }

  private placeProp(obj: TiledObject, frameOf: (gid: number) => string | null, decalLayer: boolean): void {
    const raw = obj.gid!;
    const frame = frameOf(raw & TILED_GID_MASK);
    if (!frame || !this.scene.textures.get('env').has(frame)) {
      console.warn(`Unknown prop gid ${raw & TILED_GID_MASK} (object ${obj.id})`);
      return;
    }
    const rule = propRule(frame);
    // tile objects are anchored bottom-left and rotate (clockwise, degrees) around that corner
    const a = Phaser.Math.DegToRad(obj.rotation);
    const cx = obj.x + (obj.width / 2) * Math.cos(a) + (obj.height / 2) * Math.sin(a);
    const cy = obj.y + (obj.width / 2) * Math.sin(a) - (obj.height / 2) * Math.cos(a);
    const img = this.scene.add.image(cx, cy, 'env', frame).setRotation(a);
    img.setScale(obj.width / img.frame.realWidth, obj.height / img.frame.realHeight);
    img.setFlip(!!(raw & TILED_FLIP_H), !!(raw & TILED_FLIP_V));
    img.setDepth(decalLayer || rule.decal ? DEPTH.decal : rule.overhead ? DEPTH.overhead : DEPTH.shadow + 1);

    let shadow: Phaser.GameObjects.Image | undefined;
    if (rule.shadow && !decalLayer) {
      shadow = this.scene.add
        .image(cx + 10, cy + 12, 'env', frame)
        .setRotation(a)
        .setScale(img.scaleX, img.scaleY)
        .setTintFill(0x000000)
        .setAlpha(0.28)
        .setDepth(DEPTH.shadow);
    }
    if (decalLayer || !rule.solid) return;

    const solids = this.makeSolids(rule, cx, cy, obj.width, obj.height, a);
    if (rule.explosive && solids[0]) this.explosives.push({ image: img, shadow, solid: solids[0] });
  }

  private makeSolids(rule: PropRule, cx: number, cy: number, w: number, h: number, a: number): Solid[] {
    if (rule.solid === 'circle') {
      const r = ((rule.radius ?? 0.8) * Math.min(w, h)) / 2;
      return [this.addSolid({ shape: 'circle', x: cx, y: cy, w: 2 * r, h: 2 * r, r, low: !!rule.low })];
    }
    // boxes in the prop's local frame, centred on (0,0)
    let boxes: [number, number, number, number][];
    if (rule.solid === 'corner') {
      const t = rule.thickness ?? 30;
      const left = rule.corner === 'tl' || rule.corner === 'bl';
      const top = rule.corner === 'tl' || rule.corner === 'tr';
      boxes = [
        [-w / 2, top ? -h / 2 : h / 2 - t, w, t], // horizontal arm
        [left ? -w / 2 : w / 2 - t, -h / 2, t, h], // vertical arm
      ];
    } else {
      const k = rule.inset ?? 1;
      boxes = [[(-w * k) / 2, (-h * k) / 2, w * k, h * k]];
    }
    // rotate each box and keep its axis-aligned bounds (exact for multiples of 90°)
    return boxes.map(([bx, by, bw, bh]) => {
      const corners = [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].map(([px, py]) => ({
        x: cx + px * Math.cos(a) - py * Math.sin(a),
        y: cy + px * Math.sin(a) + py * Math.cos(a),
      }));
      const x0 = Math.min(...corners.map((p) => p.x)), x1 = Math.max(...corners.map((p) => p.x));
      const y0 = Math.min(...corners.map((p) => p.y)), y1 = Math.max(...corners.map((p) => p.y));
      return this.addSolid({ shape: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: 0, low: !!rule.low });
    });
  }

  private addSolid(s: Omit<Solid, 'zone'>): Solid {
    const zone =
      s.shape === 'rect'
        ? this.scene.add.zone(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h)
        : this.scene.add.zone(s.x, s.y, s.r * 2, s.r * 2);
    this.statics.add(zone);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    if (s.shape === 'circle') body.setCircle(s.r);
    const solid: Solid = { ...s, zone };
    this.solids.push(solid);
    const [x0, y0, x1, y1] = s.shape === 'rect' ? [s.x, s.y, s.x + s.w, s.y + s.h] : [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
    for (let by = Math.floor(y0 / BUCKET); by <= Math.floor(y1 / BUCKET); by++)
      for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor(x1 / BUCKET); bx++) {
        const k = bx + by * 10007;
        const list = this.buckets.get(k);
        if (list) list.push(solid);
        else this.buckets.set(k, [solid]);
      }
    return solid;
  }

  private placeMarker(obj: TiledObject): void {
    if (obj.name === 'player') this.playerStart.set(obj.x, obj.y);
    else if (obj.name === 'spawn') this.spawnPoints.push(new Phaser.Math.Vector2(obj.x, obj.y));
    else if (obj.name === 'exit') this.exits.push(new Phaser.Geom.Rectangle(obj.x, obj.y, obj.width, obj.height));
  }

  private rebuildField(): void {
    this.field.clear();
    for (const s of this.solids) {
      if (s.removed) continue;
      const i = FIELD_INFLATE;
      if (s.shape === 'rect') this.field.blockRect(s.x - i, s.y - i, s.w + 2 * i, s.h + 2 * i);
      else this.field.blockRect(s.x - s.r - i, s.y - s.r - i, 2 * (s.r + i), 2 * (s.r + i));
    }
  }
}

/** Segment vs AABB (slab method). */
function segRect(x0: number, y0: number, dx: number, dy: number, s: Solid): number | null {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[x0, dx, s.x, s.x + s.w], [y0, dy, s.y, s.y + s.h]]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return null;
      continue;
    }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

function segCircle(x0: number, y0: number, dx: number, dy: number, s: Solid): number | null {
  const fx = x0 - s.x, fy = y0 - s.y;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - s.r * s.r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = c <= 0 ? 0 : (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
