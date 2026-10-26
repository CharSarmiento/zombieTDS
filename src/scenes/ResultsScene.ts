import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LEVELS } from '../data/levels';
import { InputManager } from '../systems/InputManager';
import { loadSave } from '../systems/SaveManager';
import { FONT } from '../ui/fonts';
import { MenuList } from '../ui/MenuList';

export interface RunResult {
  level: string;
  victory: boolean;
  kills: number;
  /** seconds */
  time: number;
  /** money picked up during the run */
  collected: number;
  /** completion bonus (0 on defeat) */
  bonus: number;
  /** money actually banked */
  banked: number;
}

/** End-of-run overlay over the frozen Game scene, for both victory and defeat. */
export class ResultsScene extends Phaser.Scene {
  private controls!: InputManager;
  private menu!: MenuList;

  constructor() {
    super('Results');
  }

  create(r: RunResult): void {
    this.controls = new InputManager(this);
    this.input.setDefaultCursor('default');
    const cx = GAME_WIDTH / 2;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, r.victory ? 0.55 : 0.65).setOrigin(0);
    this.add
      .text(cx, 160, r.victory ? '¡NIVEL COMPLETADO!' : 'HAS MUERTO', { fontFamily: FONT, fontSize: '104px', color: r.victory ? '#c8e04a' : '#c8202a' })
      .setOrigin(0.5)
      .setStroke('#000', 10);
    const def = LEVELS.find((l) => l.id === r.level);
    this.add.text(cx, 250, def?.name.toUpperCase() ?? '', { fontFamily: FONT, fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);

    const mm = Math.floor(r.time / 60), ss = String(Math.floor(r.time % 60)).padStart(2, '0');
    const rows: [string, string][] = [
      ['Bajas', String(r.kills)],
      ['Tiempo', `${mm}:${ss}`],
      ['Dinero recogido', `$${r.collected}`],
    ];
    if (r.victory) rows.push(['Bonus del nivel', `$${r.bonus}`]);
    else rows.push(['Conservas (50%)', `$${r.banked}`]);
    rows.push(['Total en el banco', `$${loadSave().money}`]);

    this.add.rectangle(cx, 470, 760, rows.length * 58 + 50, 0x000000, 0.55).setStrokeStyle(3, 0x8a8a5a, 0.9);
    rows.forEach(([k, v], i) => {
      const y = 470 - ((rows.length - 1) * 58) / 2 + i * 58;
      const last = i === rows.length - 1;
      this.add.text(cx - 340, y, k, { fontFamily: FONT, fontSize: '32px', color: last ? '#c8e04a' : '#d8d8d8' }).setOrigin(0, 0.5);
      // values appear one after another
      const t = this.add.text(cx + 340, y, v, { fontFamily: FONT, fontSize: '36px', color: last ? '#c8e04a' : '#ffffff' }).setOrigin(1, 0.5).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 250 + i * 180, duration: 250 });
    });

    const next = LEVELS[LEVELS.findIndex((l) => l.id === r.level) + 1];
    const items = r.victory
      ? [
          ...(next ? [{ label: 'SIGUIENTE', action: () => this.play(next.id) }] : []),
          { label: 'REPETIR', action: () => this.play(r.level) },
          { label: 'MENÚ', action: () => this.toMenu() },
        ]
      : [
          { label: 'REINTENTAR', action: () => this.play(r.level) },
          { label: 'MENÚ', action: () => this.toMenu() },
        ];
    this.menu = new MenuList(this, cx, 760, items, 0.8);
  }

  update(): void {
    this.menu.update(this.controls.update());
  }

  private play(level: string): void {
    this.scene.stop();
    this.scene.start('Game', { level });
  }

  private toMenu(): void {
    this.scene.stop('Game');
    this.scene.start('LevelMap');
  }
}
