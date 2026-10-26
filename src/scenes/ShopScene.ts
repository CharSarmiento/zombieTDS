import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { UPGRADES, upgradeCost, WEAPON_SHOP, WEAPON_UPGRADES } from '../data/progression';
import { WEAPON_ORDER, WEAPONS, type WeaponId } from '../data/weapons';
import { loadSave, spend } from '../systems/SaveManager';
import type { Focusable } from '../ui/Focus';
import { addBackdrop, addWindow, COLORS, fit, pips, text, toast } from '../ui/screen';
import { WINDOWS } from '../ui/windows';
import { MenuScene } from './MenuScene';

type Slot = ReturnType<ReturnType<typeof addWindow>['at']>;

/** Arsenal on the pack's bank window: buy weapons and upgrade them. */
export class ShopScene extends MenuScene {
  private weapon: WeaponId = 'gun';
  private slots: Slot[] = [];
  private labels: Slot[] = [];
  private panel!: Phaser.GameObjects.Container;
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private tabs: Focusable[] = [];
  private money!: Phaser.GameObjects.Text;
  private weaponName!: Phaser.GameObjects.Text;
  private description!: Phaser.GameObjects.Text;
  private focused = -1;

  constructor() {
    super('Shop');
  }

  create(): void {
    this.initMenu();
    addBackdrop(this, 'bg2', 0.55);
    const W = WINDOWS.bank;
    const win = addWindow(this, W.frame, GAME_WIDTH / 2, 500, 0.95);
    const title = win.at(W.title);
    text(this, title.x, title.y, 'ARSENAL', 44, COLORS.dark);
    this.slots = W.slots.map((b) => win.at(b));
    this.labels = W.labels.map((b) => win.at(b));
    const [b1, b2, b3] = W.bottom.map((b) => win.at(b));
    this.money = text(this, b1.x, b1.y, '', 24, COLORS.lime);
    this.weaponName = text(this, b2.x, b2.y, '', 20, COLORS.lime);
    text(this, b3.x, b3.y, 'ESC VOLVER', 20, COLORS.lime);
    this.description = text(this, GAME_WIDTH / 2, 1030, '', 28, COLORS.text).setStroke('#000', 5);
    this.panel = this.add.container(0, 0);

    // weapon tabs
    W.tabs.forEach((b, i) => {
      const id = WEAPON_ORDER[i];
      const p = win.at(b);
      const t = text(this, p.x, p.y, '', 28, COLORS.dark);
      this.tabTexts.push(t);
      this.tabs[i] = this.focus.add({
        x: p.x,
        y: p.y,
        hit: p.rect,
        onFocus: () => {
          t.setScale(1.12);
          this.select(id);
          this.description.setText(this.weaponSummary(id));
        },
        onBlur: () => t.setScale(1),
        activate: () => this.select(id),
      });
    });

    // the six slots: weapon card + upgrade tracks of the selected weapon
    this.slots.forEach((p, i) => {
      const ring = this.add.rectangle(p.x, p.y, p.w + 10, p.h + 10).setStrokeStyle(5, 0xc8e04a).setVisible(false);
      this.focus.add({
        x: p.x,
        y: p.y,
        hit: p.rect,
        onFocus: () => {
          ring.setVisible(true);
          this.focused = i;
          this.description.setText(this.slotDescription(i));
        },
        onBlur: () => {
          ring.setVisible(false);
          this.focused = -1;
        },
        activate: () => this.buy(i),
      });
    });

    this.focus.focus(this.tabs[WEAPON_ORDER.indexOf('gun')]);
  }

  protected back(): void {
    this.go('MainMenu');
  }

  private select(id: WeaponId): void {
    this.weapon = id;
    this.refresh();
  }

