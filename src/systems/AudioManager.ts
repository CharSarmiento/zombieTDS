import Phaser from 'phaser';
import type { AssetManifest } from '../assets/manifest';
import { MUSIC, SFX, type MusicKey, type SfxKey } from '../data/sounds';
import { loadSave } from './SaveManager';

const audioKey = (key: string, i: number) => `snd:${key}:${i}`;

/**
 * Game-wide audio (one instance, shared by every scene through the global sound manager).
 * Keys come from data/sounds.ts; only those with files in the manifest make sound, the rest are
 * silent no-ops so the game is complete with or without audio.
 */
class Audio {
  private game?: Phaser.Game;
  private variants: Record<string, number> = {};
  private lastPlayed: Record<string, number> = {};
  private music?: Phaser.Sound.BaseSound;
  private musicKey?: MusicKey;
  private loops = new Map<string, Phaser.Sound.BaseSound>();

  /** Queues every available file (call from the preload scene). */
  load(scene: Phaser.Scene, manifest: AssetManifest): void {
    for (const [key, files] of Object.entries(manifest.audio ?? {})) {
      files.forEach((url, i) => scene.load.audio(audioKey(key, i), url));
      this.variants[key] = files.length;
    }
  }

  init(game: Phaser.Game): void {
    this.game = game;
  }

  has(key: string): boolean {
    return (this.variants[key] ?? 0) > 0;
  }

  /** One-shot effect; random variant, pitch jitter and per-key throttling. */
  sfx(key: SfxKey, volume = 1): void {
    const def = SFX[key] as { volume: number; throttle?: number; pitch?: number };
    if (!this.game || !this.has(key)) return;
    const now = performance.now();
    if (def.throttle && now - (this.lastPlayed[key] ?? 0) < def.throttle) return;
    this.lastPlayed[key] = now;
    const v = loadSave().options.sfx * def.volume * volume;
    if (v <= 0) return;
    const pitch = def.pitch ? 1 + (Math.random() * 2 - 1) * def.pitch : 1;
    this.game.sound.play(audioKey(key, Phaser.Math.Between(0, this.variants[key] - 1)), { volume: v, rate: pitch });
  }

  /** Starts (or keeps) a looping effect, e.g. the flamethrower; stop it with stopLoop. */
  loop(key: SfxKey): void {
    if (!this.game || !this.has(key) || this.loops.has(key)) return;
    const s = this.game.sound.add(audioKey(key, 0), { loop: true, volume: loadSave().options.sfx * SFX[key].volume });
    s.play();
    this.loops.set(key, s);
  }

  stopLoop(key: SfxKey): void {
    const s = this.loops.get(key);
    if (!s) return;
    s.stop();
    s.destroy();
    this.loops.delete(key);
  }

  stopAllLoops(): void {
    for (const key of [...this.loops.keys()]) this.stopLoop(key as SfxKey);
  }

  /** Switches the background track with a short fade; the same track keeps playing. */
  playMusic(key: MusicKey): void {
    if (!this.game || key === this.musicKey) return;
    this.stopMusic();
    this.musicKey = key;
    if (!this.has(key)) return;
    const target = loadSave().options.music * MUSIC[key].volume;
    const m = this.game.sound.add(audioKey(key, 0), { loop: true, volume: 0 });
    m.play();
    this.music = m;
    this.fade(m, target, 800);
  }

  stopMusic(): void {
    const m = this.music;
    this.music = undefined;
    this.musicKey = undefined;
    if (m) this.fade(m, 0, 400, () => m.destroy());
  }

  /** Re-applies the volume options to what is playing (options screen). */
  applyVolumes(): void {
    const o = loadSave().options;
    if (this.music && this.musicKey) (this.music as Phaser.Sound.WebAudioSound).setVolume?.(o.music * MUSIC[this.musicKey].volume);
    for (const [key, s] of this.loops) (s as Phaser.Sound.WebAudioSound).setVolume?.(o.sfx * SFX[key as SfxKey].volume);
  }

  private fade(sound: Phaser.Sound.BaseSound, to: number, ms: number, done?: () => void): void {
    const s = sound as Phaser.Sound.WebAudioSound;
    const from = s.volume ?? 0;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      s.setVolume?.(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(step);
      else done?.();
    };
    step();
  }
}

export const audio = new Audio();
