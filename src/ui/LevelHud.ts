import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { BUFFS, type BuffId } from '../data/pickups';
import { DEPTH } from '../entities/Actor';
import type { Player } from '../entities/Player';
import type { ObjectiveStatus } from '../systems/LevelDirector';
import { FONT } from './fonts';

const BAR_W = 420;

/**
 * Level HUD: objective and progress (top centre), money and active power-ups (top right),
 * an arrow towards the current target area, and big centred announcements.
 */
export class LevelHud {
  private title: Phaser.GameObjects.Text;
  private detail: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private money: Phaser.GameObjects.Text;
  private buffIcons: Phaser.GameObjects.Container;
  private arrow: Phaser.GameObjects.Image;
  private zone: Phaser.GameObjects.Graphics;
  private shownBuffs = '';
  private banners = new Set<Phaser.GameObjects.Container>();

  constructor(
    private scene: Phaser.Scene,
    private player: Player,
    private areas: Record<string, Phaser.Geom.Rectangle[]>,
  ) {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T) =>
      o.setScrollFactor(0).setDepth(DEPTH.ui);
    this.title = fixed(scene.add.text(GAME_WIDTH / 2, 26, '', { fontFamily: FONT, fontSize: '40px', color: '#c8e04a' }).setOrigin(0.5, 0).setStroke('#000', 6));
    this.detail = fixed(scene.add.text(GAME_WIDTH / 2, 74, '', { fontFamily: FONT, fontSize: '24px', color: '#ffffff' }).setOrigin(0.5, 0).setStroke('#000', 4));
    this.bar = fixed(scene.add.graphics());
    fixed(scene.add.image(GAME_WIDTH - 200, 50, 'ui', 'items/0013_money').setScale(0.42));
    this.money = fixed(scene.add.text(GAME_WIDTH - 150, 50, '', { fontFamily: FONT, fontSize: '38px', color: '#c8e04a' }).setOrigin(0, 0.5).setStroke('#000', 5));
    this.buffIcons = fixed(scene.add.container(GAME_WIDTH - 40, 120));
    this.arrow = fixed(scene.add.image(0, 0, 'ui', 'el/0101').setVisible(false));
    this.zone = scene.add.graphics().setDepth(DEPTH.decal + 2);
  }

  update(status: ObjectiveStatus, money: number): void {
    this.title.setText(status.title);
    this.detail.setText(status.detail);
    const g = this.bar.clear();
    if (status.progress !== null) {
      const x = (GAME_WIDTH - BAR_W) / 2, y = 108;
      g.fillStyle(0x000000, 0.6).fillRect(x - 3, y - 3, BAR_W + 6, 14);
      g.fillStyle(0xc8e04a, 1).fillRect(x, y, BAR_W * Phaser.Math.Clamp(status.progress, 0, 1), 8);
    }
    this.money.setText(`$${money}`);
    this.updateBuffs();
    this.updateTarget(status.target);
  }

  /** Big centred announcement that fades out. */
  banner(title: string, subtitle = ''): void {
    const t = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.36, title, { fontFamily: FONT, fontSize: '96px', color: '#c8e04a' })
      .setOrigin(0.5)
      .setStroke('#000', 10);
    const s = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.36 + 80, subtitle, { fontFamily: FONT, fontSize: '38px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#000', 6);
    const box = this.scene.add.container(0, 0, [t, s]).setScrollFactor(0).setDepth(DEPTH.ui + 5).setAlpha(0);
    this.banners.add(box);
    box.once(Phaser.GameObjects.Events.DESTROY, () => this.banners.delete(box));
    this.scene.tweens.chain({
      targets: box,
      tweens: [
        { alpha: 1, duration: 220 },
        { alpha: 1, duration: 1500 },
        { alpha: 0, duration: 450 },
      ],
      onComplete: () => box.destroy(),
    });
    t.setScale(1.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
  }

  /** Hides objective text, arrow and pending announcements (end-of-run overlay on top). */
  hideForResults(): void {
    for (const b of this.banners) b.destroy();
    this.title.setVisible(false);
    this.detail.setVisible(false);
    this.bar.setVisible(false);
    this.arrow.setVisible(false);
    this.zone.clear();
  }

  private updateBuffs(): void {
    const active = (Object.keys(this.player.buffs) as BuffId[]).filter((id) => this.player.buffs[id] > 0);
    const key = active.join(',');
    if (key !== this.shownBuffs) {
      this.shownBuffs = key;
      this.buffIcons.removeAll(true);
      active.forEach((id, i) => {
        const icon = this.scene.add.image(-i * 84 - 36, 0, 'ui', BUFFS[id].icon);
        icon.setScale(64 / Math.max(icon.frame.realWidth, icon.frame.realHeight));
        const t = this.scene.add.text(-i * 84 - 36, 44, '', { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5).setStroke('#000', 4);
        t.setName(id);
        this.buffIcons.add([icon, t]);
      });
    }
    for (const id of active) {
      const t = this.buffIcons.getByName(id) as Phaser.GameObjects.Text | null;
      t?.setText(String(Math.ceil(this.player.buffs[id])));
    }
  }

  /** Pulsing target zone in the world, plus an edge-of-screen arrow while it is off-screen. */
  private updateTarget(target: string | null): void {
    this.zone.clear();
    const rect = target ? this.areas[target]?.[0] : undefined;
    if (!rect) {
      this.arrow.setVisible(false);
      return;
    }
    const pulse = 0.35 + 0.25 * Math.sin(this.scene.time.now / 200);
    this.zone.fillStyle(0xc8e04a, pulse * 0.5).fillRect(rect.x, rect.y, rect.width, rect.height);
    this.zone.lineStyle(4, 0xc8e04a, pulse + 0.3).strokeRect(rect.x, rect.y, rect.width, rect.height);

    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const cx = rect.centerX, cy = rect.centerY;
    const onScreen = view.contains(cx, cy);
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, cx, cy);
    let sx: number, sy: number;
    if (onScreen) {
      // bob above the zone
      sx = (cx - view.x) * cam.zoom;
      sy = (rect.y - view.y) * cam.zoom - 50 + Math.sin(this.scene.time.now / 150) * 8;
      this.arrow.setRotation(Math.PI / 2);
    } else {
      // clamp to the screen border in the direction of the target
      const m = 70;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const tx = dx > 0 ? (GAME_WIDTH / 2 - m) / dx : dx < 0 ? (-GAME_WIDTH / 2 + m) / dx : Infinity;
      const ty = dy > 0 ? (GAME_HEIGHT / 2 - m) / dy : dy < 0 ? (-GAME_HEIGHT / 2 + m) / dy : Infinity;
      const t = Math.min(tx, ty);
      sx = GAME_WIDTH / 2 + dx * t;
      sy = GAME_HEIGHT / 2 + dy * t;
      this.arrow.setRotation(angle);
    }
    this.arrow.setVisible(true).setPosition(sx, sy).setScale(1 + 0.1 * Math.sin(this.scene.time.now / 120));
  }
}
