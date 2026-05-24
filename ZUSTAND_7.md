# Step 7 - Delete Legacy State Ownership And Refresh Glue

> **Status:** In progress (May 2026). Completed items and remaining work are tracked in **`ZUSTAND.md` → “Step 7 status”** and **`ZUSTAND_8.md`** (finish facades, shop/booster/trail writes, delete `roundLegacy`).

## Objective

Remove old state systems after Zustand owns run, round, scene, save/load, and UI effect state. This step should leave one clear state flow.

## Carryover from step 5 (verify before delete)

Step 5 already removed or renamed these; grep should be **zero** before deleting stubs:

| API | Step 5 outcome |
| --- | --- |
| `DicePouch.refresh()` | **Removed** — subscription only |
| `TagStack.refresh()` | **Removed** — use `renderFromModel` / subscription |
| `Sidebar.refreshMoney()` | **Removed** — `selectRunSidebarModel` |
| `CardBar.refresh()` (public) | **Removed** — `rebuildCards()` protected |
| Scene `equipBar.refresh()` / `consumableBar.refresh()` / `dicePouch.refresh()` | **Removed** from Game/Shop/Booster/Trail scenes |
| `EquipmentBar.updateHints(game, player)` | **Deprecated** — `setHintGame(game)`; delete alias in step 7 |
| Tag `EventBus` refresh listeners in `SceneLayout` | **Removed** |

Still present until step 7: `getItemDisplayPlayer()`, `getFacadeEquipmentCache()`, `Sidebar.updateData()`, container events on bars.

## Carryover from step 6 (verify before delete)

Step 6 is **implemented** — see `ZUSTAND_6.md` → “Follow-up and cleanup”. Grep before deleting:

| Target | Step 6 outcome | Step 7 action |
| --- | --- | --- |
| `getSaveContext()` on **Shop** | **Removed** | — |
| `getSaveContext()` on **BoosterPack** / **TrailEvent** | Thin `sceneStore` readers | Delete; scenes write store on every mutation |
| `syncSceneStoreFromScene()` | **activeScene only** | Keep |
| `sceneStore` shop / pack / trail / payout | Authoritative during play | No scene backfill on save |
| `run.uiEffects` | Round-start + consumable bar + pack pop-in count | Remove legacy `pending*` run fields from save (v5 or strip from v4) |
| `round.sidebarOverlay` | Scoring hand preview (not serialized) | Remove remaining `Sidebar.updateData()` scoring paths |
| `ShopScene` buy/sell | Still in scene; syncs store after | Optional: `shopSceneActions.buy*` |
| `pendingRestoreShop` / `pendingRestorePack` / `pendingRestoreTrail` | Hydrate from store on enter | Delete scene buffers |
| `PlayerState.pendingTrailEvent` | Reduced; slice on `sceneStore` | Delete facade field |
| `GameScene` `equipment-changed` | Boss dice still direct | Store action or `uiEffects` |
| `sceneLifecycleActions` spread at init | **Inlined** on `sceneStore.ts` | Do not reintroduce cycle |
| `EventBus` in `store/actions/*` | **Forbidden** (loads Phaser in tests) | Emit from Phaser scenes only |

## Carryover from steps 4–5 (verify before delete)

**Safe to delete only after grep is clean:**

| Target | Still referenced from |
| --- | --- |
| `PlayerState.ts` | Phaser scenes/UI, `items.ts` display/unlock, tests, `ConsumablesSystem`, `TrailEventsSystem`, `DevMode`, `BoosterPackSystem` display |
| `GameState.ts` | Tests, `GameScene`, `items.ts` display(game, …) |
| `facadeSync.ts` caches | Most game systems + `roundActions` scoring path |
| v3 save path | `SaveLoad.normalizeSnapshot` — keep unless dropping old saves |

**Step 4 already removed (do not resurrect):**

- `roundActions.patchFromLegacy` — logic on `GameState` facade only
- `runMutationActions` in `actions/index.ts` — caused circular import TDZ; merge `roundActions` into barrel **only after** `PlayerState` is gone

**Then merge / cleanup:**

- Export `roundActions` from `actions/index.ts` once import cycle is broken
- Remove `legacyRoundStateToRuntime` if v3 migration retired
- Switch `bossRoundState` to immutable slice replace if no stale refs remain
- Remove `TagSystem` legacy `_legacy?` parameters

See also `ZUSTAND_4.md` → “Step 7 prerequisites”.

## Delete Or Rewrite

Delete or reduce these legacy owners:

- ~~`src/game/PlayerState.ts`~~ → **`src/game/store/runPlayerFacade.ts`** (top-level file removed; delete class after callers use store only)
- ~~`src/game/GameState.ts`~~ → **`src/game/store/roundFacade.ts`** (top-level file removed; GameScene still uses `GameState` wrapper)
- `src/game/Economy.ts` if it only wraps a balance number
- `GameState` listener types in `src/game/types.ts` (`GameEventType`, `GameEventCallback` — listeners already removed in step 3)
- scene save getters that duplicate store snapshots (`BoosterPackScene.getSaveContext`, `TrailEventScene.getSaveContext` — Shop already removed in step 6)

