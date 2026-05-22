# Wagon Bones — AI Agent Instructions

## Project Overview

Balatro-inspired dice roguelike set on the Oregon Trail. Roll d12 dice, build hands, collect equipment, and travel 8 frontier legs. Built with **Phaser 4 + SolidJS + Vite + TypeScript** using **bun** as the package manager.

## Quick Commands

| Task | Command |
|------|---------|
| Dev server | `bun run dev` |
| Build | `bun run build` |
| Tests | `bun test` |
| Single test | `bun test src/game/__tests__/items/myTest.test.ts` |
| Format | `bun run format` |

**Never use `npm`, `npx`, or `yarn`.** Use `bun` / `bunx` exclusively.

## Architecture

```
src/game/          # Pure game logic (NO Phaser imports)
src/phaser/        # Rendering layer (scenes, UI, animations)
src/data/          # JSON data + items.ts definitions
```

### Key Separation Rule

**Game logic files (`src/game/`) must NEVER import from Phaser.** They are pure TypeScript. The Phaser layer subscribes to state changes and renders them.

### Core Systems (src/game/)

| File | Purpose |
|------|---------|
| `GameState.ts` | Round state machine: SELECT→ROLL→SCORE→DAY_END→ROUND_END |
| `PlayerState.ts` | Persistent cross-scene singleton (money, dice, equipment, progression) |
| `DiceSystem.ts` | Dice creation, rolling, hand detection, scoring |
| `EquipmentEffects.ts` | Scoring pipeline orchestrator — delegates to `src/game/effects/` registry |
| `ItemsSystem.ts` | Equipment definitions, shop stock generation, auras |
| `Economy.ts` | Money tracking |
| `Constants.ts` | ALL magic numbers, colors, fonts, layout values — change here, not in logic |
| `EventBus.ts` | Singleton EventEmitter with `Events` constants (`domain:action` naming) |
| `types.ts` | Core types (Die, HandType, ScoreResult, ScoreAnimEvent, etc.) |

### Phaser Layer (src/phaser/)

| Directory | Purpose |
|-----------|---------|
| `scenes/` | Game screens (GameScene, ShopScene, TrailEventScene, etc.) |
| `ui/` | Reusable components (DiceSprite, ItemCard, Button, Sidebar, etc.) |
| `animations/` | Score, roll, and hand upgrade animations |

### Data Layer (src/data/)

- `items.ts` — **Sole source** for equipment definitions (includes `hintDisplay` functions)
- Typed data modules (`professions.ts`, `trail_guides.ts`, etc.) and remaining JSON — hands, bosses, etc.
- `professions.ts` — profession modifiers and **starting enhanced dice** per profession (plus standard dice to `GAMEPLAY.STARTING_DICE`, default 25)

## Key Patterns

### Score Animation (Event-Driven)

Game logic emits `ScoreAnimEvent[]` during scoring. The Phaser layer plays them back — **no logic duplication**.

To add animation for a new effect:
1. In game logic (`DiceSystem.ts` or `EquipmentEffects.ts`), push to `animEvents[]` next to the scoring code
2. Done. `ScoreAnimation.ts` plays back whatever events exist in the array.

### Equipment Effects (Registry-Based)

Equipment is defined in `src/data/items.ts` with an `effectType` string and `effectParams` object. Effects are dispatched via a **central registry** in `src/game/effects/`. The old monolithic switch statement has been replaced by handler modules organized by category.

#### Effect Registry Architecture (`src/game/effects/`)

| File / Directory | Purpose |
|------------------|---------|
| `registry.ts` | `EffectRegistry` class — registers and dispatches handlers by effectType |
| `types.ts` | `ScoringPipelineContext`, `ScoringMutations`, handler type interfaces |
| `helpers.ts` | Shared utilities: `forEachEquipmentResolved`, `applyEquipmentAuras`, `applyHolyAuraXMult` |
| `applyMutations.ts` | `createEmptyScoringMutations()`, `mergeMutations()` — post-scoring side effects |
| `index.ts` | Barrel export + imports all handler modules to trigger registration |
| `additive/` | Additive mult/miles/money handlers (fired in Step 5 of scoring) |
| `xmult/` | xMult handlers (fired after additive pass) |
| `perDie/` | Per-scoring-die handlers (pip effects, parity, enhancements) |
| `heldDie/` | Held-in-hand die handlers |
| `lifecycle/` | Non-scoring lifecycle hooks (round start, day end, reroll, sell, etc.) |

#### Handler Categories

- **Additive** — `effectRegistry.registerAdditive(effectType, handler)` — adds to `ctx.bonusMult` / `ctx.bonusMiles`
- **XMult** — `effectRegistry.registerXMult(effectType, handler)` — multiplies `ctx.xMult`
- **PerDie** — `effectRegistry.registerPerDie(effectType, handler)` — fires once per scoring die per trigger
- **HeldDie** — `effectRegistry.registerHeldDie(effectType, handler)` — fires once per held die per trigger
- **Lifecycle** — `effectRegistry.registerLifecycle(phase, handler)` — hooks into game events (see `LifecyclePhase` type)

#### Scoring Pipeline (`EquipmentEffects.ts`)

`applyEquipmentEffects()` builds a `ScoringPipelineContext` and runs these passes in order:
1. **Additive pass** — dispatches each equipment's `effectType` via `effectRegistry.dispatchAdditive()`
2. **Auras** — applies fire/icy auras from equipment slots
3. **XMult pass** — dispatches via `effectRegistry.dispatchXMult()`
4. **Final calculation** — `(baseMiles + totalValue + bonusMiles) * finalMult`

`processHeldInHand()` handles held dice using `effectRegistry.getHeldDie()`.

#### Adding a New Equipment Effect

