import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { DEPTH } from '../entities/Actor';
import type { WeaponStatus } from '../systems/WeaponSystem';
import { FONT } from './fonts';

const W = 380;
const H = 132;

/** Bottom-right panel: weapon icon and name, ammo, reload progress, fuel gauge. */
export class WeaponHud {
  readonly root: Phaser.GameObjects.Container;
  private icon: Phaser.GameObjects.Image;
  private name: Phaser.GameObjects.Text;
  private ammo: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private shownIcon = '';

  constructor(scene: Phaser.Scene) {
    const x = GAME_WIDTH - W - 30;
    const y = GAME_HEIGHT - H - 30;
    const bg = scene.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setStrokeStyle(3, 0x8a8a5a, 0.9);
    this.icon = scene.add.image(78, H / 2, 'ui', 'items/0014_gun');
    this.name = scene.add.text(160, 18, '', { fontFamily: FONT, fontSize: '28px', color: '#c8e04a' });
    this.ammo = scene.add.text(160, 54, '', { fontFamily: FONT, fontSize: '40px', color: '#ffffff' });
    this.bar = scene.add.graphics();
    this.root = scene.add.container(x, y, [bg, this.icon, this.name, this.ammo, this.bar]).setScrollFactor(0).setDepth(DEPTH.ui);
  }

  update(s: WeaponStatus): void {
    if (s.icon !== this.shownIcon) {
      this.shownIcon = s.icon;
      this.icon.setFrame(s.icon);
      const f = this.icon.frame;
      this.icon.setScale(Math.min(130 / f.realWidth, 100 / f.realHeight));
    }
    this.name.setText(s.name.toUpperCase());
    const g = this.bar.clear();
    const bx = 160, by = H - 22, bw = W - 180, bh = 10;

    if (s.kind === 'melee') {
      this.ammo.setText('∞').setColor('#ffffff');
    } else if (s.kind === 'gun') {
      const reserve = Number.isFinite(s.reserve) ? String(s.reserve) : '∞';
      this.ammo.setText(s.reload !== null ? 'RECARGANDO' : `${s.mag} / ${reserve}`);
      this.ammo.setColor(s.reload !== null ? '#ffcc40' : s.mag === 0 ? '#ff5050' : '#ffffff').setFontSize(s.reload !== null ? 30 : 40);
      if (s.reload !== null) {
        g.fillStyle(0x222222, 1).fillRect(bx, by, bw, bh);
        g.fillStyle(0xffcc40, 1).fillRect(bx, by, bw * s.reload, bh);
      }
    } else {
      this.ammo.setText(`${Math.ceil(s.fuel * 100)}%`).setColor(s.fuel > 0 ? '#ffffff' : '#ff5050').setFontSize(40);
      g.fillStyle(0x222222, 1).fillRect(bx, by, bw, bh);
      g.fillStyle(s.fuel > 0.25 ? 0xff8a20 : 0xff3030, 1).fillRect(bx, by, bw * s.fuel, bh);
    }
  }
}
