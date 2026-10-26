import Phaser from 'phaser';
import type { InputFrame } from '../systems/InputManager';

/** Something selectable in a menu screen. */
export interface Focusable {
  /** screen position used for directional navigation */
  x: number;
  y: number;
  /** hit area for the mouse (screen coordinates) */
  hit: Phaser.Geom.Rectangle;
  onFocus?: () => void;
  onBlur?: () => void;
  activate: () => void;
  disabled?: () => boolean;
}

/**
 * Spatial focus navigation shared by every menu screen: arrows / WASD / d-pad / stick move to
 * the nearest item in that direction, the mouse focuses on hover and activates on click,
 * Enter / Space / A activates. One focus for all devices, so mixing them never confuses it.
 */
export class FocusGroup {
  private items: Focusable[] = [];
  private index = -1;

  constructor(scene: Phaser.Scene) {
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerdown', this.onDown, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerdown', this.onDown, this);
    });
  }

  add(item: Focusable): Focusable {
    this.items.push(item);
    return item;
  }

  /** Removes every item (screens that rebuild their contents). */
  clear(): void {
    this.items = [];
    this.index = -1;
  }

  get current(): Focusable | undefined {
    return this.items[this.index];
  }

  focus(item: Focusable | undefined): void {
    const i = item ? this.items.indexOf(item) : -1;
    if (i === this.index) return;
    this.current?.onBlur?.();
    this.index = i;
    this.current?.onFocus?.();
  }

  update(input: InputFrame): void {
    if (input.navX || input.navY) this.move(input.navX, input.navY);
    if (input.confirmPressed && this.current && !this.current.disabled?.()) this.current.activate();
  }

  private move(dx: number, dy: number): void {
    const from = this.current;
    if (!from) {
      this.focus(this.items[0]);
      return;
    }
    let best: Focusable | undefined;
    let bestScore = Infinity;
    for (const it of this.items) {
      if (it === from) continue;
      const vx = it.x - from.x, vy = it.y - from.y;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(dx ? vy : vx);
      // prefer items straight ahead; sideways distance costs more than distance along
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) this.focus(best);
  }

  private hitAt(p: Phaser.Input.Pointer): Focusable | undefined {
    return this.items.find((it) => it.hit.contains(p.x, p.y));
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const it = this.hitAt(p);
    if (it) this.focus(it);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const it = this.hitAt(p);
    if (!it || !p.leftButtonDown()) return;
    this.focus(it);
    if (!it.disabled?.()) it.activate();
  }
}
