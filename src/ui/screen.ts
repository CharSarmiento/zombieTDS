import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../systems/AudioManager';
import type { Box } from './windows';
import { FONT } from './fonts';

export const COLORS = {
  lime: '#c8e04a',
  dark: '#1b220c',
  text: '#ffffff',
  dim: '#9aa080',
  red: '#ff5a5a',
} as const;

/** Full-screen illustrated background, dimmed so windows stand out. */
export function addBackdrop(scene: Phaser.Scene, key = 'bg2', dim = 0.45): void {
  scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, key).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
  scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, dim).setOrigin(0);
}

/** Places a pack window and returns a mapper from window-local layout boxes to screen space. */
export function addWindow(scene: Phaser.Scene, frame: string, cx: number, cy: number, scale = 1) {
  const img = scene.add.image(cx, cy, 'ui', frame).setScale(scale);
  const left = cx - img.displayWidth / 2;
  const top = cy - img.displayHeight / 2;
  const at = (b: Box) => ({
    x: left + b.x * scale,
    y: top + b.y * scale,
    w: b.w * scale,
    h: b.h * scale,
    rect: new Phaser.Geom.Rectangle(left + (b.x - b.w / 2) * scale, top + (b.y - b.h / 2) * scale, b.w * scale, b.h * scale),
  });
  return { img, at, scale };
}

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string = COLORS.text,
  origin: [number, number] = [0.5, 0.5],
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color }).setOrigin(...origin);
}

/** Scales an image to fit inside w×h, keeping its aspect ratio. */
export function fit<T extends Phaser.GameObjects.Image>(img: T, w: number, h: number): T {
  return img.setScale(Math.min(w / img.frame.realWidth, h / img.frame.realHeight));
}

/** Short floating message (purchase done, not enough money…). */
export function toast(scene: Phaser.Scene, x: number, y: number, message: string, color: string = COLORS.lime): void {
  // red messages are refusals; "¡…!" in green are purchases
  if (color === COLORS.red) audio.sfx('ui_error');
  else if (message.startsWith('¡')) audio.sfx('ui_buy');
  const t = text(scene, x, y, message, 34, color).setStroke('#000', 6).setDepth(1000);
  scene.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

/** Green "lit" or dark pips for upgrade levels (pack elements el/0045 and el/0046). */
export function pips(scene: Phaser.Scene, x: number, y: number, level: number, max: number, size = 30): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const gap = size * 1.25;
  for (let i = 0; i < max; i++) {
    const img = scene.add.image((i - (max - 1) / 2) * gap, 0, 'ui', i < level ? 'el/0045' : 'el/0046');
    c.add(fit(img, size, size));
  }
  return c;
}
