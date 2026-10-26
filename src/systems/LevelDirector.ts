import Phaser from 'phaser';
import type { EnemyId } from '../data/enemies';
import type { BossStep, LevelDef, LevelStep, Trickle, Wave } from '../data/levels';
import { pickWeighted, type SpawnPicker } from './SpawnPicker';

/** What the director needs from the scene. */
/** What the director tracks of a spawned boss. */
export interface BossHandle {
  readonly hp: number;
  readonly maxHp: number;
  readonly alive: boolean;
  readonly x: number;
  readonly y: number;
  readonly def: { name: string };
  enrage(multiplier: number): void;
}

export interface DirectorContext {
  picker: SpawnPicker;
  spawn: (kind: EnemyId, x: number, y: number) => BossHandle;
  /** free spot around a point (escorts and summons appear next to the boss) */
  freeNear: (x: number, y: number, minR: number, maxR: number) => Phaser.Math.Vector2 | null;
  /** boss start marker of the map, if any */
  bossPoint: Phaser.Math.Vector2 | null;
  aliveCount: () => number;
  /** true while the player stands in the named marker area */
  playerIn: (marker: string) => boolean;
}

/** HUD-facing state of the current objective. */
export interface ObjectiveStatus {
  title: string;
  detail: string;
  /** 0..1 or null when there is no meaningful progress bar */
  progress: number | null;
  /** marker the player must reach (for the HUD arrow), if any */
  target: string | null;
  /** progress bar colour (boss health is red) */
  color?: number;
}

/**
 * Runs a level's objective steps in order: wave batches with breaks, survival timers and
 * reach-the-exit goals, spawning enemies as each step dictates.
 * Emits 'banner' (title, subtitle) for big announcements and 'complete' when the level is won.
 */
export class LevelDirector {
  readonly events = new Phaser.Events.EventEmitter();
  private stepIndex = -1;
  private waveIndex = 0;
  private queue: EnemyId[] = [];
  private waveTotal = 0;
  private breakLeft = 0;
  private spawnTimer = 0;
  private stepTime = 0;
  private done = false;
  private boss?: BossHandle;
  private phase = 0;

  constructor(
    private def: LevelDef,
    private ctx: DirectorContext,
  ) {}

  /** Starts the first step (call once the scene is ready). */
  start(): void {
    this.nextStep();
  }

  get finished(): boolean {
    return this.done;
  }

  private get step(): LevelStep | undefined {
    return this.def.steps[this.stepIndex];
  }

  update(dt: number): void {
    const step = this.step;
    if (!step || this.done) return;
    this.stepTime += dt;
    switch (step.type) {
      case 'waves':
        this.updateWaves(step.waves, step.breakTime, dt);
        break;
      case 'survive':
        this.trickle(step.trickle, dt);
        if (this.stepTime >= step.seconds) this.nextStep();
        break;
      case 'reach':
        if (step.trickle) this.trickle(step.trickle, dt);
        if (this.ctx.playerIn(step.marker)) this.nextStep();
        break;
      case 'boss':
        this.updateBoss(step, dt);
        break;
    }
  }

  private updateBoss(step: BossStep, dt: number): void {
    // the queue holds escorts/summons that found no free spot yet
    if (this.queue.length) this.spawnAround(this.queue.splice(0));
    const b = this.boss;
    if (!b) return;
    if (!b.alive) {
      this.events.emit('banner', '¡JEFE ABATIDO!', b.def.name);
      this.boss = undefined;
      this.nextStep();
      return;
    }
    this.trickle(step.trickle, dt);
    const next = step.phases[this.phase];
    if (next && b.hp / b.maxHp <= next.at) {
      this.phase++;
      b.enrage(next.enrage);
      this.events.emit('banner', '¡REFUERZOS!', `${b.def.name} está furioso`);
      this.spawnAround(expand(next.summon));
    }
  }

  /** Spawns enemies in a ring around the boss (falls back to normal spawn points). */
  private spawnAround(kinds: EnemyId[]): void {
    const b = this.boss;
    for (const kind of kinds) {
      const p = b ? this.ctx.freeNear(b.x, b.y, 180, 380) : null;
      if (p) this.ctx.spawn(kind, p.x, p.y);
      else this.spawnOne(kind);
    }
  }

