import Phaser from 'phaser';
import type { EnemyId } from '../data/enemies';

/** Weighted pick of enemy types for the test arena. */
const MIX: [EnemyId, number][] = [
  ['zombie1', 18], ['zombie2', 18], ['zombie3', 17], ['zombie4', 17], ['cop', 18], ['army', 12],
];

/**
 * Temporary endless spawner for the M4 arena: keeps a growing number of zombies alive, spawning
 * them just outside the camera view. The WaveDirector of M6 replaces it.
 */
export class TestSpawner {
  private elapsed = 0;
  private nextSpawn = 0;

  constructor(
    private scene: Phaser.Scene,
    private bounds: Phaser.Geom.Rectangle,
    private isFree: (x: number, y: number) => boolean,
    private spawn: (kind: EnemyId, x: number, y: number) => void,
    private aliveCount: () => number,
    /** map spawn markers; when some are off-screen they are preferred over random spots */
    private points: Phaser.Math.Vector2[] = [],
  ) {}

  /** Target population: 6 at start, +1 every 8 s, capped at 45. */
  get target(): number {
    return Math.min(45, 6 + Math.floor(this.elapsed / 8));
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.nextSpawn -= dt;
    if (this.nextSpawn > 0 || this.aliveCount() >= this.target) return;
    this.nextSpawn = 0.35;
    this.spawnOne();
  }

  /** Spawns `n` zombies right away (debug key). */
  burst(n: number): void {
    for (let i = 0; i < n; i++) this.spawnOne();
  }

  private spawnOne(): void {
    const view = this.scene.cameras.main.worldView;
    const margin = 140;
    const hidden = this.points.filter((p) => !Phaser.Geom.Rectangle.Contains(Phaser.Geom.Rectangle.Inflate(Phaser.Geom.Rectangle.Clone(view), margin, margin), p.x, p.y));
    if (hidden.length) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const p = Phaser.Utils.Array.GetRandom(hidden);
        const x = p.x + Phaser.Math.Between(-60, 60), y = p.y + Phaser.Math.Between(-60, 60);
        if (this.bounds.contains(x, y) && this.isFree(x, y)) {
          this.spawn(pickWeighted(MIX), x, y);
          return;
        }
      }
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      // a random point on a ring just outside the visible area
      const side = Phaser.Math.Between(0, 3);
      const x = side === 0 ? view.left - margin : side === 1 ? view.right + margin : Phaser.Math.Between(view.left, view.right);
      const y = side === 2 ? view.top - margin : side === 3 ? view.bottom + margin : Phaser.Math.Between(view.top, view.bottom);
      if (!this.bounds.contains(x, y) || !this.isFree(x, y)) continue;
      this.spawn(pickWeighted(MIX), x, y);
      return;
    }
  }
}

function pickWeighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}
