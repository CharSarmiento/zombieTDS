import Phaser from 'phaser';
import type { Damageable } from '../combat/types';
import { DEPTH } from '../entities/Actor';
import type { Player } from '../entities/Player';
import type { Loadout } from '../data/progression';
import { WEAPON_ORDER, type FlameWeapon, type GunWeapon, type MeleeWeapon, type WeaponDef, type WeaponId } from '../data/weapons';
import type { Fx } from './Fx';
import type { InputFrame } from './InputManager';
import type { Projectiles } from './Projectiles';

/** Per-weapon ammunition. Melee weapons ignore it. */
interface AmmoState {
  mag: number;
  reserve: number;
  fuel: number;
}

/** What the HUD needs to draw the current weapon. */
export interface WeaponStatus {
  id: WeaponId;
  name: string;
  icon: string;
  kind: 'melee' | 'gun' | 'flame';
  mag: number;
  magazine: number;
  reserve: number;
  /** 0..1 while reloading, else null */
  reload: number | null;
  /** 0..1 for the flamethrower */
  fuel: number;
}

const FLAME_TICK = 0.1;
/** gamepad aim assist: snap to targets within this angle (rad) */
const ASSIST_ANGLE = Phaser.Math.DegToRad(9);
/** gamepad: without an assisted target, shots cross the stick line this far from the body */
const PAD_CONVERGE = 450;

/**
 * Owns weapon selection, ammo, reloading and every attack type: hitscan-free bullets
 * (via Projectiles), melee arcs timed to the swing art, and the flamethrower cone.
 */
export class WeaponSystem {
  /** multiplies all damage (strength skill × double-damage pickup) */
  damageMultiplier = 1;
  /** this run's weapon stats (upgrades and skills applied) */
  private defs: Record<WeaponId, WeaponDef>;
  /** weapons the player owns, in slot order */
  private owned: WeaponId[];
  private ammo = {} as Record<WeaponId, AmmoState>;
  private cooldown = 0;
  private reloadLeft = 0;
  private flaming = false;
  private flameTick = 0;
  private flameFx?: Phaser.GameObjects.Sprite;

  constructor(
    private scene: Phaser.Scene,
    private player: Player,
    private projectiles: Projectiles,
    private fx: Fx,
    private targets: () => readonly Damageable[],
    loadout: Loadout,
  ) {
    this.defs = loadout.weapons;
    this.owned = loadout.owned;
    if (!this.owned.includes(player.weapon)) player.weapon = this.owned.includes('gun') ? 'gun' : this.owned[0];
    for (const id of WEAPON_ORDER) {
      const w = this.defs[id];
      this.ammo[id] = {
        mag: w.kind === 'gun' ? w.magazine : 0,
        reserve: w.kind === 'gun' ? w.reserve : 0,
        fuel: w.kind === 'flame' ? w.fuel : 0,
      };
    }
  }

