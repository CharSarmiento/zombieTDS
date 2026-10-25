import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { AnimPreviewScene } from './scenes/AnimPreviewScene';
import { BootScene } from './scenes/BootScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { GameScene } from './scenes/GameScene';
import { PreloadScene } from './scenes/PreloadScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0c0d0b',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true, pixelArt: false },
  input: { gamepad: true },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, PreloadScene, CharacterSelectScene, GameScene, AnimPreviewScene],
});

// dev: expose the game for debugging and automated checks from the browser console
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
