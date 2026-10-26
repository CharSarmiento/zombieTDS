import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { computeLoadout, SKILL_ORDER, skillCost, SKILLS, type SkillId } from '../data/progression';
import { loadSave, spend } from '../systems/SaveManager';
import { addButton } from '../ui/Button';
import type { Focusable } from '../ui/Focus';
import { addBackdrop, addWindow, COLORS, fit, pips, text, toast } from '../ui/screen';
import { WINDOWS } from '../ui/windows';
import { MenuScene } from './MenuScene';

/** Permanent skills on the pack's skills window. */
export class SkillsScene extends MenuScene {
  private skill: SkillId = 'health';
  private panel!: Phaser.GameObjects.Container;
  private panelBox!: ReturnType<ReturnType<typeof addWindow>['at']>;
  private money!: Phaser.GameObjects.Text;
  private tabs: Focusable[] = [];
  private buyLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Skills');
  }

  create(): void {
    this.initMenu();
    addBackdrop(this, 'bg2', 0.55);
    const W = WINDOWS.skills;
    const win = addWindow(this, W.frame, GAME_WIDTH / 2, 520, 0.98);
    const title = win.at(W.title);
    text(this, title.x, title.y, 'HABILIDADES', 44, COLORS.dark);
    const [b1, b2, b3] = W.bottom.map((b) => win.at(b));
    this.money = text(this, b1.x, b1.y, '', 24, COLORS.lime);
    text(this, b2.x, b2.y, 'ENTER MEJORAR', 18, COLORS.lime);
    text(this, b3.x, b3.y, 'ESC VOLVER', 20, COLORS.lime);
    this.panelBox = win.at(W.panel);
    this.panel = this.add.container(0, 0);

    W.tabs.forEach((b, i) => {
      const id = SKILL_ORDER[i];
      const p = win.at(b);
      const icon = fit(this.add.image(p.x - p.w / 2 + 34, p.y, 'ui', SKILLS[id].icon), 48, 48);
      const t = text(this, p.x + 22, p.y, SKILLS[id].name.toUpperCase(), 26, COLORS.dark);
      this.tabs.push(
        this.focus.add({
          x: p.x,
          y: p.y,
          hit: p.rect,
          onFocus: () => {
            t.setScale(1.12);
            icon.setScale(icon.scale * 1.1);
            this.select(id);
          },
          onBlur: () => {
            t.setScale(1);
            icon.setScale(icon.scale / 1.1);
          },
          activate: () => this.buy(),
        }),
      );
    });

    const pb = this.panelBox;
    const buy = addButton(this, this.focus, pb.x, pb.y + pb.h / 2 - 80, 'MEJORAR', () => this.buy(), 0.85);
    this.buyLabel = buy.label;
    this.focus.focus(this.tabs[0]);
  }

  protected back(): void {
    this.go('MainMenu');
  }

  private select(id: SkillId): void {
    this.skill = id;
    this.refresh();
  }

  private refresh(): void {
    const save = loadSave();
    this.money.setText(`$${save.money}`);
    const s = SKILLS[this.skill];
    const lv = save.skills[this.skill] ?? 0;
    const cost = skillCost(this.skill, lv);
    const pb = this.panelBox;
    const top = pb.y - pb.h / 2;

    this.panel.removeAll(true);
    this.panel.add(fit(this.add.image(pb.x - 180, top + 150, 'ui', s.icon), 200, 200));
    this.panel.add(text(this, pb.x + 70, top + 80, s.name.toUpperCase(), 54, COLORS.lime, [0, 0.5]).setStroke('#000', 6));
    this.panel.add(text(this, pb.x + 70, top + 145, s.description, 24, COLORS.text, [0, 0.5]).setWordWrapWidth(270));
    this.panel.add(text(this, pb.x + 70, top + 215, `${s.perLevel} por nivel`, 22, COLORS.lime, [0, 0.5]).setWordWrapWidth(270));
    this.panel.add(pips(this, pb.x, top + 320, lv, s.levels, 46));
    this.panel.add(text(this, pb.x, top + 375, `NIVEL ${lv} / ${s.levels}`, 30, COLORS.text));
    this.panel.add(text(this, pb.x, top + 420, this.currentEffect(), 22, COLORS.dim));
    this.buyLabel.setText(cost === null ? 'MÁXIMO' : `MEJORAR $${cost}`);
  }

  /** Total effect of this skill right now, read from the computed loadout. */
  private currentEffect(): string {
    const l = computeLoadout(loadSave());
    switch (this.skill) {
      case 'health':
        return `Vida máxima actual: ${l.maxHp}`;
      case 'armor':
        return `Armadura al empezar: ${l.startArmor}`;
      case 'damage':
        return `Daño: x${l.damageMultiplier.toFixed(2)}`;
      case 'speed':
        return `Velocidad: x${l.speedMultiplier.toFixed(2)}`;
      case 'reload':
        return `Tiempo de recarga: -${Math.round(8 * (loadSave().skills.reload ?? 0))}%`;
    }
  }

  private buy(): void {
    const save = loadSave();
    const lv = save.skills[this.skill] ?? 0;
    const cost = skillCost(this.skill, lv);
    const pb = this.panelBox;
    if (cost === null) return toast(this, pb.x, pb.y, 'NIVEL MÁXIMO');
    const ok = spend(cost, (s) => ({ skills: { ...s.skills, [this.skill]: lv + 1 } }));
    toast(this, pb.x, pb.y, ok ? '¡MEJORADA!' : 'SIN DINERO', ok ? COLORS.lime : COLORS.red);
    this.refresh();
  }
}
