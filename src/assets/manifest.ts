/** Shape of public/atlases/manifest.json, produced by tools/build-assets.mjs. */
export interface AssetManifest {
  worldScale: number;
  /** atlas key -> multiatlas json url */
  atlases: Record<string, string>;
  /** animation key (e.g. "man/walk_gun") -> atlas + ordered frame names */
  anims: Record<string, { atlas: string; frames: string[] }>;
  /** static frame prefix (e.g. "house") -> atlas + frame names */
  statics: Record<string, { atlas: string; frames: string[] }>;
  /** entity -> anim -> weapon tip offset from the pivot, sprite facing +Y */
  muzzles: Record<string, Record<string, { x: number; y: number }>>;
  /** sound key -> variant files (empty until assets/audio has files) */
  audio?: Record<string, string[]>;
  tileset: {
    image: string;
    tileSize: number;
    margin: number;
    spacing: number;
    columns: number;
    count: number;
    names: string[];
  };
}

export const MANIFEST_KEY = 'asset-manifest';

export function getManifest(scene: Phaser.Scene): AssetManifest {
  return scene.cache.json.get(MANIFEST_KEY) as AssetManifest;
}

/** Atlas key that holds a given static frame, by its prefix ("house/0005" -> "env"). */
export function atlasOfStatic(manifest: AssetManifest, frame: string): string {
  return manifest.statics[frame.split('/')[0]].atlas;
}
