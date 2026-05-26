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
6. [Round view adapter](#round-view-adapter)
7. [Instance resolution](#instance-resolution)
8. [EventBus](#eventbus)
9. [UI effects queue](#ui-effects-queue)
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
│    Stores + actions + selectors                                   │
│    Systems: Dice, Equipment, Consumables, Boss, Trail, Tags, …  │
└─────────────────────────────────────────────────────────────────┘
```

**Recommended integration pattern for a new UI:**

1. Subscribe to `runStore`, `roundStore`, `sceneStore` (or use selectors + `subscribeRunSelector`, etc.).
2. Call `roundActions` / `runActions` / domain `*Actions` for player input — do not mutate store state directly except via documented `patch` helpers.
3. Consume `uiEffects` via `runActions.takeUiEffects` for animations.
4. Use `buildSaveSnapshot` / `applySaveSnapshot` for persistence; mirror `src/phaser/SaveLoadIO.ts` for scene routing after load.

**Import path:** Prefer the barrel `import { … } from '../game/store'` (re-exports `src/game/store/index.ts`). Deeper paths (`store/runStore`, `store/selectors/…`) are also public and used throughout Phaser.

---

## Entry points

| Symbol | Module | Purpose |
|--------|--------|---------|
| `default StartGame(parent: string)` | `src/game/main.ts` | Creates `Phaser.Game` from `gameConfig`. Used by `PhaserGame.tsx`. |
| `gameConfig` | `src/game/config.ts` | Phaser config (scene list, scale). **Not** imported by `src/phaser/`; only by `main.ts`. A non-Phaser UI replaces this entirely. |
| `EventBus`, `Events` | `src/game/EventBus.ts` | Cross-layer `EventEmitter` (Phaser’s emitter type). |
| `initDevModeFromUrl` | `src/game/DevMode.ts` | URL flag for dev tools (`src/index.tsx`). |

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

| API | Description |
|-----|-------------|
| `getRunState()` | Current snapshot |
| `runStore` | Subscribe for HUD, bars, shop |
| `runActions.reset()` | New run (via `resetAllGameStores` from menus) |
| `runActions.hydrate(state)` | Load save into run slice |
| `runActions.patch(partial)` | Partial update |
| `runActions.setBalance(n)` | Direct balance set |
| `runActions.enqueueUiEffect(effect)` | Queue one-shot UI work |
| `runActions.takeUiEffects(predicate)` | Atomically remove matching effects (animations) |
| `runActions.clearUiEffects()` | Clear queue |
| `subscribeRunState(listener)` | Full-store subscription |
| `onRunStoreReset(listener)` | Fires after reset/hydrate |

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
- UI queue: `uiEffects`

### Round store — `roundStore`, `getRoundState()`, `roundActions`

**Module:** `src/game/store/roundStore.ts`  
**Type:** `RoundRuntimeState | null` when no active round

Per-leg round FSM: phase, day, rerolls, miles total, die IDs + face values, selection sets, last score, sidebar overlay.

| API | Description |
|-----|-------------|
| `getRoundState()` | `null` if no round |
| `roundStore` | Subscribe (overlay revision, hint context) |
| `patchRoundStore(partial)` | Low-level patch (prefer `roundActions`) |
| `subscribeRoundState(listener)` | Full round subscription |

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

| Field | Type | Purpose |
|-------|------|---------|
| `activeScene` | `ActiveSceneKey` | `'none' \| 'Game' \| 'Shop' \| …` |
| `shop` | `ShopSceneState \| null` | Stock, packs, reroll count |
| `boosterPack` | `BoosterPackSceneState \| null` | Pack contents, picks remaining |
| `trailEvent` | `TrailEventSceneState \| null` | Event id, resolve/spyglass flags |
| `payout` | `PayoutSceneState \| null` | Breakdown + presentation |
| `roundSelect` | `RoundSelectSceneState \| null` | Skip-tag previews |

`sceneActions` lifecycle: `enterScene`, `enterShop` / `patchShop` / `markShopStockSold` / `clearShop`, booster/trail/payout/roundSelect analogs, `leaveScene`, `setActiveScene` (save sync).

### Reset

| Symbol | Module | Purpose |
|--------|--------|---------|
| `resetAllGameStores()` | `src/game/store/resetAll.ts` | Run + round + RNG reset (main menu, options, game over) |

---

## Actions

Import from `src/game/store` unless noted. **Prefer actions over raw `patch`** so equipment resolution, boss hooks, and lifecycle run correctly.

### Round FSM — `roundActions`

**Module:** `src/game/store/actions/roundActions.ts`

Primary gameplay API for the main game scene.

| Method | Purpose |
|--------|---------|
| `startRound(configOverride?)` | New leg round: config from run + equipment/trail modifiers, round-start equipment hooks, boss init |
| `selectForRoll(diceIds)` | SELECT → ROLL |
| `canUseReroll()` | Whether reroll is allowed |
| `reroll(diceIds)` | Reroll subset; equipment reroll hooks |
| `selectForScore(diceIds)` | Enter SCORE phase with selection |
| `validateScoreSelection(diceIds)` | Boss/rules gate before score |
| `calculateScore()` | Full score pipeline → `ScoreResult \| null`; updates stores, enqueues anim effects |
| `cancelScore()` | SCORE → ROLL |
| `endDay(options?)` | End day or round; equipment day/round end; may set `deferEquipmentDestructionAnimation` |
| `setSidebarOverlay(overlay \| null)` | Transient sidebar during animations |
| `applyEndOfRoundDestructions(indices)` | Apply pending destructions |
| `hydrate` / `patch` / `reset` / `clearRound` | Tests, save restore, teardown |
| `restoreRound(config, legacyState)` | Legacy round blob → runtime |
| `seedConstructorRound` | Test/bootstrap without full round-start hooks |

### Run mutations — other `*Actions`

| Export | Typical UI use |
|--------|----------------|
| `economyActions` | Earn/spend money (`PayoutScene`, `GameScene`) |
| `diceActions` | Add dice, loaded die target (`GameScene`, packs) |
| `equipmentActions` | Reorder, sell, destroy (`EquipmentBar`, trail, fire destroy anim) |
| `consumableActions` | Reorder, sell, use, add (`ConsumableBar`, shop, packs) |
| `setupActions` | Profession + difficulty (`ProfessionSelect`, `DifficultySelect`) |
| `bossActions` | Boss assignment, permit reroll (`DifficultySelect`, `RoundSelect`) |
| `progressionActions` | Advance leg/round (`Payout`, `RoundSelect`) |
| `tagActions` | Skip-round tags (`RoundSelect`) |
| `shopActions` | Shop reroll eligibility |
| `shopBuyActions` | Purchases (equipment, die, consumable, pack, permit) |
| `openShop`, `rerollShop` | `src/game/store/actions/shopSceneActions.ts` |
| `enqueueConsumablePlayback` | `src/game/store/uiEffectHelpers.ts` — consumable anim + equip pop-in |

### Economy helper

| Symbol | Module |
|--------|--------|
| `canAfford(price)` | `src/game/store/economy.ts` |

---

## Selectors

**Barrel:** `src/game/store/selectors/index.ts`  
Also re-exported from `src/game/store/index.ts`.

Pure functions `(state?) => derived`. Pass explicit `RunState` in tests; default reads `getRunState()`.

### Run selectors — `runSelectors.ts`

| Selector | Use |
|----------|-----|
| `selectProfession` | Profession def |
| `selectHandStats(state, handType)` | Hand level / miles / mult |
| `selectAvailableDice` / `selectSpentDice` / `selectAllDiceSpent` | Pouch UI |
| `selectEffectiveDays` / `selectEffectiveRerolls` | Round config display |
| `selectEquipmentSlotsFree` / `selectConsumableSlotsFree` | Shop/pack gating |
| `selectTargetMiles` | Leg target |
| `selectCurrentBoss` / `selectIsBossRound` / `selectBossForLeg` | Boss UI |
| `selectJourneyComplete` / `selectStoryVictoryOffered` | End screens |
| `selectShopRerollCost` / `selectTrailGuidesFree` | Shop |
| `selectPendingTags` / tag skip preview helpers | Round select, tooltips |
| `selectIsProfessionSpecialEquipment` | Item card styling |
| `canAfford`, `hasBankNote`, `selectDebtLimit`, `selectMinBalance` | Economy UI |

### UI selectors — `uiSelectors.ts`

Render-focused snapshots (often serialized to strings for cheap `subscribe` equality).

| Selector | Use |
|----------|-----|
| `selectRunSidebarModel` | Sidebar miles/target/hand |
| `selectSidebarOverlayRevision` | Bump on overlay change |
| `selectRoundTotalMiles` | `roundSelectors.ts` |
| `selectEquipmentBarSnapshot` / `selectEquipmentBarSlotLabel` | Equipment bar |
| `selectConsumableBarSnapshot` / `selectConsumableBarSlotLabel` | Consumable bar |
| `selectCanUseSecondHelpings` | Consumable rules |
| `selectTagStackModel` | Tag stack |
| `selectDicePouchCounts` | Pouch modal |
| `selectEquipmentHintRoundContext` | Dynamic equipment hints |
| `selectTrailDebuffLines` | Trail debuff copy |

### Scene selectors — `sceneSelectors.ts`

| Selector | Use |
|----------|-----|
| `selectShopAffordabilityInputs` | Shop price coloring |
| `selectShopStockRevision` | Stock change detection |

### Subscription helpers

| Symbol | Purpose |
|--------|---------|
| `subscribeRunSelector` | Selector-based run subscription |
| `subscribeRoundSelector` | Round subscription |
| `subscribeSceneSelector` | Scene subscription |

Phaser often uses `bindStore(scene, runStore, selector, listener)` instead (`src/phaser/store/subscribe.ts`).

---

## Round view adapter

**Module:** `src/game/store/roundView.ts`

Transitional **die-object** API used heavily by `GameScene`: reads/writes `RoundState` (`Die[]` arrays) while storage remains ID-based in `RoundRuntimeState`.

| Symbol | Purpose |
|--------|---------|
| `readRoundState()` | Legacy `RoundState` snapshot (read-only intent; mutate via patch) |
| `patchLegacyRoundState(partial, config?)` | Apply legacy-shaped patch |
| `getActiveRoundConfig()` | Active `GameConfig` |
| `initRoundSession()` / `startRoundSession()` | Start round after load / new game |

**New UI recommendation:** Prefer `roundActions` + `getRoundState()` directly; use round view only if porting `GameScene` logic verbatim.

---

## Instance resolution

**Module:** `src/game/store/resolve.ts`

Stored instances use `defId`; live `EquipmentInstance` / `ConsumableInstance` attach resolved defs from `ItemsSystem` / `ConsumablesSystem`.

| Symbol | Purpose |
|--------|---------|
| `resolveEquipmentList()` | Run equipment → instances |
| `resolveConsumableList()` | Run consumables → instances |
| `resolveLastUsedConsumableDef()` | Last used card def |
| `replaceEquipmentList(instances)` | Write back after mutations |

Always call `replaceEquipmentList` after handlers that mutate equipment arrays in memory.

---

## EventBus

**Module:** `src/game/EventBus.ts`

Singleton `EventEmitter`. Naming: `domain:action`.

**Important:** Game logic **does not** emit on `EventBus` today. Phaser scenes (and Solid) emit; listeners are sparse.

### `Events` constants

| Constant | Value | Emitted from (examples) | Listeners |
|----------|-------|-------------------------|-----------|
| `SCENE_READY` | `scene:ready` | Most scenes `create()` | `PhaserGame.tsx` |
| `PERMITS_CHANGED` | `player:permits-changed` | `JourneyInfoModal` (dev) | `RoundSelectScene` |
| `TAG_EARNED` | `game:tag-earned` | `RoundSelectScene` | *(none in repo)* |
| `ROUND_SKIPPED` | `game:round-skipped` | `RoundSelectScene` | *(none)* |
| `TAG_QUEUE_CHANGED` | `game:tag-queue-changed` | `ShopScene` | *(none)* |
| `LEASE_PAID` | `equipment:lease_paid` | `GameScene` | *(none)* |
| `EQUIPMENT_PERISHED` | `equipment:perished` | `GameScene` | *(none)* |
| `LEASE_DEFAULTED` | `equipment:lease_defaulted` | `GameScene` | *(none)* |
| `PHASE_CHANGED` | `game:phase-changed` | — | *(unused)* |
| `HAND_UPDATED` | `game:hand-updated` | — | *(unused)* |
| `DICE_ROLLED` | `game:dice-rolled` | — | *(unused)* |
| `SCORE_CALCULATED` | `game:score-calculated` | — | *(unused)* |
| `DAY_ENDED` | `game:day-ended` | — | *(unused)* |
| `ROUND_WON` / `ROUND_LOST` | `game:round-*` | — | *(unused)* |
| `REROLL_UPDATED` | `game:reroll-updated` | — | *(unused)* |
| `SPENT_REFRESHED` | `game:spent-refreshed` | — | *(unused)* |
| `EQUIPMENT_DESTROYED` | `equipment:destroyed` | — | *(unused)* |

A new UI may subscribe to the unused constants for SFX/haptics, or replace EventBus with store-driven effects only.

### Scene contract

Scenes should `EventBus.emit(Events.SCENE_READY, this)` at end of `create()` so the host can track the active scene.

---

## UI effects queue

**Type:** `UiEffect` on `RunState.uiEffects` (`src/game/store/types.ts`)

One-shot instructions from logic → rendering (not authoritative).

| `kind` | Meaning |
|--------|---------|
| `dice-added` | New dice IDs to animate in |
| `equipment-destroyed` | Fire destroy anim (indices) |
| `round-start-destructions` | Batch destruction at round start |
| `round-start-equipment-created` | Count of new equipment |
| `equipment-created` / `equipment-created-count` | Shop/pack pop-in |
| `consumable-used` | Consumable id |
| `consumable-anim` | `ConsumableAnimEvent[]` playback |
| `score-anim` | `ScoreAnimEvent[]` playback |
| `tag-earned` | Tag id |

**Consumption:** `runActions.takeUiEffects(predicate)` in `GameScene` / `consumableUiEffects.ts`.  
**Production:** `runActions.enqueueUiEffect`, `enqueueConsumablePlayback`, scoring pipeline.

---

## Save and auto-save

### Snapshot API — `src/game/SaveLoad.ts`

| Symbol | Purpose |
|--------|---------|
| `buildSaveSnapshot(options?)` | Serialize run + round + scene slices |
| `applySaveSnapshot(snapshot)` | Restore stores; returns `{ scene: ActiveScene }` for routing |
| `validateSaveSnapshot(data)` | Parse/validate unknown JSON |
| `assertSaveIntegrity(snapshot)` | Dev integrity check |
| `getSaveFilename(snapshot)` | Download name |
| `serializeEquipmentInstance` / `deserializeEquipmentInstance` | Shop preview persistence |
| `serializePackItem` / `deserializePackItem` | Booster pack cards |
| `shopSceneStateToSaveData` / `boosterPackSceneStateToSaveData` / `trailEventSceneStateToSaveData` | Scene slice converters |

**Types:** `GameSaveSnapshot`, `PlayerSaveData`, `ActiveScene`, `ShopSaveData`, `BoosterPackSaveData`, `TrailEventSaveData`, …

`SAVE_VERSION` — bump when snapshot shape changes.

### Auto-save — `src/game/AutoSave.ts`

| Symbol | Purpose |
|--------|---------|
| `writeAutoSaveToStorage(snapshot)` | `localStorage` write |
| `readAutoSaveFromStorage()` | Read current slot |
| `readPreviousAutoSaveFromStorage()` | Previous slot (debug export) |
| `clearAutoSaveStorage()` | Clear |

**Key:** `GAMEPLAY.AUTOSAVE_STORAGE_KEY` in `Constants.ts`.

### Phaser I/O wrappers (reference implementation)

| Module | Role |
|--------|------|
| `src/phaser/SaveLoadIO.ts` | File pickers, `applySaveSnapshot`, scene `start()` routing |
| `src/phaser/AutoSaveManager.ts` | Interval flush, boot restore in `Preloader` |

A new UI should reimplement these thin wrappers, not duplicate snapshot logic.

---

## Core types

**Module:** `src/game/types.ts` (also re-exported from store barrel: `Die`, `HandType`, `ScoreResult`, `HandResult`)

| Type | UI use |
|------|--------|
| `Die` | Dice rendering, selection |
| `HandType`, `HandStats`, `HandResult` | Hand display, upgrades |
| `ScoreResult` | Score panel; includes `animEvents`, `mutations` |
| `ScoreAnimEvent`, `ScoreAnimTarget`, `ScoreAnimPopupType` | Score animation playback |
| `HandUpgradeInfo` | Hand level-up animation |
| `PhaseState` | FSM phase |
| `GameConfig` | Round limits |
| `RoundState` | Legacy round adapter |
| `DifficultyLevel`, `DifficultyDef`, `BossDef` | Menus, sidebars |
| `TrailTagInstance`, `TrailTagDef`, `TagCategory` | Tags |
| `EquipmentModifier` | Modifier badges |
| `Decimal`, `DecimalSource` | `src/game/decimal.ts` — large scores |

**Scoring mutations:** `applyScoringMutations`, `createEmptyScoringMutations` from `src/game/effects/applyMutations.ts` — applied in `GameScene` after anim, not in Phaser-free tests’ hot path only via `calculateScore`.

---

## Gameplay systems

Direct imports from Phaser are **public** for UI orchestration (shop generation, consumable use, boss display rules). Logic-heavy; call from UI only when the store action does not already wrap the flow.

### Dice

| Module | Key exports |
|--------|-------------|
| `DiceSystem.ts` | `createDie`, `detectBestHand` |
| `DiceSelectionSystem.ts` | `DiceSelectionConfig`, `drawDiceForSelection`, `applyDiceSelectionEffect`, `shouldUpdateDisplayedDiceValue` |

### Equipment and items

| Module | Key exports |
|--------|-------------|
| `ItemsSystem.ts` | `EquipmentDef`, `EquipmentInstance`, `generateShopStock`, `getEquipmentListPrice`, `getAllEquipment`, aura/cursed/leased helpers |
| `EquipmentModifiers.ts` | `getEquipmentPurchasePrice`, `rollShopEquipmentPreview`, `applyEquipmentModifierDestructions`, `processEquipmentModifiersEndOfRound`, `acquireEquipmentInstance` |
| `EquipmentModifierDisplay.ts` | `getModifierTooltipLines` |
| `EquipmentEffects.ts` | `processEquipmentOnShopEnd`, pack hooks, `processGoldHeldAtRoundEnd`, `processBlueMoonHeldAtRoundEnd`, hand-played hooks (usually via `roundActions`) |
| `equipmentUtils.ts` | `getLoadedDiceMultiplier` |

### Consumables

| Module | Key exports |
|--------|-------------|
| `ConsumablesSystem.ts` | `ConsumableDef`, `ConsumableInstance`, `executeConsumableEffect`, `getConsumableTexturePrefix`, `getConsumableDefById`, `ConsumableAnimEvent`, `grantGhostMedicine`, … |

### Boss, trail, tags, packs, permits

| Module | Key exports |
|--------|-------------|
| `BossEffectsSystem.ts` | `isDiceScoringDisabledByBoss`, `isDiceLockedByBoss`, `revealLandSlideHints`, equipment display order |
| `TrailEventsSystem.ts` | `selectTrailEvent`, `resolveChoice`, `hasActiveTrailRoundEffects`, spyglass helpers, `markTrailEventSeen` |
| `trailEventAssets.ts` | Image keys/paths, `computeCoverCrop` |
| `TagSystem.ts` | `grantTag`, `consumeNextRoundTags`, `processBossPayoutTags`, skip preview helpers |
| `BoosterPackSystem.ts` | `PackDefinition`, `PackItem`, `generatePackContents`, `getPackDefById` |
| `PermitsSystem.ts` | `getPermitById`, discount helpers |

### Progression and RNG

| Module | Key exports |
|--------|-------------|
| `runProgression.ts` | `computePayoutBreakdown`, `computeRoundReward`, `computeTargetMiles` |
| `RunRng.ts` | `generateRunSeed`, `initRunRng`, `rngShuffle`, `rngFloat`, `getRunSeed` |

### Display context (dynamic tooltips)

| Module | Key exports |
|--------|-------------|
| `displayContext.ts` | `getItemDisplayContext`, `getRoundHintContext`, `ItemDisplayContext`, `RoundHintContext` |

Item defs in `src/data/items.ts` expose `display(game, player)` — UI passes context from `getItemDisplayContext`.

---

## Presentation and layout helpers

| Module | Key exports |
|--------|-------------|
| `Constants.ts` | `COLORS`, `TEXT_COLORS`, `FONTS`, `UI`, `GAMEPLAY`, `ANIM`, `DICE`, `DIFFICULTIES`, layout constants |
| `formatScore.ts` | `formatScore`, `formatMult`, `formatScoreComponent` |
| `scoreMath.ts` | `D`, `addScore`, `multiplyScore`, `milesToSave`, `milesFromSave` |
| `roundBackgrounds.ts` | `gameRoundBackgroundPath`, `gameRoundBackgroundTextureKey`, `getRunRoundBackgroundIndex` |

These are safe to re-map to your design tokens in a new UI.

---

## Preferences and meta

| Module | Key exports |
|--------|-------------|
| `AudioPreferences.ts` | `initAudioPreferences`, `getAudioPreferences`, `setAudioPreferences` |
| `GameplayPreferences.ts` | `initGameplayPreferences`, `getGameplayPreferences`, setters (e.g. dice animation) |
| `UserStats.ts` | `getHighestUnlockedDifficulty`, `isDifficultyUnlocked`, `recordStoryVictory`, beat colors |
| `DevMode.ts` | `isDevMode`, shop/boss/permit cheats — dev UI only |

---

## Phaser-local glue

Not part of `src/game/` but part of the **current** UI integration pattern:

| Module | Purpose |
|--------|---------|
| `src/phaser/store/subscribe.ts` | `bindStore`, `bindGameObject` — Zustand → scene lifecycle |
| `src/phaser/store/consumableUiEffects.ts` | Wires consumable UI effects on `GameScene` |
| `src/phaser/SaveLoadIO.ts` | Save/load + scene routing |
| `src/phaser/AutoSaveManager.ts` | Timed autosave |

Replicate lifecycle binding (subscribe on mount, unsubscribe on destroy) in any replacement framework.

---

## Scene → API map

Quick reference for which APIs each scene touches most.

| Scene | Primary APIs |
|-------|----------------|
| `GameScene` | `roundActions`, `readRoundState` / `patchLegacyRoundState`, `runActions`, `sceneActions`, `DiceSystem`, `ConsumablesSystem`, `BossEffectsSystem`, `TagSystem`, selectors, `uiEffects` |
| `ShopScene` | `sceneStore`, `shopBuyActions`, `openShop`/`rerollShop`, `ItemsSystem`, `ConsumablesSystem`, save serialize |
| `BoosterPackScene` | `sceneStore`, `BoosterPackSystem`, `consumableActions`, `diceActions`, `EquipmentEffects` pack hooks |
| `TrailEventScene` | `TrailEventsSystem`, `sceneStore`, `equipmentActions` |
| `RoundSelectScene` | `tagActions`, `progressionActions`, `bossActions`, `TagSystem`, EventBus |
| `PayoutScene` | `progressionActions`, `economyActions`, `sceneStore.payout`, `computePayoutBreakdown` |
| `ProfessionSelectScene` | `setupActions`, `createDie`, `UserStats` |
| `DifficultySelectScene` | `setupActions`, `bossActions`, `RunRng`, `UserStats` |
| `Preloader` | Prefs init, consumable texture prefix, `AutoSaveManager` boot |
| `MainMenu` / `GameOver` | `resetAllGameStores`, `EventBus`, light run reads |
| `DiceSelectionScene` | `DiceSelectionSystem` |

**Phaser-only scenes (no `src/game/` imports):** `Boot.ts`, `ui/AuraFX.ts`.

---

## Migration notes

### Do

- Drive gameplay through `roundActions` and domain `*Actions`.
- Subscribe to stores or selectors; use `takeUiEffects` for animations.
- Use `buildSaveSnapshot` / `applySaveSnapshot` for persistence.
- Play `ScoreResult.animEvents` sequentially; do not recompute scores in the UI.
- Pass explicit `{}` or data to scene transitions if you keep a scene stack (Phaser quirk documented in `AGENTS.md`).

### Avoid

- Duplicating scoring, hand detection, or equipment rules in the UI layer.
- Mutating `RunState` / `RoundRuntimeState` without actions (except documented `patch` paths).
- Importing Phaser from new logic under `src/game/`.
- Assuming `EventBus` game events are wired — most are emit-only placeholders.

### Transitional / technical debt

1. **`readRoundState` / `patchLegacyRoundState`** — die-object adapter; long-term UI should use ID-based round state.
2. **`subscribeRunState` / `patchRoundStore`** — exported but Phaser prefers `bindStore` + selectors.
3. **`src/data/*`** — parallel public surface for defs, art keys, bosses, events; 50+ phaser files import data directly.
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
subscribeSceneState, createInitialSceneState, selectors/*, roundView, computeRoundReward,
computeTargetMiles, computePayoutBreakdown, ProfessionDef, HandResult, ScoreResult, HandType, Die,
resetAllGameStores
```

For a minimal new UI, start with: **stores + `roundActions` + selectors + `SaveLoad` + `types` + `Constants` + `formatScore`**.

---

*Generated for UI engine migration. When APIs change, update this file alongside `AGENTS.md`.*
