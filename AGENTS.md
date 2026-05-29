# Wagon Bones — AI Agent Instructions

use composer-2.5 for subagents, never use composer-2.5-fast for subagents

## Project Overview

Balatro-inspired dice roguelike set on the Oregon Trail. Roll **d12** dice (values 1–12), build hands, collect equipment, and travel **8 legs** with **3 rounds per leg** (mile marker → river ford → boss showdown). Built with **Phaser 4 + SolidJS + Vite + TypeScript** using **bun** as the package manager.

SolidJS (`App.tsx` → `PhaserGame.tsx`) is a thin host; almost all gameplay lives in Phaser scenes and `src/game/`.

## Quick Commands

| Task | Command |
|------|---------|
| Dev server | `bun run dev` (http://localhost:8080) |
| Build | `bun run build` |
| Typecheck | `bun run typecheck` |
| Tests | `bun test` |
| Single test | `bun test src/game/__tests__/items/myTest.test.ts` |
| Format | `bun run format` |
| Format check | `bun run format:check` |
| Tests + format | `bun run check` |
| CI locally | `bun run ci` |

**Never use `npm`, `npx`, or `yarn`.** Use `bun` / `bunx` exclusively.

### Before finishing work

Run these before marking a task done (in order):

1. **`bun run typecheck`** — `tsc --noEmit` on `src/` (strict; catches issues tests may miss)
2. **`bun run check`** — tests + format
3. **`bun run build`** — when you changed Phaser scenes, Vite config, or anything that affects the production bundle

Fix failures in code you touched. Do not introduce new TypeScript errors, test failures, or format violations. The repo may still have pre-existing `tsc` errors elsewhere; clear those when you edit the affected files.

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
| `store/runStore.ts` + `store/actions/*` | Run state (money, dice, equipment, consumables, trail modifiers, …) |
| `store/roundStore.ts` + `roundActions` | Round FSM: **SELECT → ROLL → SCORE → DAY_END** → **ROUND_END** |
| `facade/` | Blessed UI orchestration (`gameFacade.*`); Phaser scenes call facade instead of `*System.ts` |
| `playback/` | `PlaybackCommand` queue (`enqueuePlayback`, `takePlayback`) — logic → animation channel |
| `store/sceneStore.ts` | Shop, booster pack, trail event, payout, round-select slices |
| `DiceSystem.ts` | Dice creation, rolling, pouch/spent cycling, hand detection |
| `scoring/scoreHand.ts` | Per-hand score orchestration (`scoreHand` → held → additive/xMult in `roundActions`) |
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
| `store/economy.ts` + `economyActions` | Money tracking |
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

### TypeScript

- **No inline type imports.** Never use `import('./module').Type` or `import('../foo').Bar` in type positions — not on fields (`surveyorHand?: import('../types').HandType`), parameters, or return types. Add a top-level `import type { Foo } from './module'` (or a value import when the symbol is an enum) and reference `Foo` directly.

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

### State access

- **Run / round / scene** — `getRunState()`, `getRoundState()`, `getSceneState()` and `*Actions` in `src/game/store/`
- **Tests** — `resetTestRun()` / `resetAllGameStores()`; optional `testRunPlayer.ts` / `testGameState.ts` shims
- `EventBus` — host-only (`Events.SCENE_READY`); gameplay uses stores, facade, and `playbackQueue`

### UI integration (post-refactor)

- Phaser scenes call **`gameFacade`** for orchestration (`import { gameFacade } from '../game/facade'`).
- **Animations:** logic enqueues `PlaybackCommand` via `enqueuePlayback` / helpers in `src/game/store/playbackEnqueue.ts` (`enqueueHandUpgrades`, `enqueueConsumablePlayback`, …). `PlaybackRunner` in `src/phaser/playback/` drains the FIFO queue in order — **scenes must not call animation primitives directly for gameplay outcomes**.
- **Scene binding:** any scene that can enqueue playback (Game, Shop, BoosterPack, Payout, TrailEvent, RoundSelect) binds `bindScenePlaybackRunner()` (or `bindScenePlaybackRunner` helper) in `create()`.
- **Manual drains:** `day-end-destructions`, `score-events` (`round-end-held`), and scene-specific continuations use `playbackRunner.drainMatching(...)` after enqueueing — all drains serialize through one chain.
- **Consumables:** scenes using `ConsumableBar` route `UseConsumableResult` through `handleStandardConsumableResult` for dice-selection redirects only; hand upgrades and consumable bar animations enqueue via `enqueueConsumablePlayback`.
- **Round state:** reads via `selectHandDice`, `selectRolledDice`, etc.; writes via `roundActions`, `roundWrites`, or `gameFacade.round`.

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

**Active development — no legacy save support.** The game is not launched; do not add migration helpers, equipment-state inference, or other backward-compatibility shims when renaming or adding run fields. On load, default missing fields with `?? 0`, `?? []`, `?? null`, etc. in `deserializeRunState` (or the v3 `playerSaveToRunState` path only when that path still exists). Do not bump `SAVE_VERSION` for field additions alone. Remove dead legacy code when you touch it rather than extending it.

## Testing

- Framework: **bun:test** (Jest-compatible API)
- Helpers: `src/game/__tests__/testHelpers.ts` — `setupGame()`, `calculateTestScore()`, `playScoredDayAndEnd()`, `item()`, `die()`, …
- Setup: `src/game/__tests__/setup.ts` (suppresses `console.log`)
- **Test game logic only** — not Phaser rendering

Tests run against **real** game modules (`roundActions`, effect registry, stores). There is no parallel mock scoring stack. Failures usually mean either the handler is wrong or **store wiring** did not persist mutations.

### Two layers: handler vs integration

| Layer | When to use | Example | Catches |
|-------|-------------|---------|---------|
| **Handler (unit)** | Rule logic on an in-memory `EquipmentInstance[]` | `processEndOfRound([inst])`, `processEquipmentOnHandPlayed([inst], hand)` | Effect math, branches |
| **Store (integration)** | Anything that must survive an action boundary | `playScoredDayAndEnd(game)` then read `player.equipment` / `getRunState()` | Missing `replaceEquipmentList`, wrong resolve path |

Use **both** for stateful equipment (`equip.state`, `sellValue`, `perishableRoundsLeft`):

1. One fast handler test for the rule.
2. One integration test through the real action that runs in gameplay.

### Integration helpers (`testHelpers.ts`)

| Helper | Flow | Use when |
|--------|------|----------|
| `calculateTestScore({ scoredDice, equipment })` | `startRound` → patch ROLL → `selectForScore` → `calculateScore` | Scoring pipeline; persists via `calculateScore` |
| `playScoredDayAndEnd(game, options?)` | roll → score → `endDay`; syncs `player` from store | Day/round-end lifecycle (`processEndOfRound`, `processEquipmentOnDayEnd`) |
| `seedTestRoll(dice)` | Patch round store to ROLL with fixed dice | Deterministic hands inside a started round |
| `syncEquipmentInstances(...inst)` | Copy store → instances tests still hold | After store actions when keeping local `item()` refs |
| `pushEquipmentState(...inst)` | Copy instances → store | Before store-driven actions when seeding custom `state` |

`playScoredDayAndEnd` options:

- `avoidWin: true` — high `targetMiles` so one hand does not end the leg.
- `endDay: { deferEquipmentDestructionAnimation: true }` — matches `GameScene` (`roundActions.endDay` production path).

### Lifecycle → action map (what to integration-test)

| Mutation timing | Production entry | Prefer integration test via |
|-----------------|------------------|-----------------------------|
| On score | `roundActions.calculateScore` | `calculateTestScore` or `game.calculateScore` + `player.syncFromStore()` |
| End of scored day | `roundActions.endDay` → `processEndOfRound` + `processEquipmentOnDayEnd` | `playScoredDayAndEnd` |
| Start of leg round | `roundActions.startRound` → `processEquipmentOnRoundStart` | `game.startRound()` (+ `roundActions.clearRound()` for a second round in tests) |
| Leg payout money | `computePayoutBreakdown` in `runProgression.ts` | `computePayoutBreakdown(getRunState(), …)` — **not** `processEndOfRound().moneyEarned` alone for `END_ROUND_MONEY` |

**Do not assume** `processEndOfRound().moneyEarned` is applied during `endDay`; payday-style money is summed again at payout. Handler tests on `moneyEarned` are still useful but must be paired with `computePayoutBreakdown` for payout items.

**Destruction-only** checks (e.g. Dynamite `destroyedIndices`) can stay on `processEndOfRound` direct calls; removal often persisted even when `state` did not (historical Fading Memory bug).

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

### New equipment (required)

**Every new equipment definition in `src/data/items.ts` must ship with tests** before the task is done. Do not merge item-only data without coverage.

| Requirement | Details |
|-------------|---------|
| **Minimum** | At least one test that exercises the item’s real effect path (not only `effectType` / `effectParams` metadata). |
| **Stateful items** | Handler test **and** integration through the production action (`calculateTestScore`, `playScoredDayAndEnd`, `processEquipmentOnRoundStart`, etc.) when state must persist in the run store. |
| **Timed “rounds”** | Items with `roundsRemaining` or “after each round” copy mean **leg rounds** (mile → ford → boss), not travel days. Use `processEndOfRound(..., { isLegRoundEnd: true })` in handler tests and `playScoredDayAndEnd` across multiple days for integration. `endDay` calls `processEndOfRound` every day but passes `isLegRoundEnd` only when the leg round actually ends. |
| **File choice** | Same category table as above — never a `phaseN.test.ts` or `newEquipment.test.ts` catch-all. |


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
