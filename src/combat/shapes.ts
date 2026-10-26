import Phaser from 'phaser';
import type { AttackShape } from '../data/enemies';

/** True if a circle (px, py, pr) touches the shape cast from (ox, oy) facing `angle`. */
export function shapeHits(s: AttackShape, ox: number, oy: number, angle: number, px: number, py: number, pr: number): boolean {
  const dx = px - ox, dy = py - oy;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  switch (s.type) {
    case 'arc': {
      const d = Math.hypot(dx, dy);
      if (d - pr > s.radius) return false;
      if (d < pr || s.angle >= 360) return true;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle));
      return diff <= Phaser.Math.DegToRad(s.angle) / 2 + Math.atan2(pr, d);
    }
    case 'line': {
      const along = dx * cos + dy * sin;
      const across = -dx * sin + dy * cos;
      return along >= -pr && along <= s.length + pr && Math.abs(across) <= s.width / 2 + pr;
    }
    case 'circle':
      return Math.hypot(dx - cos * s.offset, dy - sin * s.offset) <= s.radius + pr;
  }
}

/** Draws the shape in local space (origin at the attacker, facing +X) into a Graphics. */
export function drawShape(g: Phaser.GameObjects.Graphics, s: AttackShape, fill: number, alpha: number, stroke = true): void {
  g.clear().fillStyle(fill, alpha);
  if (stroke) g.lineStyle(4, fill, Math.min(1, alpha + 0.35));
  switch (s.type) {
    case 'arc': {
      if (s.angle >= 360) {
        g.fillCircle(0, 0, s.radius);
        if (stroke) g.strokeCircle(0, 0, s.radius);
        break;
      }
      const half = Phaser.Math.DegToRad(s.angle) / 2;
      g.slice(0, 0, s.radius, -half, half, false).fillPath();
      if (stroke) g.slice(0, 0, s.radius, -half, half, false).strokePath();
      break;
    }
    case 'line':
      g.fillRect(0, -s.width / 2, s.length, s.width);
      if (stroke) g.strokeRect(0, -s.width / 2, s.length, s.width);
      break;
    case 'circle':
      g.fillCircle(s.offset, 0, s.radius);
      if (stroke) g.strokeCircle(s.offset, 0, s.radius);
      break;
  }
}