1. Add definition to `src/data/items.ts`
2. Create or append to the appropriate handler file in `src/game/effects/<category>/`
3. Call `effectRegistry.register<Category>(effectType, handler)` — the handler receives `(ctx, equip, index)` and mutates `ctx` in-place
4. Push to `ctx.animEvents` for visual feedback
5. Add test to the **correct existing test file** in `src/game/__tests__/items/` based on effect category (see Testing section below — never create per-phase test files)

### Hint Display System

Equipment cards show dynamic colored hints via `hintDisplay(game, player) => HintSegment[][]`. Styles: `miles` (blue), `mult` (red), `odds` (green), `inactive` (gray), `condition` (amber), `active` (green), `money` (gold), `text` (default).

### Singletons

- `PlayerState` — accessed via `getPlayerState()`, reset via `resetPlayerState()`
- `GameState` — instantiated per round, not global
- `EventBus` — global singleton for cross-system events

### Scene Lifecycle

- Scenes clean up resize listeners in `shutdown`
- Use `EventBus.emit(Events.SCENE_READY, this)` at end of `create()`
- Shared layout via `createLayout()` in `SceneLayout.ts`
- **CRITICAL: Always pass explicit `{}` as the second argument to `this.scene.start(key, {})`** — Phaser reuses the previous `init` data when no data argument is provided, causing stale state bugs across scene re-entries

### Constants

Colors, fonts, sizing, gameplay values — all in `Constants.ts`. Import from there, never hardcode.

## Testing

- Framework: **bun:test** (Jest-compatible API)
- Test helpers: `src/game/__tests__/testHelpers.ts` — provides `setupGame()`, `calculateTestScore()`, `item()`, `die()`, etc.
- Setup file: `src/game/__tests__/setup.ts` (suppresses console.log)
- Pattern: Test game logic only (pure functions), not Phaser rendering

### Test File Organization (CRITICAL)

**Tests are organized by EFFECT CATEGORY, NOT by phase/release.** Never create a new test file for a batch of items (e.g. `phase9.test.ts`). Always append new tests to the correct existing file based on the item's `effectType`.

| File | Effect Categories |
|------|-------------------|
| `xMult.test.ts` | xMult effects: `DICE_COUNT_XMULT`, `REROLL_COUNT_XMULT`, `HAND_LEVEL_XMULT`, `SPENT_DICE_XMULT`, `ENHANCED_DICE_XMULT`, `HAND_CONTAINS_XMULT`, `ENHANCED_DICE_COUNT_XMULT`, `GRAVEROBBER_XMULT`, etc. |
| `nonScoring.test.ts` | Config modifiers (`TRAIL_BACKPACK`, `EXPRESS_TRAIN`, `PACK_SADDLE`, `COFFEE`, `FLOUR_SACK`), end-of-round money (`TRAIL_ALMANAC_MONEY`, `BANK_ACCOUNT`), round-start effects (`PHANTOM_WAGON`, `ROUND_START_SUPPLY`), day-end effects, reroll effects, misc non-scoring mechanics |
| `pipEffects.test.ts` | Per-pip scoring effects: `PIP_BONUS_MILES`, `PIP_SCORED_MILES_GAIN`, etc. |
| `statefulMult.test.ts` | Stateful additive mult accumulators |
| `handEffects.test.ts` | `HAND_MULT` (additive hand-type bonuses) |
| `conditionalEffects.test.ts` | Conditional additive mult |
| `parityEffects.test.ts` | Even/odd parity effects |
| `heldInHand.test.ts` | Held-in-hand dice effects |
| `copyEquipment.test.ts` | Mirror Lake / Echo Chamber copy tests |
| `loadedDice.test.ts` | Loaded Dice interaction tests |
| `addMult.test.ts` | Simple `ADD_MULT` tests |
| `legStart.test.ts` | Leg start effects |
| `stickerEffects.test.ts` | Dice sticker effects |

**When adding tests for a new item:**
1. Identify the item's `effectType` from its definition in `src/data/items.ts`
2. Find the matching test file from the table above
3. Append the new `describe()` block at the END of that file
4. **NEVER create a new test file** unless adding a genuinely new effect category

## Game Design Documentation

See these files for game mechanics and planned features:
- [README.md](README.md) — Overview and hand types
- [GAME_OVERVIEW.md](GAME_OVERVIEW.md) — Core mechanics
- [GAME_EQUIPMENT_OVERVIEW.md](GAME_EQUIPMENT_OVERVIEW.md) — All equipment items by phase
- [GAME_DICE_OVERVIEW.md](GAME_DICE_OVERVIEW.md) — Dice enhancements and auras
- [GAME_BOSS_OVERVIEW.md](GAME_BOSS_OVERVIEW.md) — Boss encounters
- [GAME_SUPPLY_CARD_OVERVIEW.md](GAME_SUPPLY_CARD_OVERVIEW.md) — Supply cards
- [GAME_TRAIL_GUIDE_OVERVIEW.md](GAME_TRAIL_GUIDE_OVERVIEW.md) — Trail guides
- [GAME_PERMITS_OVERVIEW.md](GAME_PERMITS_OVERVIEW.md) — Permits system
- [GAME_FRONTIER_ENCOUNTER_OVERVIEW.md](GAME_FRONTIER_ENCOUNTER_OVERVIEW.md) — Frontier encounters

## Skills

This project has custom skills in `.agents/skills/`:
- `phaser` — Phaser 4 game development patterns and conventions
- `particles` — Phaser 4 particle effects
- `sprites-and-images` — Sprite/Image game objects
- `v4-new-features` — Phaser 4 new features (Filters, RenderNodes, etc.)
- `game-designer` — Visual polish and game feel improvements
- `game-ui-design` — Game UI/UX design expertise
