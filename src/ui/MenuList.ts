import Phaser from 'phaser';
import type { InputFrame } from '../systems/InputManager';
import { BUTTON_LABEL_DY } from './Button';
import { FONT } from './fonts';

export interface MenuItem {
  label: string;
  action: () => void;
}

const BUTTON_FRAME = 'el/0068';
const GAP = 18;

/**
 * Vertical list of green pack buttons. Mouse hover/click, keyboard arrows/WASD + Enter and
 * gamepad d-pad/stick + A all work; the selection is shared between them.
 */
export class MenuList {
  readonly root: Phaser.GameObjects.Container;
  private buttons: { bg: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text }[] = [];
  private index = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private items: MenuItem[],
    private scale = 0.85,
  ) {
    this.root = scene.add.container(x, y);
    const h = 120 * scale;
    items.forEach((item, i) => {
      const by = i * (h + GAP);
      const bg = scene.add.image(0, by, 'ui', BUTTON_FRAME).setScale(scale).setInteractive({ useHandCursor: true });
      const text = scene.add
        .text(0, by + BUTTON_LABEL_DY * scale, item.label, { fontFamily: FONT, fontSize: `${Math.round(40 * scale)}px`, color: '#1b220c' })
        .setOrigin(0.5);
      bg.on('pointerover', () => this.select(i));
      bg.on('pointerdown', () => item.action());
      this.root.add([bg, text]);
      this.buttons.push({ bg, text });
    });
    this.select(0);
  }

  get height(): number {
    return this.items.length * (this.buttons[0]?.bg.displayHeight ?? 0) + (this.items.length - 1) * GAP;
  }

  update(input: InputFrame): void {
    if (input.navY) this.select(Phaser.Math.Wrap(this.index + input.navY, 0, this.items.length));
    if (input.confirmPressed) this.items[this.index].action();
  }

  private select(i: number): void {
    this.index = i;
    this.buttons.forEach(({ bg, text }, j) => {
      const on = j === i;
      bg.setTint(on ? 0xffffff : 0x8c8c8c).setScale(this.scale * (on ? 1.06 : 1));
      text.setColor(on ? '#10160a' : '#2c321e');
    });
  }
}
