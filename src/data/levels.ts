/** Campaign levels. Objectives, waves and unlocks are added in M6/M9. */
export interface LevelDef {
  id: string;
  name: string;
  /** Tiled map in public/maps/<map>.json */
  map: string;
}

export const LEVELS: LevelDef[] = [{ id: 'level01', name: 'Suburbio', map: 'level01' }];

export const mapKey = (map: string) => `map:${map}`;
export const PROPS_TILESET_KEY = 'props-tileset';
