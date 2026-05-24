# Zustand Full-State Ownership Plan

## Goal

Move Wagon Bones from mutable singleton/class state to Zustand-owned state. Zustand should be the source of truth for run state, round state, active scene state, and save/load snapshots. Game logic should remain Phaser-free and testable, while Phaser scenes and UI components subscribe to the slices of state they render.

This plan assumes it is acceptable to break some flows during the migration. Do not build compatibility layers whose only purpose is to keep the old `PlayerState`/`GameState` ownership model alive. Replace old ownership directly, then fix callers.

## Current Sync Problems

The codebase currently has several overlapping sync mechanisms:

- `PlayerState` is a mutable singleton read directly from Phaser and game logic.
- `GameState` is a mutable per-round class with its own callback map.
- `EventBus` carries a few cross-layer notifications such as tags and scene readiness.
- Phaser UI components rebuild themselves with manual `refresh()` calls after mutations.
- Some scene-local pending fields exist mostly to survive Phaser scene reuse or autosave timing.

This works only when every mutation site remembers every dependent UI refresh. As new effects mutate dice, money, tags, equipment, consumables, permits, bosses, or trail modifiers, missed refreshes are easy.

## Target Architecture

Use vanilla Zustand in `src/game/` as the Phaser-free state layer:

- `src/game/store/runStore.ts`
  - Owns all cross-scene run data that currently lives on `PlayerState`.
- `src/game/store/roundStore.ts`
  - Owns active round state and config that currently lives on `GameState`.
- `src/game/store/sceneStore.ts`
  - Owns active shop, booster pack, trail event, payout, and round-select runtime data.
- `src/game/store/actions/`
  - Contains Phaser-free state actions for economy, dice, equipment, consumables, tags, permits, trail events, packs, scoring, and round lifecycle.
- `src/game/store/selectors/`
  - Contains render-focused selectors and derived game selectors.
- `src/phaser/store/subscribe.ts`
  - Phaser helper that subscribes to selectors and unsubscribes on scene shutdown or object destroy.
  - Imports Phaser, but no game logic imports this helper.

`PlayerState` and `GameState` top-level files are **removed**; compatibility classes live under `src/game/store/runPlayerFacade.ts` and `src/game/store/roundFacade.ts` until step 8 deletes them. The stores own state, and actions are the write path.

## Store Shape

Use plain serializable-ish state shapes instead of mutable class instances:

```ts
interface RootGameStores {
  run: RunState;
  round: RoundRuntimeState | null;
  scene: SceneRuntimeState;
  uiEffects: UiEffect[];
}
```

Core rules:

- No store field should hold a `PlayerState` or `GameState` instance.
- No action should mutate nested arrays/maps/sets in place unless it also replaces the containing slice before returning.
- Prefer arrays and records over `Map`/`Set` in store state so save/load and selectors stay simple.
- Domain systems should receive state/action dependencies explicitly or import store actions. They should not call `getPlayerState()`.
- Phaser objects, sprites, scenes, tweens, sounds, and containers never enter the game stores.

## Migration Steps

1. `ZUSTAND_1.md` - Add Zustand and define store-owned state models.
2. `ZUSTAND_2.md` - Replace `PlayerState` with `runStore` state and actions.
3. `ZUSTAND_3.md` - Replace `GameState` with `roundStore` state and actions.
4. `ZUSTAND_4.md` - Move pure systems and save/load onto store-owned data.
5. `ZUSTAND_5.md` - Convert Phaser shared UI to Zustand subscriptions.
6. `ZUSTAND_6.md` - Move scene-specific state and UI effects into stores. **Implemented** — see status below.
7. `ZUSTAND_7.md` - Delete legacy state ownership, refresh glue, and dead event APIs. **Complete** (May 2026).
8. `ZUSTAND_8.md` - Finish facade removal, store-native shop/booster/consumable/trail writes, round legacy proxy deletion. **Complete** (May 2026).

