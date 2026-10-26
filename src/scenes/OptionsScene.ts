import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../systems/AudioManager';
import { InputManager } from '../systems/InputManager';
import { loadSave, resetSave, updateOptions, type Options } from '../systems/SaveManager';
import { addBackdrop, COLORS, text, toast } from '../ui/screen';

interface Row {
  label: string;
  value: () => string;
  /** -1 / +1 from left/right, 0 from confirm */
  change: (dir: number) => void;
}

const ROW_H = 78;
const PANEL_W = 1000;

/**
 * Settings: volumes, screen shake, damage numbers, fullscreen (and wiping progress from the main
 * menu). Opened from the main menu (as a screen) or from the pause (as an overlay above it).
 */
export class OptionsScene extends Phaser.Scene {
  private controls!: InputManager;
  private rows: Row[] = [];
  private texts: { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text; left: Phaser.GameObjects.Image; right: Phaser.GameObjects.Image }[] = [];
  private index = 0;
  private from = 'MainMenu';
  private wipeArmed = false;

  constructor() {
    super('Options');
  }

  create(data: { from?: string } = {}): void {
    this.from = data.from ?? 'MainMenu';
    this.index = 0;
    this.wipeArmed = false;
    this.controls = new InputManager(this);
    this.input.setDefaultCursor('default');
    // scenes draw in registration order: as an overlay this must be above the game
    this.scene.bringToTop();
    const overlay = this.from === 'Pause';
    if (overlay) this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setOrigin(0);
    else addBackdrop(this, 'bg2', 0.6);

    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const yesNo = (v: boolean) => (v ? 'SÍ' : 'NO');
    const volume = (key: 'music' | 'sfx') => (dir: number) => {
      const o = loadSave().options;
      updateOptions({ [key]: Phaser.Math.Clamp(Math.round((o[key] + (dir || 0.1) * 0.1) * 10) / 10, 0, 1) } as Partial<Options>);
      audio.applyVolumes();
      if (key === 'sfx') audio.sfx('ui_select');
    };
    const toggle = (key: 'shake' | 'damageNumbers') => () => updateOptions({ [key]: !loadSave().options[key] } as Partial<Options>);

    this.rows = [
      { label: 'MÚSICA', value: () => pct(loadSave().options.music), change: volume('music') },
      { label: 'EFECTOS', value: () => pct(loadSave().options.sfx), change: volume('sfx') },
      { label: 'SACUDIDA DE PANTALLA', value: () => yesNo(loadSave().options.shake), change: toggle('shake') },
      { label: 'NÚMEROS DE DAÑO', value: () => yesNo(loadSave().options.damageNumbers), change: toggle('damageNumbers') },
      { label: 'PANTALLA COMPLETA', value: () => yesNo(this.scale.isFullscreen), change: () => this.scale.toggleFullscreen() },
      ...(overlay ? [] : [{ label: 'BORRAR PROGRESO', value: () => (this.wipeArmed ? '¿SEGURO?' : ''), change: () => this.wipe() }]),
      { label: 'VOLVER', value: () => '', change: () => this.back() },
    ];

    const top = GAME_HEIGHT / 2 - (this.rows.length * ROW_H) / 2;
    const cx = GAME_WIDTH / 2;
    text(this, cx, top - 110, 'OPCIONES', 96, COLORS.lime).setStroke('#000', 10);
    this.add.rectangle(cx, top + (this.rows.length * ROW_H) / 2 - ROW_H / 2, PANEL_W, this.rows.length * ROW_H + 40, 0x000000, 0.55).setStrokeStyle(3, 0x8a8a5a, 0.9);
    this.texts = this.rows.map((row, i) => {
      const y = top + i * ROW_H;
      const label = text(this, cx - PANEL_W / 2 + 50, y, row.label, 34, COLORS.text, [0, 0.5]);
      const value = text(this, cx + 300, y, '', 34, COLORS.lime);
      const left = this.add.image(cx + 160, y, 'ui', 'el/0142').setScale(1.2).setInteractive({ useHandCursor: true });
      const right = this.add.image(cx + 440, y, 'ui', 'el/0143').setScale(1.2).setInteractive({ useHandCursor: true });
      left.on('pointerdown', () => this.change(i, -1));
      right.on('pointerdown', () => this.change(i, 1));
      const hit = this.add.rectangle(cx - 100, y, PANEL_W - 400, ROW_H - 8).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => this.select(i));
      hit.on('pointerdown', () => this.change(i, 0));
      return { label, value, left, right };
    });
    this.refresh();
    text(this, cx, GAME_HEIGHT - 60, '↑↓ elegir   ←→ cambiar   ENTER / A aceptar   ESC / B volver', 24, COLORS.dim);
  }

  update(): void {
    const input = this.controls.update();
    if (input.pausePressed || input.backPressed) return this.back();
    if (input.navY) this.select(Phaser.Math.Wrap(this.index + input.navY, 0, this.rows.length));
    if (input.navX) this.change(this.index, input.navX);
    if (input.confirmPressed) this.change(this.index, 0);
  }

  private select(i: number): void {
    if (i !== this.index) audio.sfx('ui_move');
    this.index = i;
    this.refresh();
  }

  private change(i: number, dir: number): void {
    this.index = i;
    this.rows[i].change(dir);
    if (i !== this.rows.length - 1) audio.sfx('ui_select');
    this.refresh();
  }

  private refresh(): void {
    this.texts.forEach((t, i) => {
      const on = i === this.index;
      const v = this.rows[i].value();
      t.label.setColor(on ? COLORS.lime : COLORS.text).setScale(on ? 1.08 : 1);
      t.value.setText(v);
      t.left.setVisible(v !== '' && !v.startsWith('¿')).setAlpha(on ? 1 : 0.5);
      t.right.setVisible(v !== '' && !v.startsWith('¿')).setAlpha(on ? 1 : 0.5);
    });
  }

  /** Two presses: the first arms it, the second wipes the progress. */
  private wipe(): void {
    if (!this.wipeArmed) {
      this.wipeArmed = true;
      return;
    }
    resetSave();
    this.wipeArmed = false;
    audio.sfx('ui_error');
    toast(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PROGRESO BORRADO', COLORS.red);
  }

  private back(): void {
    if (this.from === 'Pause') {
      this.scene.stop();
      this.scene.wake('Pause');
    } else this.scene.start('MainMenu');
  }
}
