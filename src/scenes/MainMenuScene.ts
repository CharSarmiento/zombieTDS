import { GAME_HEIGHT } from '../config';
import { LEVELS } from '../data/levels';
import { CHARACTERS } from '../data/player';
import { loadSave, resetSave, updateSave } from '../systems/SaveManager';
import { addButton } from '../ui/Button';
import { addBackdrop, addWindow, COLORS, text, toast } from '../ui/screen';
import { WINDOWS } from '../ui/windows';
import { MenuScene } from './MenuScene';

/** Title screen: play, arsenal, skills, character. */
export class MainMenuScene extends MenuScene {
  constructor() {
    super('MainMenu');
  }

  create(): void {
    this.initMenu();
    const save = loadSave();
    addBackdrop(this, 'bg1', 0.35);

    // left column: title and the main actions
    const lx = 400;
    text(this, lx, 150, 'ZOMBIES', 120, COLORS.lime).setStroke('#000', 12);
    text(this, lx, 245, 'SUPERVIVENCIA', 44, COLORS.text).setStroke('#000', 6);
    const actions: [string, () => void][] = [
      ['JUGAR', () => this.go('LevelMap')],
      ['ARSENAL', () => this.go('Shop')],
      ['HABILIDADES', () => this.go('Skills')],
      ['PERSONAJE', () => this.go('CharacterSelect')],
    ];
    const buttons = actions.map(([label, action], i) => addButton(this, this.focus, lx, 420 + i * 125, label, action, 0.9));
    this.focus.focus(buttons[0].item);

    // right: the pack's main window as a status board
    const W = WINDOWS.main;
    const win = addWindow(this, W.frame, 1330, GAME_HEIGHT / 2, 0.9);
    const title = win.at(W.title);
    text(this, title.x, title.y, 'SUPERVIVIENTE', 40, COLORS.dark);
    const [s1, s2] = W.slots.map((b) => win.at(b));
    text(this, s1.x, s1.y, CHARACTERS[save.character].name.toUpperCase(), 24, COLORS.lime);
    text(this, s2.x, s2.y, `$${save.money}`, 26, COLORS.lime);
    const playBox = win.at(W.button);
    const play = text(this, playBox.x, playBox.y, 'JUGAR', 30, COLORS.dark);
    this.focus.add({
      x: playBox.x,
      y: playBox.y,
      hit: playBox.rect,
      activate: () => this.go('LevelMap'),
      onFocus: () => play.setScale(1.15),
      onBlur: () => play.setScale(1),
    });
    const [b1, b2] = W.bottom.map((b) => win.at(b));
    text(this, b1.x, b1.y, `NIVELES ${save.completed.length}/10`, 20, COLORS.lime);
    const kills = Object.values(save.best).reduce((s, r) => s + r.kills, 0);
    text(this, b2.x, b2.y, `RÉCORD BAJAS ${kills}`, 20, COLORS.lime);

    text(this, 20, GAME_HEIGHT - 24, `Niveles disponibles: ${LEVELS.length} · Esc: volver`, 18, COLORS.dim, [0, 0.5]);
    if (import.meta.env.DEV) {
      text(this, 20, GAME_HEIGHT - 50, 'DEV: F6 +$1000 y desbloquear todo · F7 borrar progreso · F9 animaciones', 18, COLORS.dim, [0, 0.5]);
      const kb = this.input.keyboard!;
      kb.on('keydown-F6', () => this.devUnlock());
      kb.on('keydown-F7', () => {
        resetSave();
        this.scene.restart();
      });
      kb.on('keydown-F9', () => this.scene.start('AnimPreview'));
    }
  }

  protected back(): void {
    // nothing behind the title screen
  }

  private devUnlock(): void {
    const save = loadSave();
    // pretend every level was completed so all weapons can be bought
    const all = ['level01', 'level02', 'level03', 'level04', 'level05', 'level06', 'level07', 'level08', 'level09', 'level10'];
    updateSave({ money: save.money + 1000, completed: Array.from(new Set([...save.completed, ...all])) });
    toast(this, 400, 960, '+$1000 · todo desbloqueado');
    this.time.delayedCall(700, () => this.scene.restart());
  }
}
