# Step 6 - Move Scene-Specific State And UI Effects Into Stores

## Status: implemented (read before step 7)

**1403 tests pass**; **`bun run build`** succeeds. Scene save-relevant data is written to `sceneStore` during play; resize/restart re-hydrates from the store for Shop, BoosterPack, TrailEvent, and Payout. One-shot animations use `run.uiEffects` where wired below.

Step 7 should delete remaining facades, `getSaveContext()` stubs, legacy run animation fields on save payloads, and finish moving buy/sell paths into store actions.

---

## Objective

Make save-relevant scene state and one-shot animation requests store-owned. Phaser scenes should become render/input shells around store state.

## What was implemented

### Scene store (`sceneStore` + `sceneActions`)

All lifecycle methods live on **`sceneActions`** in `src/game/store/sceneStore.ts` (inlined to avoid `sceneStore` ↔ `sceneLifecycleActions` import cycles). `src/game/store/actions/sceneLifecycleActions.ts` re-exports `sceneActions` only.

| Slice | Authoritative fields | Write path |
| --- | --- | --- |
| `shop` | `stock`, `packs` (incl. `sold` / `opened`), `shopRerollCount` | `enterShop`, `patchShop`, `markShopStockSold`, `markShopPackOpened`, `clearShop` |
| `boosterPack` | `packDefId`, `returnScene`, `contents`, `picksRemaining`, `usedCardIndices` | `enterBoosterPack`, `patchBoosterPack`, `markBoosterCardUsed`, `clearBoosterPack` |
| `trailEvent` | `eventId`, `resolved`, `spyglassRevealed`, `selectedChoiceId?` | `enterTrailEvent`, `patchTrailEvent`, `clearTrailEvent` |
| `payout` | `breakdown` + `presentation` (miles, days/rerolls, leg/round, `investmentBonus`) | `enterPayout`, `clearPayout` |
| `roundSelect` | `roundSkipPreviewTags` (mirror of run for resize) | `syncRoundSelectFromRun`, `clearRoundSelect` |

### Shop generation (game layer)

| Module | Role |
| --- | --- |
| `src/game/store/shopStock.ts` | `generateShopStockRows`, tag inject/aura/free-shop, `generateNewShopState`, `generateRerolledShopStock` |
| `src/game/store/actions/shopSceneActions.ts` | `openShop()`, `rerollShop()`, `restoreShop()` — writes `sceneStore.shop`; **no** `EventBus` import (Phaser scenes emit `TAG_QUEUE_CHANGED`) |

`ShopScene` no longer owns `generateMixedStock` / `applyShopTagMods`; it hydrates `ShopItem[]` from the store via `hydrateShopFromState()` and syncs on buy/reroll/resize.

### UI effect queue (`run.uiEffects`)

| Kind | Enqueued from | Consumed by |
| --- | --- | --- |
| `round-start-destructions` | `roundActions.startRound` | `GameScene.consumeRoundStartUiEffects` |
| `round-start-equipment-created` | `roundActions.startRound` | same |
| `dice-added` | `roundActions.startRound` | `GameScene` (`takeDiceAddedUiEffects` + legacy save fallback) |
| `consumable-anim` | `enqueueConsumablePlayback()` after `executeConsumableEffect` | `bindConsumableUiEffects()` (Game, Shop, Booster consumable bar) |
| `equipment-created-count` | Booster pack `finishUseCard` | `bindConsumableUiEffects()` |

`runActions.takeUiEffects(predicate)` removes consumed effects so they do not replay on resize.

**Not persisted:** `uiEffects` stripped in `serializeRunState`; `sidebarOverlay` stripped in `serializeRoundState`.

### Scenes wired

| Scene | Store on enter | Resize / restart | Notes |
| --- | --- | --- | --- |
| **Shop** | `shopSceneActions.openShop` or restore from `sceneStore` | Re-hydrates stock/packs from `sceneStore.shop` | Subscribes `selectShopAffordabilityInputs` + `selectShopStockRevision` → `updateDisplays()` |
| **BoosterPack** | `enterBoosterPack` / restore | Re-hydrates contents/picks from store | Pack **card** picks still use inline `applyConsumableAnimEvents` (staged completion) |
| **TrailEvent** | `enterTrailEvent` / restore | `syncTrailToStore` + `scene.restart({})` | `pendingTrailEventId` on run for spyglass only; slice is save source |
| **Payout** | `enterPayout` from `GameScene` (boss tags applied before transition) | `scene.restart({})` reads store only | No `Payout` in `ActiveScene` save key list |
| **RoundSelect** | `syncRoundSelectFromRun` | `scene.restart()` | Skip offers remain on **run**; scene slice is preview mirror |
| **Game** | `enterScene('Game')` | Round overlay via store | See sidebar overlay below |
| **GameOver** | `enterScene('none')` | N/A | Story flags stay on run |

