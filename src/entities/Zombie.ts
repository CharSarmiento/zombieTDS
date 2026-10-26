import Phaser from 'phaser';
import type { Damageable, Hit } from '../combat/types';
import { drawShape, shapeHits } from '../combat/shapes';
import { ENEMIES, ZOMBIE_ANIM_SPEED, type AttackDef, type EnemyDef, type EnemyId } from '../data/enemies';
import { audio } from '../systems/AudioManager';
import type { Crowd } from '../systems/Crowd';
import { pickWeighted } from '../systems/SpawnPicker';
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

/** An attack in progress: where it was aimed, its timing and its ground marker. */
interface ActiveAttack {
  def: AttackDef;
  ox: number;
  oy: number;
  angle: number;
  start: number;
  hitTime: number;
  endTime: number;
  landed?: boolean;
  marker?: Phaser.GameObjects.Graphics;
  lingerUntil?: number;
  lingerTick?: number;
}

const TURN_SPEED = 7;
const ACCEL = 6;
const BURN_TINT = 0xff8840;
const SLOW_TINT = 0xa8c8ff;
const CORPSE_MS = 9000;
/** speed factor while off-screen */
const CATCH_UP_MULTIPLIER = 2.2;

/**
 * Any melee enemy, from walkers to the final boss: follows the flow field (or walks straight
 * when it sees the player) and uses the attacks listed in its data, with ground telegraphs,
 * lunges and burning areas for the big ones.
 */
