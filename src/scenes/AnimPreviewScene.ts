import Phaser from 'phaser';
import { getManifest, type AssetManifest } from '../assets/manifest';
import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '../config';

const TEXT = { fontFamily: 'Arial', fontSize: '20px', color: '#e8f0c0' } as const;

/**
 * Debug scene to validate the asset pipeline.
 *  TAB         toggle overview (everything at real scale) / inspector
 *  ↑ ↓         inspector: previous / next entity
 *  ← →         inspector: previous / next animation
 *  R           inspector: rotate towards the mouse (pivot test)
 *  Z           inspector: toggle 2x zoom
 */
export class AnimPreviewScene extends Phaser.Scene {
  private manifest!: AssetManifest;
  private entities: string[] = [];
  private animsOf: Record<string, string[]> = {};
  private entityIdx = 0;
  private animIdx = 0;
  private overview = true;
  private rotate = false;
  private zoom = 1;
  private root!: Phaser.GameObjects.Container;
  private subject?: Phaser.GameObjects.Sprite;
  private marker!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super('AnimPreview');
  }

  create(): void {
    this.manifest = getManifest(this);
    for (const key of Object.keys(this.manifest.anims)) {
      const [entity, anim] = key.split('/');
      if (entity === 'fx') continue;
      (this.animsOf[entity] ??= []).push(anim);
    }
    this.entities = Object.keys(this.animsOf);

    this.drawGround();
    this.root = this.add.container(0, 0);
    this.marker = this.add.graphics().setDepth(10);
    this.info = this.add.text(20, 16, '', TEXT).setDepth(20).setBackgroundColor('#000000aa').setPadding(8);

    const kb = this.input.keyboard!;
    kb.on('keydown-TAB', (e: KeyboardEvent) => {
      e.preventDefault();
      this.overview = !this.overview;
      this.rebuild();
    });
    kb.on('keydown-UP', () => this.step(-1, 0));
    kb.on('keydown-DOWN', () => this.step(1, 0));
    kb.on('keydown-LEFT', () => this.step(0, -1));
    kb.on('keydown-RIGHT', () => this.step(0, 1));
    kb.on('keydown-R', () => (this.rotate = !this.rotate));
    kb.on('keydown-Z', () => {
      this.zoom = this.zoom === 1 ? 2 : 1;
      this.rebuild();
    });
    this.rebuild();
  }

  /** Real-scale ground so sprite sizes can be judged against the 100px tile. */
  private drawGround(): void {
    const grass = this.manifest.tileset.names.indexOf('grass/00');
    const asphalt = this.manifest.tileset.names.indexOf('asphalt/12');
    for (let y = 0; y < GAME_HEIGHT; y += TILE_SIZE)
      for (let x = 0; x < GAME_WIDTH; x += TILE_SIZE)
        this.add.image(x, y, 'ground', y >= 600 && y < 800 ? asphalt : grass).setOrigin(0);
    const g = this.add.graphics().lineStyle(1, 0x000000, 0.15);
    for (let x = 0; x <= GAME_WIDTH; x += TILE_SIZE) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += TILE_SIZE) g.lineBetween(0, y, GAME_WIDTH, y);
  }

  private step(de: number, da: number): void {
    if (this.overview) return;
    if (de) {
      this.entityIdx = Phaser.Math.Wrap(this.entityIdx + de, 0, this.entities.length);
      this.animIdx = 0;
    }
    if (da) this.animIdx = Phaser.Math.Wrap(this.animIdx + da, 0, this.animsOf[this.entities[this.entityIdx]].length);
    this.rebuild();
  }

  private rebuild(): void {
    this.root.removeAll(true);
    this.subject = undefined;
    this.marker.clear();
    if (this.overview) this.buildOverview();
    else this.buildInspector();
  }

  private buildOverview(): void {
    // walking lineup, one per entity, centred on tile rows
    const cols = 7;
    const cellW = GAME_WIDTH / cols;
    const small = this.entities.filter((e) => !['boss1', 'boss2', 'megaboss'].includes(e));
    small.forEach((entity, i) => {
      const x = cellW * (i % cols) + cellW / 2;
      const y = 200 + Math.floor(i / cols) * 230;
      const walk = this.animsOf[entity].find((a) => a.startsWith('walk')) ?? this.animsOf[entity][0];
      this.root.add(this.add.sprite(x, y, '').play(`${entity}/${walk}`));
      this.root.add(this.add.text(x, y + 95, entity, TEXT).setOrigin(0.5));
    });
    ['boss1', 'boss2', 'megaboss'].forEach((entity, i) => {
      const x = 330 + i * 620;
      const y = 820;
      this.root.add(this.add.sprite(x, y, '').play(`${entity}/walk`));
      this.root.add(this.add.text(x, y + 240, entity, TEXT).setOrigin(0.5));
    });
    this.info.setText('OVERVIEW · escala real sobre tiles de 100px   [TAB] inspector');
  }

  private buildInspector(): void {
    const entity = this.entities[this.entityIdx];
    const anim = this.animsOf[entity][this.animIdx];
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.subject = this.add.sprite(cx, cy, '').setScale(this.zoom).play(`${entity}/${anim}`);
    this.subject.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () =>
      this.time.delayedCall(400, () => this.subject?.play(`${entity}/${anim}`)),
    );
    this.root.add(this.subject);
    const frames = this.manifest.anims[`${entity}/${anim}`].frames.length;
    this.info.setText(
      [
        `INSPECTOR  ${entity} / ${anim}   (${frames} frames)`,
        `[↑↓] entidad ${this.entityIdx + 1}/${this.entities.length}   [←→] anim ${this.animIdx + 1}/${this.animsOf[entity].length}`,
        `[R] rotar hacia el mouse: ${this.rotate ? 'ON' : 'OFF'}   [Z] zoom x${this.zoom}   [TAB] overview`,
      ].join('\n'),
    );
  }

  update(): void {
    if (!this.subject) return;
    const s = this.subject;
    if (this.rotate) {
      const p = this.input.activePointer;
      // sprites face +Y (down); Phaser rotation 0 faces +X
      s.rotation = Phaser.Math.Angle.Between(s.x, s.y, p.worldX, p.worldY) - Math.PI / 2;
    } else s.rotation = 0;

    const g = this.marker.clear();
    g.lineStyle(1, 0xffff00, 0.8).lineBetween(s.x - 40, s.y, s.x + 40, s.y).lineBetween(s.x, s.y - 40, s.x, s.y + 40);
    const entity = this.entities[this.entityIdx];
    const anim = this.animsOf[entity][this.animIdx];
    const tip = this.manifest.muzzles[entity]?.[anim];
    if (tip) {
      const v = new Phaser.Math.Vector2(tip.x * this.zoom, tip.y * this.zoom).rotate(s.rotation);
      g.fillStyle(0xff3030, 1).fillCircle(s.x + v.x, s.y + v.y, 5);
    }
  }
}