Each numbered file is written as an implementation brief for a smaller agent.

### Step 3 interim bridges (do not extend)

Step 3 moved round ownership to `roundStore` / `roundActions` but left short-lived shims so tests and Phaser keep running. **Do not add new callers** of these patterns:

- `GameState` facade (`new GameState`, `game.state`, `game.config` setters)
- ~~`roundActions.patchFromLegacy` / `seedConstructorRound`~~ — legacy round patching moved to `GameState.ts` (`applyLegacyRoundPatch`); see step 4 status below
- `ensureDiceInRun` (injecting dice via legacy state patches) — now **private** in `GameState.ts` only

Full list, file paths, and removal step: see **“Temporary compatibility”** in `ZUSTAND_3.md` and **“Step 4 status”** below.

### Step 4 status (implemented)

Step 4 moved pure systems and save/load onto store-owned data. Save format is **v4**. Details and remaining bridges: see **`ZUSTAND_4.md` → “Step 4 status (implemented)”**.

### Step 5 status (implemented — read before steps 6–7)

Step 5 converted shared Phaser UI to Zustand subscriptions. Full detail: **`ZUSTAND_5.md` → “Step 5 status (implemented)”**.

**Permanent additions (keep):**

- `src/game/store/selectors/uiSelectors.ts` — composite selectors for dice pouch, tag stack, sidebar, equipment/consumable bars
- `src/game/displayContext.ts` — `ItemDisplayContext` / `RoundHintContext` for `items.ts` `display()` and equipment hints
- `bindGameObject()` / `bindStore()` in `src/phaser/store/subscribe.ts` — subscribe on construct, unsubscribe on `destroy` / scene `shutdown`
- `EquipmentBar.setHintRound(ctx)` — `getRoundHintContext()` (null in shop/pack scenes)
- `CardBar.rebuildCards()` — protected rebuild; subclasses subscribe to snapshot selectors

**Shared UI now subscription-driven:**

| Component | Selectors / actions |
| --- | --- |
| `DicePouch` | `selectDicePouchCounts` |
| `TagStack` | `selectTagStackModel` (no `EventBus` tag listeners in `SceneLayout`) |
| `Sidebar` | `selectRunSidebarModel`, `selectRoundSidebarModel` |
| `EquipmentBar` | `selectEquipmentBarSnapshot`, `selectEquipmentBarSlotLabel`; hints via `setHintRound(getRoundHintContext())`; writes via `equipmentActions` |
| `ConsumableBar` | `selectConsumableBarSnapshot`, `selectCanUseSecondHelpings`; writes via `consumableActions` |

**Removed from scenes/animations:** `sidebar.refreshMoney()`, `dicePouch.refresh()`, `equipBar.refresh()`, `consumableBar.refresh()`, `layout.tagStack.refresh()`, and consumable-bar refresh calls in `ScoreAnimation` / equipment refresh in pop-in/fire-destroy animations (store subscription rebuilds bars).

**Still deferred (do not treat as final API):**

| Item | Notes | Remove in |
| --- | --- | --- |
| `Sidebar.updateData()` | Imperative tweens + pills; hand preview via `round.sidebarOverlay` | **8** |
| `getItemDisplayContext()` bridge | Hints use context, not facade; some `items.ts` paths still accept legacy `player` shape | **8** |
| `equipment-changed` / `consumable-used` events | Boss dice on GameScene; consumable **execution** on bars; consumable **anim** via `uiEffects` | **8** |
| Boss `bossRoundState` in-place patch | Equipment bar rebuilds from snapshot; logic may still mutate in place | **8** |
| `ShopScene` buy/sell handlers | Affordability is store-driven; purchases still call `getPlayerState()` | **8** — `shopSceneActions.buy*` |
| Out-of-scope UI | `JourneyInfoModal`, pack scene, trail sacrifice still use facade | **8** |

