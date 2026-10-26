import Phaser from 'phaser';

/** What the crowd needs from each member. */
export interface CrowdMember {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alive: boolean;
  readonly root: Phaser.GameObjects.Zone;
  readonly mass: number;
  /** current speed, px/s */
  readonly speed: number;
}

/** Only part of the overlap is corrected each frame, so pushing looks soft instead of jittery. */
const PUSH_FACTOR = 0.5;
/** members closer than this (times the sum of radii) count as neighbours for steering */
const NEIGHBOUR_RANGE = 1.6;

/**
 * Soft crowd behaviour for the horde, replacing rigid body-vs-body collisions (which made
 * zombies jam into queues). A spatial hash keeps neighbour queries cheap:
 *  - resolve(): gently pushes overlapping members apart (mass-weighted)
 *  - avoidance(): steering that slides a member around whoever blocks its way
 */
export class Crowd<T extends CrowdMember> {
  private cells = new Map<number, T[]>();

  /** cells must exceed the largest pair of radii (megaboss + walker) for 3×3 neighbour queries */
  constructor(private cellSize = 150) {}

  rebuild(members: readonly T[]): void {
    this.cells.clear();
    for (const m of members) {
      if (!m.alive) continue;
      const key = this.key(m.x, m.y);
      const list = this.cells.get(key);
      if (list) list.push(m);
      else this.cells.set(key, [m]);
    }
  }

  /** Separates overlapping members by moving them apart a fraction of the overlap. */
  resolve(): void {
    for (const list of this.cells.values()) {
      for (const a of list) {
        this.forNeighbours(a, (b) => {
          if (b === a || b.x < a.x || (b.x === a.x && b.y <= a.y)) return; // each pair once
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = a.radius + b.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) return;
          const d = Math.sqrt(d2) || 0.01;
          const overlap = (min - d) * PUSH_FACTOR;
          const nx = d2 ? dx / d : 1, ny = d2 ? dy / d : 0;
          const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
          a.root.x -= nx * overlap * wa;
          a.root.y -= ny * overlap * wa;
          b.root.x += nx * overlap * wb;
          b.root.y += ny * overlap * wb;
        });
      }
    }
  }

  /**
   * Steering for a member walking along `dir` (unit): pushes away from close neighbours and,
   * when someone stands right ahead, slides sideways (`side` = ±1, a per-member preference)
   * so the crowd flows around and surrounds the target instead of queueing.
   * Returns a vector roughly in [0..1] units, to be scaled by the member's speed.
   */
  avoidance(m: T, dir: Phaser.Math.Vector2, side: number): Phaser.Math.Vector2 {
    const out = new Phaser.Math.Vector2();
    let blocked = 0;
    /** blocked by someone slow or standing (attacking): only then ease off */
    let jammed = 0;
    this.forNeighbours(m, (o) => {
      if (o === m) return;
      const dx = o.x - m.x, dy = o.y - m.y;
      const range = (m.radius + o.radius) * NEIGHBOUR_RANGE;
      const d2 = dx * dx + dy * dy;
      if (d2 >= range * range || d2 === 0) return;
      const d = Math.sqrt(d2);
      const strength = 1 - d / range;
      out.x -= (dx / d) * strength * 0.6;
      out.y -= (dy / d) * strength * 0.6;
      // neighbour ahead, inside the walking corridor?
      const ahead = (dx * dir.x + dy * dir.y) / d;
      if (ahead > 0.55) {
        blocked = Math.max(blocked, strength * ahead);
        if (o.speed < 30) jammed = Math.max(jammed, strength * ahead);
      }
    });
    if (blocked > 0) {
      // slide perpendicular to the walking direction, on this member's preferred side
      out.x += -dir.y * side * 1.2 * blocked;
      out.y += dir.x * side * 1.2 * blocked;
    }
    if (jammed > 0) {
      // the one ahead is not moving (attacking the target): ease off instead of crushing it.
      // A walking neighbour is simply followed, so queues through doors keep flowing.
      out.x -= dir.x * 0.7 * jammed;
      out.y -= dir.y * 0.7 * jammed;
    }
    return out;
  }

  private forNeighbours(m: T, fn: (o: T) => void): void {
    const cx = Math.floor(m.x / this.cellSize), cy = Math.floor(m.y / this.cellSize);
    for (let y = cy - 1; y <= cy + 1; y++)
      for (let x = cx - 1; x <= cx + 1; x++) {
        const list = this.cells.get(x + y * 100003);
        if (list) for (const o of list) fn(o);
      }
  }

  private key(x: number, y: number): number {
    return Math.floor(x / this.cellSize) + Math.floor(y / this.cellSize) * 100003;
  }
}
