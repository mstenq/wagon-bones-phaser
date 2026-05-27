# Public API Spec — UI Layer Boundary

This document describes the **public surface** between **game logic** (`src/game/`) and **rendering / UI** (`src/phaser/`, Solid host in `src/PhaserGame.tsx`). Use it when swapping Phaser for another engine, or when building alternate UIs (web components, native shell, replay viewer, etc.).

**Principles (from `AGENTS.md`):**

- Game logic must not depend on Phaser scenes or sprites (exceptions: `main.ts`, `config.ts`, `EventBus.ts`).
- **Authoritative state** lives in Zustand stores; **mutations** go through `*Actions`; **derived read models** use selectors.
- Scoring and equipment rules run in `src/game/`; the UI plays back `ScoreAnimEvent[]` and other one-shot UI queues — it does not reimplement rules.

**Not in scope:** `src/data/*` (static definitions). Phaser imports data directly for catalogs and art keys; treat data as a separate, stable content API if you extract it.

---

## Table of contents

1. [Architecture](#architecture)
2. [Entry points](#entry-points)
3. [State stores](#state-stores)
4. [Actions](#actions)
5. [Selectors](#selectors)
6. [Facade](#facade)
7. [Instance resolution](#instance-resolution)
8. [EventBus](#eventbus)
9. [Playback queue](#playback-queue)
10. [Save and auto-save](#save-and-auto-save)
11. [Core types](#core-types)
12. [Gameplay systems](#gameplay-systems)
13. [Presentation and layout helpers](#presentation-and-layout-helpers)
14. [Preferences and meta](#preferences-and-meta)
15. [Phaser-local glue](#phaser-local-glue)
16. [Scene → API map](#scene--api-map)
17. [Migration notes](#migration-notes)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Solid host (src/PhaserGame.tsx, src/App.tsx)                   │
│    StartGame() ──► Phaser.Game                                  │
│    EventBus.on(SCENE_READY)                                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Rendering layer (src/phaser/)                                  │
│    Scenes, UI components, animations, SaveLoadIO, AutoSaveMgr   │
│    bindStore / bindGameObject (src/phaser/store/subscribe.ts)   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ imports only ↓
┌───────────────────────────▼─────────────────────────────────────┐
│  Game logic (src/game/) — NO Phaser (except bootstrap bridge)   │
│    facade/ — blessed UI orchestration (gameFacade)              │
│    playback/ — PlaybackCommand queue                            │
│    Stores + actions + selectors                                   │
│    Systems: Dice, Equipment, Consumables, Boss, Trail, Tags, …  │
└─────────────────────────────────────────────────────────────────┘
```

**Recommended integration pattern for a new UI:**

1. Subscribe to `runStore`, `roundStore`, `sceneStore` (or use selectors + `subscribeRunSelector`, etc.).
2. Call **`gameFacade`** for scene orchestration; lower-level `roundActions` / `runActions` / domain `*Actions` for headless tests.
3. Consume **`playbackQueue`** via `takePlayback` / a single playback runner — do not reimplement scoring animations inline.
4. Use `buildSaveSnapshot` / `applySaveSnapshot` for persistence; mirror `src/phaser/SaveLoadIO.ts` for scene routing after load.

**Import paths:**

- **Facade (primary UI entry):** `import { gameFacade } from '../game/facade'`
- **Store barrel:** `import { … } from '../game/store'` (re-exports `src/game/store/index.ts`, including `gameFacade`, `enqueuePlayback`, selectors)
- Deeper paths (`store/runStore`, `store/selectors/…`) remain public and are used throughout Phaser.

---

## Entry points

| Symbol                                             | Module                 | Purpose                                                                                                                          |
| -------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `default StartGame(parent: string)`                | `src/game/main.ts`     | Creates `Phaser.Game` from `gameConfig`. Used by `PhaserGame.tsx`.                                                               |
| `gameConfig`                                       | `src/game/config.ts`   | Phaser config (scene list, scale). **Not** imported by `src/phaser/`; only by `main.ts`. A non-Phaser UI replaces this entirely. |
| `gameFacade`                                       | `src/game/facade/`     | **Primary UI orchestration** — round, shop, pack, trail, meta, consumable, boss, dice, equipment                                 |
| `enqueuePlayback`, `takePlayback`, `clearPlayback` | `src/game/playback/`   | Playback command queue API                                                                                                       |
| `EventBus`, `Events`                               | `src/game/EventBus.ts` | Host-only `EventEmitter` (`SCENE_READY` only).                                                                                   |
| `initDevModeFromUrl`                               | `src/game/DevMode.ts`  | URL flag for dev tools (`src/index.tsx`).                                                                                        |

### Solid ↔ Phaser bridge

`PhaserGame.tsx`:

- Calls `StartGame('game-container')`.
- Listens for `Events.SCENE_READY` → updates ref with active `Phaser.Scene`.
- Destroys game on unmount.

A replacement host would still call `StartGame` **or** drop Phaser and drive scenes yourself while using the same store/action API.

---

## State stores

Three vanilla Zustand stores (`zustand/vanilla` + `subscribeWithSelector`). All expose `getState()`, `.subscribe(selector, listener)`, and snapshot reads via `get*State()`.

### Run store — `runStore`, `getRunState()`, `runActions`

**Module:** `src/game/store/runStore.ts`  
**Type:** `RunState` (`src/game/store/types.ts`)

Cross-scene run persistence: money, dice pool, equipment/consumable **stored** instances (by `defId`), leg/round progression, trail modifiers, tags, boss round state, UI effect queue.

| API                                   | Description                                       |
| ------------------------------------- | ------------------------------------------------- |
| `getRunState()`                       | Current snapshot                                  |
| `runStore`                            | Subscribe for HUD, bars, shop                     |
| `runActions.reset()`                  | New run (via `resetAllGameStores` from menus)     |
| `runActions.hydrate(state)`           | Load save into run slice                          |
| `runActions.patch(partial)`           | Partial update                                    |
| `runActions.setBalance(n)`            | Direct balance set                                |
| `runActions.enqueuePlayback(command)` | Queue one-shot playback command                   |
| `enqueuePlayback(command)`            | Same (module-level helper on `playback/queue.ts`) |
| `takePlayback(predicate)`             | Atomically remove matching commands               |
| `clearPlayback()`                     | Clear queue                                       |
| `subscribeRunState(listener)`         | Full-store subscription                           |
| `onRunStoreReset(listener)`           | Fires after reset/hydrate                         |

Representative `RunState` fields the UI reads often:

- Economy: `balance`, `interestCap`
- Dice: `dice`, `spentDiceIds`, `loadedDieTarget`, `loadedDieSyncLucky`
- Loadout: `equipment`, `consumables`, `maxEquipmentSlots`, `maxConsumableSlots`, `lastUsedConsumableId`
- Progression: `leg`, `round`, `handStats`, `professionId`, `difficulty`, `handSize`
- Permits / shop: `purchasedPermits`, `shopSlots`, `shopRerollCount`, `skipNextShop`
- Trail: `trailEventModifiers`, `trailRoundEffects`, `pendingTrailEventId`, `seenTrailEventIds`
- Tags: `pendingTags`, `storedAuraTags`, `roundSkipPreviewTags`, `skippedRoundTags`, …
- Boss: `bossRoundState`, `bossAssignmentIds`, `bossEffectDisabled`
- Victory: `endlessMode`, `storyVictoryPending`
- UI queue: `playbackQueue` (`PlaybackCommand[]`, not persisted in saves)

### Round store — `roundStore`, `getRoundState()`, `roundActions`

**Module:** `src/game/store/roundStore.ts`  
**Type:** `RoundRuntimeState | null` when no active round

Per-leg round FSM: phase, day, rerolls, miles total, die IDs + face values, selection sets, last score, sidebar overlay.

| API                             | Description                                |
| ------------------------------- | ------------------------------------------ |
| `getRoundState()`               | `null` if no round                         |
| `roundStore`                    | Subscribe (overlay revision, hint context) |
| `patchRoundStore(partial)`      | Low-level patch (prefer `roundActions`)    |
| `subscribeRoundState(listener)` | Full round subscription                    |

`RoundRuntimeState` highlights:

- `config`: `GameConfig` (`maxDays`, `maxRerolls`, `rollSize`, `scoreSize`, `targetMiles`)
- `phase`: `'SELECT' | 'ROLL' | 'SCORE' | 'DAY_END' | 'ROUND_END'`
- `day`, `rerollsRemaining`, `totalMiles` (`Decimal`)
- `dieValuesByDieId`, `selectedForRollIds`, `rolledDice`, `selectedForScoreIds`
- `currentHandType`, `handHistory`, `lastScoreResult`
- `sidebarOverlay` — ephemeral HUD during score anim (not in saves)

### Scene store — `sceneStore`, `getSceneState()`, `sceneActions`

**Module:** `src/game/store/sceneStore.ts`  
**Type:** `SceneRuntimeState`

Save-relevant **between-scene** buffers (shop stock, booster pack, trail event in progress, payout presentation, round-select previews).

| Field         | Type                            | Purpose                           |
| ------------- | ------------------------------- | --------------------------------- |
| `activeScene` | `ActiveSceneKey`                | `'none' \| 'Game' \| 'Shop' \| …` |
| `shop`        | `ShopSceneState \| null`        | Stock, packs, reroll count        |
| `boosterPack` | `BoosterPackSceneState \| null` | Pack contents, picks remaining    |
| `trailEvent`  | `TrailEventSceneState \| null`  | Event id, resolve/spyglass flags  |
| `payout`      | `PayoutSceneState \| null`      | Breakdown + presentation          |
| `roundSelect` | `RoundSelectSceneState \| null` | Skip-tag previews                 |

`sceneActions` lifecycle: `enterScene`, `enterShop` / `patchShop` / `markShopStockSold` / `clearShop`, booster/trail/payout/roundSelect analogs, `leaveScene`, `setActiveScene` (save sync).

### Reset

| Symbol                 | Module                       | Purpose                                                 |
| ---------------------- | ---------------------------- | ------------------------------------------------------- |
| `resetAllGameStores()` | `src/game/store/resetAll.ts` | Run + round + RNG reset (main menu, options, game over) |

---

## Actions

Import from `src/game/store` unless noted. **Prefer actions over raw `patch`** so equipment resolution, boss hooks, and lifecycle run correctly.

### Round FSM — `roundActions`

**Module:** `src/game/store/actions/roundActions.ts`

Primary gameplay API for the main game scene.

| Method                                       | Purpose                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `startRound(configOverride?)`                | New leg round: config from run + equipment/trail modifiers, round-start equipment hooks, boss init                                                                                                                       |
| `selectForRoll(diceIds)`                     | SELECT → ROLL                                                                                                                                                                                                            |
| `canUseReroll()`                             | Whether reroll is allowed                                                                                                                                                                                                |
| `reroll(diceIds)`                            | Reroll subset; equipment reroll hooks                                                                                                                                                                                    |
| `selectForScore(diceIds)`                    | Enter SCORE phase with selection                                                                                                                                                                                         |
| `validateScoreSelection(diceIds)`            | Boss/rules gate before score                                                                                                                                                                                             |
| `calculateScore(options?)`                   | Full score pipeline → `ScoreResult \| null`; updates stores, enqueues anim effects. Supports `{ deferConsumableGrants?: boolean }` so consumable grants can be applied by playback timing instead of immediate mutation. |
| `cancelScore()`                              | SCORE → ROLL                                                                                                                                                                                                             |
| `endDay(options?)`                           | End day or round; equipment day/round end; may set `deferEquipmentDestructionAnimation`                                                                                                                                  |
| `setSidebarOverlay(overlay \| null)`         | Transient sidebar during animations                                                                                                                                                                                      |
| `applyEndOfRoundDestructions(indices)`       | Apply pending destructions                                                                                                                                                                                               |
| `hydrate` / `patch` / `reset` / `clearRound` | Tests, save restore, teardown                                                                                                                                                                                            |
| `restoreRound(config, legacyState)`          | Legacy round blob → runtime                                                                                                                                                                                              |
| `seedConstructorRound`                       | Test/bootstrap without full round-start hooks                                                                                                                                                                            |

### Run mutations — other `*Actions`

| Export                      | Typical UI use                                                       |
| --------------------------- | -------------------------------------------------------------------- |
| `economyActions`            | Earn/spend money (`PayoutScene`, `GameScene`)                        |
| `diceActions`               | Add dice, loaded die target (`GameScene`, packs)                     |
| `equipmentActions`          | Reorder, sell, destroy (`EquipmentBar`, trail, fire destroy anim)    |
| `consumableActions`         | Reorder, sell, use, add (`ConsumableBar`, shop, packs)               |
| `setupActions`              | Profession + difficulty (`ProfessionSelect`, `DifficultySelect`)     |
| `bossActions`               | Boss assignment, permit reroll (`DifficultySelect`, `RoundSelect`)   |
| `progressionActions`        | Advance leg/round (`Payout`, `RoundSelect`)                          |
| `tagActions`                | Skip-round tags (`RoundSelect`)                                      |
| `shopActions`               | Shop reroll eligibility                                              |
| `shopBuyActions`            | Purchases (equipment, die, consumable, pack, permit)                 |
| `openShop`, `rerollShop`    | `src/game/store/actions/shopSceneActions.ts`                         |
| `enqueueConsumablePlayback` | `src/game/store/uiEffectHelpers.ts` — consumable anim + equip pop-in |

### Economy helper

| Symbol             | Module                      |
| ------------------ | --------------------------- |
| `canAfford(price)` | `src/game/store/economy.ts` |

---

## Selectors

**Barrel:** `src/game/store/selectors/index.ts`  
Also re-exported from `src/game/store/index.ts`.

Pure functions `(state?) => derived`. Pass explicit `RunState` in tests; default reads `getRunState()`.

### Run selectors — `runSelectors.ts`

| Selector                                                          | Use                       |
| ----------------------------------------------------------------- | ------------------------- |
| `selectProfession`                                                | Profession def            |
| `selectHandStats(state, handType)`                                | Hand level / miles / mult |
| `selectAvailableDice` / `selectSpentDice` / `selectAllDiceSpent`  | Pouch UI                  |
| `selectEffectiveDays` / `selectEffectiveRerolls`                  | Round config display      |
| `selectEquipmentSlotsFree` / `selectConsumableSlotsFree`          | Shop/pack gating          |
| `selectTargetMiles`                                               | Leg target                |
| `selectCurrentBoss` / `selectIsBossRound` / `selectBossForLeg`    | Boss UI                   |
| `selectJourneyComplete` / `selectStoryVictoryOffered`             | End screens               |
| `selectShopRerollCost` / `selectTrailGuidesFree`                  | Shop                      |
| `selectPendingTags` / tag skip preview helpers                    | Round select, tooltips    |
| `selectIsProfessionSpecialEquipment`                              | Item card styling         |
| `canAfford`, `hasBankNote`, `selectDebtLimit`, `selectMinBalance` | Economy UI                |

### UI selectors — `uiSelectors.ts`

Render-focused snapshots (often serialized to strings for cheap `subscribe` equality).

| Selector                                                       | Use                       |
| -------------------------------------------------------------- | ------------------------- |
| `selectRunSidebarModel`                                        | Sidebar miles/target/hand |
| `selectSidebarOverlayRevision`                                 | Bump on overlay change    |
| `selectRoundTotalMiles`                                        | `roundSelectors.ts`       |
| `selectEquipmentBarSnapshot` / `selectEquipmentBarSlotLabel`   | Equipment bar             |
| `selectConsumableBarSnapshot` / `selectConsumableBarSlotLabel` | Consumable bar            |
| `selectCanUseSecondHelpings`                                   | Consumable rules          |
| `selectTagStackModel`                                          | Tag stack                 |
| `selectDicePouchCounts`                                        | Pouch modal               |
| `selectEquipmentHintRoundContext`                              | Dynamic equipment hints   |
| `selectTrailDebuffLines`                                       | Trail debuff copy         |

### Scene selectors — `sceneSelectors.ts`

| Selector                        | Use                    |
| ------------------------------- | ---------------------- |
| `selectShopAffordabilityInputs` | Shop price coloring    |
| `selectShopStockRevision`       | Stock change detection |

### Subscription helpers

| Symbol                   | Purpose                         |
| ------------------------ | ------------------------------- |
| `subscribeRunSelector`   | Selector-based run subscription |
| `subscribeRoundSelector` | Round subscription              |
| `subscribeSceneSelector` | Scene subscription              |

Phaser often uses `bindStore(scene, runStore, selector, listener)` instead (`src/phaser/store/subscribe.ts`).

---

## Facade

**Module:** `src/game/facade/` (`gameFacade`, `gameRound`, `gameShop`, …)

Primary UI entry for Phaser scenes. Wraps store actions and systems so scenes do not import `*System.ts` directly for orchestration.

| Namespace                                      | Purpose                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `gameFacade.round`                             | Round FSM: `beginRoundSession`, roll/reroll/score, `endDay`, `submitScore`, round writes |
| `gameFacade.shop`                              | Shop open/buy/reroll                                                                     |
| `gameFacade.pack`                              | Booster pack open/use                                                                    |
| `gameFacade.trail`                             | Trail events, spyglass, choices                                                          |
| `gameFacade.meta`                              | Profession, difficulty, tags, payout progression                                         |
| `gameFacade.consumable`                        | Use consumables with playback                                                            |
| `gameFacade.boss`                              | Boss UI rules (locked dice, scoring disabled)                                            |
| `gameFacade.equipment`                         | Modifier destruction, leased checks                                                      |
| `gameFacade.dice` / `gameFacade.diceSelection` | Loaded die UI, dice selection flows                                                      |

**Round reads:** `selectHandDice`, `selectRolledDice`, `selectRoundConfig`, … from `store/selectors/roundSelectors.ts`.

**Round writes:** `roundActions`, `roundWrites` (`syncRolledDiceFromFaces`, `setHandDice`, …), or `gameFacade.round.*`.

**Session bootstrap:** `initRoundSession()` / `startRoundSession()` exported from `facade/round.ts` (also re-exported on store barrel).

---

## Instance resolution

**Module:** `src/game/store/resolve.ts`

Stored instances use `defId`; live `EquipmentInstance` / `ConsumableInstance` attach resolved defs from `ItemsSystem` / `ConsumablesSystem`.

| Symbol                            | Purpose                     |
| --------------------------------- | --------------------------- |
| `resolveEquipmentList()`          | Run equipment → instances   |
| `resolveConsumableList()`         | Run consumables → instances |
| `resolveLastUsedConsumableDef()`  | Last used card def          |
| `replaceEquipmentList(instances)` | Write back after mutations  |

Always call `replaceEquipmentList` after handlers that mutate equipment arrays in memory.

---

## EventBus

**Module:** `src/game/EventBus.ts`

Singleton Phaser `EventEmitter` for **host ↔ Phaser lifecycle only** (`SCENE_READY`). Gameplay state, animations, and cross-scene refresh use **stores**, **facade**, and **playbackQueue** — not EventBus.

### `Events` constants

| Constant      | Value         | Emitted from                     | Listeners        |
| ------------- | ------------- | -------------------------------- | ---------------- |
| `SCENE_READY` | `scene:ready` | Most scenes at end of `create()` | `PhaserGame.tsx` |

**Store-driven replacements (do not reintroduce EventBus for these):**

| Former event                 | Replacement                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `PERMITS_CHANGED`            | `runStore` + `selectPurchasedPermitsRevision` (`bindStore` on `RoundSelectScene`)    |
| `TAG_QUEUE_CHANGED`          | Shop stock from `sceneStore`; tags consumed in `generateNewShopState` / `rerollShop` |
| Lease / perished / defaulted | `modifier-feedback` playback command + inline floating text in `GameScene`           |

### Scene contract

Scenes should `EventBus.emit(Events.SCENE_READY, this)` at end of `create()` so the host can track the active scene.

---

## Playback queue

**Type:** `PlaybackCommand` on `RunState.playbackQueue` (`src/game/playback/types.ts`)

One-shot instructions from logic → rendering (not authoritative; cleared on save).

| `kind`                                          | Meaning                                          |
| ----------------------------------------------- | ------------------------------------------------ |
| `dice-added`                                    | New dice IDs to animate in                       |
| `equipment-destroyed`                           | Fire destroy anim (indices)                      |
| `round-start-destructions`                      | Batch destruction at round start                 |
| `round-start-equipment-created`                 | Count of new equipment                           |
| `equipment-created` / `equipment-created-count` | Shop/pack pop-in                                 |
| `consumable-playback`                           | `ConsumableAnimEvent[]` playback                 |
| `score`                                         | Full `ScoreResult` for score phase               |
| `score-events`                                  | Held-in-hand `ScoreAnimEvent[]` after main score |
| `modifier-feedback`                             | Lease/perished/defaulted floating text           |
| `tag-earned`                                    | Tag id                                           |

**Production:** `enqueuePlayback`, `runActions.enqueuePlayback`, scoring/consumable helpers in logic.  
**Consumption:** `takePlayback` in `src/phaser/playback/PlaybackRunner.ts` (single runner per scene that needs animations).

---

## Save and auto-save

### Snapshot API — `src/game/SaveLoad.ts`

| Symbol                                                                                            | Purpose                                                      |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `buildSaveSnapshot(options?)`                                                                     | Serialize run + round + scene slices                         |
| `applySaveSnapshot(snapshot)`                                                                     | Restore stores; returns `{ scene: ActiveScene }` for routing |
| `validateSaveSnapshot(data)`                                                                      | Parse/validate unknown JSON                                  |
| `assertSaveIntegrity(snapshot)`                                                                   | Dev integrity check                                          |
| `getSaveFilename(snapshot)`                                                                       | Download name                                                |
| `serializeEquipmentInstance` / `deserializeEquipmentInstance`                                     | Shop preview persistence                                     |
| `serializePackItem` / `deserializePackItem`                                                       | Booster pack cards                                           |
| `shopSceneStateToSaveData` / `boosterPackSceneStateToSaveData` / `trailEventSceneStateToSaveData` | Scene slice converters                                       |

**Types:** `GameSaveSnapshot`, `PlayerSaveData`, `ActiveScene`, `ShopSaveData`, `BoosterPackSaveData`, `TrailEventSaveData`, …

`SAVE_VERSION` — bump when snapshot shape changes.

### Auto-save — `src/game/AutoSave.ts`

| Symbol                              | Purpose                      |
| ----------------------------------- | ---------------------------- |
| `writeAutoSaveToStorage(snapshot)`  | `localStorage` write         |
| `readAutoSaveFromStorage()`         | Read current slot            |
| `readPreviousAutoSaveFromStorage()` | Previous slot (debug export) |
| `clearAutoSaveStorage()`            | Clear                        |

**Key:** `GAMEPLAY.AUTOSAVE_STORAGE_KEY` in `Constants.ts`.

### Phaser I/O wrappers (reference implementation)

| Module                          | Role                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `src/phaser/SaveLoadIO.ts`      | File pickers, `applySaveSnapshot`, scene `start()` routing |
| `src/phaser/AutoSaveManager.ts` | Interval flush, boot restore in `Preloader`                |

A new UI should reimplement these thin wrappers, not duplicate snapshot logic.

---

## Core types

**Module:** `src/game/types.ts` (also re-exported from store barrel: `Die`, `HandType`, `ScoreResult`, `HandResult`)

| Type                                                      | UI use                                          |
| --------------------------------------------------------- | ----------------------------------------------- |
| `Die`                                                     | Dice rendering, selection                       |
| `HandType`, `HandStats`, `HandResult`                     | Hand display, upgrades                          |
| `ScoreResult`                                             | Score panel; includes `animEvents`, `mutations` |
| `ScoreAnimEvent`, `ScoreAnimTarget`, `ScoreAnimPopupType` | Score animation playback                        |
| `HandUpgradeInfo`                                         | Hand level-up animation                         |
| `PhaseState`                                              | FSM phase                                       |
| `GameConfig`                                              | Round limits                                    |
| `RoundState`                                              | Legacy round adapter                            |
| `DifficultyLevel`, `DifficultyDef`, `BossDef`             | Menus, sidebars                                 |
| `TrailTagInstance`, `TrailTagDef`, `TagCategory`          | Tags                                            |
| `EquipmentModifier`                                       | Modifier badges                                 |
| `Decimal`, `DecimalSource`                                | `src/game/decimal.ts` — large scores            |

**Scoring mutations:** `applyScoringMutations`, `createEmptyScoringMutations` from `src/game/effects/applyMutations.ts` — applied from round/facade scoring flow. When `calculateScore({ deferConsumableGrants: true })` is used (production `GameScene` path), consumable grants are deferred and then committed by score playback handlers at reveal-time.

---

## Gameplay systems

Direct imports from Phaser are **public** for UI orchestration (shop generation, consumable use, boss display rules). Logic-heavy; call from UI only when the store action does not already wrap the flow.

### Dice

| Module                   | Key exports                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `DiceSystem.ts`          | `createDie`, `detectBestHand`                                                                               |
| `DiceSelectionSystem.ts` | `DiceSelectionConfig`, `drawDiceForSelection`, `applyDiceSelectionEffect`, `shouldUpdateDisplayedDiceValue` |

### Equipment and items

| Module                        | Key exports                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ItemsSystem.ts`              | `EquipmentDef`, `EquipmentInstance`, `generateShopStock`, `getEquipmentListPrice`, `getAllEquipment`, aura/cursed/leased helpers                                 |
| `EquipmentModifiers.ts`       | `getEquipmentPurchasePrice`, `rollShopEquipmentPreview`, `applyEquipmentModifierDestructions`, `processEquipmentModifiersEndOfRound`, `acquireEquipmentInstance` |
| `EquipmentModifierDisplay.ts` | `getModifierTooltipLines`                                                                                                                                        |
| `EquipmentEffects.ts`         | `processEquipmentOnShopEnd`, pack hooks, `processGoldHeldAtRoundEnd`, `processBlueMoonHeldAtRoundEnd`, hand-played hooks (usually via `roundActions`)            |
| `equipmentUtils.ts`           | `getLoadedDiceMultiplier`                                                                                                                                        |

### Consumables

| Module                 | Key exports                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConsumablesSystem.ts` | `ConsumableDef`, `ConsumableInstance`, `executeConsumableEffect`, `getConsumableTexturePrefix`, `getConsumableDefById`, `ConsumableAnimEvent`, `grantGhostMedicine`, … |

### Boss, trail, tags, packs, permits

| Module                 | Key exports                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `BossEffectsSystem.ts` | `isDiceScoringDisabledByBoss`, `isDiceLockedByBoss`, `revealLandSlideHints`, equipment display order      |
| `TrailEventsSystem.ts` | `selectTrailEvent`, `resolveChoice`, `hasActiveTrailRoundEffects`, spyglass helpers, `markTrailEventSeen` |
| `trailEventAssets.ts`  | Image keys/paths, `computeCoverCrop`                                                                      |
| `TagSystem.ts`         | `grantTag`, `consumeNextRoundTags`, `processBossPayoutTags`, skip preview helpers                         |
| `BoosterPackSystem.ts` | `PackDefinition`, `PackItem`, `generatePackContents`, `getPackDefById`                                    |
| `PermitsSystem.ts`     | `getPermitById`, discount helpers                                                                         |

### Progression and RNG

| Module              | Key exports                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `runProgression.ts` | `computePayoutBreakdown`, `computeRoundReward`, `computeTargetMiles`    |
| `RunRng.ts`         | `generateRunSeed`, `initRunRng`, `rngShuffle`, `rngFloat`, `getRunSeed` |

### Display context (dynamic tooltips)

| Module              | Key exports                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `displayContext.ts` | `getItemDisplayContext`, `getRoundHintContext`, `ItemDisplayContext`, `RoundHintContext` |

Item defs in `src/data/items.ts` expose `display(game, player)` — UI passes context from `getItemDisplayContext`.

---

## Presentation and layout helpers

| Module                | Key exports                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `Constants.ts`        | `COLORS`, `TEXT_COLORS`, `FONTS`, `UI`, `GAMEPLAY`, `ANIM`, `DICE`, `DIFFICULTIES`, layout constants |
| `formatScore.ts`      | `formatScore`, `formatMult`, `formatScoreComponent`                                                  |
| `scoreMath.ts`        | `D`, `addScore`, `multiplyScore`, `milesToSave`, `milesFromSave`                                     |
| `roundBackgrounds.ts` | `gameRoundBackgroundPath`, `gameRoundBackgroundTextureKey`, `getRunRoundBackgroundIndex`             |

These are safe to re-map to your design tokens in a new UI.

---

## Preferences and meta

| Module                   | Key exports                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `AudioPreferences.ts`    | `initAudioPreferences`, `getAudioPreferences`, `setAudioPreferences`                      |
| `GameplayPreferences.ts` | `initGameplayPreferences`, `getGameplayPreferences`, setters (e.g. dice animation)        |
| `UserStats.ts`           | `getHighestUnlockedDifficulty`, `isDifficultyUnlocked`, `recordStoryVictory`, beat colors |
| `DevMode.ts`             | `isDevMode`, shop/boss/permit cheats — dev UI only                                        |

---

## Phaser-local glue

Not part of `src/game/` but part of the **current** UI integration pattern:

| Module                                  | Purpose                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `src/phaser/store/subscribe.ts`         | `bindStore`, `bindGameObject` — Zustand → scene lifecycle |
| `src/phaser/playback/PlaybackRunner.ts` | Subscribes to `playbackQueue`, plays all command kinds    |
| `src/phaser/playback/handlers.ts`       | Per-command Phaser animation handlers                     |
| `src/phaser/SaveLoadIO.ts`              | Save/load + scene routing                                 |
| `src/phaser/AutoSaveManager.ts`         | Timed autosave                                            |

Replicate lifecycle binding (subscribe on mount, unsubscribe on destroy) in any replacement framework.

---

## Scene → API map

Quick reference for which APIs each scene touches most.

| Scene                   | Primary APIs                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `GameScene`             | `gameFacade`, round selectors, `PlaybackRunner`, `sceneActions`, display context      |
| `ShopScene`             | `gameFacade.shop`, `gameFacade.consumable`, `sceneStore`, save serialize              |
| `BoosterPackScene`      | `gameFacade.pack`, `sceneStore`                                                       |
| `TrailEventScene`       | `gameFacade.trail`, `sceneStore`                                                      |
| `RoundSelectScene`      | `gameFacade.meta`, selectors, `SCENE_READY`                                           |
| `PayoutScene`           | `progressionActions`, `economyActions`, `sceneStore.payout`, `computePayoutBreakdown` |
| `ProfessionSelectScene` | `setupActions`, `createDie`, `UserStats`                                              |
| `DifficultySelectScene` | `setupActions`, `bossActions`, `RunRng`, `UserStats`                                  |
| `Preloader`             | Prefs init, consumable texture prefix, `AutoSaveManager` boot                         |
| `MainMenu` / `GameOver` | `resetAllGameStores`, `EventBus`, light run reads                                     |
| `DiceSelectionScene`    | `DiceSelectionSystem`                                                                 |

**Phaser-only scenes (no `src/game/` imports):** `Boot.ts`, `ui/AuraFX.ts`.

---

## Migration notes

### Do

- Drive scene orchestration through **`gameFacade`**; use `roundActions` / domain `*Actions` in headless tests.
- Subscribe to stores or selectors; route animations through **`playbackQueue`** + one runner.
- Use `buildSaveSnapshot` / `applySaveSnapshot` for persistence.
- Play `ScoreResult.animEvents` via playback commands; do not recompute scores in the UI.
- Pass explicit `{}` or data to scene transitions if you keep a scene stack (Phaser quirk documented in `AGENTS.md`).
- Emit **`Events.SCENE_READY`** only for host ↔ Phaser lifecycle.

### Avoid

- Duplicating scoring, hand detection, or equipment rules in the UI layer.
- Mutating `RunState` / `RoundRuntimeState` without actions (except documented `patch` paths).
- Importing Phaser from new logic under `src/game/`.
- Importing `TagSystem` / `EquipmentEffects` / `ConsumablesSystem` from `src/phaser/scenes/` (use facade).
- Using `EventBus` for gameplay state (stores + facade + playback queue instead).

### Remaining technical debt

1. **`subscribeRunState` / `patchRoundStore`** — exported but Phaser prefers `bindStore` + selectors.
2. **`src/data/*`** — parallel public surface for defs, art keys, bosses, events; many phaser UI files import data directly.
3. **`runtimeToLegacyRoundState`** — v3 save migration and `testGameState.ts` only; production round state is ID-based.
4. **Inline type imports** — disallowed in `src/game/` per project rules; use top-level `import type`.

### Suggested contract tests when swapping UI

- `bun test src/game/__tests__/` — logic remains correct without Phaser.
- Integration: load snapshot → `applySaveSnapshot` → assert `getRunState()` + scene key.
- One full hand: `startRound` → roll → `calculateScore` → `endDay` via store actions in a headless test harness.

---

## Barrel export index

`src/game/store/index.ts` re-exports:

```
types, runStore, runActions, getRunState, subscribeRunState, createInitialRunState,
economyActions, diceActions, equipmentActions, consumableActions, tagActions,
permitActions, bossActions, setupActions, progressionActions, shopActions, shopBuyActions,
roundActions, serialization, resolve, economy, roundStore, getRoundState, subscribeRoundState,
createInitialRoundState, patchRoundStore, sceneStore, sceneActions, getSceneState,
subscribeSceneState, createInitialSceneState, selectors/*, roundWrites,
computeRoundReward, computeTargetMiles, computePayoutBreakdown,
gameFacade, initRoundSession, startRoundSession, enqueuePlayback, takePlayback, clearPlayback,
ProfessionDef, HandResult, ScoreResult, HandType, Die, resetAllGameStores
```

For a minimal new UI, start with: **`gameFacade` + stores + selectors + `playback` + `SaveLoad` + `types` + `Constants` + `formatScore`**.

---

_Generated for UI engine migration. When APIs change, update this file alongside `AGENTS.md`._
