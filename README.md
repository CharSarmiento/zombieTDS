# Zombies Game

Top-down zombie survival shooter for PC, played with keyboard + mouse or a gamepad. It is a level-based campaign: you pick a male or female survivor (cosmetic only), fight through 10 levels of zombies, elites and bosses, and spend the money you earn on weapons, upgrades and skills.

Built with **Phaser 3 + TypeScript + Vite**.

## Setup

```bash
npm install
# 1. put the licensed art in assets/ (see assets/README.md)
# 2. generate atlases, tileset and manifest into public/
npm run assets
# 3. run
npm run dev        # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run assets` | Builds the texture atlases from `assets/` (`npm run assets -- man zombies` rebuilds only those groups) |
| `npm run maps` | Generates missing level maps (`public/maps/*.json`) from `tools/build-maps.mjs`; `-- --force` overwrites |
| `npm run dev` | Development server |
| `npm run build` | Type-check + production build into `dist/` |

## Editing levels in Tiled

Maps are regular Tiled JSON files: open `public/maps/level01.json` in [Tiled](https://www.mapeditor.org/) (after `npm run assets`, which creates the tilesets it uses).

- **ground** (tile layer): paint with the `ground` tileset.
- **props** (object layer): insert tiles from the `props` collection: walls, furniture, cars, trees, barrels. Collision, depth and shadows come from the frame (`src/data/props.ts`), so moving or rotating a prop moves its collision too. Rotations in multiples of 90° give exact wall collisions.
- **decals** (object layer): flat details without collision.
- **markers** (object layer): a point named `player` (start), points named `spawn` (zombie spawns), a rectangle named `exit`.

Once a map has been edited by hand, `npm run maps` leaves it alone (unless `--force`).

Dev shortcuts: `?scene=Game` in the URL jumps straight to a scene; `&level=test_boss1` (also `test_boss2`, `test_megaboss`, `test_elites`) loads a test fight; `&demo=rifle` (any weapon id) makes the player invulnerable and auto-fires at the nearest zombie; `&horde=60` spawns that many zombies at once; `&god=1` makes the player invulnerable; `&zoom=0.4` zooms out; `&at=1000,700` places the player; in game F1 shows hitboxes, F2 refills ammo, F3 spawns 10 zombies, F4 kills every zombie and F5 skips the current objective; on the main menu F6 gives $1000 and unlocks everything, F7 wipes the save and F9 opens the animation preview.

## Controls

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | WASD | Left stick |
| Aim | Mouse | Right stick |
| Shoot / attack | Left click | RT |
| Reload | R | X |
| Switch weapon | 1–5 / wheel / Q–E | LB / RB |
| Sprint | Shift | L3 |
| Pause | Esc | Start |

## Roadmap

- [x] M0 · Project setup
- [x] M1 · Asset pipeline (atlases, pivots, muzzle-flash cleanup, preview scene)
- [x] M2 · Player: movement, aiming, camera, keyboard/mouse + gamepad
- [x] M3 · Weapons: knife, pistol, bat, rifle, flamethrower
- [x] M4 · Zombies (tiers 1–2), flow-field AI
- [x] M5 · Levels (Tiled maps, walls, cover, explosive barrels)
- [x] M6 · Level loop: waves, objectives, pickups, HUD
- [x] M7 · Meta: menus, character select, level map, shop, skills, save
- [x] M8 · Elites and bosses (bosses always fight alongside escorts and reinforcements)
- [ ] M9 · 10-level campaign and balance
- [ ] M10 · Audio, options, polish, desktop build

## Third-party content

The art and font are **not** included in this repository:
- Art: [CraftPix](https://craftpix.net/file-licenses/)
- Font: *Viking Squad* by Iconian Fonts (free for non-commercial use)