export class Zombie extends Actor implements Damageable {
  readonly def: EnemyDef;
  hp: number;
  state: State = 'chase';
  /** per-attack cooldowns (time when each becomes usable) */
  private readyAt: number[];
  private globalReadyAt = 0;
  private attack?: ActiveAttack;
  /** boss phase speed factor */
  private rage = 1;
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
    this.readyAt = def.attacks.map(() => 0);
    // a little variety so the horde does not move in lockstep
    this.baseSpeed = def.speed * Phaser.Math.FloatBetween(0.9, 1.1);
    this.body.setMass(def.mass).setDamping(true).setDrag(0.01).setCollideWorldBounds(true);
    this.facing = Phaser.Math.Angle.Between(x, y, ctx.player.x, ctx.player.y);
    const walk = scene.anims.get(`${kind}/walk`);
    this.sprite.play({ key: walk.key, startFrame: Phaser.Math.Between(0, walk.frames.length - 1) }).setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 300 });
  }

  get maxHp(): number {
    return this.def.hp;
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
        this.updateAttack(dt);
        break;
      case 'chase': {
        const a = p.alive && now >= this.globalReadyAt ? this.chooseAttack() : null;
        if (a) {
          this.startAttack(a);
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
    const speed = speedOverride ?? this.baseSpeed * this.rage * this.ctx.speedMultiplier() * this.catchUp();
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
    this.sprite.anims.timeScale = Phaser.Math.Clamp(moving / (this.def.animSpeed ?? ZOMBIE_ANIM_SPEED), 0.3, 1.8);
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

  /** Picks one of the attacks whose range covers the current gap and that is off cooldown. */
  private chooseAttack(): AttackDef | null {
    const p = this.ctx.player;
    const gap = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) - this.def.radius - p.radius;
    const now = this.scene.time.now;
    const options = this.def.attacks.filter(
      (a, i) => now >= this.readyAt[i] && gap <= a.range && gap >= (a.minRange ?? -Infinity),
    );
    if (!options.length) return null;
    return pickWeighted(options.map((a): [AttackDef, number] => [a, a.weight ?? 1]));
  }

  private startAttack(a: AttackDef): void {
    const p = this.ctx.player;
    const now = this.scene.time.now;
    this.state = 'attack';
    this.facing = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    this.sprite.play(`${this.kind}/${a.anim}`);
    const animMs = this.sprite.anims.currentAnim!.duration;
    const ms = a.duration ? a.duration * 1000 : animMs;
    this.sprite.anims.timeScale = animMs / ms;
    this.readyAt[this.def.attacks.indexOf(a)] = now + ms + a.cooldown * 1000;
    // every attack waits a little before the next one, so attacks do not chain instantly
    this.globalReadyAt = now + ms + 250;

    this.attackSound(a);
    const atk: ActiveAttack = { def: a, ox: this.x, oy: this.y, angle: this.facing, start: now, hitTime: now + ms * a.hitAt, endTime: now + ms };
    if (a.telegraph) {
      atk.marker = this.scene.add.graphics().setPosition(atk.ox, atk.oy).setRotation(atk.angle).setDepth(DEPTH.decal + 2);
    }
    this.attack = atk;
  }

  private updateAttack(dt: number): void {
    const atk = this.attack!;
    const a = atk.def;
    const now = this.scene.time.now;
    const p = this.ctx.player;

    if (now < atk.hitTime) {
      if (a.lunge && now > atk.start + 120) {
        // dash along the locked direction after a short wind-up
        this.body.setVelocity(Math.cos(atk.angle) * a.lunge, Math.sin(atk.angle) * a.lunge);
      } else this.brake(dt);
      if (!a.telegraph) this.turnTowards(Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y), dt * 0.6);
      if (atk.marker) {
        const k = (now - atk.start) / (atk.hitTime - atk.start);
        drawShape(atk.marker, a.shape, 0xff2a1a, 0.1 + 0.32 * k);
      }
    } else {
      this.brake(dt);
      if (!atk.landed) this.landHit(atk);
    }
    if (atk.lingerUntil && now < atk.lingerUntil) this.updateLinger(atk, now);
    if (now >= atk.endTime) this.finishAttack();
  }

  private landHit(atk: ActiveAttack): void {
    atk.landed = true;
    const a = atk.def;
    const p = this.ctx.player;
    // telegraphed attacks hit where they were announced; plain swipes follow the attacker
    const [ox, oy, ang] = a.telegraph ? [atk.ox, atk.oy, atk.angle] : [this.x, this.y, this.facing];
    if (p.alive && shapeHits(a.shape, ox, oy, ang, p.x, p.y, p.radius)) {
      p.takeDamage({ amount: a.damage, source: 'melee', fromX: this.x, fromY: this.y, knockback: a.knockback });
    }
    if (this.def.tier >= 3) this.ctx.fx.shake(this.def.tier >= 4 ? 0.006 : 0.003, 120);
    if (a.linger) {
      atk.lingerUntil = this.scene.time.now + a.linger.seconds * 1000;
      atk.lingerTick = 0;
      this.spawnFireZone(atk);
    } else if (atk.marker) {
      // flash, then fade out
      drawShape(atk.marker, a.shape, 0xffffff, 0.45);
      const m = atk.marker;
      atk.marker = undefined;
      this.scene.tweens.add({ targets: m, alpha: 0, duration: 160, onComplete: () => m.destroy() });
    }
  }

  /** Burning ground left by fire attacks: hurts the player every half second while standing in it. */
  private updateLinger(atk: ActiveAttack, now: number): void {
    const a = atk.def;
    const p = this.ctx.player;
    if (atk.marker) drawShape(atk.marker, a.shape, 0xff7a10, 0.2 + 0.08 * Math.sin(now / 90), false);
    if (now < (atk.lingerTick ?? 0)) return;
    atk.lingerTick = now + 500;
    if (p.alive && shapeHits(a.shape, atk.ox, atk.oy, atk.angle, p.x, p.y, p.radius)) {
      p.takeDamage({ amount: a.linger!.dps * 0.5, source: 'fire', fromX: atk.ox, fromY: atk.oy, knockback: 0 });
    }
  }

  private spawnFireZone(atk: ActiveAttack): void {
    const s = atk.def.shape;
    if (s.type !== 'line') return;
    const flames: Phaser.GameObjects.Sprite[] = [];
    for (let d = 40; d < s.length; d += 110) {
      const x = atk.ox + Math.cos(atk.angle) * d + Phaser.Math.Between(-20, 20);
      const y = atk.oy + Math.sin(atk.angle) * d + Phaser.Math.Between(-20, 20);
      flames.push(
        this.scene.add
          .sprite(x, y, 'fx')
          .play({ key: 'fx/flame', startFrame: Phaser.Math.Between(0, 5) })
          .setRotation(Math.random() * Math.PI * 2)
          .setScale(1.1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.decal + 3),
      );
    }
    const marker = atk.marker;
    this.scene.time.delayedCall(atk.def.linger!.seconds * 1000, () => {
      this.scene.tweens.add({
        targets: [...flames, ...(marker ? [marker] : [])],
        alpha: 0,
        duration: 400,
        onComplete: () => [...flames, marker].forEach((o) => o?.destroy()),
      });
    });
  }

  private finishAttack(): void {
    const atk = this.attack;
    // a lingering fire zone outlives the attack: it cleans itself up
    if (atk?.marker && !atk.lingerUntil) atk.marker.destroy();
    this.attack = undefined;
    if (this.state === 'attack') {
      this.state = 'chase';
      this.sprite.anims.timeScale = 1;
      this.sprite.play(`${this.kind}/walk`);
    }
  }

  private attackSound(a: AttackDef): void {
    if (this.def.tier < 3) return audio.sfx('zombie_attack');
    if (a.linger) return audio.sfx('fire_breath');
    if (a.shape.type === 'circle') return audio.sfx('boss_slam', this.def.tier >= 4 ? 1 : 0.7);
    audio.sfx(this.def.tier >= 4 ? 'boss_attack' : 'elite_roar', this.def.tier >= 4 ? 1 : 0.6);
  }

  /** Phase change of a boss: faster from now on. */
  enrage(multiplier: number): void {
    this.rage = multiplier;
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
    // big enemies take hits constantly: a soft red tint instead of a white silhouette
    if (this.scene.time.now < this.flashUntil) {
      if (this.def.tier >= 3) this.sprite.setTint(0xff9090);
      else this.sprite.setTintFill(0xffffff);
    }
    else if (this.burnLeft > 0 && this.alive) this.sprite.setTint(BURN_TINT);
    else if (this.alive && this.ctx.speedMultiplier() < 1) this.sprite.setTint(SLOW_TINT);
    else if (this.alive && this.rage > 1) this.sprite.setTint(0xffa0a0);
    else this.sprite.clearTint();
  }

  private die(): void {
    if (this.attack && !this.attack.lingerUntil) this.attack.marker?.destroy();
    this.attack = undefined;
    this.state = 'dead';
    this.burnLeft = 0;
    audio.sfx(this.def.tier >= 4 ? 'boss_death' : 'zombie_death');
    if (this.def.tier >= 4) {
      this.ctx.fx.shake(0.02, 600);
      for (let i = 0; i < 6; i++) this.ctx.fx.bloodSplat(this.x + Phaser.Math.Between(-80, 80), this.y + Phaser.Math.Between(-80, 80), 2.2);
    }
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
