import Phaser from 'phaser';
import { getManifest } from '../assets/manifest';
import { TILE_SIZE } from '../config';
import { CAMERA } from '../data/player';
import { WEAPON_ORDER, WEAPONS } from '../data/weapons';
import { DEPTH } from '../entities/Actor';
import { Player } from '../entities/Player';
import { InputManager, type InputFrame } from '../systems/InputManager';
import { loadSave } from '../systems/SaveManager';
import { FONT } from '../ui/fonts';

const MAP_W = 40;
const MAP_H = 28;

/**
 * Gameplay scene. For M2 it is a test arena (ground, scenery without collision) to try
 * movement, aiming, weapon switching and the camera. Levels from Tiled replace it in M5.
 */
export class GameScene extends Phaser.Scene {
  private controls!: InputManager;
  private player!: Player;
  private crosshair!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Text;
  private lookAhead = new Phaser.Math.Vector2();

  constructor() {
    super('Game');
  }

  create(): void {
    this.controls = new InputManager(this);
    const worldW = MAP_W * TILE_SIZE;
    const worldH = MAP_H * TILE_SIZE;
    this.buildArena();
    this.physics.world.setBounds(0, 0, worldW, worldH);

    this.player = new Player(this, worldW / 2, worldH / 2, loadSave().character);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.player.root, true, CAMERA.lerp, CAMERA.lerp);

    this.crosshair = this.add.image(0, 0, 'ui', 'el/0005').setScale(0.32).setScrollFactor(0).setDepth(DEPTH.ui).setAlpha(0.9);
    this.input.setDefaultCursor('none');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('default'));

    this.hud = this.add
      .text(24, 20, '', { fontFamily: FONT, fontSize: '26px', color: '#e8f0c0', lineSpacing: 6 })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setShadow(2, 2, '#000', 4, true, true);

    this.input.keyboard!.on('keydown-F1', () => this.toggleDebug());
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const input = this.controls.update();
    if (input.pausePressed) {
      // pause menu arrives in M6; for now go back to character select
      this.scene.start('CharacterSelect');
      return;
    }
    this.player.update(input, dt);
    this.updateCamera(input, dt);
    this.updateCrosshair(input);
    this.updateHud(input);
  }

  /** Looks ahead towards the aim so the player sees more of where they point. */
  private updateCamera(input: InputFrame, dt: number): void {
    const target = new Phaser.Math.Vector2();
    if (input.aimWorld) {
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
    this.crosshair.setVisible(input.device === 'kbm').setPosition(p.x, p.y);
  }

  private updateHud(input: InputFrame): void {
    const slots = WEAPON_ORDER.map((id, i) => (id === this.player.weapon ? `[${i + 1} ${WEAPONS[id].name}]` : `${i + 1} ${WEAPONS[id].name}`));
    const controls =
      input.device === 'pad'
        ? 'Stick izq. mover · Stick der. apuntar · L3 correr · LB/RB arma · Start salir'
        : 'WASD mover · Mouse apuntar · Shift correr · 1-5 / rueda / Q-E arma · Esc salir';
    this.hud.setText([
      slots.join('   '),
      controls,
      `${input.device === 'pad' ? 'GAMEPAD' : 'TECLADO + MOUSE'} · ${Math.round(this.game.loop.actualFps)} fps · F1 hitbox`,
    ]);
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
