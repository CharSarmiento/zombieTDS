import Phaser from 'phaser';
import { getManifest } from '../assets/manifest';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { animSettings, DERIVED_ANIMS } from '../data/anims';

/** Loads every atlas listed in the manifest and registers all animations. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const manifest = getManifest(this);
    const barW = 800;
    const x = (GAME_WIDTH - barW) / 2;
    const y = GAME_HEIGHT / 2;
    this.add.rectangle(x, y, barW, 24, 0x222222).setOrigin(0, 0.5);
    const bar = this.add.rectangle(x, y, 0, 24, 0xc8e04a).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => (bar.width = barW * p));

    for (const [key, url] of Object.entries(manifest.atlases)) this.load.multiatlas(key, url, 'atlases/');
    const ts = manifest.tileset;
    this.load.spritesheet('ground', ts.image, {
      frameWidth: ts.tileSize,
      frameHeight: ts.tileSize,
      margin: ts.margin,
      spacing: ts.spacing,
    });
    this.load.image('bg1', 'images/bg1.png');
    this.load.image('bg2', 'images/bg2.png');
  }

  create(): void {
    const manifest = getManifest(this);
    for (const [key, a] of Object.entries(manifest.anims)) {
      const s = animSettings(key);
      this.anims.create({
        key,
        frames: a.frames.map((frame) => ({ key: a.atlas, frame })),
        frameRate: s.fps,
        repeat: s.repeat,
      });
    }
    for (const d of DERIVED_ANIMS) {
      const src = manifest.anims[d.from];
      this.anims.create({
        key: d.key,
        frames: d.frames.map((i) => ({ key: src.atlas, frame: src.frames[i] })),
        frameRate: d.fps,
        repeat: d.repeat,
      });
    }
    // The main menu arrives in M7; until then the game starts at character select.
    // Dev shortcut: ?scene=Game (or any scene key) jumps straight there.
    const jump = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene') : null;
    this.scene.start(jump && this.scene.get(jump) ? jump : 'CharacterSelect');
  }
}
