import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LEVELS } from '../data/levels';
import { loadSave } from '../systems/SaveManager';
import type { Focusable } from '../ui/Focus';
import { addBackdrop, addWindow, COLORS, fit, text, toast } from '../ui/screen';
import { WINDOWS } from '../ui/windows';
import { MenuScene } from './MenuScene';

type NodeState = 'done' | 'open' | 'locked' | 'soon';

const NODE_FRAME: Record<NodeState, string> = {
  done: 'el/0016', // shield
  open: 'el/0015', // red ring
  locked: 'el/0014', // dark ring
  soon: 'el/0014',
};

/** Campaign map on the pack's levels window: 10 nodes along the baked path. */
export class LevelMapScene extends MenuScene {
  private info!: Phaser.GameObjects.Text;
  private infoSub!: Phaser.GameObjects.Text;

  constructor() {
    super('LevelMap');
  }

  create(): void {
    this.initMenu();
    const save = loadSave();
    addBackdrop(this, 'bg2', 0.55);
    const W = WINDOWS.map;
    const win = addWindow(this, W.frame, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10);
    const title = win.at(W.title);
    text(this, title.x, title.y, 'MAPA', 46, COLORS.dark);
    const [money, hint] = W.bottom.map((b) => win.at(b));
    text(this, money.x, money.y, `$${save.money}`, 22, COLORS.lime);
    text(this, hint.x, hint.y, 'ESC', 22, COLORS.lime);

    // info strip over the dark lower part of the map
    const strip = win.at({ x: 634, y: 735, w: 760, h: 70 });
    this.add.rectangle(strip.x, strip.y, strip.w, strip.h, 0x000000, 0.7).setStrokeStyle(2, 0x8a8a5a, 0.9);
    this.info = text(this, strip.x, strip.y - 14, '', 30, COLORS.lime);
    this.infoSub = text(this, strip.x, strip.y + 18, '', 20, COLORS.text);

    let firstOpen: Focusable | undefined;
    W.nodes.forEach((n, i) => {
      const def = LEVELS[i];
      const state: NodeState = !def ? 'soon' : save.completed.includes(def.id) ? 'done' : i === 0 || save.completed.includes(LEVELS[i - 1]?.id) ? 'open' : 'locked';
      const p = win.at(n);
      // covers the baked node underneath
      const img = fit(this.add.image(p.x, p.y, 'ui', NODE_FRAME[state]), state === 'done' ? 74 : 96, state === 'done' ? 90 : 96);
      const base = img.scale;
      if (state === 'locked' || state === 'soon') img.setTint(0x808080);
      const num = text(this, p.x, p.y + (state === 'done' ? -4 : 0), String(i + 1), 30, state === 'locked' || state === 'soon' ? '#8a8a8a' : COLORS.text).setStroke('#000', 5);
      if (state === 'open') this.tweens.add({ targets: img, scale: base * 1.12, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut' });
      const ring = this.add.circle(p.x, p.y, 54).setStrokeStyle(5, 0xc8e04a).setVisible(false);

      const item = this.focus.add({
        x: p.x,
        y: p.y,
        hit: p.rect,
        onFocus: () => {
          ring.setVisible(true);
          num.setScale(1.2);
          this.describe(i, state);
        },
        onBlur: () => {
          ring.setVisible(false);
          num.setScale(1);
        },
        activate: () => {
          if (state === 'open' || state === 'done') this.go('Game', { level: def!.id });
          else toast(this, p.x, p.y - 60, state === 'soon' ? 'PRÓXIMAMENTE' : 'BLOQUEADO', COLORS.red);
        },
      });
      if (state === 'open' && !firstOpen) firstOpen = item;
    });
    this.focus.focus(firstOpen ?? this.focus.current);
  }

  protected back(): void {
    this.go('MainMenu');
  }

  private describe(i: number, state: NodeState): void {
    const def = LEVELS[i];
    if (!def) {
      this.info.setText(`NIVEL ${i + 1}`);
      this.infoSub.setText('Próximamente');
      return;
    }
    this.info.setText(`NIVEL ${i + 1} · ${def.name.toUpperCase()}`);
    const best = loadSave().best[def.id];
    const time = best ? `${Math.floor(best.time / 60)}:${String(Math.floor(best.time % 60)).padStart(2, '0')}` : '';
    this.infoSub.setText(
      state === 'locked'
        ? 'Completa el nivel anterior para desbloquearlo'
        : `${best ? `Mejor tiempo ${time} · ` : ''}Recompensa $${def.reward} · ENTER / clic para jugar`,
    );
  }
}
