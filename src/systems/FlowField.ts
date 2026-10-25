import Phaser from 'phaser';

const UNREACHABLE = 0xffff;
/** 8 neighbours: dx, dy, cost (x10 to keep integers) */
const DIRS: [number, number, number][] = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];

/**
 * Grid distance field towards a target (the player). Every enemy reads the direction of its cell,
 * so pathing cost is one shortest-path pass per target cell change instead of one search per zombie.
 * Diagonals never cut blocked corners.
 */
export class FlowField {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  private dist: Uint16Array;
  private targetCell = -1;
  private dirty = true;

  constructor(
    worldW: number,
    worldH: number,
    readonly cell: number,
  ) {
    this.cols = Math.ceil(worldW / cell);
    this.rows = Math.ceil(worldH / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.dist = new Uint16Array(this.cols * this.rows).fill(UNREACHABLE);
  }

  /** Marks every cell overlapped by a world rectangle as (un)walkable. */
  blockRect(x: number, y: number, w: number, h: number, value = true): void {
    const c0 = Math.max(0, Math.floor(x / this.cell)), c1 = Math.min(this.cols - 1, Math.floor((x + w - 1) / this.cell));
    const r0 = Math.max(0, Math.floor(y / this.cell)), r1 = Math.min(this.rows - 1, Math.floor((y + h - 1) / this.cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.blocked[r * this.cols + c] = value ? 1 : 0;
    this.dirty = true;
  }

  isBlockedAt(x: number, y: number): boolean {
    const i = this.indexAt(x, y);
    return i < 0 || this.blocked[i] === 1;
  }

  /** Recomputes only when the target enters a new cell (or the grid changed). */
  update(targetX: number, targetY: number): void {
    const t = this.indexAt(targetX, targetY);
    if (t < 0 || (t === this.targetCell && !this.dirty)) return;
    this.targetCell = t;
    this.dirty = false;
    this.compute(t);
  }

  /** Unit direction to walk from (x, y) towards the target, or null if unreachable / already there. */
  direction(x: number, y: number): Phaser.Math.Vector2 | null {
    const i = this.indexAt(x, y);
    if (i < 0) return null;
    const c = i % this.cols, r = (i / this.cols) | 0;
    let best = this.dist[i], bc = -1, br = -1;
    for (const [dx, dy] of DIRS) {
      const nc = c + dx, nr = r + dy;
      if (!this.walkable(nc, nr) || (dx && dy && (!this.walkable(c + dx, r) || !this.walkable(c, r + dy)))) continue;
      const d = this.dist[nr * this.cols + nc];
      if (d < best) { best = d; bc = nc; br = nr; }
    }
    if (bc < 0) return null;
    return new Phaser.Math.Vector2((bc + 0.5) * this.cell - x, (br + 0.5) * this.cell - y).normalize();
  }

  /** True if the straight segment crosses no blocked cell (grid DDA). */
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let c = Math.floor(x0 / this.cell), r = Math.floor(y0 / this.cell);
    const c1 = Math.floor(x1 / this.cell), r1 = Math.floor(y1 / this.cell);
    const dx = x1 - x0, dy = y1 - y0;
    const stepC = Math.sign(dx), stepR = Math.sign(dy);
    const tDeltaC = dx ? Math.abs(this.cell / dx) : Infinity;
    const tDeltaR = dy ? Math.abs(this.cell / dy) : Infinity;
    let tMaxC = dx ? ((stepC > 0 ? (c + 1) * this.cell - x0 : x0 - c * this.cell) / Math.abs(dx)) : Infinity;
    let tMaxR = dy ? ((stepR > 0 ? (r + 1) * this.cell - y0 : y0 - r * this.cell) / Math.abs(dy)) : Infinity;
    for (let guard = 0; guard < this.cols + this.rows; guard++) {
      if (!this.walkable(c, r)) return false;
      if (c === c1 && r === r1) return true;
      if (tMaxC < tMaxR) { tMaxC += tDeltaC; c += stepC; }
      else { tMaxR += tDeltaR; r += stepR; }
    }
    return true;
  }

  private compute(target: number): void {
    this.dist.fill(UNREACHABLE);
    this.dist[target] = 0;
    // queue-based relaxation (SPFA) with costs 10/14: simple and plenty fast for these small grids
    const queue: number[] = [target];
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const c = i % this.cols, r = (i / this.cols) | 0;
      const base = this.dist[i];
      for (const [dx, dy, cost] of DIRS) {
        const nc = c + dx, nr = r + dy;
        if (!this.walkable(nc, nr)) continue;
        if (dx && dy && (!this.walkable(c + dx, r) || !this.walkable(c, r + dy))) continue;
        const n = nr * this.cols + nc;
        const nd = base + cost;
        if (nd < this.dist[n]) {
          this.dist[n] = nd;
          queue.push(n);
        }
      }
    }
  }

  private walkable(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.blocked[r * this.cols + c] === 0;
  }

  private indexAt(x: number, y: number): number {
    const c = Math.floor(x / this.cell), r = Math.floor(y / this.cell);
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows ? r * this.cols + c : -1;
  }
}
