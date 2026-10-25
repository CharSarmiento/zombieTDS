import Phaser from 'phaser';

export const DEPTH = {
  ground: 0,
  decal: 5,
  shadow: 10,
  actor: 20,
  player: 30,
  overhead: 40,
  ui: 100,
} as const;

/**
 * Anything that moves and animates in the world. Physics lives on an invisible circular zone,
 * while the sprite and its shadow are purely visual and are synced to it after the physics step.
 * This keeps the hitbox stable no matter how the per-frame pivots of the art change.
 * Sprites are drawn facing +Y, so `facing` (radians, 0 = +X) maps to rotation `facing - PI/2`.
 */
export class Actor {
  readonly root: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow?: Phaser.GameObjects.Image;
  facing = Math.PI / 2;

  constructor(
    readonly scene: Phaser.Scene,
    x: number,
    y: number,
    readonly radius: number,
    shadow?: { atlas: string; frame: string; alpha?: number },
    depth: number = DEPTH.actor,
  ) {
    this.root = scene.add.zone(x, y, radius * 2, radius * 2);
    scene.physics.add.existing(this.root);
    this.body = this.root.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(radius);
    if (shadow) {
      this.shadow = scene.add.image(x, y, shadow.atlas, shadow.frame).setAlpha(shadow.alpha ?? 0.55).setDepth(DEPTH.shadow);
    }
    this.sprite = scene.add.sprite(x, y, '').setDepth(depth);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  get x(): number {
    return this.root.x;
  }

  get y(): number {
    return this.root.y;
  }

  /** Copies the physics position to the visuals; runs after the physics step. */
  protected sync(): void {
    this.sprite.setPosition(this.root.x, this.root.y).setRotation(this.facing - Math.PI / 2);
    this.shadow?.setPosition(this.root.x + 6, this.root.y + 8);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    this.root.destroy();
    this.sprite.destroy();
    this.shadow?.destroy();
  }
}
