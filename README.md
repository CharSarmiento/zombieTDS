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
| `npm run dev` | Development server |
| `npm run build` | Type-check + production build into `dist/` |

Dev shortcuts: `?scene=Game` in the URL jumps straight to a scene; F1 shows hitboxes in game; F9 on character select opens the animation preview.

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
- [ ] M3 · Weapons: knife, pistol, bat, rifle, flamethrower
- [ ] M4 · Zombies (tiers 1–2), flow-field AI
- [ ] M5 · Levels (Tiled maps, walls, cover, explosive barrels)
- [ ] M6 · Level loop: waves, objectives, pickups, HUD
- [ ] M7 · Meta: menus, character select, level map, shop, skills, save
- [ ] M8 · Elites and bosses
- [ ] M9 · 10-level campaign and balance
- [ ] M10 · Audio, options, polish, desktop build

## Third-party content

The art and font are **not** included in this repository:
- Art: [CraftPix](https://craftpix.net/file-licenses/)
- Font: *Viking Squad* by Iconian Fonts (free for non-commercial use)
