import Phaser from 'phaser';
import type { Damageable, Hit } from '../combat/types';
import { ENEMIES, ZOMBIE_ANIM_SPEED, type EnemyDef, type EnemyId } from '../data/enemies';
import type { Crowd } from '../systems/Crowd';
import type { FlowField } from '../systems/FlowField';
import type { Fx } from '../systems/Fx';
import { Actor, DEPTH } from './Actor';
import type { Player } from './Player';

/** Shared world services a zombie needs. */
export interface ZombieContext {
  player: Player;
  field: FlowField;
  crowd: Crowd<Zombie>;
  fx: Fx;
  /** global enemy speed factor (slow-enemies pickup) */
  speedMultiplier: () => number;
  onKilled: (z: Zombie) => void;
}

type State = 'chase' | 'attack' | 'stagger' | 'dead';

const TURN_SPEED = 7;
const ACCEL = 6;
const BURN_TINT = 0xff8840;
const SLOW_TINT = 0xa8c8ff;
const CORPSE_MS = 9000;
/** speed factor while off-screen */
const CATCH_UP_MULTIPLIER = 2.2;

/** Melee zombie: follows the flow field (or walks straight when it sees the player) and swipes. */
export class Zombie extends Actor implements Damageable {
  readonly def: EnemyDef;
  hp: number;
  state: State = 'chase';
  private attackReadyAt = 0;
  private stateUntil = 0;
  private baseSpeed: number;
  /** preferred side (±1) to slide around blockers, so the horde spreads both ways */
  private side = Math.random() < 0.5 ? -1 : 1;
  private burnLeft = 0;
  private burnDps = 0;
  private burnTick = 0;
  private flashUntil = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly kind: EnemyId,
    private ctx: ZombieContext,
  ) {
    const def = ENEMIES[kind];
    super(scene, x, y, def.radius, undefined, DEPTH.actor);
    this.def = def;
    this.hp = def.hp;
    // a little variety so the horde does not move in lockstep
    this.baseSpeed = def.speed * Phaser.Math.FloatBetween(0.9, 1.1);
    this.body.setMass(def.mass).setDamping(true).setDrag(0.01).setCollideWorldBounds(true);
    this.facing = Phaser.Math.Angle.Between(x, y, ctx.player.x, ctx.player.y);
    this.sprite.play({ key: `${kind}/walk`, startFrame: Phaser.Math.Between(0, 8) }).setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 300 });
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onAnimComplete, this);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get mass(): number {
    return this.def.mass;
  }

  get speed(): number {
    return this.alive ? this.body.velocity.length() : 0;
  }

  update(dt: number): void {
    this.updateTint();
    if (!this.alive) return;
    this.updateBurn(dt);
    if (!this.alive) return;
    const now = this.scene.time.now;
    const p = this.ctx.player;

    switch (this.state) {
      case 'stagger':
        if (now >= this.stateUntil) this.state = 'chase';
        break;
      case 'attack':
        this.brake(dt);
        this.turnTowards(Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y), dt * 0.6);
        break;
      case 'chase': {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
        if (p.alive && dist <= this.def.radius + p.radius + this.def.reach && now >= this.attackReadyAt) {
          this.startAttack();
          break;
        }
        this.chase(dt, p.alive ? null : 0);
        break;
      }
    }
  }

  takeDamage(hit: Hit): void {
    if (!this.alive) return;
    this.hp -= hit.amount;
    const push = hit.knockback * (1 - this.def.knockbackResist);
    if (push > 0) {
      const away = new Phaser.Math.Vector2(this.x - hit.fromX, this.y - hit.fromY).normalize();
      this.body.velocity.add(away.scale(push));
      // strong hits interrupt (except an attack that is about to land)
      if (push > 150 && this.state === 'chase') {
        this.state = 'stagger';
        this.stateUntil = this.scene.time.now + this.def.stagger * 1000;
      }
    }
    if (hit.burn) {
      this.burnLeft = Math.max(this.burnLeft, hit.burn.duration);
      this.burnDps = Math.max(this.burnDps, hit.burn.dps);
    }
    if (hit.source !== 'fire') {
      this.ctx.fx.bloodSplat(this.x, this.y, hit.source === 'melee' ? 1.1 : 0.7);
      this.ctx.fx.damageNumber(this.x, this.y, hit.amount);
      this.flashUntil = this.scene.time.now + 70;
    }
    if (this.hp <= 0) this.die();
  }

  // --- behaviour --------------------------------------------------------------------------

  private chase(dt: number, speedOverride: number | null): void {
    const p = this.ctx.player;
    const direct = new Phaser.Math.Vector2(p.x - this.x, p.y - this.y).normalize();
    // straight at the player when nothing is in between; else follow the field;
    // never stand still: without a field direction, keep pushing towards the player
    const dir = this.ctx.field.lineOfSight(this.x, this.y, p.x, p.y) ? direct : (this.ctx.field.direction(this.x, this.y) ?? direct);
    const speed = speedOverride ?? this.baseSpeed * this.ctx.speedMultiplier() * this.catchUp();
    const desired = new Phaser.Math.Vector2();
    if (dir && speed > 0) {
      // follow the path, but flow around neighbours instead of pushing into them
      desired.copy(dir).add(this.ctx.crowd.avoidance(this, dir, this.side)).limit(1).scale(speed);
    }
    const t = 1 - Math.exp(-ACCEL * dt);
    const v = this.body.velocity;
    this.body.setVelocity(Phaser.Math.Linear(v.x, desired.x, t), Phaser.Math.Linear(v.y, desired.y, t));
    const moving = this.body.velocity.length();
    if (moving > 10) this.turnTowards(Math.atan2(this.body.velocity.y, this.body.velocity.x), dt);
    this.sprite.anims.timeScale = Phaser.Math.Clamp(moving / ZOMBIE_ANIM_SPEED, 0.3, 1.8);
  }

  /**
   * Zombies the player cannot see walk faster, so a fleeing player is never left alone and the
   * pressure stays on; on screen they move at their normal pace, so the boost goes unnoticed.
   */
  private catchUp(): number {
    const view = this.scene.cameras.main.worldView;
    const margin = 80;
    const onScreen =
      this.x > view.left - margin && this.x < view.right + margin && this.y > view.top - margin && this.y < view.bottom + margin;
    return onScreen ? 1 : CATCH_UP_MULTIPLIER;
  }

  private startAttack(): void {
    this.state = 'attack';
    this.attackReadyAt = this.scene.time.now + this.def.attackCooldown * 1000;
    this.sprite.anims.timeScale = 1;
    this.sprite.play(`${this.kind}/attack`);
    const duration = this.sprite.anims.currentAnim!.duration;
    this.scene.time.delayedCall(duration * this.def.attackHitAt, () => this.landHit());
  }

  private landHit(): void {
    if (this.state !== 'attack') return;
    const p = this.ctx.player;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
    const inFront = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y) - this.facing)) < Math.PI / 2;
    // a little extra reach so dodging needs real distance, not a pixel
    if (dist <= this.def.radius + p.radius + this.def.reach * 1.35 && inFront) {
      p.takeDamage({ amount: this.def.damage, source: 'melee', fromX: this.x, fromY: this.y, knockback: 180 });
    }
  }

  private onAnimComplete(anim: Phaser.Animations.Animation): void {
    if (this.state === 'attack' && anim.key.endsWith('/attack')) {
      this.state = 'chase';
      this.sprite.play(`${this.kind}/walk`);
    }
  }

  private brake(dt: number): void {
    const t = 1 - Math.exp(-ACCEL * 2 * dt);
    const v = this.body.velocity;
    this.body.setVelocity(Phaser.Math.Linear(v.x, 0, t), Phaser.Math.Linear(v.y, 0, t));
  }

  private turnTowards(angle: number, dt: number): void {
    this.facing = Phaser.Math.Angle.RotateTo(this.facing, angle, TURN_SPEED * dt);
  }

  private updateBurn(dt: number): void {
    if (this.burnLeft <= 0) return;
    this.burnLeft -= dt;
    this.burnTick -= dt;
    if (this.burnTick > 0) return;
    this.burnTick = 0.5;
    const dmg = this.burnDps * 0.5;
    this.hp -= dmg;
    this.ctx.fx.damageNumber(this.x, this.y, dmg, '#ffa040');
    if (this.hp <= 0) this.die();
  }

  private updateTint(): void {
    if (this.scene.time.now < this.flashUntil) this.sprite.setTintFill(0xffffff);
    else if (this.burnLeft > 0 && this.alive) this.sprite.setTint(BURN_TINT);
    else if (this.alive && this.ctx.speedMultiplier() < 1) this.sprite.setTint(SLOW_TINT);
    else this.sprite.clearTint();
  }

  private die(): void {
    this.state = 'dead';
    this.burnLeft = 0;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.sprite.anims.timeScale = 1;
    this.sprite.play(`${this.kind}/death`).setDepth(DEPTH.decal + 1);
    this.ctx.fx.bloodSplat(this.x, this.y, 1.6);
    this.ctx.onKilled(this);
    this.scene.time.delayedCall(CORPSE_MS, () => {
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: 800, onComplete: () => this.destroy() });
    });
  }
}