**Selector import rule:** UI selectors in `uiSelectors.ts` must import from `./runSelectors` / `./roundSelectors` only — **not** from `./index.ts` (circular export: `index` re-exports `uiSelectors`).

**Permanent additions (keep):**

- `src/game/store/serialization.ts` — serialize/deserialize run, round, scene for snapshots
- `SAVE_VERSION = 4` in `SaveLoad.ts` — `{ run, round, scene, runSeed, rngState, activeScene }`
- `applyPermitEffectToRun()` in `PermitsSystem.ts`
- `src/game/store/bossRoundState.ts` — boss round slice read/write helpers
- `src/game/store/runReads.ts` — small run selectors (`getRunProfessionId`, etc.)
- Store-native `applyScoringMutations()` (via `economyActions`, `consumableActions`, `runStore`)

**Temporary / deferred (do not treat as final API):**

| Item | Location | Why it exists | Remove in |
| --- | --- | --- | --- |
| `PlayerState` facade | `store/runPlayerFacade.ts` | Phaser buy flows, tests, consumable/trail execution | **Step 8** |
| `GameState` + round legacy proxy | `store/roundFacade.ts`, `store/roundLegacy.ts` | `GameScene.rs()` die-object view; some tests | **Step 8** |
| ~~Equipment/consumable facade caches~~ | ~~`facadeSync.ts`~~ | **Removed (step 7)** — use `store/resolve.ts` |
| ~~`getSaveContext()` on scenes~~ | — | **Removed (step 7)** |
| Run save: `pendingNewDiceIds`, `pendingAnimatedDestructions`, `pendingJunkDealerCount` | `RunState` / save | Runtime uses `uiEffects` + legacy load fallback | **Step 8** (v5 or strip from v4) |
| `ConsumablesSystem` / `TrailEventsSystem` `PlayerState` params | many functions | `resolveChoice`, `executeConsumableEffect`, conditions | **Step 8** |
| `legacyRoundStateToRuntime` / `runtimeToLegacyRoundState` | `roundResolve.ts` | v3 save migration, tests | **Step 8** after proxy removed |
| TagSystem `_legacy?: unknown` args | `TagSystem.ts` | Ignored; store is source of truth | **Step 8** |
| Boss state **in-place** patches | `bossRoundState.ts` | Stale-ref risk if replaced with immutable patches | **Step 8** |
| v3 → v4 snapshot migration | `SaveLoad.ts` `normalizeSnapshot()` | Older saves | Keep until v5 if needed |

**Import-cycle lesson:** Do **not** add `import { runActions } from '../runStore'` to `actions/index.ts` merged with action spreads (`runMutationActions`). It caused `ReferenceError: Cannot access 'coreRunActions' before initialization` when `PlayerState` loaded the barrel during module init. Export `runActions` from `runStore` only.

**Effect pipeline (partial):** Scoring/lifecycle handlers now receive `professionId` via context; equipment still often comes from facade cache, not `run.equipment` stored form. Shared bars read facade cache for card instances; hints sync via `setHintGame` + round selector.

### Step 6 status (implemented — read before step 7)

Step 6 moved scene-specific state and one-shot UI effects into stores. **1403 tests pass**; **`bun run build`** succeeds. Full detail: **`ZUSTAND_6.md` → “Status: implemented”**.

**Permanent additions (keep):**

- `src/game/store/sceneStore.ts` — shop, booster pack, trail, payout, round-select slices; **`sceneActions` inlined** (no spread of `sceneLifecycleActions` at module init — import cycle)
- `src/game/store/shopStock.ts` — Phaser-free shop stock/pack generation
- `src/game/store/actions/shopSceneActions.ts` — `openShop`, `rerollShop`, `restoreShop` (no `EventBus` import)
- `src/game/store/selectors/sceneSelectors.ts` — shop affordability / stock revision
- `src/game/store/uiEffectHelpers.ts` — `enqueueConsumablePlayback`
- `src/phaser/store/consumableUiEffects.ts` — `bindConsumableUiEffects`
- `round.sidebarOverlay` — resize-safe scoring hand/miles/mult preview (not serialized)
- `run.uiEffects` — round-start anims, consumable bar playback, pack equipment pop-in count (not serialized)

