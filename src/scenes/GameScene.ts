import Phaser from 'phaser';
import type { Damageable } from '../combat/types';
import type { EnemyId } from '../data/enemies';
import { LEVELS, type LevelDef } from '../data/levels';
import { BUFF_EFFECT } from '../data/pickups';
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
import { LevelDirector } from '../systems/LevelDirector';
import { Pickups } from '../systems/Pickups';
import { Projectiles } from '../systems/Projectiles';
import { loadSave, recordRun } from '../systems/SaveManager';
import { SpawnPicker } from '../systems/SpawnPicker';
import { WeaponSystem } from '../systems/WeaponSystem';
import { FONT } from '../ui/fonts';
import { LevelHud } from '../ui/LevelHud';
import { PlayerHud } from '../ui/PlayerHud';
import { WeaponHud } from '../ui/WeaponHud';
import type { RunResult } from './ResultsScene';

/** Fraction of the money picked up that is kept when the player dies. */
const DEATH_KEEP = 0.5;

/**
 * Gameplay scene: loads a Tiled level, runs its objectives through the LevelDirector and
 * handles combat, pickups, HUD, pause and the end of the run.
 */
export class GameScene extends Phaser.Scene {
  private def!: LevelDef;
  private controls!: InputManager;
  private level!: Level;
  private player!: Player;
  private fx!: Fx;
  private projectiles!: Projectiles;
  private weapons!: WeaponSystem;
  private pickups!: Pickups;
  private director!: LevelDirector;
  private crowd!: Crowd<Zombie>;
  private zombies: Zombie[] = [];
  private barrels: Barrel[] = [];
  /** zombies + barrels, rebuilt each frame for weapons and bullets */
  private targets: Damageable[] = [];
  private zombieGroup!: Phaser.GameObjects.Group;
  private zombieCtx!: ZombieContext;
  private kills = 0;
  private elapsed = 0;
  private ended = false;
  private crosshair!: Phaser.GameObjects.Image;
  private devText?: Phaser.GameObjects.Text;
  private weaponHud!: WeaponHud;
  private playerHud!: PlayerHud;
  private levelHud!: LevelHud;
  private lookAhead = new Phaser.Math.Vector2();

  constructor() {
    super('Game');
  }

  create(data: { level?: string } = {}): void {
    this.zombies = [];
    this.barrels = [];
    this.targets = [];
    this.kills = 0;
    this.elapsed = 0;
    this.ended = false;
    this.controls = new InputManager(this);

    this.def = LEVELS.find((l) => l.id === data.level) ?? LEVELS[0];
    this.level = new Level(this, this.def.map);
    const { width, height } = this.level;
    this.physics.world.setBounds(0, 0, width, height);

    this.player = new Player(this, this.level.playerStart.x, this.level.playerStart.y, loadSave().character);
    this.player.body.setMass(1.5);
    this.physics.add.collider(this.player.root, this.level.statics);

    this.fx = new Fx(this);
    const targets = () => this.targets;
    this.projectiles = new Projectiles(this, this.fx, targets, (x0, y0, dx, dy) => this.level.raycast(x0, y0, dx, dy));
    this.weapons = new WeaponSystem(this, this.player, this.projectiles, this.fx, targets);
    this.pickups = new Pickups(this, this.player, this.weapons);
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
      speedMultiplier: () => (this.player.buffs.slow > 0 ? BUFF_EFFECT.slowMultiplier : 1),
      onKilled: (z) => {
        if (this.director.finished) return; // the end-of-level collapse is not the player's doing
        this.kills++;
        this.pickups.rollDrop(z.x, z.y, z.def);
      },
    };

    const picker = new SpawnPicker(
      this,
      new Phaser.Geom.Rectangle(60, 60, width - 120, height - 120),
      (x, y) => !this.level.field.isBlockedAt(x, y),
      this.level.spawnPoints,
    );
    this.director = new LevelDirector(this.def, {
      picker,
      spawn: (kind, x, y) => this.spawnZombie(kind, x, y),
      aliveCount: () => this.zombies.filter((z) => z.alive).length,
      playerIn: (marker) => (marker === 'exit' ? this.level.exits : []).some((r) => r.contains(this.player.x, this.player.y)),
    });

