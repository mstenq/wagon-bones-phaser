# Wagon Bones — AI Agent Instructions

## Project Overview

Balatro-inspired dice roguelike set on the Oregon Trail. Roll **d12** dice (values 1–12), build hands, collect equipment, and travel **8 legs** with **3 rounds per leg** (mile marker → river ford → boss showdown). Built with **Phaser 4 + SolidJS + Vite + TypeScript** using **bun** as the package manager.

SolidJS (`App.tsx` → `PhaserGame.tsx`) is a thin host; almost all gameplay lives in Phaser scenes and `src/game/`.

## Quick Commands

| Task | Command |
|------|---------|
| Dev server | `bun run dev` (http://localhost:8080) |
| Build | `bun run build` |
| Tests | `bun test` |
| Single test | `bun test src/game/__tests__/items/myTest.test.ts` |
| Format | `bun run format` |
| Format check | `bun run format:check` |

**Never use `npm`, `npx`, or `yarn`.** Use `bun` / `bunx` exclusively.

## Architecture

```
src/game/          # Pure game logic — no Phaser game objects (see exceptions below)
src/phaser/        # Rendering layer (scenes, UI, animations, asset preload)
src/data/          # Typed data modules + some JSON (items, events, bosses, etc.)
public/assets/     # PNG art (items, trail events, bosses, backgrounds, …)
```

### Key Separation Rule

**Game logic in `src/game/` must not depend on Phaser scenes, sprites, or rendering.** Handlers and systems stay testable in isolation.

**Allowed Phaser imports (bootstrap / bridge only):**

| File | Why |
|------|-----|
| `src/game/main.ts` | Creates the Phaser `Game` instance |
| `src/game/config.ts` | Phaser game config (`Scale`, etc.) |
| `src/game/EventBus.ts` | Uses `Phaser.Events.EventEmitter` for scene ↔ logic events |

Everything else under `src/game/` should remain Phaser-free.

### Core Systems (`src/game/`)

| File / area | Purpose |
|-------------|---------|
| `GameState.ts` | Round state machine: **SELECT → ROLL → SCORE → DAY_END** (repeat) → **ROUND_END** |
| `PlayerState.ts` | Persistent cross-scene singleton (money, dice pouch, equipment, permits, tags, trail modifiers) |
| `DiceSystem.ts` | Dice creation, rolling, pouch/spent cycling, hand detection, per-die scoring |
| `EquipmentEffects.ts` | Scoring pipeline + round/day lifecycle orchestration (some hooks still live here) |
| `effects/` | Effect registry — additive, xMult, perDie, heldDie, lifecycle handlers |
| `ItemsSystem.ts` | Equipment **instances**, shop stock, unlock checks, aura types (defs in `data/items.ts`) |
| `EquipmentModifiers.ts` | Cursed / perishable / leased / negative modifiers on equipment instances |
| `ConsumablesSystem.ts` | Supply cards, trail guides, frontier encounters |
| `BoosterPackSystem.ts` | Pack opening logic |
| `BossEffectsSystem.ts` | Boss round restrictions and modifiers |
| `TrailEventsSystem.ts` | Between-round narrative events, choices, modifier accumulation |
| `trailEventAssets.ts` | Asset key helpers for trail event / spyglass images (logic-side) |
| `TagSystem.ts` | Skip-round tag rewards |
| `PermitsSystem.ts` | Frontier permits (voucher-like shop upgrades) |
| `DiceSelectionSystem.ts` | Dice selection flows (enhancements, destruction, etc.) |
| `Economy.ts` | Money tracking |
| `SaveLoad.ts` | Serializable run snapshot types + apply/serialize |
| `AutoSave.ts` | Auto-save scheduling (interval from `Constants`) |
| `scoreMath.ts` / `formatScore.ts` | Scoring math and display formatting |
| `Constants.ts` | Magic numbers, colors, fonts, layout, gameplay defaults |
| `EventBus.ts` | Global `EventEmitter` + `Events` constants (`domain:action` naming) |
| `types.ts` | Core types (`Die`, `HandType`, `ScoreAnimEvent`, `PhaseState`, …) |
| `DevMode.ts` | Debug/cheat helpers for development |
| `config.ts` | Phaser game configuration |

Default gameplay sizing (see `GAMEPLAY` in `Constants.ts`): **8 dice rolled**, **5 scored**, **4 days**, **4 rerolls** per day (profession/permits/trail events modify these).

### Phaser Layer (`src/phaser/`)

| Directory | Purpose |
|-----------|---------|
| `scenes/` | `Boot` → `Preloader` → menu flow → run scenes (see below) |
| `ui/` | Reusable components (`DiceSprite`, `ItemCard`, `EquipmentBar`, `SpyglassTrailPreview`, …) |
| `animations/` | `ScoreAnimation`, `RollAnimation`, `HandUpgradeAnimation` |
| `AutoSaveManager.ts` | Boot-time restore + periodic save |
| `SaveLoadIO.ts` | `localStorage` persistence + scene routing on load |
| `GameAudio.ts` / `BackgroundMusic.ts` | SFX and music |

**Scene flow (typical run):** `MainMenu` → `ProfessionSelect` → `DifficultySelect` → `RoundSelect` → `Game` → `Payout` → (`TrailEvent` | `Shop` | `BoosterPack` | `DiceSelection`) → … → `GameOver`.

### Data Layer (`src/data/`)

| Module | Contents |
|--------|----------|
| `items.ts` | **Sole source** for equipment definitions (`effectType`, `effectParams`, `display`, optional `unlockCondition`) |
| `hands.ts` | Hand type definitions and detection order |
| `trail_events.ts` | Trail event definitions and effect types |
| `trail_guides.ts` / `.json` | Trail guide (planet) cards |
| `supply_cards.ts` / `.json` | Supply (tarot) cards |
| `frontier_encounters.ts` | Frontier (spectral) cards |
| `bosses.ts` | Boss definitions |
| `professions.ts` / `.json` | Professions + starting enhanced dice |
| `permits.ts` / `.json` | Permits |
| `packs.ts` / `.json` | Booster packs |
| `trail_tags.ts` | Tag definitions |
| `dice_enhancements.ts`, `pip_enhancements.ts`, `dice_auras.ts`, `item_auras.ts` | Enhancement/aura metadata |

Prefer typed `.ts` modules over raw JSON where the codebase has already migrated (`BUGS.md` tracks remaining JSON → TS work).

Equipment UI hints: items use `display(game, player)` on each def (returns `ItemDisplayResult` / hint segments). Only a couple of items still use a separate `hintDisplay` name — treat **`display` as the canonical hook** for dynamic tooltips.

## Key Patterns

### Score Animation (Event-Driven)

Game logic emits `ScoreAnimEvent[]` during scoring. The Phaser layer plays them back — **no logic duplication**.

To add animation for a new effect:

1. In game logic (`DiceSystem.ts`, effect handlers, or `EquipmentEffects.ts`), push to `animEvents[]` next to the scoring code
2. `ScoreAnimation.ts` plays back whatever events exist in the array

### Equipment Effects (Registry-Based)

Equipment is defined in `src/data/items.ts` with `effectType` + `effectParams`. Handlers register in `src/game/effects/` and dispatch through `effectRegistry`.

#### Effect Registry Architecture (`src/game/effects/`)

| File / Directory | Purpose |
|------------------|---------|
| `registry.ts` | `EffectRegistry` — register and dispatch by `effectType` / lifecycle phase |
| `types.ts` | `ScoringPipelineContext`, `ScoringMutations`, `LifecyclePhase`, handler interfaces |
| `helpers.ts` | Shared utilities (`forEachEquipmentResolved`, auras, copy targets, …) |
| `applyMutations.ts` | `createEmptyScoringMutations()`, `mergeMutations()`, post-score application |
| `index.ts` | Barrel export; imports handler modules to trigger registration |
| `additive/` | Additive mult/miles/money (independent equipment pass) |
| `xmult/` | xMult pass (`risky.ts`, `conditional.ts`, `stateful.ts`, …) |
| `perDie/` | Per scoring die (pips, parity, enhancements) |
| `heldDie/` | Held-in-hand die triggers |
| `lifecycle/` | `on-hand-played`, `on-pre-scoring`, `after-hand-scored`, shop/reroll/sell, … |

#### Handler Categories

- **Additive** — `effectRegistry.registerAdditive(effectType, handler)` — `ctx.bonusMult` / `ctx.bonusMiles`
- **XMult** — `effectRegistry.registerXMult(effectType, handler)` — multiplies `ctx.xMult`
- **PerDie** — `effectRegistry.registerPerDie(effectType, handler)` — once per scoring die per trigger
- **HeldDie** — `effectRegistry.registerHeldDie(effectType, handler)` — held dice
- **Lifecycle** — `effectRegistry.registerLifecycle(phase, handler)` — see `LifecyclePhase` in `effects/types.ts`

**Note:** Round/day lifecycle hooks live in `effects/lifecycle/onRoundStart.ts`, `onDayEnd.ts`, and `onRoundEnd.ts` (orchestrator + `registerLifecycle`). Add new round-start/day-end/end-round effect types there.

#### Scoring Pipeline (`EquipmentEffects.ts`)

`applyEquipmentEffects()` builds a `ScoringPipelineContext` and runs roughly:

1. **Additive pass** — `dispatchAdditive()` per equipment (left to right)
2. **Auras** — fire/icy from equipment slots
3. **XMult pass** — `dispatchXMult()`
4. **Final calculation** — `(baseMiles + totalValue + bonusMiles) * finalMult` (see `scoreMath.ts` for precision)

Per-die scoring and retriggers live in `DiceSystem.ts`. `processHeldInHand()` uses held-die handlers.

#### Adding a New Equipment Effect

1. Add definition to `src/data/items.ts`
2. Create or append to the appropriate handler file in `src/game/effects/<category>/`
3. `effectRegistry.register<Category>(effectType, handler)` — mutates `ctx` in place
4. Push to `ctx.animEvents` for visual feedback
5. Add test to the **correct existing test file** in `src/game/__tests__/items/` (see Testing — never create per-phase test files)

### Hint / Display System

Equipment cards show dynamic colored hints via `display(game, player)`. Segment styles include: `miles`, `mult`, `odds`, `inactive`, `condition`, `active`, `money`, `text`.

**Gap:** Static tooltips cannot see live run state. `BUGS.md` tracks making consumable/equipment tooltips state-aware (like `display`) for cards such as Second Helpings and Trade.

### Singletons

- `PlayerState` — `getPlayerState()`, `resetPlayerState()`
- `GameState` — one instance per round (not global)
- `EventBus` — global cross-layer events

### Scene Lifecycle

- Scenes clean up resize listeners in `shutdown`
- Emit `EventBus.emit(Events.SCENE_READY, this)` at end of `create()`
- Shared layout via `createLayout()` in `SceneLayout.ts`
- **CRITICAL:** Pass explicit data to `this.scene.start(key, data)` when re-entering a scene — Phaser reuses previous `init` data if the second argument is omitted. Prefer `{}` when no data is needed. Audit call sites when debugging stale scene state.

### Constants

Colors, fonts, sizing, gameplay values — **`Constants.ts` only**. Import from there; do not hardcode in logic or UI.

### Save / Auto-save

- Logic: `SaveLoad.ts`, `AutoSave.ts`
- IO + boot restore: `phaser/AutoSaveManager.ts`, `phaser/SaveLoadIO.ts`
- Key: `GAMEPLAY.AUTOSAVE_STORAGE_KEY` in `localStorage`

## Testing

- Framework: **bun:test** (Jest-compatible API)
- Helpers: `src/game/__tests__/testHelpers.ts` — `setupGame()`, `calculateTestScore()`, `item()`, `die()`, …
- Setup: `src/game/__tests__/setup.ts` (suppresses `console.log`)
- **Test game logic only** — not Phaser rendering

### Test File Organization (CRITICAL)

**Tests are organized by EFFECT CATEGORY, NOT by phase/release.** Never create `phase9.test.ts`-style files. Append to the matching file below.

| File | Effect categories / topic |
|------|---------------------------|
| `items/xMult.test.ts` | xMult effects |
| `items/nonScoring.test.ts` | Config modifiers, round/day end, reroll, shop, misc lifecycle |
| `items/pipEffects.test.ts` | Per-pip scoring |
| `items/statefulMult.test.ts` | Stateful additive mult |
| `items/handEffects.test.ts` | `HAND_MULT` and hand-type additive bonuses |
| `items/conditionalEffects.test.ts` | Conditional additive mult |
| `items/parityEffects.test.ts` | Even/odd parity |
| `items/heldInHand.test.ts` | Held-in-hand |
| `items/copyEquipment.test.ts` | Copy equipment (Mirror Lake, Echo Chamber, …) |
| `items/loadedDice.test.ts` | Loaded dice |
| `items/addMult.test.ts` | `ADD_MULT` |
| `items/legStart.test.ts` | Leg / round start |
| `items/stickerEffects.test.ts` | Dice stickers |
| `scoring.test.ts`, `bosses.test.ts`, `trailEvents.test.ts`, `trailEventAssets.test.ts` | Core scoring, bosses, trail events |
| `saveLoad.test.ts`, `autoSave.test.ts`, `permits.test.ts`, `tags.test.ts`, … | Meta-systems |

**When adding tests for a new item:** read `effectType` in `items.ts` → pick file from table → append `describe()` at **end** of file.

## Game Design Documentation

| Doc | Topic |
|-----|--------|
| [README.md](README.md) | Overview (note: still says “six-sided” in places — dice are **d12** in code) |
| [GAME_OVERVIEW.md](GAME_OVERVIEW.md) | Core loop, scoring order, professions |
| [GAME_EQUIPMENT_OVERVIEW.md](GAME_EQUIPMENT_OVERVIEW.md) | Equipment by phase |
| [GAME_DICE_OVERVIEW.md](GAME_DICE_OVERVIEW.md) | Enhancements, stickers, auras |
| [GAME_BOSS_OVERVIEW.md](GAME_BOSS_OVERVIEW.md) | Bosses |
| [GAME_SUPPLY_CARD_OVERVIEW.md](GAME_SUPPLY_CARD_OVERVIEW.md) | Supply cards |
| [GAME_TRAIL_GUIDE_OVERVIEW.md](GAME_TRAIL_GUIDE_OVERVIEW.md) | Trail guides |
| [GAME_PERMITS_OVERVIEW.md](GAME_PERMITS_OVERVIEW.md) | Permits |
| [GAME_FRONTIER_ENCOUNTER_OVERVIEW.md](GAME_FRONTIER_ENCOUNTER_OVERVIEW.md) | Frontier encounters |
| [GAME_TAGS_OVERVIEW.md](GAME_TAGS_OVERVIEW.md) | Skip-round tags |
| [BUGS.md](BUGS.md) | Known bugs, balance notes, tech debt |
| [SCOUTS_SPYGLASS_UPDATE.md](SCOUTS_SPYGLASS_UPDATE.md) | Spyglass trail preview design |

## Skills

Custom skills in `.agents/skills/`:

- `phaser` — Phaser patterns (project uses **v4**)
- `particles` — Particle effects
- `sprites-and-images` — Sprites and images
- `v4-new-features` — Phaser 4 filters, render nodes, etc.
- `game-designer` — Visual polish and game feel
- `game-ui-design` — HUD and UX