**Scenes now store-backed during play:**

| Scene | Store slice | Resize / restart |
| --- | --- | --- |
| Shop | `sceneStore.shop` | Re-hydrate from store; `shopSceneActions` on open/reroll |
| BoosterPack | `sceneStore.boosterPack` | Re-hydrate contents/picks |
| TrailEvent | `sceneStore.trailEvent` | `syncTrailToStore` + `scene.restart({})` |
| Payout | `sceneStore.payout` (+ `presentation`) | `scene.restart({})` reads store only |
| RoundSelect | `sceneStore.roundSelect` | Preview mirror; skip offers on run |
| Game | `round.sidebarOverlay`, `run.uiEffects` | Overlay subscription on `Sidebar` |

**Step 6 follow-up:** Mostly addressed in step 7–8. Remaining: shop **buy** actions in store, `GameScene` without legacy round proxy, save pending fields. See **`ZUSTAND_8.md`**.

**Import-cycle rules (step 6):** Do not import `EventBus` from `src/game/store/actions/*`. Do not spread action modules that import `sceneStore` into `sceneActions` at top level.

### Step 7 status (complete — May 2026)

Step 7 relocated facades and removed several bridges. Completed in step 8.

### Step 8 status (complete — May 2026)

**1402 tests pass**; **`bun run build`** succeeds. Zustand is the source of truth for run, round, scene, save v4, shared UI subscriptions, and store-native shop/booster/trail/consumable writes.

**Removed from production:**

- `store/runPlayerFacade.ts`, `store/roundFacade.ts`, `store/roundLegacy.ts`
- `getPlayerState()` / `getLegacyRoundState()` in Phaser and game logic
- Proxy round view in production (`GameScene` uses `readRoundState()` + `patchLegacyRoundState()`)

**Added:**

- `store/actions/shopBuyActions.ts` — shop purchases
- `store/roundView.ts` — round die-object read/write without Proxy
- `store/resetAll.ts` — `resetAllGameStores()` for menus / game over
- `src/game/__tests__/testRunPlayer.ts` — test-only `PlayerState` shim (not imported from production)
- `src/game/__tests__/testGameState.ts` — test-only `GameState` with Proxy `state` for legacy test mutations

**Systems now store-native:** `ConsumablesSystem`, `TrailEventsSystem`, `ShopScene`, `BoosterPackScene`, `TrailEventScene`, `GameScene` consumables.

**Done in step 7:**

| Change | Detail |
| --- | --- |
| Facade quarantine | `PlayerState.ts` / `GameState.ts` → `store/runPlayerFacade.ts`, `store/roundFacade.ts`, `store/roundLegacy.ts` |
| `facadeSync.ts` | **Deleted** — `store/resolve.ts` |
| Display / hints | `displayContext.ts`; `EquipmentBar.setHintRound` + `getRoundHintContext()` |
| Scene save getters | `getSaveContext()` **removed** from BoosterPack / TrailEvent / Shop |
| `roundActions` export | Available from `store/index.ts` without import cycle |
| Phaser migration (partial) | Profession/difficulty/payout/round-select/save IO; GameScene mostly on `roundActions` + legacy round view |
| Trail / shop reads | `markTrailEventSeen`, store-backed spyglass selection; shop `updateDisplays` via selectors |
| Animations | `equipmentActions.destroyEquipment`, `replaceEquipmentList` for consumable grants |

**Still open (step 8):**

