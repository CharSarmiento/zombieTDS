import Phaser from 'phaser';
import type { Damageable } from '../combat/types';
import { DEPTH } from '../entities/Actor';
import type { Fx } from './Fx';

interface Bullet {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  left: number;
  damage: number;
  knockback: number;
  active: boolean;
}

/**
 * Pooled bullets, moved manually and tested as segments against target circles each frame,
 * so fast bullets never tunnel through enemies.
 */
export class Projectiles {
  private pool: Bullet[] = [];

  constructor(
    private scene: Phaser.Scene,
    private fx: Fx,
    private targets: () => readonly Damageable[],
    /** walls and other bullet-blocking geometry: first hit t in [0,1] along the segment, or null */
    private blocker: (x0: number, y0: number, dx: number, dy: number) => number | null = () => null,
  ) {}

  fire(x: number, y: number, angle: number, speed: number, range: number, damage: number, knockback: number): void {
    let b = this.pool.find((p) => !p.active);
    if (!b) {
      const img = this.scene.add.image(0, 0, 'fx', 'fx/shot').setDepth(DEPTH.player - 1).setBlendMode(Phaser.BlendModes.ADD);
      b = { img, vx: 0, vy: 0, left: 0, damage: 0, knockback: 0, active: false };
      this.pool.push(b);
    }
    b.active = true;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.left = range;
    b.damage = damage;
    b.knockback = knockback;
    b.img.setPosition(x, y).setRotation(angle - Math.PI / 2).setVisible(true).setActive(true);
  }

  update(dt: number): void {
    for (const b of this.pool) {
      if (!b.active) continue;
      const x0 = b.img.x, y0 = b.img.y;
      const step = Math.min(Math.hypot(b.vx, b.vy) * dt, b.left);
      const len = Math.hypot(b.vx, b.vy);
      const dx = (b.vx / len) * step, dy = (b.vy / len) * step;

      const hit = this.firstHit(x0, y0, dx, dy);
      const wall = this.blocker(x0, y0, dx, dy);
      if (wall !== null && (!hit || wall < hit.t)) {
        this.fx.impact(x0 + dx * wall, y0 + dy * wall, Math.atan2(dy, dx));
        this.release(b);
        continue;
      }
      if (hit) {
        const hx = x0 + dx * hit.t, hy = y0 + dy * hit.t;
        hit.target.takeDamage({ amount: b.damage, source: 'bullet', fromX: x0, fromY: y0, knockback: b.knockback });
        this.fx.impact(hx, hy, Math.atan2(dy, dx));
        this.release(b);
        continue;
      }
      b.img.setPosition(x0 + dx, y0 + dy);
      b.left -= step;
      if (b.left <= 0) this.release(b);
    }
  }

  /** Closest target crossed by the segment (x0,y0)+t*(dx,dy), t in [0,1]. */
  private firstHit(x0: number, y0: number, dx: number, dy: number): { target: Damageable; t: number } | null {
    let best: { target: Damageable; t: number } | null = null;
    const a = dx * dx + dy * dy;
    for (const target of this.targets()) {
      if (!target.alive) continue;
      const fx = x0 - target.x, fy = y0 - target.y;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - target.radius * target.radius;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = c <= 0 ? 0 : (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t <= 1 && (!best || t < best.t)) best = { target, t };
    }
    return best;
  }

  private release(b: Bullet): void {
    b.active = false;
    b.img.setVisible(false).setActive(false);
  }
}
