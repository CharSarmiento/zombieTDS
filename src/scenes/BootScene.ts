import Phaser from 'phaser';
import { MANIFEST_KEY } from '../assets/manifest';
import { loadFonts } from '../ui/fonts';

/** Loads only the asset manifest, then hands over to the Preload scene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.json(MANIFEST_KEY, 'atlases/manifest.json');
  }

  create(): void {
    if (!this.cache.json.get(MANIFEST_KEY)) {
      this.add.text(40, 40, 'Falta public/atlases/manifest.json\nEjecuta: npm run assets', { fontSize: '32px', color: '#ff6060' });
      return;
    }
    loadFonts().then(() => this.scene.start('Preload'));
  }
}
