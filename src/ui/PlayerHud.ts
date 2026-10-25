import Phaser from 'phaser';
import { GAME_HEIGHT } from '../config';
import { CHARACTERS } from '../data/player';
import { DEPTH } from '../entities/Actor';
import type { Player } from '../entities/Player';
import { FONT } from './fonts';

const BAR_W = 300;

/** Bottom-left panel: portrait, health and armor bars, kill counter. Expanded in M6. */
export class PlayerHud {
  readonly root: Phaser.GameObjects.Container;
  private bars: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private kills: Phaser.GameObjects.Text;
  private shownHp = 0;

  constructor(scene: Phaser.Scene, private player: Player) {
    const bg = scene.add.rectangle(0, 0, 470, 132, 0x000000, 0.55).setOrigin(0).setStrokeStyle(3, 0x8a8a5a, 0.9);
    const portrait = scene.add.image(66, 66, 'ui', CHARACTERS[player.character].portrait).setDisplaySize(108, 108);
    this.bars = scene.add.graphics();
    this.hpText = scene.add.text(140, 20, '', { fontFamily: FONT, fontSize: '22px', color: '#ffffff' });
    this.kills = scene.add.text(140, 92, '', { fontFamily: FONT, fontSize: '22px', color: '#c8e04a' });
    this.root = scene.add
      .container(30, GAME_HEIGHT - 162, [bg, portrait, this.bars, this.hpText, this.kills])
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
    this.shownHp = player.hp;
  }

  update(dt: number, kills: number): void {
    const p = this.player;
    // the trailing bar catches up with real health, showing how much a hit took
    this.shownHp = this.shownHp > p.hp ? Math.max(p.hp, this.shownHp - 60 * dt) : p.hp;
    const g = this.bars.clear();
    const x = 140, y = 50;
    g.fillStyle(0x222222, 1).fillRect(x, y, BAR_W, 18);
    g.fillStyle(0xffffff, 0.6).fillRect(x, y, (BAR_W * this.shownHp) / p.maxHp, 18);
    g.fillStyle(p.hp / p.maxHp > 0.3 ? 0xc8202a : 0xff3030, 1).fillRect(x, y, (BAR_W * p.hp) / p.maxHp, 18);
    if (p.armor > 0) {
      g.fillStyle(0x222222, 1).fillRect(x, y + 22, BAR_W, 8);
      g.fillStyle(0x4aa0e0, 1).fillRect(x, y + 22, (BAR_W * p.armor) / p.maxArmor, 8);
    }
    this.hpText.setText(`VIDA ${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.kills.setText(`BAJAS ${kills}`);
  }
}
