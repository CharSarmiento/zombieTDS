import Phaser from 'phaser';
import { getManifest } from '../assets/manifest';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { animSettings } from '../data/anims';

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
    // Until the main menu exists (M7), the asset preview is the entry point.
    this.scene.start('AnimPreview');
  }
}
