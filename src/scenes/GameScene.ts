import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { Damageable } from '../combat/types';
import type { EnemyId } from '../data/enemies';
import { LEVELS } from '../data/levels';
import { CAMERA } from '../data/player';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../data/weapons';
import { DEPTH } from '../entities/Actor';
import { Barrel, EXPLOSION } from '../entities/Barrel';
import { Player } from '../entities/Player';
import { Zombie, type ZombieContext } from '../entities/Zombie';
import { Level } from '../level/Level';
import { Crowd } from '../systems/Crowd';
import { Fx } from '../systems/Fx';
import { InputManager, type InputFrame } from '../systems/InputManager';
import { Projectiles } from '../systems/Projectiles';
import { loadSave } from '../systems/SaveManager';
import { TestSpawner } from '../systems/TestSpawner';
import { WeaponSystem } from '../systems/WeaponSystem';
import { FONT } from '../ui/fonts';
import { PlayerHud } from '../ui/PlayerHud';
import { WeaponHud } from '../ui/WeaponHud';

/**
 * Gameplay scene: loads a Tiled level and runs combat on it. Until M6 the zombies come from an
 * endless test spawner; the wave director and objectives replace it.
 */
export class GameScene extends Phaser.Scene {
  private controls!: InputManager;
  private level!: Level;
  private player!: Player;
  private fx!: Fx;
  private projectiles!: Projectiles;
  private weapons!: WeaponSystem;
  private crowd!: Crowd<Zombie>;
  private spawner!: TestSpawner;
  private zombies: Zombie[] = [];
  private barrels: Barrel[] = [];
  /** zombies + barrels, rebuilt each frame for weapons and bullets */
  private targets: Damageable[] = [];
  private zombieGroup!: Phaser.GameObjects.Group;
  private zombieCtx!: ZombieContext;
  private kills = 0;
  private crosshair!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Text;
  private weaponHud!: WeaponHud;
  private playerHud!: PlayerHud;
  private deathOverlay?: Phaser.GameObjects.Container;
  private lookAhead = new Phaser.Math.Vector2();

  constructor() {
    super('Game');
  }

  create(data: { level?: string } = {}): void {
    this.zombies = [];
    this.barrels = [];
    this.targets = [];
    this.kills = 0;
    this.deathOverlay = undefined;
    this.controls = new InputManager(this);

    const def = LEVELS.find((l) => l.id === data.level) ?? LEVELS[0];
    this.level = new Level(this, def.map);
    const { width, height } = this.level;
    this.physics.world.setBounds(0, 0, width, height);

    this.player = new Player(this, this.level.playerStart.x, this.level.playerStart.y, loadSave().character);
    this.player.body.setMass(1.5);
    this.physics.add.collider(this.player.root, this.level.statics);

    this.fx = new Fx(this);
    const targets = () => this.targets;
    this.projectiles = new Projectiles(this, this.fx, targets, (x0, y0, dx, dy) => this.level.raycast(x0, y0, dx, dy));
    this.weapons = new WeaponSystem(this, this.player, this.projectiles, this.fx, targets);
    this.barrels = this.level.explosives.map((p) => new Barrel(this, this.level, p, (b) => this.explode(b.x, b.y)));

    this.zombieGroup = this.add.group();
    // zombies only collide rigidly with the player and the level; among themselves the Crowd keeps them apart softly
    this.physics.add.collider(this.player.root, this.zombieGroup);
    this.physics.add.collider(this.zombieGroup, this.level.statics);
    this.crowd = new Crowd<Zombie>();
    this.zombieCtx = {
      player: this.player,
      field: this.level.field,
      crowd: this.crowd,
      fx: this.fx,
      speedMultiplier: () => 1,
      onKilled: () => this.kills++,
    };
    this.spawner = new TestSpawner(
      this,
      new Phaser.Geom.Rectangle(60, 60, width - 120, height - 120),
      (x, y) => !this.level.field.isBlockedAt(x, y),
      (kind, x, y) => this.spawnZombie(kind, x, y),
      () => this.zombies.filter((z) => z.alive).length,
      this.level.spawnPoints,
    );

    this.player.events.on('hurt', () => {
      this.fx.shake(0.008, 140);
      this.fx.bloodSplat(this.player.x, this.player.y, 0.6);
    });
    this.player.events.on('died', () => this.time.delayedCall(1600, () => this.showDeath()));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, width, height);
    cam.startFollow(this.player.root, true, CAMERA.lerp, CAMERA.lerp);