### Save / load

- **`SaveLoadIO.syncSceneStoreFromScene()`** — only sets `activeScene`; scenes are expected to have kept `sceneStore` current during play.
- **Removed:** `ShopScene.getSaveContext()` and shop backfill from Phaser getters on save.
- **Still present (step 7):** `BoosterPackScene.getSaveContext()`, `TrailEventScene.getSaveContext()` — thin readers of `sceneStore`; delete when grep is clean.

### Scoring sidebar (resize-safe)

- **`RoundRuntimeState.sidebarOverlay`** — transient title / hand / miles / mult (`milesBaseSave` / `multSave` as serialized decimals).
- **`roundActions.setSidebarOverlay()`** — merge or clear.
- **`Sidebar`** subscribes to `selectSidebarOverlayRevision` and applies overlay.
- **`GameScene`** / **`ScoreAnimation`** patch overlay instead of relying on `updateData()` for hand preview and post-score pill reset.

Imperative animation APIs remain (`setMultAnimated`, `setRoundScoreAnimated`, `shakeMultPill`) — those are tween drivers, not state ownership.

### Selectors

- `src/game/store/selectors/sceneSelectors.ts` — `selectShopAffordabilityInputs`, `selectShopStockRevision`, scene slice getters.
- `src/game/__tests__/store/sceneActions.test.ts`, `shopStock.test.ts`, `uiEffectHelpers.test.ts`

---

## Done criteria (checklist)

| Criterion | Status |
| --- | --- |
| Shop, booster pack, trail event, payout state in `sceneStore` | **Done** |
| Animation requests as `uiEffects` (where wired) | **Partial** — round-start + consumable bar + pack pop-in count; not all equipment lifecycle |
| Scenes do not use save getters as authoritative | **Partial** — Shop removed; Booster/Trail still expose `getSaveContext()` as store readers |
| Resize/restart uses store | **Done** for Shop, BoosterPack, TrailEvent, Payout |
| Save/load restores through stores | **Done** (v4 `scene` blob hydrated on load) |

---

## Follow-up and cleanup (step 7 and optional polish)

### Required in step 7

| Item | Location | Action |
| --- | --- | --- |
| Delete `PlayerState` / `GameState` facades | `PlayerState.ts`, `GameState.ts` | Grep-driven removal; tests use `runActions` / `roundActions` |
| Delete `getSaveContext()` | `BoosterPackScene`, `TrailEventScene` | Redundant with `getSceneState()` |
| Remove run save fields | `RunState.pendingNewDiceIds`, `pendingAnimatedDestructions`, `pendingJunkDealerCount` | Drop from v4 payload or bump v5; keep v3→v4 migration only |
| `facadeSync.ts` | `store/facadeSync.ts` | Resolve from `run.equipment` / `run.consumables` in selectors |
| `getItemDisplayPlayer()` | `displayContext.ts`, bars | `display(game, runContext)` from store |
| `equipment-changed` on **GameScene** | `GameScene.ts` | Boss dice rules → store action or `uiEffects` |
| `ConsumablesSystem` / `TrailEventsSystem` `PlayerState` params | many | `RunState` + actions |
| Merge `roundActions` into `actions/index.ts` | After facade gone | Fix import cycle permanently |
| Scene restore buffers | `pendingRestoreShop`, `pendingRestorePack`, `pendingRestoreTrail` | Init from `sceneStore` only; drop duplicate fields |
| `pendingTrailEvent` facade | `PlayerState` | Use `sceneStore.trailEvent` + `run.pendingTrailEventId` only if still needed |

### Shop (optional polish — can be step 7)

| Item | Notes |
| --- | --- |
| **Buy actions in store** | `buyEquipment`, `buyDie`, `buyConsumable`, `buyPack` still mutate in `ShopScene` then `syncShopToStore` / `markShopStockSold` |
| **`updateDisplays()`** | Still manual affordability; subscribed to run + scene revision — could become pure `selectShopCardModels` |
| **Free-shop pack costs** | Tag free-shop zeroes stock in `shopStock`; pack def costs on `PackInstance` may need mirror in store for display |

