# Sonidos del juego

El juego ya está preparado para todos estos sonidos. Mientras falte alguno, ese momento simplemente queda en silencio.

## Cómo agregarlos

1. Pon los archivos en `assets/audio/` con el **nombre exacto** de la tabla. Se aceptan `.ogg` (recomendado), `.mp3`, `.wav` y `.m4a`.
2. **Variantes al azar (opcional):** si hay varias versiones de un sonido, numéralas: `zombie_death_1.ogg`, `zombie_death_2.ogg`, `zombie_death_3.ogg`… El juego elige una al azar cada vez, y así no se vuelve repetitivo. Se recomiendan sobre todo para disparos, impactos, gruñidos y muertes.
3. Corre `npm run assets` y recarga el juego.

Igual que el arte, la carpeta `assets/audio/` no se sube a GitHub. Revisa la licencia de cada sonido; los packs CC0 (dominio público), como los de [Kenney](https://kenney.nl/assets/category:Audio) o los marcados como CC0 en [OpenGameArt](https://opengameart.org) y [Freesound](https://freesound.org), no tienen restricciones.

## Música (en loop)

| Archivo | Cuándo suena | Sugerencia |
|---|---|---|
| `music_menu` | Menús, mapa, arsenal, habilidades | Tenso pero tranquilo, de 1 a 3 min con loop limpio |
| `music_level` | Durante los niveles | Acción y suspenso, percusión |
| `music_boss` | Durante las peleas de jefe | Más intensa, épica |

## Armas

| Archivo | Cuándo suena | Duración |
|---|---|---|
| `gun_shot` | Disparo de pistola | Corto (< 0,4 s) · con variantes |
| `rifle_shot` | Cada bala del rifle (hasta 10 por segundo) | Muy corto (< 0,2 s) · con variantes |
| `flame_loop` | Lanzallamas encendido | Loop sin cortes, 1 a 2 s |
| `knife_swing` | Tajo de cuchillo (al aire) | Corto, "whoosh" agudo |
| `bat_swing` | Golpe de bate (al aire) | Corto, "whoosh" grave |
| `melee_hit` | Cuchillo o bate que conecta | Golpe seco o carne |
| `reload` | Empieza la recarga | ~1 s, mecánico |
| `empty_click` | Sin balas | Clic seco |
| `weapon_switch` | Cambiar de arma | Muy corto, metálico |
| `bullet_hit` | Bala que impacta a un zombie | Corto, carnoso · con variantes |
| `bullet_wall` | Bala que pega en pared o auto | Corto, ricochet o impacto |

## Zombies y jefes

| Archivo | Cuándo suena |
|---|---|
| `zombie_groan` | Gruñidos de ambiente (más frecuentes cuantos más zombies hay) · con variantes |
| `zombie_attack` | Zarpazo de un zombie común |
| `zombie_death` | Muerte de un zombie · con variantes |
| `elite_roar` | Ataque de una élite (Manos Grandes, Cabezón) |
| `boss_roar` | Llega un jefe / el jefe invoca refuerzos |
| `boss_attack` | Ataque de barrido o latigazo de un jefe |
| `boss_slam` | Golpe al suelo (élites y jefes) |
| `fire_breath` | Aliento de fuego de La Abominación (~1,5 s) |
| `boss_death` | Muerte de un jefe (largo, dramático) |

## Jugador y mundo

| Archivo | Cuándo suena |
|---|---|
| `player_hurt` | El jugador recibe daño · con variantes |
| `player_death` | Muerte del jugador |
| `footstep` | Pasos al caminar (suave, ~3 por segundo) · con variantes |
| `explosion` | Barril que explota |
| `pickup_money` | Recoger dinero (moneda, "cling") |
| `pickup_item` | Recoger vida, armadura o munición |
| `powerup` | Recoger velocidad, zombies lentos o daño ×2 |

## Avisos e interfaz

| Archivo | Cuándo suena |
|---|---|
| `wave_start` | Empieza una oleada o un "sobrevive" |
| `wave_clear` | Oleada superada / zona despejada |
| `level_complete` | Nivel completado (jingle corto) |
| `game_over` | Muerte, pantalla de derrota |
| `ui_move` | Moverse entre opciones de un menú (muy corto, suave) |
| `ui_select` | Elegir una opción |
| `ui_buy` | Compra o mejora realizada (caja registradora, moneda) |
| `ui_error` | Acción no permitida (sin dinero, bloqueado) |

El volumen de cada sonido ya está equilibrado en el código (`src/data/sounds.ts`), y en el juego se regula desde **Opciones** (música y efectos por separado).
