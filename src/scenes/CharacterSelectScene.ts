import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHARACTERS, type CharacterId } from '../data/player';
import { audio } from '../systems/AudioManager';
import { InputManager } from '../systems/InputManager';
import { loadSave, updateSave } from '../systems/SaveManager';
import { FONT } from '../ui/fonts';

const ORDER: CharacterId[] = ['man', 'girl'];

/** Pick the survivor (cosmetic only). Provisional layout; the full menu flow arrives in M7. */
export class CharacterSelectScene extends Phaser.Scene {
  private controls!: InputManager;
  private index = 0;
  private cards: { frame: Phaser.GameObjects.Rectangle; portrait: Phaser.GameObjects.Image; preview: Phaser.GameObjects.Sprite }[] = [];
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('CharacterSelect');
  }

  create(): void {
    this.controls = new InputManager(this);
    audio.playMusic('music_menu');
    this.index = Math.max(0, ORDER.indexOf(loadSave().character));

    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg1').setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setOrigin(0);
    this.add
      .text(GAME_WIDTH / 2, 130, 'ELIGE TU SUPERVIVIENTE', { fontFamily: FONT, fontSize: '84px', color: '#c8e04a' })
      .setOrigin(0.5)
      .setShadow(4, 4, '#000', 8, true, true);

    ORDER.forEach((id, i) => {
      const x = GAME_WIDTH / 2 + (i === 0 ? -330 : 330);
      const y = 520;
      const frame = this.add.rectangle(x, y, 460, 600, 0x111111, 0.75).setStrokeStyle(6, 0x555555);
      const portrait = this.add.image(x, y - 80, 'ui', CHARACTERS[id].portrait).setDisplaySize(320, 320);
      const preview = this.add.sprite(x, y + 180, '').play(`${id}/walk_gun`).setScale(1.1);
      this.add.text(x, y + 255, CHARACTERS[id].name.toUpperCase(), { fontFamily: FONT, fontSize: '48px', color: '#ffffff' }).setOrigin(0.5);
      for (const obj of [frame, portrait]) {
        obj.setInteractive({ useHandCursor: true });
        obj.on('pointerover', () => this.select(i));
        obj.on('pointerdown', () => this.confirm());
      }
      this.cards.push({ frame, portrait, preview });
    });

    this.hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 70, '', { fontFamily: FONT, fontSize: '32px', color: '#d8d8d8' })
      .setOrigin(0.5);

    this.select(this.index);
  }

  update(): void {
    const input = this.controls.update();
    if (input.navX) this.select(Phaser.Math.Wrap(this.index + input.navX, 0, ORDER.length));
    if (input.confirmPressed) this.confirm();
    if (input.pausePressed || input.backPressed) this.scene.start('MainMenu');
    this.hint.setText(
      input.device === 'pad'
        ? '◄ ►  elegir      A  confirmar      B  volver'
        : 'A / D  o  ← →  elegir      ENTER o clic  confirmar      ESC  volver',
    );
  }

  private select(i: number): void {
    this.index = i;
    this.cards.forEach((c, j) => {
      const on = j === i;
      c.frame.setStrokeStyle(6, on ? 0xc8e04a : 0x555555);
      c.portrait.setAlpha(on ? 1 : 0.55);
      if (on) c.preview.anims.resume();
      else c.preview.anims.pause();
    });
  }

  private confirm(): void {
    updateSave({ character: ORDER[this.index] });
    this.scene.start('MainMenu');
  }
}
