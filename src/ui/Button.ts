import Phaser from 'phaser';
import type { Focusable, FocusGroup } from './Focus';
import { COLORS, text } from './screen';

const FRAME = 'el/0068';
/** The green bar sits above the image centre (hoses hang below it): offset in source px. */
export const BUTTON_LABEL_DY = -14.5;

/** Green pack button registered in a FocusGroup; brightens and grows when focused. */
export function addButton(
  scene: Phaser.Scene,
  focus: FocusGroup,
  x: number,
  y: number,
  label: string,
  action: () => void,
  scale = 0.8,
): { bg: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; item: Focusable } {
  const bg = scene.add.image(x, y, 'ui', FRAME).setScale(scale).setTint(0x8c8c8c);
  const t = text(scene, x, y + BUTTON_LABEL_DY * scale, label, Math.round(40 * scale), '#2c321e');
  const item = focus.add({
    x,
    y,
    hit: bg.getBounds(),
    activate: action,
    onFocus: () => {
      bg.setTint(0xffffff).setScale(scale * 1.06);
      t.setColor(COLORS.dark);
    },
    onBlur: () => {
      bg.setTint(0x8c8c8c).setScale(scale);
      t.setColor('#2c321e');
    },
  });
  return { bg, label: t, item };
}
