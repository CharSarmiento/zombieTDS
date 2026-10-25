import Phaser from 'phaser';
import { CHARACTERS, PLAYER, type CharacterId } from '../data/player';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../data/weapons';
import type { InputFrame } from '../systems/InputManager';
import { Actor, DEPTH } from './Actor';

/** The survivor: twin-stick movement and aiming, per-weapon walk animations. */
export class Player extends Actor {
  weapon: WeaponId = 'gun';
  private moving = false;
  private shownAnim = '';

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly character: CharacterId,
  ) {
    super(scene, x, y, PLAYER.radius, { atlas: 'env', frame: CHARACTERS[character].shadow }, DEPTH.player);
    this.body.setCollideWorldBounds(true);
    this.refreshAnim(true);
  }

  update(input: InputFrame, dt: number): void {
    this.updateWeapon(input);
    this.updateMovement(input, dt);
    this.updateAim(input, dt);
    this.refreshAnim();
  }

  private updateWeapon(input: InputFrame): void {
    let idx = WEAPON_ORDER.indexOf(this.weapon);
    if (input.weaponSlot !== null && input.weaponSlot < WEAPON_ORDER.length) idx = input.weaponSlot;
    else if (input.weaponDelta) idx = Phaser.Math.Wrap(idx + input.weaponDelta, 0, WEAPON_ORDER.length);
    this.weapon = WEAPON_ORDER[idx];
  }

  private updateMovement(input: InputFrame, dt: number): void {
    const speed = PLAYER.walkSpeed * (input.sprint ? PLAYER.sprintMultiplier : 1);
    const t = 1 - Math.exp(-PLAYER.acceleration * dt);
    const v = this.body.velocity;
    this.body.setVelocity(
      Phaser.Math.Linear(v.x, input.move.x * speed, t),
      Phaser.Math.Linear(v.y, input.move.y * speed, t),
    );
    const current = this.body.velocity.length();
    this.moving = current > 25;
    // play the walk cycle at the pace of the actual movement
    this.sprite.anims.timeScale = Phaser.Math.Clamp(current / PLAYER.walkSpeed, 0.4, 1.6);
  }

  private updateAim(input: InputFrame, dt: number): void {
    if (input.aimWorld) {
      this.facing = Phaser.Math.Angle.Between(this.x, this.y, input.aimWorld.x, input.aimWorld.y);
      return;
    }
    // gamepad: right stick aims; without it, face where you walk
    const dir = input.aimDir ?? (input.move.lengthSq() > 0.04 ? input.move : null);
    if (dir) this.facing = Phaser.Math.Angle.RotateTo(this.facing, dir.angle(), PLAYER.padTurnSpeed * dt);
  }

  /** Walk cycle while moving, first walk frame when standing still. */
  private refreshAnim(force = false): void {
    const key = `${this.character}/walk_${WEAPONS[this.weapon].anim}`;
    const state = `${key}|${this.moving}`;
    if (!force && state === this.shownAnim) return;
    this.shownAnim = state;
    this.sprite.play(key);
    if (!this.moving) this.sprite.anims.pause();
  }
}
