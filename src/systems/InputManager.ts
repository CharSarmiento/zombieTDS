import Phaser from 'phaser';

export type Device = 'kbm' | 'pad';

/** Everything gameplay and menus need from the player's hands, sampled once per frame. */
export interface InputFrame {
  device: Device;
  /** movement, length 0..1 */
  move: Phaser.Math.Vector2;
  /** keyboard/mouse: aim target in world coordinates */
  aimWorld: Phaser.Math.Vector2 | null;
  /** gamepad: aim direction (unit) while the right stick is held, else null */
  aimDir: Phaser.Math.Vector2 | null;
  fire: boolean;
  firePressed: boolean;
  reloadPressed: boolean;
  sprint: boolean;
  /** -1 / +1 to cycle weapons */
  weaponDelta: number;
  /** direct weapon slot (0-based) or null */
  weaponSlot: number | null;
  pausePressed: boolean;
  confirmPressed: boolean;
  backPressed: boolean;
  /** menu navigation, -1/0/+1 on the frame it is pressed */
  navX: number;
  navY: number;
}

const DEADZONE = 0.22;
const NAV_THRESHOLD = 0.6;
const TRIGGER_THRESHOLD = 0.3;

/** Standard gamepad mapping (W3C). */
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const KEY_NAMES = 'W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,R,Q,E,ONE,TWO,THREE,FOUR,FIVE,ESC,ENTER,SPACE';

/**
 * Abstracts keyboard+mouse and gamepad. The active device switches automatically to whichever
 * was used last, so the game can show the right prompts and aiming mode.
 */
export class InputManager {
  device: Device = 'kbm';
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private wheel = 0;
  private mouseDown = false;
  private mousePressed = false;
  private prevButtons: boolean[] = [];
  private prevNav = { x: 0, y: 0 };
  private lastPointer = { x: 0, y: 0 };

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys(KEY_NAMES, false) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,TAB');
    kb.on('keydown', this.onKeyDown, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.mouse?.disableContextMenu();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** First connected gamepad (browsers only expose it after a button press). */
  get pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const gp = this.scene.input.gamepad;
    return gp && gp.total > 0 ? gp.getAll()[0] : undefined;
  }

  update(): InputFrame {
    const pad = this.pad;
    const pressed = (i: number) => !!pad?.buttons[i]?.pressed;
    const value = (i: number) => pad?.buttons[i]?.value ?? 0;
    const down = (i: number) => pressed(i) && !this.prevButtons[i];

    // --- device detection
    const p = this.scene.input.activePointer;
    if (Math.abs(p.x - this.lastPointer.x) + Math.abs(p.y - this.lastPointer.y) > 3) this.device = 'kbm';
    this.lastPointer = { x: p.x, y: p.y };
    const left = pad ? radial(pad.leftStick) : new Phaser.Math.Vector2();
    const right = pad ? radial(pad.rightStick) : new Phaser.Math.Vector2();
    if (pad && (left.lengthSq() > 0 || right.lengthSq() > 0 || pad.buttons.some((b) => b.pressed))) this.device = 'pad';

    const k = this.keys;
    const jd = (name: string) => Phaser.Input.Keyboard.JustDown(k[name]);

    // --- keyboard + mouse
    const kbMove = new Phaser.Math.Vector2(
      +(k.D.isDown || k.RIGHT.isDown) - +(k.A.isDown || k.LEFT.isDown),
      +(k.S.isDown || k.DOWN.isDown) - +(k.W.isDown || k.UP.isDown),
    );
    if (kbMove.lengthSq() > 1) kbMove.normalize();
    const slotKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
    const slot = slotKeys.findIndex((name) => jd(name));
    const kbNavX = +jd('RIGHT') - +jd('LEFT') || +jd('D') - +jd('A');
    const kbNavY = +jd('DOWN') - +jd('UP') || +jd('S') - +jd('W');

    // --- gamepad menu navigation (d-pad or stick crossing the threshold)
    const stickNavX = Math.abs(left.x) > NAV_THRESHOLD ? Math.sign(left.x) : 0;
    const stickNavY = Math.abs(left.y) > NAV_THRESHOLD ? Math.sign(left.y) : 0;
    const padNavX = (+down(BTN.RIGHT) - +down(BTN.LEFT)) || (stickNavX !== this.prevNav.x ? stickNavX : 0);
    const padNavY = (+down(BTN.DOWN) - +down(BTN.UP)) || (stickNavY !== this.prevNav.y ? stickNavY : 0);
    this.prevNav = { x: stickNavX, y: stickNavY };

    const cam = this.scene.cameras.main;
    const frame: InputFrame = {
      device: this.device,
      move: left.lengthSq() > kbMove.lengthSq() ? left : kbMove,
      aimWorld: this.device === 'kbm' ? p.positionToCamera(cam) as Phaser.Math.Vector2 : null,
      aimDir: this.device === 'pad' && right.lengthSq() > 0 ? right.clone().normalize() : null,
      fire: this.mouseDown || value(BTN.RT) > TRIGGER_THRESHOLD,
      firePressed: this.mousePressed || (value(BTN.RT) > TRIGGER_THRESHOLD && !this.prevButtons[BTN.RT]),
      reloadPressed: jd('R') || down(BTN.X),
      sprint: k.SHIFT.isDown || pressed(BTN.L3),
      weaponDelta: Math.sign(this.wheel) || +(jd('E') || down(BTN.RB)) - +(jd('Q') || down(BTN.LB)),
      weaponSlot: slot >= 0 ? slot : null,
      pausePressed: jd('ESC') || down(BTN.START),
      confirmPressed: jd('ENTER') || jd('SPACE') || down(BTN.A),
      backPressed: down(BTN.B),
      navX: kbNavX || padNavX,
      navY: kbNavY || padNavY,
    };

    this.prevButtons = pad ? pad.buttons.map((b, i) => (i === BTN.RT ? b.value > TRIGGER_THRESHOLD : b.pressed)) : [];
    this.wheel = 0;
    this.mousePressed = false;
    return frame;
  }

  private onKeyDown(): void {
    this.device = 'kbm';
  }

  private onWheel(_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number): void {
    this.device = 'kbm';
    this.wheel += Math.sign(dy);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    this.device = 'kbm';
    if (p.leftButtonDown()) {
      this.mouseDown = true;
      this.mousePressed = true;
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (!p.leftButtonDown()) this.mouseDown = false;
  }

  destroy(): void {
    const kb = this.scene.input.keyboard;
    kb?.off('keydown', this.onKeyDown, this);
    if (kb) for (const key of Object.values(this.keys)) kb.removeKey(key);
    this.scene.input.off('wheel', this.onWheel, this);
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
  }
}

/** Radial deadzone, rescaled so output starts at 0 just past the deadzone. */
function radial(stick: Phaser.Math.Vector2): Phaser.Math.Vector2 {
  const len = stick.length();
  if (len < DEADZONE) return new Phaser.Math.Vector2();
  const scaled = Math.min(1, (len - DEADZONE) / (1 - DEADZONE));
  return stick.clone().scale(scaled / len);
}