Delete step 3–4 round bridges (verify no callers before delete):

- ~~`roundActions.patchFromLegacy`~~ — removed in step 4; **`GameState.applyLegacyRoundPatch`** remains until this step
- `roundActions.seedConstructorRound`
- **`ensureDiceInRun`** — private in `GameState.ts` only (step 4)
- `legacyRoundStateProxy` in `GameState.ts` (whole file deleted)
- `runtimeToLegacyRoundState` / `legacyRoundStateToRuntime` if v3 migration no longer needed
- `store/facadeSync.ts` facade caches if all readers use store resolve helpers
- `applyPermitEffect(permit, player)` deprecated wrapper

If a file still contains useful pure helpers, move them into focused helper modules and delete the mutable class wrapper.

## Remove Singleton APIs

Remove all usages of:

- `getPlayerState()`
- `resetPlayerState()`
- `new GameState()`
- `gameState.state`
- `gameState.config`
- `gameState.on/off`

Replacement patterns:

- use `runStore.getState()` only inside action/selector modules
- use action functions for writes
- use selectors for UI reads
- use round actions for phase transitions
- use save/load hydrate helpers for restore

## Remove Manual Refresh APIs

Step 5 removed the bar/pouch/tag refresh APIs below. Step 7: delete any **stale references**, deprecated aliases, and scene helpers that only mirrored store state.

**Already removed (step 5):**

- `DicePouch.refresh()`, `TagStack.refresh()`, `Sidebar.refreshMoney()`, public `CardBar.refresh()`
- Scene calls to `equipBar.refresh()`, `consumableBar.refresh()`, `dicePouch.refresh()`, `tagStack.refresh()`
- Animation-driven bar refresh in score/pop-in/fire-destroy paths

**Still remove in step 7:**

- `EquipmentBar.updateHints()` deprecated alias (use `setHintGame` only)
- `getItemDisplayPlayer()` once `display()` accepts run context
- scene-level `updateDisplays()` / `updateEquipHints()` that only mirror store (Shop stock UI may move to step 6 subscriptions first)

Keep visual-only methods:

- animation helpers
- card lookup for animations
- modal open callbacks
- Phaser canvas texture `refresh()` in `ItemCard`

## Remove Dead Event APIs

Audit `src/game/EventBus.ts`.

Remove events that only synchronized game state or UI refresh:

- phase/hand/dice/score/day/round constants
- tag queue refresh events
- permit refresh events
- equipment modifier events with no listeners

Keep only host/Phaser bridge events that still have a real boundary purpose, such as `SCENE_READY`, unless that is replaced by a store-backed active scene bridge too.

## Direct Mutation Audit

Search for and eliminate direct state writes outside action modules:

- `equipment.push`
- `equipment.splice`
- `consumables.push`
- `consumables.splice`
- `dice.push`
- `dice =`
- `spentDiceIds`
- `pendingTags`
- `balance =`
- `trailEventModifiers =`
- `trailRoundEffects =`
- `round.phase =` (including via `game.state.phase =` proxy)
- `round.hand =` / `game.state.hand.push` (GameScene carryover paths)
- `selectedForRoll`
- `selectedForScore`
- `game.state.rolledDice =` test shortcuts (use `roundActions` + run dice seeding)

If a direct write remains, it should be inside a store action or a pure function operating on a draft/local clone.

## State Flow After Cleanup

The final flow should be:

1. User input calls a Phaser scene handler.
2. Scene handler calls a store action.
3. Store action runs game logic and updates store state.
4. Store action enqueues UI effects if needed.
5. Phaser components subscribed to selectors update themselves.
6. Phaser animation systems consume UI effects and play visuals.
7. Save/autosave snapshots read stores only.

No scene should call "refresh everything" after a mutation.

## Tests

Add or update tests for:

- run actions
- round actions
- scene actions
- save/load hydrate
- autosave snapshot creation
- selector outputs for shared UI
- UI effect queue consumption

When exact publish counts are brittle, assert final state and consumed effects.

## Manual Regression Checklist

Run through:

- new run setup
- profession and difficulty selection
- shop buy/sell/reorder/reroll
- equipment dynamic hints
- consumable buy/use/sell/reorder
- booster pack rewards and return routing
- trail event preview/resolve/sacrifice
- tags earned/displayed/consumed
- game roll/reroll/score/day end/win/loss
- boss rounds that hide/disable equipment or dice
- loaded die target changes
- save/load from Game, Shop, BoosterPack, TrailEvent, RoundSelect
- autosave boot restore
- resize in major scenes

## Done Criteria

- Zustand stores are the only authoritative state owners.
- `PlayerState` and `GameState` ownership is gone.
- Manual refresh glue is gone except graphics-only refresh calls.
- EventBus no longer carries game state sync.
- Save/load and autosave read/write stores only.
- Tests and manual smoke confirm the new flow.
