import Phaser from 'phaser';
import { InputManager } from '../systems/InputManager';
import { FocusGroup } from '../ui/Focus';

/**
 * Base for menu screens: input, focus navigation and "back" (Esc / B) handling.
 * Subclasses build their contents in create() and implement back().
 */
export abstract class MenuScene extends Phaser.Scene {
  protected controls!: InputManager;
  protected focus!: FocusGroup;

  protected initMenu(): void {
    this.controls = new InputManager(this);
    this.focus = new FocusGroup(this);
    this.input.setDefaultCursor('default');
    this.cameras.main.fadeIn(180, 0, 0, 0);
  }

  protected abstract back(): void;

  update(): void {
    const input = this.controls.update();
    if (input.pausePressed || input.backPressed) {
      this.back();
      return;
    }
    this.focus.update(input);
  }

  /** Fades out and starts another scene. */
  protected go(key: string, data?: object): void {
    this.input.enabled = false;
    this.cameras.main.fadeOut(160, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key, data));
  }
}
