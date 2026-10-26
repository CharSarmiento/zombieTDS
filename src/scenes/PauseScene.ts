import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { InputManager } from '../systems/InputManager';
import { FONT } from '../ui/fonts';
import { MenuList } from '../ui/MenuList';

const CONTROLS = [
  ['', 'TECLADO + MOUSE', 'GAMEPAD'],
  ['Mover', 'WASD', 'Stick izquierdo'],
  ['Apuntar', 'Mouse', 'Stick derecho'],
  ['Disparar', 'Clic izquierdo', 'RT'],
  ['Recargar', 'R', 'X'],
  ['Cambiar arma', '1-5 · rueda · Q/E', 'LB / RB'],
  ['Correr', 'Shift', 'L3'],
  ['Pausa', 'Esc', 'Start'],
];

/** Overlay on top of the frozen Game scene: resume, restart or quit, plus the controls. */
export class PauseScene extends Phaser.Scene {
  private controls!: InputManager;
  private menu!: MenuList;
  private level = '';

  constructor() {
    super('Pause');
  }

  create(data: { level: string }): void {
    this.level = data.level;
    this.controls = new InputManager(this);
    this.input.setDefaultCursor('default');

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65).setOrigin(0);
    this.add.text(GAME_WIDTH / 2, 150, 'PAUSA', { fontFamily: FONT, fontSize: '110px', color: '#c8e04a' }).setOrigin(0.5).setStroke('#000', 10);

    this.menu = new MenuList(this, 560, 420, [
      { label: 'CONTINUAR', action: () => this.resume() },
      { label: 'REINICIAR', action: () => this.restart() },
      { label: 'SALIR', action: () => this.quit() },
    ]);

    const x = 920, y = 340;
    this.add.rectangle(x - 30, y - 30, 900, CONTROLS.length * 54 + 40, 0x000000, 0.5).setOrigin(0).setStrokeStyle(3, 0x8a8a5a, 0.9);
    CONTROLS.forEach((row, i) => {
      const color = i === 0 ? '#c8e04a' : '#ffffff';
      row.forEach((cell, j) => {
        this.add.text(x + [0, 260, 580][j], y + i * 54, cell, { fontFamily: FONT, fontSize: '26px', color });
      });
    });
  }

  update(): void {
    const input = this.controls.update();
    if (input.pausePressed || input.backPressed) {
      this.resume();
      return;
    }
    this.menu.update(input);
  }

  private resume(): void {
    this.scene.stop();
    this.scene.resume('Game');
  }

  private restart(): void {
    this.scene.stop();
    this.scene.start('Game', { level: this.level });
  }

  private quit(): void {
    this.scene.stop('Game');
    this.scene.start('CharacterSelect');
  }
}
