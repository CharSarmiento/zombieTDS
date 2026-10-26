import Phaser from 'phaser';

const MARGIN = 140;

/**
 * Chooses where enemies appear: a map spawn marker outside the camera view when possible,
 * otherwise a free spot on a ring just outside the view.
 */
export class SpawnPicker {
  constructor(
    private scene: Phaser.Scene,
    private bounds: Phaser.Geom.Rectangle,
    private isFree: (x: number, y: number) => boolean,
    private points: Phaser.Math.Vector2[] = [],
  ) {}

  pick(): Phaser.Math.Vector2 | null {
    const view = Phaser.Geom.Rectangle.Inflate(Phaser.Geom.Rectangle.Clone(this.scene.cameras.main.worldView), MARGIN, MARGIN);
    const hidden = this.points.filter((p) => !view.contains(p.x, p.y));
    for (let attempt = 0; attempt < 10 && hidden.length; attempt++) {
      const p = Phaser.Utils.Array.GetRandom(hidden);
      const x = p.x + Phaser.Math.Between(-60, 60), y = p.y + Phaser.Math.Between(-60, 60);
      if (this.bounds.contains(x, y) && this.isFree(x, y)) return new Phaser.Math.Vector2(x, y);
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const side = Phaser.Math.Between(0, 3);
      const x = side === 0 ? view.left : side === 1 ? view.right : Phaser.Math.Between(view.left, view.right);
      const y = side === 2 ? view.top : side === 3 ? view.bottom : Phaser.Math.Between(view.top, view.bottom);
      if (this.bounds.contains(x, y) && this.isFree(x, y)) return new Phaser.Math.Vector2(x, y);
    }
    return null;
  }
}

export function pickWeighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}