    this.crosshair = this.add.image(0, 0, 'ui', 'el/0005').setScale(0.32).setScrollFactor(0).setDepth(DEPTH.ui).setAlpha(0.9);
    this.input.setDefaultCursor('none');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('default'));

    this.hud = this.add
      .text(24, 20, '', { fontFamily: FONT, fontSize: '24px', color: '#e8f0c0', lineSpacing: 6 })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setShadow(2, 2, '#000', 4, true, true);
    this.weaponHud = new WeaponHud(this);
    this.playerHud = new PlayerHud(this, this.player);

    const kb = this.input.keyboard!;
    kb.on('keydown-F1', () => this.toggleDebug());
    kb.on('keydown-F2', () => this.weapons.refillAll());
    kb.on('keydown-F3', () => this.spawner.burst(10));
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(location.search);
      // ?horde=N spawns N zombies at once (performance checks); ?zoom=0.4 zooms out to review maps
      const horde = Number(params.get('horde'));
      if (horde > 0) this.time.delayedCall(500, () => this.spawner.burst(horde));
      const zoom = Number(params.get('zoom'));
      if (zoom > 0) cam.setZoom(zoom);
      // ?at=x,y places the player (pathing checks)
      const at = params.get('at')?.split(',').map(Number);
      if (at?.length === 2) this.player.body.reset(at[0], at[1]);
    }
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const input = this.controls.update();
    if (import.meta.env.DEV) this.applyDemo(input);

    if (this.deathOverlay) {
      if (input.confirmPressed) this.scene.restart();
      else if (input.pausePressed || input.backPressed) this.scene.start('CharacterSelect');
    } else if (input.pausePressed) {
      // pause menu arrives in M6; for now go back to character select
      this.scene.start('CharacterSelect');
      return;
    }

    this.targets = [...this.zombies, ...this.barrels];
    this.player.update(input, dt);
    if (this.player.alive) {
      this.weapons.update(input, dt);
      this.spawner.update(dt);
    }
    this.projectiles.update(dt);
    this.level.field.update(this.player.x, this.player.y);
    this.crowd.rebuild(this.zombies);
    this.crowd.resolve();
    for (const z of this.zombies) z.update(dt);
    if (this.zombies.some((z) => z.destroyed)) this.zombies = this.zombies.filter((z) => !z.destroyed);
    if (this.barrels.some((b) => !b.alive)) this.barrels = this.barrels.filter((b) => b.alive);

    this.updateCamera(input, dt);
    this.updateCrosshair(input);
    this.updateHud(input, dt);
  }

  private spawnZombie(kind: EnemyId, x: number, y: number): void {
    const z = new Zombie(this, x, y, kind, this.zombieCtx);
    this.zombies.push(z);
    this.zombieGroup.add(z.root);
  }

  /** Area damage with linear falloff; hits zombies, other barrels and (less) the player. */
  private explode(x: number, y: number): void {
    const R = EXPLOSION.radius;
    const falloff = (d: number) => 1 - 0.75 * Math.min(1, d / R);
    for (const t of [...this.zombies, ...this.barrels]) {
      if (!t.alive) continue;
      const d = Phaser.Math.Distance.Between(x, y, t.x, t.y) - t.radius;
      if (d > R) continue;
      t.takeDamage({ amount: EXPLOSION.damage * falloff(Math.max(0, d)), source: 'explosion', fromX: x, fromY: y, knockback: EXPLOSION.knockback });
    }
    const dp = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) - this.player.radius;
    if (dp <= R) {
      this.player.takeDamage({
        amount: EXPLOSION.damage * EXPLOSION.playerFactor * falloff(Math.max(0, dp)),
        source: 'explosion', fromX: x, fromY: y, knockback: EXPLOSION.knockback,
      });
    }
    this.fx.shake(0.02, 320);
  }

  private showDeath(): void {
    const bg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0);
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'HAS MUERTO', { fontFamily: FONT, fontSize: '120px', color: '#c8202a' })
      .setOrigin(0.5)
      .setStroke('#000', 8);
    const info = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, `Bajas: ${this.kills}`, { fontFamily: FONT, fontSize: '44px', color: '#ffffff' })
      .setOrigin(0.5);
    const hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 140, 'ENTER / A  reintentar      ESC / B  salir', { fontFamily: FONT, fontSize: '30px', color: '#d0d0d0' })
      .setOrigin(0.5);
    this.deathOverlay = this.add.container(0, 0, [bg, title, info, hint]).setScrollFactor(0).setDepth(DEPTH.ui + 10).setAlpha(0);
    this.tweens.add({ targets: this.deathOverlay, alpha: 1, duration: 500 });
  }

  /** Looks ahead towards the aim so the player sees more of where they point. */
  private updateCamera(input: InputFrame, dt: number): void {
    const target = new Phaser.Math.Vector2();
    if (!this.player.alive) target.set(0, 0);
    else if (input.aimWorld) {
      target.set(input.aimWorld.x - this.player.x, input.aimWorld.y - this.player.y).scale(CAMERA.mouseLookFactor);
    } else {
      target.setToPolar(this.player.facing, CAMERA.lookAhead * (input.aimDir ? 1 : 0.5));
    }
    target.limit(CAMERA.lookAhead);
    const t = 1 - Math.exp(-4 * dt);
    this.lookAhead.set(Phaser.Math.Linear(this.lookAhead.x, target.x, t), Phaser.Math.Linear(this.lookAhead.y, target.y, t));
    this.cameras.main.setFollowOffset(-this.lookAhead.x, -this.lookAhead.y);
  }

  private updateCrosshair(input: InputFrame): void {
    const p = this.input.activePointer;
    this.crosshair.setVisible(input.device === 'kbm' && this.player.alive).setPosition(p.x, p.y);
  }

  private updateHud(input: InputFrame, dt: number): void {
    const slots = WEAPON_ORDER.map((id, i) => (id === this.player.weapon ? `[${i + 1} ${WEAPONS[id].name}]` : `${i + 1} ${WEAPONS[id].name}`));
    const controls =
      input.device === 'pad'
        ? 'Stick izq. mover · Stick der. apuntar · RT disparar · X recargar · L3 correr · LB/RB arma · Start salir'
        : 'WASD mover · Mouse apuntar · Clic disparar · R recargar · Shift correr · 1-5 / rueda / Q-E arma · Esc salir';
    const alive = this.zombies.filter((z) => z.alive).length;
    this.hud.setText([
      slots.join('   '),
      controls,
      `${input.device === 'pad' ? 'GAMEPAD' : 'TECLADO + MOUSE'} · ${Math.round(this.game.loop.actualFps)} fps · zombies ${alive}/${this.spawner.target} · F1 hitbox · F2 munición · F3 +10 zombies`,
    ]);
    this.weaponHud.update(this.weapons.status);
    this.playerHud.update(dt, this.kills);
  }

  /**
   * Dev only: `?demo=<weaponId>` keeps the player alive and auto-fires at the nearest zombie,
   * so combat can be checked in headless screenshots without real input.
   */
  private applyDemo(input: InputFrame): void {
    const params = new URLSearchParams(location.search);
    // ?god=1: the player cannot die (crowd/AI checks)
    if (params.has('god')) this.player.hp = this.player.maxHp;
    const demo = params.get('demo') as WeaponId | null;
    if (!demo || !WEAPONS[demo]) return;
    this.player.hp = this.player.maxHp;
    if (this.player.weapon !== demo) input.weaponSlot = WEAPON_ORDER.indexOf(demo);
    const dist = (z: Zombie) => Phaser.Math.Distance.Between(z.x, z.y, this.player.x, this.player.y);
    const target = this.zombies.filter((z) => z.alive).sort((a, b) => dist(a) - dist(b))[0];
    if (!target) return;
    input.aimWorld = new Phaser.Math.Vector2(target.x, target.y);
    input.fire = true;
    input.firePressed = Math.floor(this.time.now / 260) % 2 === 0;
  }

  private toggleDebug(): void {
    const world = this.physics.world;
    if (!world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = !world.drawDebug;
    world.debugGraphic.clear().setDepth(DEPTH.ui);
  }
}
