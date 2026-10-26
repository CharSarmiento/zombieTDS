import Phaser from 'phaser';
import type { Damageable, Hit } from '../combat/types';
import type { ExplosivePlacement, Level } from '../level/Level';
import { audio } from '../systems/AudioManager';
import { DEPTH } from './Actor';

export const EXPLOSION = {
  radius: 230,
  /** damage at the centre, falling off linearly to 25% at the edge */
  damage: 140,
  /** the player takes this fraction (being caught by your own barrel hurts, but is survivable) */
  playerFactor: 0.4,
  knockback: 520,
  hp: 30,
};

/** Red barrel: can be shot, burned or blown up by another explosion. */
export class Barrel implements Damageable {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  alive = true;
  private hp = EXPLOSION.hp;

  constructor(
    private scene: Phaser.Scene,
    private level: Level,
    private placed: ExplosivePlacement,
    /** applies the blast to everything around (the scene knows all damageables) */
    private onExplode: (b: Barrel) => void,
  ) {
    this.x = placed.solid.x;
    this.y = placed.solid.y;
    this.radius = placed.solid.r;
  }

  takeDamage(hit: Hit): void {
    if (!this.alive) return;
    this.hp -= hit.amount;
    if (hit.burn || hit.source === 'explosion') this.hp = 0;
    if (this.hp <= 0) this.explode(hit.source === 'explosion' ? 140 : 0);
  }

  private explode(delayMs: number): void {
    this.alive = false;
    // chain reactions ripple outwards instead of all going off on the same frame
    this.scene.time.delayedCall(delayMs, () => {
      this.placed.image.destroy();
      this.placed.shadow?.destroy();
      this.level.removeSolid(this.placed.solid);
      // scorch mark
      this.scene.add
        .image(this.x, this.y, 'env', 'water_spot/water_darkspot_0005')
        .setTint(0x141210)
        .setAlpha(0.9)
        .setScale(2.4)
        .setRotation(Math.random() * Math.PI * 2)
        .setDepth(DEPTH.decal);
      audio.sfx('explosion');
      const boom = this.scene.add.sprite(this.x, this.y, 'fx').play('fx/explosion').setScale(1.7).setDepth(DEPTH.overhead + 1);
      boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy());
      this.onExplode(this);
    });
  }
}