  get status(): ObjectiveStatus {
    const step = this.step;
    if (this.stepIndex < 0) return { title: this.def.name.toUpperCase(), detail: 'Prepárate…', progress: null, target: null };
    if (!step || this.done) return { title: '¡NIVEL COMPLETADO!', detail: '', progress: 1, target: null };
    switch (step.type) {
      case 'waves': {
        const n = step.waves.length;
        if (this.breakLeft > 0) {
          return { title: `OLEADA ${this.waveIndex + 1} / ${n}`, detail: `Prepárate… ${Math.ceil(this.breakLeft)}`, progress: null, target: null };
        }
        const left = this.queue.length + this.ctx.aliveCount();
        return {
          title: `OLEADA ${this.waveIndex + 1} / ${n}`,
          detail: `Zombies restantes: ${left}`,
          progress: this.waveTotal ? 1 - left / this.waveTotal : 0,
          target: null,
        };
      }
      case 'survive': {
        const s = Math.ceil(Math.max(0, step.seconds - this.stepTime));
        return { title: 'SOBREVIVE', detail: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, progress: this.stepTime / step.seconds, target: null };
      }
      case 'reach':
        return { title: step.label ?? 'LLEGA A LA SALIDA', detail: 'Sigue la flecha', progress: null, target: step.marker };
      case 'boss': {
        const b = this.boss;
        if (!b) return { title: 'JEFE', detail: '', progress: null, target: null };
        return {
          title: b.def.name.toUpperCase(),
          detail: `Fase ${this.phase + 1} / ${step.phases.length + 1}`,
          progress: Math.max(0, b.hp / b.maxHp),
          target: null,
          color: 0xd02a2a,
        };
      }
    }
  }

  /** Dev: completes the current step at once. */
  skipStep(): void {
    this.queue = [];
    this.nextStep();
  }

  /** Dev: spawns `n` extra walkers. */
  burst(n: number): void {
    for (let i = 0; i < n; i++) this.spawnOne(pickWeighted<EnemyId>([['zombie1', 1], ['zombie3', 1], ['cop', 1]]));
  }

  // --- steps --------------------------------------------------------------------------------

  private nextStep(): void {
    this.stepIndex++;
    this.stepTime = 0;
    this.spawnTimer = 0;
    const step = this.step;
    if (!step) {
      this.done = true;
      this.events.emit('complete');
      return;
    }
    switch (step.type) {
      case 'waves':
        this.waveIndex = 0;
        this.beginBreak(step, 2.5);
        break;
      case 'survive':
        this.events.emit('banner', 'SOBREVIVE', `${step.seconds} segundos`);
        break;
      case 'reach':
        this.events.emit('banner', '¡ZONA DESPEJADA!', step.label ? step.label.replace(/[¡!]/g, '').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'Llega a la salida');
        break;
      case 'boss': {
        this.phase = 0;
        const p = this.ctx.bossPoint ?? this.ctx.picker.pick();
        if (!p) break;
        this.boss = this.ctx.spawn(step.boss, p.x, p.y);
        this.events.emit('banner', this.boss.def.name.toUpperCase(), '¡Ha llegado un jefe!');
        this.spawnAround(expand(step.escort));
        break;
      }
    }
  }

  private beginBreak(step: Extract<LevelStep, { type: 'waves' }>, seconds = step.breakTime): void {
    this.breakLeft = seconds;
    this.queue = [];
  }

  private updateWaves(waves: Wave[], breakTime: number, dt: number): void {
    if (this.breakLeft > 0) {
      this.breakLeft -= dt;
      if (this.breakLeft <= 0) this.startWave(waves[this.waveIndex], waves.length);
      return;
    }
    const wave = waves[this.waveIndex];
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && this.ctx.aliveCount() < wave.maxAlive) {
      this.spawnTimer = wave.interval;
      this.spawnOne(this.queue.pop()!);
    }
    if (!this.queue.length && this.ctx.aliveCount() === 0) {
      this.waveIndex++;
      if (this.waveIndex >= waves.length) this.nextStep();
      else {
        this.events.emit('banner', '¡OLEADA SUPERADA!', `Siguiente en ${breakTime} s`);
        this.breakLeft = breakTime;
      }
    }
  }

  private startWave(wave: Wave, total: number): void {
    const list = expand(wave.spawn);
    this.queue = Phaser.Utils.Array.Shuffle(list);
    this.waveTotal = list.length;
    this.spawnTimer = 0;
    this.events.emit('banner', `OLEADA ${this.waveIndex + 1}`, this.waveIndex + 1 === total ? 'La última' : `de ${total}`);
  }

  private trickle(t: Trickle, dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.ctx.aliveCount() >= t.maxAlive) return;
    this.spawnTimer = t.interval;
    this.spawnOne(pickWeighted(Object.entries(t.weights) as [EnemyId, number][]));
  }

  private spawnOne(kind: EnemyId): void {
    const p = this.ctx.picker.pick();
    if (p) this.ctx.spawn(kind, p.x, p.y);
    else this.queue.push(kind); // no free spot this frame: retry later
  }
}

/** { zombie1: 2, cop: 1 } -> ['zombie1', 'zombie1', 'cop'] */
function expand(counts: Partial<Record<EnemyId, number>>): EnemyId[] {
  const list: EnemyId[] = [];
  for (const [kind, n] of Object.entries(counts) as [EnemyId, number][]) for (let i = 0; i < n; i++) list.push(kind);
  return list;
}
