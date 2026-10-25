import Phaser from 'phaser';
import { getManifest } from '../assets/manifest';
import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '../config';
import type { EnemyId } from '../data/enemies';
import { CAMERA } from '../data/player';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../data/weapons';
import { DEPTH } from '../entities/Actor';
import { Player } from '../entities/Player';
import { Zombie, type ZombieContext } from '../entities/Zombie';
import { Crowd } from '../systems/Crowd';
import { FlowField } from '../systems/FlowField';
import { Fx } from '../systems/Fx';
import { InputManager, type InputFrame } from '../systems/InputManager';
import { Projectiles } from '../systems/Projectiles';
import { loadSave } from '../systems/SaveManager';
import { TestSpawner } from '../systems/TestSpawner';
import { WeaponSystem } from '../systems/WeaponSystem';
import { FONT } from '../ui/fonts';
import { PlayerHud } from '../ui/PlayerHud';
import { WeaponHud } from '../ui/WeaponHud';

const MAP_W = 40;
const MAP_H = 28;
/** flow field resolution, px */
const FIELD_CELL = 50;

/**
 * Gameplay scene. Until M5 it is a test arena (ground, scenery without collision) with an
 * endless zombie spawner. Levels from Tiled and the wave director replace it later.
 */
export class GameScene extends Phaser.Scene {
  private controls!: InputManager;
  private player!: Player;
  private fx!: Fx;
  private projectiles!: Projectiles;
  private weapons!: WeaponSystem;
  private field!: FlowField;
  private crowd!: Crowd<Zombie>;
  private spawner!: TestSpawner;
  private zombies: Zombie[] = [];
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

  create(): void {
    this.zombies = [];
    this.kills = 0;
    this.deathOverlay = undefined;
    this.controls = new InputManager(this);
    const worldW = MAP_W * TILE_SIZE;
    const worldH = MAP_H * TILE_SIZE;
    this.buildArena();
    this.physics.world.setBounds(0, 0, worldW, worldH);

    this.player = new Player(this, worldW / 2, worldH / 2, loadSave().character);
    this.player.body.setMass(1.5);

    this.fx = new Fx(this);
    const targets = () => this.zombies;
    this.projectiles = new Projectiles(this, this.fx, targets);
    this.weapons = new WeaponSystem(this, this.player, this.projectiles, this.fx, targets);

    this.field = new FlowField(worldW, worldH, FIELD_CELL);
    this.zombieGroup = this.add.group();
    // zombies only collide rigidly with the player; among themselves the Crowd keeps them apart softly
    this.physics.add.collider(this.player.root, this.zombieGroup);
    this.crowd = new Crowd<Zombie>();
    this.zombieCtx = {
      player: this.player,
      field: this.field,
      crowd: this.crowd,
      fx: this.fx,
      speedMultiplier: () => 1,
      onKilled: () => this.kills++,
    };
    this.spawner = new TestSpawner(
      this,
      new Phaser.Geom.Rectangle(60, 60, worldW - 120, worldH - 120),
      (x, y) => !this.field.isBlockedAt(x, y),
      (kind, x, y) => this.spawnZombie(kind, x, y),
      () => this.zombies.filter((z) => z.alive).length,
    );

    this.player.events.on('hurt', () => {
      this.fx.shake(0.008, 140);
      this.fx.bloodSplat(this.player.x, this.player.y, 0.6);
    });
    this.player.events.on('died', () => this.time.delayedCall(1600, () => this.showDeath()));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
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
    // dev: ?horde=N spawns N zombies at once (performance checks)
    const horde = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('horde')) : 0;
    if (horde > 0) this.time.delayedCall(500, () => this.spawner.burst(horde));
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

    this.player.update(input, dt);
    if (this.player.alive) {
      this.weapons.update(input, dt);
      this.spawner.update(dt);
    }
    this.projectiles.update(dt);
    this.field.update(this.player.x, this.player.y);
    this.crowd.rebuild(this.zombies);
    this.crowd.resolve();
    for (const z of this.zombies) z.update(dt);
    if (this.zombies.some((z) => z.destroyed)) this.zombies = this.zombies.filter((z) => !z.destroyed);

    this.updateCamera(input, dt);
    this.updateCrosshair(input);
    this.updateHud(input, dt);
  }

  private spawnZombie(kind: EnemyId, x: number, y: number): void {
    const z = new Zombie(this, x, y, kind, this.zombieCtx);
    this.zombies.push(z);
    this.zombieGroup.add(z.root);
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

  /** Grass field crossed by a road, with decals and some props for a sense of motion. */
  private buildArena(): void {
    const manifest = getManifest(this);
    const tileIndex = (name: string) => manifest.tileset.names.indexOf(name);
    const ts = manifest.tileset;
    const map = this.make.tilemap({ tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, width: MAP_W, height: MAP_H });
    const tileset = map.addTilesetImage('ground', 'ground', ts.tileSize, ts.tileSize, ts.margin, ts.spacing)!;
    const layer = map.createBlankLayer('ground', tileset)!.setDepth(DEPTH.ground);
    layer.fill(tileIndex('grass/00'));
    layer.fill(tileIndex('asphalt/12'), 0, 12, MAP_W, 3);
    layer.fill(tileIndex('asphalt/12'), 24, 0, 3, MAP_H);

    const rnd = new Phaser.Math.RandomDataGenerator(['arena']);
    const decals = [...manifest.statics.leaf.frames, ...manifest.statics.crack_ground.frames.slice(0, 12)];
    for (let i = 0; i < 140; i++) {
      this.add
        .image(rnd.between(0, MAP_W * TILE_SIZE), rnd.between(0, MAP_H * TILE_SIZE), 'env', rnd.pick(decals))
        .setRotation(rnd.rotation())
        .setAlpha(0.8)
        .setDepth(DEPTH.decal);
    }
    const props: [string, number, number][] = [
      ['outside/0009', 900, 500], ['outside/0010', 3200, 600], ['outside/0011', 1400, 2300],
      ['outside/0008', 3000, 2200], ['outside/0000', 600, 2000], ['outside/0001', 3500, 1700],
      ['outside/0017', 1700, 1340], ['outside/0016', 2550, 1900], ['outside/0013', 2100, 900],
      ['outside/0012', 1900, 1700], ['outside/0003', 500, 800],
    ];
    // tree canopies (0006-0011) cover the player; everything else stays on the ground
    const isCanopy = (frame: string) => /outside\/00(0[6-9]|1[01])$/.test(frame);
    for (const [frame, x, y] of props) this.add.image(x, y, 'env', frame).setDepth(isCanopy(frame) ? DEPTH.overhead : DEPTH.shadow + 1);
  }
}
