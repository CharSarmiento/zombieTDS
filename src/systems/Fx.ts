import Phaser from 'phaser';
import { getManifest } from '../assets/manifest';
import { DEPTH } from '../entities/Actor';
import { FONT } from '../ui/fonts';

const MAX_BLOOD = 160;
const BLOOD_TINT = 0x5e0b0b;

/** Short-lived combat feedback: muzzle flashes, impacts, blood decals, damage numbers, shake. */
export class Fx {
  private blood: Phaser.GameObjects.Image[] = [];
  private bloodFrames: string[];

  constructor(private scene: Phaser.Scene) {
    // the darker water spots read well as blood once tinted
    this.bloodFrames = getManifest(scene).statics.water_spot.frames.filter((f) => !f.includes('light')).slice(0, 15);
  }

  /** Flash art points down (+Y) from the muzzle. */
  muzzleFlash(x: number, y: number, angle: number, frame: string): void {
    const img = this.scene.add
      .image(x, y, 'fx', frame)
      .setOrigin(0.5, 0.15)
      .setRotation(angle - Math.PI / 2)
      .setDepth(DEPTH.player + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.time.delayedCall(55, () => img.destroy());
  }

  impact(x: number, y: number, angle: number): void {
    const img = this.scene.add
      .image(x, y, 'fx', 'fx/gun_rifle_01')
      .setRotation(angle + Math.PI / 2)
      .setScale(0.7)
      .setDepth(DEPTH.overhead)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: img, alpha: 0, scale: 0.3, duration: 90, onComplete: () => img.destroy() });
  }

  bloodSplat(x: number, y: number, size = 1): void {
    const img = this.scene.add
      .image(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10), 'env', Phaser.Utils.Array.GetRandom(this.bloodFrames))
      .setTint(BLOOD_TINT)
      .setRotation(Math.random() * Math.PI * 2)
      .setScale(Phaser.Math.FloatBetween(0.3, 0.55) * size)
      .setAlpha(0.85)
      .setDepth(DEPTH.decal);
    this.blood.push(img);
    if (this.blood.length > MAX_BLOOD) this.blood.shift()?.destroy();
  }

  damageNumber(x: number, y: number, amount: number, color = '#ffffff'): void {
    const t = this.scene.add
      .text(x + Phaser.Math.Between(-12, 12), y - 30, String(Math.round(amount)), {
        fontFamily: FONT,
        fontSize: '26px',
        color,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui - 1)
      .setStroke('#000000', 4);
    this.scene.tweens.add({ targets: t, y: t.y - 46, alpha: 0, duration: 650, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  shake(intensity: number, ms = 90): void {
    if (intensity > 0) this.scene.cameras.main.shake(ms, intensity, false);
  }
}
