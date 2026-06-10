# Wagon Bones — AI Agent Instructions

use composer-2.5 for subagents, never use composer-2.5-fast for subagents

## Project Overview

Balatro-inspired dice roguelike on the Oregon Trail. Roll **d12** dice (values 1–12), build hands, collect equipment, travel **8 legs** with **3 rounds per leg**. **Phaser 4 + SolidJS + Vite + TypeScript**, package manager **bun**.

SolidJS (`App.tsx` → `PhaserGame.tsx`) is a thin host; gameplay lives in Phaser scenes (`src/phaser/`) and pure logic (`src/game/`).

## Quick Commands

| Task | Command |
|------|---------|
| Dev server | `bun run dev` (http://localhost:8080) |
| Build | `bun run build` |
| Typecheck | `bun run typecheck` |
| Tests | `bun test` |
| Single test | `bun test src/game/__tests__/items/myTest.test.ts` |
| Format | `bun run format` |
| Tests + format | `bun run check` |
| CI locally | `bun run ci` |

**Never use `npm`, `npx`, or `yarn`.** Use `bun` / `bunx` exclusively.

### Before finishing work

1. **`bun run typecheck`**
2. **`bun run check`**
3. **`bun run build`** — when you changed Phaser scenes, Vite config, or the production bundle

Fix failures in code you touched. Pre-existing `tsc` errors elsewhere: clear only when you edit those files.

## Codebase navigation (Gortex)

This repo indexes via the **Gortex** MCP server (`.cursor/mcp.json`). **Use Gortex graph tools for architecture and “where does X live?”** — not for input bugs or line-level debugging. See `.cursor/rules/gortex-workflow.mdc`.

| Need | Tool |
|------|------|
| Orient / index health | `graph_stats` or `index_health` |
| Task-scoped context | `smart_context` with a natural-language `task` |
| Find symbols | `search_symbols` |
| Read one symbol | `get_symbol_source` |
| Callers / callees | `get_call_chain`, `find_usages` |
| Literal search | `search_text` |
| Community overview | `.cursor/rules/gortex-communities.mdc` |

## Architecture (constitution only)

```
src/game/       # Pure game logic — no Phaser game objects (see exceptions)
src/phaser/     # Scenes, UI, animations, asset preload
src/data/       # Typed defs (items, events, bosses, …)
public/assets/  # Art
```

**Logic/render split:** `src/game/` must not import Phaser scenes or sprites. Allowed Phaser imports in `src/game/`: `main.ts`, `config.ts`, `EventBus.ts` only.

**Orchestration:** Phaser scenes call **`gameFacade`**, not `*System.ts` directly. Gameplay animations go through **`enqueuePlayback`** / `PlaybackRunner` — scenes must not drive outcome animations themselves. State: `getRunState()` / `getRoundState()` / `getSceneState()` and matching `*Actions`.

**Equipment:** defs in `src/data/items.ts` (`effectType`, `effectParams`, `display`); handlers in `src/game/effects/` via `effectRegistry`. Scoring pipeline, store layout, scene flow, data modules — **`smart_context`** or **`search_symbols`** on the relevant symbol.

**Constants:** colors, fonts, sizing, gameplay defaults — **`Constants.ts` only** (`GAMEPLAY`: 8 rolled, 5 scored, 4 days, 4 rerolls by default).

## Key patterns

### TypeScript

- **No inline type imports** (`import('./x').Foo`). Use top-level `import type { Foo } from '...'`.

### Score animation

Logic pushes `ScoreAnimEvent[]` during scoring; `ScoreAnimation.ts` plays them back. No duplicated scoring in Phaser.

### New equipment effect

1. Def in `src/data/items.ts`
2. Handler in `src/game/effects/<category>/`, register with `effectRegistry`
3. Push `ctx.animEvents` for visuals
4. Tests in the correct existing file (see Testing)

### Save / auto-save

Logic: `SaveLoad.ts`, `AutoSave.ts`. IO: `phaser/AutoSaveManager.ts`, `phaser/SaveLoadIO.ts`.

**Pre-ship: no backwards compatibility.** The game has not shipped; old local saves are disposable. Do not preserve compatibility with renamed or removed ids.

**Renames are direct.** When an id changes (aura, tag, equipment, effect, etc.), update definitions and all references. Do **not** add `normalize*` / `migrate*` / alias-map helpers in save/load or resolve paths.

**`??` defaults are for new optional fields only** — not for translating old stored values to new names.

**One canonical id everywhere.** Do not keep a separate visual id (e.g. `arcane`) and game-data id (e.g. `icy`) unless the user explicitly asks for that split.

Default missing fields with `??` in deserialize paths. Do not bump `SAVE_VERSION` for field additions alone. Remove dead legacy code when you touch it.

## Phaser gotchas

### Container hit areas

Containers use a **center transform**. Hit rects must match how children are drawn:

| Pattern | Draw | Hit area |
|---------|------|----------|
| **Center-anchored** (preferred) | from `(-w/2, -h/2)` | `Rectangle(0, 0, w, h)` |
| **Top-left children** | from `(0, 0)` | `Rectangle(w/2, h/2, w, h)` |

Call `setSize(w, h)` before `setInteractive(...)`.

### Responsive run scenes

Canvas is `Scale.RESIZE` — use **`SceneLayout.ts`** / `createRunSceneShell()`, not raw `scene.scale.width`. Lay out inside `layout.contentX` … `contentBottom`. New layout numbers → `Constants.ts` `UI` block only.

### Scene lifecycle

- Clean up resize listeners in `shutdown`
- `EventBus.emit(Events.SCENE_READY, this)` at end of `create()`
- **Pass explicit data to `scene.start(key, data)`** — omitting the second arg reuses stale `init` data; use `{}` when empty

### Shop card clicks

Use `wireShopCardPointerUp` (requires pointerdown on the card) so scene transitions from `Button` (`pointerdown`) do not ghost-open cards on `pointerup`.

## Testing

- **bun:test**; helpers in `src/game/__tests__/testHelpers.ts`
- **Test game logic only** — not Phaser rendering
- Real modules, no mock scoring stack; failures = wrong handler or store not persisted

**Handler vs integration:** stateful equipment needs both — direct handler test + integration via `calculateTestScore`, `playScoredDayAndEnd`, or `game.startRound()` as appropriate.

**Player-faithful tests:** exercise the same store flags and actions the game uses (`player.advanceRound(true)`, `playScoredDayAndEnd`, lifecycle hooks like `processEquipmentOnSell`). Do **not** manually patch run/equipment state (`itemWithState`, `player.roundsSkipped = N`, `patchRun`) to simulate gameplay the player never triggers — that hides wiring bugs (e.g. Shortcut Trail reading `equip.state.roundsSkipped` while skips only increment run `roundsSkipped`). Use `itemWithState` / direct handler calls only for isolated handler math or edge cases that cannot be reached through normal play.

**Helpers:** `calculateTestScore`, `playScoredDayAndEnd` (use `avoidWin: true`, `endDay: { deferEquipmentDestructionAnimation: true }` when needed), `seedTestRoll`, `syncEquipmentInstances` / `pushEquipmentState`.

**Payout money:** use `computePayoutBreakdown` for `END_ROUND_MONEY` — not `processEndOfRound().moneyEarned` alone.

**Timed “rounds”** on items = **leg rounds** (mile → ford → boss), not travel days.

### Test file organization (CRITICAL)

By **effect category**, never `phaseN.test.ts`. Append to the matching file:

| File | Topic |
|------|-------|
| `items/xMult.test.ts` | xMult |
| `items/nonScoring.test.ts` | Lifecycle, shop, reroll, misc |
| `items/pipEffects.test.ts` | Per-pip |
| `items/statefulMult.test.ts` | Stateful additive mult |
| `items/handEffects.test.ts` | Hand-type mult |
| `items/conditionalEffects.test.ts` | Conditional mult |
| `items/parityEffects.test.ts` | Even/odd |
| `items/heldInHand.test.ts` | Held-in-hand |
| `items/copyEquipment.test.ts` | Copy equipment |
| `items/loadedDice.test.ts` | Loaded dice |
| `items/addMult.test.ts` | `ADD_MULT` |
| `items/legStart.test.ts` | Leg / round start |
| `items/stickerEffects.test.ts` | Stickers |
| `scoring.test.ts`, `bosses.test.ts`, `trailEvents.test.ts`, … | Core / meta |

**Every new item in `items.ts` needs tests** before the task is done (real effect path, not metadata-only).

## Design docs

[GAME_OVERVIEW.md](GAME_OVERVIEW.md) · [GAME_EQUIPMENT_OVERVIEW.md](GAME_EQUIPMENT_OVERVIEW.md) · [GAME_DICE_OVERVIEW.md](GAME_DICE_OVERVIEW.md) · [GAME_BOSS_OVERVIEW.md](GAME_BOSS_OVERVIEW.md) · [GAME_SUPPLY_CARD_OVERVIEW.md](GAME_SUPPLY_CARD_OVERVIEW.md) · [GAME_TRAIL_GUIDE_OVERVIEW.md](GAME_TRAIL_GUIDE_OVERVIEW.md) · [GAME_PERMITS_OVERVIEW.md](GAME_PERMITS_OVERVIEW.md) · [GAME_FRONTIER_ENCOUNTER_OVERVIEW.md](GAME_FRONTIER_ENCOUNTER_OVERVIEW.md) · [GAME_TAGS_OVERVIEW.md](GAME_TAGS_OVERVIEW.md) · [BUGS.md](BUGS.md)

Dice are **d12** in code (README may still say six-sided).

## Skills

`.agents/skills/`: `phaser`, `particles`, `sprites-and-images`, `v4-new-features`, `game-designer`, `game-ui-design`