### Booster pack (optional polish)

| Item | Notes |
| --- | --- |
| Pack card `applyConsumableAnimEvents` | Intentional staged flow per brief; could enqueue `consumable-anim` + callback if unified |
| `finishUseCard` + `playEquipmentCreatedPopIn` | Pop-in uses `equipment-created-count` effect; equipment must exist in store before animation (subscription) |

### Animations (optional polish)

| Item | Notes |
| --- | --- |
| `ConsumableAnimPlayback.ts` | Still called directly from scenes/effects; could be the sole consumer of `consumable-anim` (already true for bar path) |
| Equipment destruction in consumable anim | Still mutates via `getPlayerState().equipment` inside playback — step 7: `equipmentActions` + store |
| `ScoreAnimation` | Still drives sidebar imperatively for tweens; overlay state is store-backed |

### Import-cycle rules (do not regress)

1. **Do not** spread `sceneLifecycleActions` into `sceneActions` at module top level if `sceneLifecycleActions` imports `sceneStore` — use inline methods on `sceneStore.ts` or `Object.assign` after init (current: inlined).
2. **Do not** import `EventBus` from `src/game/store/actions/*` — loads Phaser in tests.
3. **Do not** add `runActions` to `actions/index.ts` merged spreads until `PlayerState` is deleted (step 4 lesson).

---

## Original brief (reference)

### Carryover from step 5

Step 5 wired **shared** UI to the run/round stores. Step 6 did **not** re-add bar or sidebar money refresh calls.

- **Shared bars** — subscription-driven (step 5).
- **`Sidebar.updateData()`** — largely replaced by `sidebarOverlay` + subscriptions for scoring preview; `updateData` remains for imperative/tween paths.
- **`ShopScene.updateDisplays()`** — still updates stock/pack affordability; now **triggered by store subscriptions**, not equipment bar events.
- **`equipment-changed` / `consumable-used`** — consumable **execution** still on bar events; **animations** for consumable bar go through `uiEffects`. GameScene `equipment-changed` → boss dice (step 7).

### Carryover from step 4

- **`syncSceneStoreFromScene()`** — **done** (activeScene only).
- **Scene restore** — hydrate from `sceneStore` on enter; local `pendingRestore*` buffers can be removed in step 7.
- **UI effect queue** — **partial** (see table above).

---

## Verification (step 6)

```bash
bun test
bun run build
```

Manual smoke (high value):

- Enter shop → buy item / pack → save/load in Shop → resize window
- Open booster pack → use card → leave → save/load in BoosterPack
- Trail event (with and without spyglass) → resolve choice → save mid-scene → reload
- Win round → Payout → collect → TrailEvent
- Round select skip tag → resize
- New run: round-start destruction / junk dealer / mystery dice animations
- Use consumable from bar in Game and Shop (queued anim)

When removing `updateDisplays` or `getSaveContext`, re-test the exact mutation path.

---

## Scenes in scope (original)

- `src/phaser/scenes/ShopScene.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/scenes/TrailEventScene.ts`
- `src/phaser/scenes/RoundSelectScene.ts`
- `src/phaser/scenes/PayoutScene.ts`
- `src/phaser/scenes/GameOver.ts`
- `src/phaser/animations/`

## UI effect types (actual shapes)

Implemented kinds use `kind` (not `type`) and omit `source` until needed:

```ts
type UiEffect =
  | { kind: 'dice-added'; dieIds: string[] }
  | { kind: 'round-start-destructions'; entries: { sourceIdx: number; victimIdx: number }[] }
  | { kind: 'round-start-equipment-created'; count: number }
  | { kind: 'consumable-anim'; events: ConsumableAnimEvent[]; equipmentCreatedCount?: number }
  | { kind: 'equipment-created-count'; count: number }
  | { kind: 'equipment-destroyed'; sourceIdx: number; victimIdx: number }
  | { kind: 'equipment-created'; equipmentIndices: number[] }
  | { kind: 'consumable-used'; consumableId: string }
  | { kind: 'score-anim'; events: ScoreAnimEvent[] }
  | { kind: 'tag-earned'; tagId: string };
```

Add `source?: string` in step 7 only if needed for debugging duplicate consumption.
