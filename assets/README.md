# assets/ (not versioned)

This folder holds the original third-party art. Its contents are **not** in the repository, because their licenses do not allow redistribution. Everything the game uses is generated from here by `npm run assets` (see `tools/build-assets.mjs`). That script only reads this folder and never modifies it.

## What goes here

1. **CraftPix zombie top-down shooter pack**: extract it so this folder contains, among others:
   ```
   assets/
     Characters/PNG_Bodyparts&Animations/PNG Animations/{Man,Girl}/...
     Zombies/PNG Animations/{1LVL,2LVL}/...
     Monsters/PNG Animations/{3LVL,4LVL,5LVL}/...
     Tiles/PNG/{Walls,Roof}
     Tiles&Details/PNG/{Asphalt_tiles,Grass_tiles,Ground_tiles,Water_tiles,...}
     Objects/PNG/...            Items/PNG/      Explosion/PNG/
     Icons/PNG/  AVAs/  PNG/  PNG_Window/
   ```
   License: https://craftpix.net/file-licenses/
2. **Viking Squad font** (Iconian Fonts): https://www.dafont.com/viking-squad.font. Put the `.ttf` files in `assets/fonts/`.
   It is free for **non-commercial** use only. A commercial release needs a license from http://iconian.com/commercial.html.

3. **Sounds (optional)**: `assets/audio/<key>.ogg` (or numbered variants `<key>_1.ogg`, `<key>_2.ogg`…). The full list of keys is in `AUDIO.md`; missing sounds are simply silent.

The `.ai` (Illustrator) sources from the pack are not used by the game.