  /** Rebuilds the slot contents and texts from the save. */
  private refresh(): void {
    const save = loadSave();
    this.money.setText(`$${save.money}`);
    this.weaponName.setText(WEAPONS[this.weapon].name.toUpperCase());
    WEAPON_ORDER.forEach((id, i) => {
      // owned weapons in dark ink, buyable ones with a price mark, locked ones faded
      const owned = save.owned.includes(id);
      this.tabTexts[i].setText(`${WEAPONS[id].name.toUpperCase()}${!owned && this.available(id) ? ' $' : ''}`);
      this.tabTexts[i].setColor(id === this.weapon ? '#000000' : COLORS.dark).setAlpha(owned || this.available(id) ? 1 : 0.45);
    });

    this.panel.removeAll(true);
    const owned = save.owned.includes(this.weapon);
    const shop = WEAPON_SHOP[this.weapon];

    // slot 0: the weapon
    const s0 = this.slots[0];
    const icon = fit(this.add.image(s0.x, s0.y, 'ui', WEAPONS[this.weapon].icon), s0.w * 0.85, s0.h * 0.8);
    if (!owned && !this.available(this.weapon)) icon.setTint(0x404040);
    this.panel.add(icon);
    this.panel.add(this.labelText(0, owned ? 'TUYA' : this.available(this.weapon) ? `$${shop.price}` : 'BLOQ.', owned ? COLORS.lime : COLORS.text));

    // slots 1..5: upgrades
    const tracks = WEAPON_UPGRADES[this.weapon].tracks;
    for (let i = 1; i < this.slots.length; i++) {
      const s = this.slots[i];
      const track = tracks[i - 1];
      if (!track) {
        this.panel.add(this.add.rectangle(s.x, s.y, s.w, s.h, 0x000000, 0.35));
        continue;
      }
      const u = UPGRADES[track];
      const lv = save.upgrades[this.weapon]?.[track] ?? 0;
      const cost = upgradeCost(this.weapon, track, lv);
      const alpha = owned ? 1 : 0.35;
      this.panel.add(text(this, s.x, s.y - 40, u.name.toUpperCase(), 26, COLORS.lime).setAlpha(alpha));
      this.panel.add(pips(this, s.x, s.y + 10, lv, u.levels, 32).setAlpha(alpha));
      this.panel.add(text(this, s.x, s.y + 52, `NV ${lv}/${u.levels}`, 20, COLORS.text).setAlpha(alpha));
      this.panel.add(this.labelText(i, cost === null ? 'MAX' : `$${cost}`, cost === null ? COLORS.lime : COLORS.text).setAlpha(alpha));
    }
    if (this.focused >= 0) this.description.setText(this.slotDescription(this.focused));
  }

  private labelText(i: number, value: string, color: string): Phaser.GameObjects.Text {
    const l = this.labels[i];
    return text(this, l.x, l.y, value, 22, color);
  }

  private available(id: WeaponId): boolean {
    const req = WEAPON_SHOP[id].requires;
    return !req || loadSave().completed.includes(req);
  }

  private weaponSummary(id: WeaponId): string {
    const w = WEAPONS[id];
    const kind = w.kind === 'melee' ? 'Cuerpo a cuerpo' : w.kind === 'gun' ? (w.auto ? 'Automática' : 'Semiautomática') : 'Daño continuo y quemadura';
    return `${w.name}: ${kind}`;
  }

  private slotDescription(i: number): string {
    const save = loadSave();
    const id = this.weapon;
    if (i === 0) {
      if (save.owned.includes(id)) return `${WEAPONS[id].name}: ya está en tu arsenal`;
      const req = WEAPON_SHOP[id].requires;
      if (!this.available(id)) return `Se desbloquea al completar el nivel ${Number(req?.replace(/\D/g, ''))}`;
      return `Comprar ${WEAPONS[id].name} por $${WEAPON_SHOP[id].price}`;
    }
    const track = WEAPON_UPGRADES[id].tracks[i - 1];
    if (!track) return '';
    return `${UPGRADES[track].name}: ${UPGRADES[track].perLevel} por nivel`;
  }

  private buy(i: number): void {
    const save = loadSave();
    const id = this.weapon;
    const at = this.slots[i];
    if (i === 0) {
      if (save.owned.includes(id)) return;
      if (!this.available(id)) return toast(this, at.x, at.y, 'BLOQUEADO', COLORS.red);
      const ok = spend(WEAPON_SHOP[id].price, (s) => ({ owned: [...s.owned, id] }));
      toast(this, at.x, at.y, ok ? '¡COMPRADA!' : 'SIN DINERO', ok ? COLORS.lime : COLORS.red);
    } else {
      const track = WEAPON_UPGRADES[id].tracks[i - 1];
      if (!track) return;
      if (!save.owned.includes(id)) return toast(this, at.x, at.y, 'COMPRA EL ARMA', COLORS.red);
      const lv = save.upgrades[id]?.[track] ?? 0;
      const cost = upgradeCost(id, track, lv);
      if (cost === null) return toast(this, at.x, at.y, 'MÁXIMO', COLORS.lime);
      const ok = spend(cost, (s) => ({ upgrades: { ...s.upgrades, [id]: { ...s.upgrades[id], [track]: lv + 1 } } }));
      toast(this, at.x, at.y, ok ? '¡MEJORADA!' : 'SIN DINERO', ok ? COLORS.lime : COLORS.red);
    }
    this.refresh();
  }
}