    this.player.events.on('hurt', () => {
      this.fx.shake(0.008, 140);
      this.fx.bloodSplat(this.player.x, this.player.y, 0.6);
    });
    this.player.events.on('died', () => this.time.delayedCall(1600, () => this.endRun(false)));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, width, height);
    cam.startFollow(this.player.root, true, CAMERA.lerp, CAMERA.lerp);

    this.crosshair = this.add.image(0, 0, 'ui', 'el/0005').setScale(0.32).setScrollFactor(0).setDepth(DEPTH.ui).setAlpha(0.9);
    this.input.setDefaultCursor('none');
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.controls.reset();
      this.input.setDefaultCursor('none');
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('default'));

    this.weaponHud = new WeaponHud(this);
    this.playerHud = new PlayerHud(this, this.player);
    this.levelHud = new LevelHud(this, this.player, { exit: this.level.exits });
    this.director.events.on('banner', (title: string, sub: string) => this.levelHud.banner(title, sub));
    this.director.events.on('complete', () => this.onLevelComplete());
    this.levelHud.banner(this.def.name.toUpperCase(), 'Sobrevive');
    this.time.delayedCall(1800, () => this.director.start());

    if (import.meta.env.DEV) this.setupDev(cam);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const input = this.controls.update();
    if (import.meta.env.DEV) this.applyDemo(input);

    if (input.pausePressed && !this.ended) {
      this.scene.launch('Pause', { level: this.def.id });
      this.scene.pause();
      return;
    }

    if (!this.ended) this.elapsed += dt;
    this.targets = [...this.zombies, ...this.barrels];
    this.weapons.damageMultiplier = this.player.buffs.superpower > 0 ? BUFF_EFFECT.damageMultiplier : 1;
    this.player.update(input, dt);
    if (this.player.alive) {
      this.weapons.update(input, dt);
      this.director.update(dt);
    }
    this.projectiles.update(dt);
    this.pickups.update(dt);
    this.level.field.update(this.player.x, this.player.y);
    this.crowd.rebuild(this.zombies);
    this.crowd.resolve();
    for (const z of this.zombies) z.update(dt);
    if (this.zombies.some((z) => z.destroyed)) this.zombies = this.zombies.filter((z) => !z.destroyed);
    if (this.barrels.some((b) => !b.alive)) this.barrels = this.barrels.filter((b) => b.alive);

    this.updateCamera(input, dt);
    this.updateCrosshair(input);
    this.weaponHud.update(this.weapons.status);
    this.playerHud.update(dt, this.kills);
    this.levelHud.update(this.director.status, this.pickups.money);
    this.devText?.setText(`${Math.round(this.game.loop.actualFps)} fps · zombies ${this.zombies.filter((z) => z.alive).length} · F1 hitbox · F2 munición · F3 +10 · F4 matar todos · F5 saltar objetivo`);
  }

  private spawnZombie(kind: EnemyId, x: number, y: number): void {
    const z = new Zombie(this, x, y, kind, this.zombieCtx);
    this.zombies.push(z);
    this.zombieGroup.add(z.root);
  }

  private onLevelComplete(): void {
    this.levelHud.banner('¡NIVEL COMPLETADO!', `+$${this.def.reward}`);
    // the remaining zombies collapse: the area is safe
    for (const z of this.zombies) if (z.alive) z.takeDamage({ amount: 9999, source: 'explosion', fromX: z.x, fromY: z.y, knockback: 0 });
    this.time.delayedCall(2400, () => this.endRun(true));
  }

  private endRun(victory: boolean): void {
    if (this.ended) return;
    this.ended = true;
    const collected = this.pickups.money;
    const bonus = victory ? this.def.reward : 0;
    const banked = victory ? collected + bonus : Math.floor(collected * DEATH_KEEP);
    recordRun(this.def.id, { victory, money: banked, time: this.elapsed, kills: this.kills });
    const result: RunResult = { level: this.def.id, victory, kills: this.kills, time: this.elapsed, collected, bonus, banked };
    this.levelHud.hideForResults();
    this.scene.launch('Results', result);
    this.scene.pause();
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

  // --- development helpers ----------------------------------------------------------------

  private setupDev(cam: Phaser.Cameras.Scene2D.Camera): void {
    this.devText = this.add
      .text(24, 16, '', { fontFamily: FONT, fontSize: '18px', color: '#9aa080' })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
    const kb = this.input.keyboard!;
    kb.on('keydown-F1', () => {
      const world = this.physics.world;
      if (!world.debugGraphic) world.createDebugGraphic();
      world.drawDebug = !world.drawDebug;
      world.debugGraphic.clear().setDepth(DEPTH.ui);
    });
    kb.on('keydown-F2', () => this.weapons.refillAll());
    kb.on('keydown-F3', () => this.director.burst(10));
    kb.on('keydown-F4', () => {
      for (const z of this.zombies) if (z.alive) z.takeDamage({ amount: 9999, source: 'bullet', fromX: z.x, fromY: z.y, knockback: 0 });
    });
    kb.on('keydown-F5', () => this.director.skipStep());

    const params = new URLSearchParams(location.search);
    // ?horde=N spawns N zombies at once (performance checks); ?zoom=0.4 zooms out to review maps
    const horde = Number(params.get('horde'));
    if (horde > 0) this.time.delayedCall(500, () => this.director.burst(horde));
    const zoom = Number(params.get('zoom'));
    if (zoom > 0) cam.setZoom(zoom);
    // ?at=x,y places the player (pathing checks)
    const at = params.get('at')?.split(',').map(Number);
    if (at?.length === 2) this.player.body.reset(at[0], at[1]);
  }

  /**
   * Dev only: `?god=1` keeps the player alive; `?demo=<weaponId>` also auto-fires at the
   * nearest zombie, so combat can be checked in headless screenshots without real input.
   */
  private applyDemo(input: InputFrame): void {
    const params = new URLSearchParams(location.search);
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
}