| Area | ~remaining |
| --- | --- |
| `getPlayerState()` in Phaser | Shop ~16, BoosterPack ~12, TrailEvent ~6, GameScene ~2, JourneyInfoModal ~3 |
| Facade class files | Delete `runPlayerFacade`, `roundFacade`, `roundLegacy` after callers gone |
| `ConsumablesSystem` / `TrailEventsSystem` | Store-native write paths |
| `GameScene.rs()` | Replace legacy Proxy with direct `roundActions` / selectors |
| Save v4 legacy pending fields | Optional v5 migration |
| Tests | Prefer `resetTestRun()`; reduce `resetPlayerState` / `new GameState()` |

## Manual Refresh Logic (step 5 — done for shared UI)

Step 5 removed manual refresh for the shared components below. **Step 8** owns deleting remaining scene-driven presentation paths and facade-backed buy flows.

**Done (step 5):**

- `DicePouch`, `TagStack`, `Sidebar` money/leg/boss/trail fields, `CardBar` / `EquipmentBar` / `ConsumableBar` rebuilds
- `SceneLayout` tag `EventBus` listeners
- Game / Shop / BoosterPack / TrailEvent / RoundSelect scene calls that only mirrored store state into bars or sidebar money
- `ScoreAnimation`, `EquipmentPopInAnimation`, `EquipmentFireDestroyAnimation` bar refresh calls

**Still scene-driven (not “refresh drift” — real scene logic):**

- `Sidebar.updateData()` — imperative tweens; hand preview largely via `sidebarOverlay` + subscription (step 6)
- `ShopScene.updateDisplays()` — affordability (triggered by store subscriptions since step 6); buy/sell still mutates in scene then syncs store
- `EquipmentBar.setHintRound()` from `GameScene` when round context changes (subscription handles hint *content*)
- Phaser canvas `refresh()` in `ItemCard` (graphics only)
- Booster pack **card** picks — staged `applyConsumableAnimEvents` (intentional; bar path uses `uiEffects`)

## Weirdness To Retire

These patterns should be removed, not preserved behind adapters:

- Player-state / run-save pending animation fields (`pendingNewDiceIds`, `pendingAnimatedDestructions`, `pendingJunkDealerCount`) — runtime uses `uiEffects`; drop on save in **step 8**.
- Repeated `getPlayerState()` in Phaser scenes (shop buy, booster rewards, trail resolve, consumables) — **step 8**.
- Repeated `getPlayerState()` in `ConsumablesSystem` / `TrailEventsSystem` — **step 8**.
- `getLegacyRoundState()` Proxy writes from `GameScene` — **step 8** (`roundActions` only).
- `store/runPlayerFacade.ts` / `store/roundFacade.ts` classes — **step 8**.
- Legacy `RoundState` conversion helpers in `roundResolve.ts` — **step 8** after tests migrate.
- ~~Scene restore buffers / `getSaveContext()`~~ — **done (step 7)**.
- ~~`facadeSync.ts` equipment caches~~ — **done (step 7)**.
- ~~`EventBus` tag queue refresh~~ — tag stack subscribes (step 5); audit other refresh-only events in **step 8**.
- Phaser scene restarts that rely on old scene data. Continue passing explicit `{}` during migration.

## What Should Not Change

- `src/game/` must remain Phaser-free.
- Scoring, item effects, dice logic, save serialization, and tests should continue to work without a running Phaser scene after each completed step, but intermediate breakage while replacing ownership is acceptable.
- Animations should still be event-driven. Zustand should notify UI state changes, not duplicate score animation logic.
- Scene-local transient interaction state is fine when it is not authoritative game state. Examples: hover state, drag position, pointer marquee, and temporary modal widgets.

## Verification Strategy

Run increasingly broad checks after each step:

- `bun test` for logic behavior.
- Focused manual smoke in dev server:
  - start run, buy/sell/reorder equipment
  - buy/use/sell consumables
  - gain/lose dice
  - score a hand, reroll, end day
  - resolve trail event
  - open booster pack
  - save/load in Game, Shop, BoosterPack, TrailEvent
- `bun run build` after major steps.

When a manual refresh is removed, test the exact mutation that used to call it.
