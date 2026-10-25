import Phaser from 'phaser';
import { getManifest } from '../assets/manifest';
import type { Hit } from '../combat/types';
import { CHARACTERS, PLAYER, type CharacterId } from '../data/player';
import { WEAPONS, type WeaponId } from '../data/weapons';
import type { InputFrame } from '../systems/InputManager';
import { Actor, DEPTH } from './Actor';

/**
 * The survivor: twin-stick movement and aiming, per-weapon walk animations.
 * Weapon logic lives in WeaponSystem, which drives the attack animations through
 * playAttack / playAttackLoop / endAttack.
 */
export class Player extends Actor {
  /** emits 'hurt' (hit: Hit) and 'died' */
  readonly events = new Phaser.Events.EventEmitter();
  weapon: WeaponId = 'gun';
  moving = false;
  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  armor = 0;
  maxArmor = PLAYER.maxArmor;
  alive = true;
  private invulnerableUntil = 0;
  private hurtFlashUntil = 0;
  /** an attack animation owns the sprite; walk/idle updates wait until it ends */
  private attacking = false;
  private shownAnim = '';

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly character: CharacterId,
  ) {
    super(scene, x, y, PLAYER.radius, { atlas: 'env', frame: CHARACTERS[character].shadow }, DEPTH.player);
    this.body.setCollideWorldBounds(true);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimComplete, this);
    this.refreshAnim(true);
  }

  update(input: InputFrame, dt: number): void {
    this.updateHurtVisuals();
    if (!this.alive) return;
    this.updateMovement(input, dt);
    this.updateAim(input, dt);
    this.refreshAnim();
  }

  takeDamage(hit: Hit): void {
    const now = this.scene.time.now;
    if (!this.alive || now < this.invulnerableUntil) return;
    let amount = hit.amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * PLAYER.armorAbsorb);
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableUntil = now + PLAYER.invulnerableMs;
    this.hurtFlashUntil = now + 140;
    const away = new Phaser.Math.Vector2(this.x - hit.fromX, this.y - hit.fromY).normalize();
    this.body.velocity.add(away.scale(hit.knockback * PLAYER.knockbackTaken));
    this.events.emit('hurt', hit);
    if (this.hp <= 0) this.die();
  }

  heal(amount: number): void {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  private die(): void {
    this.alive = false;
    this.attacking = false;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.sprite.anims.chain();
    this.sprite.anims.timeScale = 1;
    this.sprite.play(`${this.character}/death`);
    this.events.emit('died');
  }

  /** Red flash on hit, blinking while invulnerable. */
  private updateHurtVisuals(): void {
    const now = this.scene.time.now;
    if (now < this.hurtFlashUntil) this.sprite.setTint(0xff5050);
    else this.sprite.clearTint();
    const blinking = this.alive && now < this.invulnerableUntil;
    this.sprite.setAlpha(blinking && Math.floor(now / 70) % 2 === 0 ? 0.55 : 1);
  }

  /**
   * One-shot attack animation (`attack_<anim>`), time-scaled to last `duration` seconds if given.
   * With `restart` false, an attack already playing keeps going (automatic fire).
   */
  playAttack(anim: string, duration?: number, restart = true): void {
    const key = `${this.character}/${anim}`;
    if (!restart && this.attacking && this.sprite.anims.isPlaying && this.sprite.anims.currentAnim?.key === key) return;
    this.attacking = true;
    this.shownAnim = key;
    this.sprite.play(key);
    const a = this.sprite.anims.currentAnim;
    this.sprite.anims.timeScale = duration && a ? a.duration / 1000 / duration : 1;
  }

  /** Plays `start` once, then loops `loop` until endAttack. */
  playAttackLoop(start: string, loop: string): void {
    this.attacking = true;
    this.shownAnim = loop;
    this.sprite.anims.timeScale = 1;
    this.sprite.play(`${this.character}/${start}`).chain(`${this.character}/${loop}`);
  }

  /** Stops a looping attack, optionally through an outro animation. */
  endAttack(outro?: string): void {
    this.sprite.anims.chain(); // clear any queued loop
    if (outro) {
      this.sprite.play(`${this.character}/${outro}`);
    } else {
      this.attacking = false;
      this.refreshAnim(true);
    }
  }

  /** Weapon tip in world coordinates for the given animation (falls back to the body centre). */
  muzzle(anim: string): Phaser.Math.Vector2 {
    const tip = getManifest(this.scene).muzzles[this.character]?.[anim];
    const v = new Phaser.Math.Vector2(tip?.x ?? 0, tip?.y ?? 0).rotate(this.facing - Math.PI / 2);
    return v.add(new Phaser.Math.Vector2(this.x, this.y));
  }

  private onAnimComplete(anim: Phaser.Animations.Animation): void {
    if (!this.alive) return;
    // an intro hands over to its chained loop, so the attack is still going
    if (!anim.key.includes('/attack_') || anim.key.endsWith('_start')) return;
    this.attacking = false;
    this.refreshAnim(true);
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
    if (!this.attacking) this.sprite.anims.timeScale = Phaser.Math.Clamp(current / PLAYER.walkSpeed, 0.4, 1.6);
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
    if (this.attacking) return;
    const key = `${this.character}/walk_${WEAPONS[this.weapon].anim}`;
    const state = `${key}|${this.moving}`;
    if (!force && state === this.shownAnim) return;
    this.shownAnim = state;
    this.sprite.play(key);
    if (!this.moving) this.sprite.anims.pause();
  }
}