  update(input: InputFrame, dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.updateSelection(input);
    const w = this.defs[this.player.weapon];

    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) this.finishReload();
    }

    switch (w.kind) {
      case 'gun':
        if (input.reloadPressed) this.startReload();
        if (w.auto ? input.fire : input.firePressed) this.tryShoot(w, input);
        break;
      case 'melee':
        if (input.fire && this.cooldown <= 0) this.swing(w);
        break;
      case 'flame':
        this.updateFlame(w, input.fire, dt);
        break;
    }
  }

  get status(): WeaponStatus {
    const id = this.player.weapon;
    const w = this.defs[id];
    const a = this.ammo[id];
    return {
      id,
      name: w.name,
      icon: w.icon,
      kind: w.kind,
      mag: a.mag,
      magazine: w.kind === 'gun' ? w.magazine : 0,
      reserve: a.reserve,
      reload: this.reloadLeft > 0 && w.kind === 'gun' ? 1 - this.reloadLeft / w.reload : null,
      fuel: w.kind === 'flame' ? a.fuel / w.fuel : 0,
    };
  }

  /** Adds reserve ammo to a gun (capped at its maximum). */
  addAmmo(id: WeaponId, amount: number): void {
    const w = this.defs[id];
    if (w.kind === 'gun') this.ammo[id].reserve = Math.min(w.maxReserve, this.ammo[id].reserve + amount);
  }

  /** Adds fuel to the flamethrower (capped at the tank size). */
  addFuel(amount: number): void {
    const w = this.defs.flame;
    if (w.kind === 'flame') this.ammo.flame.fuel = Math.min(w.fuel, this.ammo.flame.fuel + amount);
  }

  /** Owned weapons in slot order (HUD). */
  get ownedWeapons(): readonly WeaponId[] {
    return this.owned;
  }

  /** Fills every weapon (debug). */
  refillAll(): void {
    for (const id of WEAPON_ORDER) {
      const w = this.defs[id];
      if (w.kind === 'gun') {
        this.ammo[id].mag = w.magazine;
        this.ammo[id].reserve = w.maxReserve;
      }
      if (w.kind === 'flame') this.ammo[id].fuel = w.fuel;
    }
  }

  // --- selection --------------------------------------------------------------------------

  private updateSelection(input: InputFrame): void {
    let next = this.player.weapon;
    // number keys keep a fixed slot per weapon (4 is always the rifle); unowned slots do nothing
    const slotted = input.weaponSlot !== null ? WEAPON_ORDER[input.weaponSlot] : undefined;
    if (slotted && this.owned.includes(slotted)) next = slotted;
    else if (input.weaponDelta) {
      const idx = this.owned.indexOf(this.player.weapon);
      next = this.owned[Phaser.Math.Wrap(idx + input.weaponDelta, 0, this.owned.length)];
    }
    if (next === this.player.weapon) return;
    // switching cancels a reload or a flame stream
    this.reloadLeft = 0;
    if (this.flaming) this.stopFlame(false);
    this.player.weapon = next;
    this.cooldown = Math.max(this.cooldown, 0.15);
  }

  // --- guns -------------------------------------------------------------------------------

  private tryShoot(w: GunWeapon, input: InputFrame): void {
    const a = this.ammo[this.player.weapon];
    if (this.cooldown > 0 || this.reloadLeft > 0) return;
    if (a.mag <= 0) {
      this.startReload();
      return;
    }
    a.mag--;
    this.cooldown = w.cooldown;

    const anim = `attack_${w.anim}`;
    this.player.playAttack(anim, w.auto ? undefined : Math.max(w.cooldown, 0.2), !w.auto);
    const tip = this.player.muzzle(anim);
    const spread = Phaser.Math.DegToRad(this.player.moving ? w.spreadMoving : w.spread);
    // fire from the barrel straight at the aimed point (cursor, assisted target, or the stick line)
    const target = this.aimPoint(input, w.range, tip);
    const aim = Phaser.Math.Angle.Between(tip.x, tip.y, target.x, target.y);
    const angle = aim + Phaser.Math.FloatBetween(-spread / 2, spread / 2);

    this.projectiles.fire(tip.x, tip.y, angle, w.bulletSpeed, w.range, w.damage * this.damageMultiplier, w.knockback);
    this.fx.muzzleFlash(tip.x, tip.y, aim, Phaser.Utils.Array.GetRandom(w.flashes));
    this.fx.shake(w.shake, 60);
    if (a.mag === 0) this.startReload();
  }

  private startReload(): void {
    const w = this.defs[this.player.weapon];
    if (w.kind !== 'gun' || this.reloadLeft > 0) return;
    const a = this.ammo[this.player.weapon];
    if (a.mag >= w.magazine || a.reserve <= 0) return;
    this.reloadLeft = w.reload;
  }

  private finishReload(): void {
    this.reloadLeft = 0;
    const w = this.defs[this.player.weapon];
    if (w.kind !== 'gun') return;
    const a = this.ammo[this.player.weapon];
    const take = Math.min(w.magazine - a.mag, a.reserve);
    a.mag += take;
    if (Number.isFinite(a.reserve)) a.reserve -= take;
  }

  /**
   * World point the shot should go through.
   *  - mouse: the cursor (unless it sits on top of the player, then straight ahead)
   *  - gamepad: a target close to the stick line (light aim assist), otherwise a point on the
   *    stick line from the body centre, so shots converge where the player is looking
   */
  private aimPoint(input: InputFrame, range: number, tip: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const p = this.player;
    const ahead = (d: number) => new Phaser.Math.Vector2(p.x + Math.cos(p.facing) * d, p.y + Math.sin(p.facing) * d);
    if (input.aimWorld) {
      const tooClose = Phaser.Math.Distance.Between(p.x, p.y, input.aimWorld.x, input.aimWorld.y) < Phaser.Math.Distance.Between(p.x, p.y, tip.x, tip.y) + 30;
      return tooClose ? ahead(PAD_CONVERGE) : input.aimWorld;
    }
    let best = ASSIST_ANGLE;
    let result = ahead(PAD_CONVERGE);
    for (const t of this.targets()) {
      if (!t.alive) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y);
      if (d > range) continue;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(p.x, p.y, t.x, t.y) - p.facing));
      if (diff < best) {
        best = diff;
        result = new Phaser.Math.Vector2(t.x, t.y);
      }
    }
    return result;
  }

  // --- melee ------------------------------------------------------------------------------

  private swing(w: MeleeWeapon): void {
    this.cooldown = w.cooldown;
    this.player.playAttack(`attack_${w.anim}`, w.cooldown);
    const weapon = this.player.weapon;
    this.scene.time.delayedCall(w.cooldown * w.hitAt * 1000, () => {
      if (this.player.weapon !== weapon) return;
      let hits = 0;
      for (const t of this.inArc(this.player.x, this.player.y, w.range, w.arc)) {
        t.takeDamage({ amount: w.damage * this.damageMultiplier, source: 'melee', fromX: this.player.x, fromY: this.player.y, knockback: w.knockback });
        hits++;
      }
      if (hits) this.fx.shake(w.shake, 110);
    });
  }

  /** Alive targets whose circle reaches into the arc in front of the player. */
  private inArc(x: number, y: number, range: number, arcDeg: number): Damageable[] {
    const half = Phaser.Math.DegToRad(arcDeg) / 2;
    return this.targets().filter((t) => {
      if (!t.alive) return false;
      const d = Phaser.Math.Distance.Between(x, y, t.x, t.y);
      if (d - t.radius > range) return false;
      if (d < t.radius) return true; // overlapping: always hit
      const ang = Phaser.Math.Angle.Between(x, y, t.x, t.y);
      // widen the arc by the target's angular size
      return Math.abs(Phaser.Math.Angle.Wrap(ang - this.player.facing)) <= half + Math.atan2(t.radius, d);
    });
  }

  // --- flamethrower -----------------------------------------------------------------------

  private updateFlame(w: FlameWeapon, firing: boolean, dt: number): void {
    const a = this.ammo[this.player.weapon];
    const wants = firing && a.fuel > 0 && this.cooldown <= 0;
    if (wants && !this.flaming) this.startFlame();
    if (!wants && this.flaming) this.stopFlame(true);
    if (!this.flaming) return;

    a.fuel = Math.max(0, a.fuel - w.fuelPerSecond * dt);
    const tip = this.player.muzzle('walk_flame');
    this.flameFx?.setPosition(tip.x, tip.y).setRotation(this.player.facing - Math.PI / 2);

    this.flameTick -= dt;
    if (this.flameTick > 0) return;
    this.flameTick += FLAME_TICK;
    for (const t of this.inArc(tip.x, tip.y, w.range, w.arc)) {
      t.takeDamage({
        amount: w.dps * FLAME_TICK * this.damageMultiplier,
        source: 'fire',
        fromX: this.player.x,
        fromY: this.player.y,
        knockback: w.knockback,
        burn: { dps: w.burnDps * this.damageMultiplier, duration: w.burnTime },
      });
    }
  }

  private startFlame(): void {
    this.flaming = true;
    this.flameTick = 0;
    this.player.playAttackLoop('attack_flame_start', 'attack_flame_loop');
    // the baked flame is short: a longer stream sprite extends it to the real reach
    this.flameFx = this.scene.add
      .sprite(this.player.x, this.player.y, 'fx')
      .play('fx/flame')
      .setScale(1.3, 1.25)
      .setAlpha(0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.player + 1);
  }

  private stopFlame(withOutro: boolean): void {
    this.flaming = false;
    this.cooldown = 0.25;
    this.player.endAttack(withOutro ? 'attack_flame_end' : undefined);
    const f = this.flameFx;
    this.flameFx = undefined;
    if (f) this.scene.tweens.add({ targets: f, alpha: 0, duration: 120, onComplete: () => f.destroy() });
  }
}
