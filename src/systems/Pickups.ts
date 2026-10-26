import Phaser from 'phaser';
import type { EnemyDef } from '../data/enemies';
import { DROPS, PICKUP_VALUES, PICKUPS, type PickupKind } from '../data/pickups';
import { DEPTH } from '../entities/Actor';
import type { Player } from '../entities/Player';
import { FONT } from '../ui/fonts';
import { pickWeighted } from './SpawnPicker';
import type { WeaponSystem } from './WeaponSystem';

const SIZE = 54;
const PICK_RADIUS = 34;

interface Pickup {
  kind: PickupKind;
  value: number;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  x: number;
  y: number;
  age: number;
  phase: number;
  /** pulled towards the player once inside the magnet radius */
  pulled: boolean;
}

/** Items dropped by zombies: bobbing on the ground, pulled in when close, applied on touch. */
export class Pickups {
  /** money collected during the level */
  money = 0;
  private items: Pickup[] = [];

  constructor(
    private scene: Phaser.Scene,
    private player: Player,
    private weapons: WeaponSystem,
  ) {}

  /** Rolls the drop table for a killed enemy. */
  rollDrop(x: number, y: number, def: EnemyDef): void {
    if (def.coins) {
      // elites and bosses burst into a pile of coins
      for (let i = 0; i < def.coins; i++) {
        const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * (30 + def.coins * 6);
        this.spawn('money', x + Math.cos(a) * r, y + Math.sin(a) * r, def.reward);
      }
    } else if (Math.random() < DROPS.moneyChance + DROPS.tierBonus(def)) this.spawn('money', x - 14, y, def.reward);
    const bonus = 1 + DROPS.tierBonus(def) * 4;
    const table = DROPS.items.map(([k, w]): [PickupKind | 'none', number] => [k, k === 'none' ? w : w * bonus]);
    const kind = pickWeighted(table);
    if (kind !== 'none') this.spawn(kind, x + 14, y, 0);
  }

  spawn(kind: PickupKind, x: number, y: number, value: number): void {
    const def = PICKUPS[kind];
    const img = this.scene.add.image(x, y, 'ui', def.icon).setDepth(DEPTH.actor - 1);
    img.setScale(SIZE / Math.max(img.frame.realWidth, img.frame.realHeight));
    const shadow = this.scene.add.ellipse(x, y + 22, SIZE * 0.8, 14, 0x000000, 0.35).setDepth(DEPTH.shadow);
    // pop out of the corpse
    img.setScale(0.01);
    this.scene.tweens.add({ targets: img, scale: SIZE / Math.max(img.frame.realWidth, img.frame.realHeight), duration: 220, ease: 'Back.easeOut' });
    this.items.push({ kind, value, img, shadow, x, y, age: 0, phase: Math.random() * Math.PI * 2, pulled: false });
  }

  update(dt: number): void {
    const p = this.player;
    for (const it of this.items) {
      it.age += dt;
      const d = Phaser.Math.Distance.Between(it.x, it.y, p.x, p.y);
      if (p.alive && (it.pulled || d < DROPS.magnetRadius)) {
        it.pulled = true;
        const speed = 300 + it.age * 60 + (DROPS.magnetRadius - Math.min(d, DROPS.magnetRadius)) * 6;
        const step = Math.min(d, speed * dt);
        it.x += ((p.x - it.x) / (d || 1)) * step;
        it.y += ((p.y - it.y) / (d || 1)) * step;
      }
      const bob = Math.sin(it.age * 4 + it.phase) * 5;
      it.img.setPosition(it.x, it.y - 8 + bob);
      it.shadow.setPosition(it.x, it.y + 18);
      // blink during the last seconds
      const left = DROPS.lifetime - it.age;
      it.img.setAlpha(left < 4 && !it.pulled ? (Math.floor(it.age * 8) % 2 ? 0.35 : 1) : 1);
      if (p.alive && Phaser.Math.Distance.Between(it.x, it.y, p.x, p.y) < PICK_RADIUS) this.collect(it);
      else if (left <= 0 && !it.pulled) this.remove(it);
    }
    if (this.items.some((it) => !it.img.active)) this.items = this.items.filter((it) => it.img.active);
  }

  private collect(it: Pickup): void {
    const p = this.player;
    const v = PICKUP_VALUES;
    let text = PICKUPS[it.kind].label;
    switch (it.kind) {
      case 'money':
        this.money += it.value;
        text = `+$${it.value}`;
        break;
      case 'health':
        p.heal(v.health);
        break;
      case 'armor':
        p.addArmor(v.armor);
        break;
      case 'ammoRifle':
        this.weapons.addAmmo('rifle', v.ammoRifle);
        break;
      case 'fuel':
        this.weapons.addFuel(v.fuel);
        break;
      case 'ammoBox':
        this.weapons.addAmmo('rifle', v.ammoBox.rifle);
        this.weapons.addFuel(v.ammoBox.fuel);
        break;
      case 'speed':
      case 'slow':
      case 'superpower':
        p.addBuff(it.kind);
        break;
    }
    this.floatText(p.x, p.y - 50, text, PICKUPS[it.kind].color);
    this.remove(it);
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '24px', color })
      .setOrigin(0.5)
      .setStroke('#000', 4)
      .setDepth(DEPTH.ui - 1);
    this.scene.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private remove(it: Pickup): void {
    it.img.destroy();
    it.shadow.destroy();
  }
}
