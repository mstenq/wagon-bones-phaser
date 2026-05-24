# Step 8 — Finish Facade Removal And Store-Native Systems

## Objective

Complete the work started in step 7: Zustand is already authoritative for run, round, scene, save v4, and shared UI subscriptions. What remains is deleting compatibility facades, migrating the last `getPlayerState()` call sites, and moving shop/booster/consumable/trail **writes** into store actions so game logic never depends on mutable class wrappers.

**Current baseline (May 2026):** `bun test` — **1402 pass**; `bun run build` — OK.

## What step 7 already delivered

| Area | Status |
| --- | --- |
| Top-level `PlayerState.ts` / `GameState.ts` | **Removed** — logic in `store/runPlayerFacade.ts`, `store/roundFacade.ts`, `store/roundLegacy.ts` |
| `facadeSync.ts` | **Deleted** — `store/resolve.ts` (`resolveEquipmentList`, `replaceEquipmentList`, …) |
| `displayContext.ts` | **Added** — `ItemDisplayContext`, `RoundHintContext`, `getItemDisplayContext()`, `getRoundHintContext()` |
| `getSaveContext()` on scenes | **Deleted** — scenes read/write `sceneStore` only |
| `getFacadeEquipmentCache()` | **Gone** — bars rebuild from store via selectors |
| `EquipmentBar.setHintGame` | **Replaced** — `setHintRound(getRoundHintContext())` |
| `applyPermitEffect(permit, player)` | **Removed** — `applyPermitEffectToRun()` |
| `roundActions` in `store/index.ts` | **Exported** (import-cycle resolved for run barrel) |
| Profession / difficulty / payout / round-select / save IO | **Store-backed** |
| `GameScene` round ownership | **Mostly migrated** — `getLegacyRoundState()` + `roundActions`; no `new GameState()` field |
| Trail selection / spyglass | **Mostly store reads** — `markTrailEventSeen`, `selectTrailEvent()`, `resolveEquipmentList` |
| Shop affordability UI | **`updateDisplays()`** uses `selectShopAffordabilityInputs` + `canAfford` |
| Equipment fire / consumable anims | **`equipmentActions.destroyEquipment`**, `replaceEquipmentList` |
| `grantGhostMedicine()` | **Store path** when no `PlayerState` passed |

## Remaining `getPlayerState()` (Phaser)

Grep target before closing step 8: **zero** in `src/phaser/` except tests if any.

| File | ~calls | Blocker |
| --- | ---: | --- |
| `ShopScene.ts` | 16 | Buy/sell/reroll stock still mutates via facade (`trySpend`, `addDie`, `equipment.push`, permits) |
| `BoosterPackScene.ts` | 12 | Pack rewards, instant effects, consumable execution |
| `TrailEventScene.ts` | 6 | `resolveChoice`, sacrifice UI, `trailEventModifiers` / `skipNextShop` |
| `GameScene.ts` | 2 | `executeConsumableEffect(consumed, player, …)` |
| `JourneyInfoModal.ts` | 3 | Hand stats / leg panels / dev permit grant |

## Remaining `PlayerState` in game logic

| Module | Notes |
| --- | --- |
| `ConsumablesSystem.ts` | `executeConsumableEffect`, `useConsumableDirectly`, instant effects still take `PlayerState` |
| `TrailEventsSystem.ts` | `resolveChoice`, `checkCondition`, `applyEffect` — reads/writes via facade param |
| `TagSystem.ts` | Optional legacy `_legacy` args (ignored); drop params |
| `ItemsSystem` / `BoosterPackSystem` / `equipmentUnlock` | `display(game, player)` — use `ItemDisplayContext` only |
| Tests (`testHelpers`, item suites, saveLoad, …) | Prefer `resetTestRun()` + store actions; keep facade only until deleted |

## Facade files to delete (last)

Delete only when grep is clean:

- `src/game/store/runPlayerFacade.ts` — `PlayerState` class, `getPlayerState`, `resetPlayerState`
- `src/game/store/roundFacade.ts` — `GameState` class (tests may still import)
- `src/game/store/roundLegacy.ts` — `getLegacyRoundState()` Proxy; replace `GameScene.rs()` with `roundActions` + selectors only

After deletion, remove re-exports from `store/index.ts` and update `AGENTS.md` architecture table.

---

## Phase A — Shop and booster buy paths

### A1. Shop scene actions

Add to `shopSceneActions.ts` (or `store/actions/shopBuyActions.ts`):

- `buyEquipment(stockIndex, preview)` — `economyActions.trySpend`, `acquireEquipmentInstance`, `replaceEquipmentList`
- `buyConsumable(def)` / `buyAndUseConsumable(def)` — `consumableActions` + `enqueueConsumablePlayback`
- `buyDie(die)` — `diceActions.addDie`
- `buyPack(packDef)` — spend + `sceneActions.markShopPackOpened`
- `buyPermit(permit)` — `permitActions` + `applyPermitEffectToRun`

`ShopScene` handlers become thin: validate UI → call action → `sceneActions.markShopStockSold` / sync slice.

### A2. Booster pack scene

- Route instant effects through `economyActions`, `diceActions`, `equipmentActions`, `consumableActions`
- `handleConsumableUsed` → `executeConsumableEffect` store API (no player param)
- Pack return routing already uses `sceneStore`; confirm no facade writes on exit

### A3. Permit / stock helpers

- `getOrGeneratePermit` → read `currentLegPermitId` from `getRunState()`; write via `runActions.patch`
- `generateOneStockItem` → `selectProfession(getRunState())` for frontier-in-shop weight
- `getOwnedItemIds` → `selectShopAffordabilityInputs` or dedicated selector

**Verify:** shop buy/sell/reroll, buy & use consumable, permit purchase, pack open, resize in Shop, save/load in Shop.

---

## Phase B — Consumables and trail systems

### B1. `ConsumablesSystem`

- Replace `player: PlayerState` with explicit deps or internal `getRunState()` + actions:
  - Money: `economyActions`
  - Dice: `diceActions`
  - Equipment state on instances: `replaceEquipmentList` after mutating resolved instances
  - Consumables: `consumableActions`
  - `lastUsedConsumable`: run slice field (already on store)
- `executeConsumableEffect` / `useConsumableDirectly` — no facade parameter
- Update `ConsumableAnimPlayback` callers if effect application moves entirely into actions

### B2. `TrailEventsSystem`

- `resolveChoice` — use `runActions.patch` for `trailEventModifiers`, `skipNextShop`, seen ids (already `markTrailEventSeen`)
- `checkCondition` — `getRunState()` + `resolveEquipmentList` + `resolveConsumableList`
- `applyEffect` — delegate to existing progression/dice/economy actions
- `applySpyglassInvestigate` — store-only path once tests use `equipmentActions` / store seeding

### B3. `GameScene` consumables

- `handleConsumableUsed` → `executeConsumableEffect(consumed, context)` only
- Remove last `getPlayerState` import from `GameScene.ts`

**Verify:** supply/trail guide/frontier from bar and shop; Second Helpings; dice-selection consumables; trail sacrifice; spyglass avoid/investigate.

---

## Phase C — Round legacy proxy removal

### C1. Eliminate `getLegacyRoundState()` in `GameScene`

Replace patterns:

| Legacy (`rs()`) | Target |
| --- | --- |
| `this.rs().phase` | `getRoundState()?.phase` or `selectRoundPhase` |
| `this.rs().hand.push(die)` | `roundActions.addToHand` / existing draw actions |
| `this.rs().rolledDice[i] = …` | `roundActions.patchRolledDie` or immutable replace |
| Direct phase reads in UI | Selectors in `roundSelectors.ts` |

Keep **die object instances** in round store only as long as scoring pipeline requires live `Die` references; otherwise store die ids + resolve from `run.dice`.

### C2. Tests

- `setupGame()` / `calculateTestScore()` — seed via `roundActions.startRound` + `diceActions`, not `game.state.* =`
- Remove `GameState` from `store.test.ts` assertion once class deleted
- Delete `roundFacade.ts` when no test imports `new GameState()`

**Verify:** full scoring pipeline, reroll, day end, boss rounds, refill-after-raid, loaded die UI.

---

## Phase D — Shared UI and modals

| Component | Action |
| --- | --- |
| `JourneyInfoModal` | `getRunState()` + `selectHandStats` / `selectProfession`; dev permit → `permitActions` or `devGrantPermit` with store |
| `DicePouchModal` | Store selectors (if still using facade) |
| `EquipmentCatalogModal` | `getItemDisplayContext()` only |
| `OptionsModal` | Audit single `getPlayerState` use |
| `Sidebar.updateData()` | Keep tweens; ensure all authoritative fields come from selectors (overlay already on round store) |

**Verify:** journey modal tabs, resize, hand level display matches run store.

---

## Phase E — Save format and legacy fields

### E1. Run save cleanup (optional v5)

Remove from serialized run (or stop writing in v4):

- `pendingNewDiceIds`
- `pendingAnimatedDestructions`
- `pendingJunkDealerCount`

Runtime already prefers `run.uiEffects`; keep **load fallback** in `roundActions` until v5 migration written in `SaveLoad.normalizeSnapshot`.

### E2. Round save

- When `roundLegacy` is gone, ensure save round slice has no duplicate die blobs inconsistent with `run.dice`
- Document `sidebarOverlay` as non-serialized (already omitted)

### E3. Scene save

- Confirm autosave never reconstructs shop/pack/trail from Phaser `init` data alone

**Verify:** `saveLoad.test.ts`, autosave boot from Game/Shop/BoosterPack/TrailEvent, old v3→v4 migration still passes.

---

## Phase F — EventBus audit and dead API removal

- Grep `Events.` in `src/phaser` — remove listeners that only refreshed UI now subscription-driven
- Keep: `SCENE_READY`, audio/SFX bridges, lease/perish **presentation** events if scenes still show floating text
- Remove deprecated `EquipmentBar.updateHints` alias if any reference remains
- Remove `TagSystem` unused `_legacy` parameters

---

## Phase G — Tests and docs

- `testHelpers.ts`: `resetTestRun()` as default; `getPlayerState()` only if facade still exists
- Migrate high-churn suites last: `trailEvents.test.ts`, `consumables.test.ts`, `permits.test.ts`, `equipmentModifiers.test.ts`
- Update `AGENTS.md` — stores as source of truth; remove `PlayerState` / `GameState` from core systems table
- Update `ZUSTAND.md` step 7 → **complete**; archive or shorten `ZUSTAND_7.md` carryover tables

---

## Done criteria (step 8 / migration complete)

- [ ] No `getPlayerState()` / `resetPlayerState()` in `src/` (except optional thin test shim, then delete)
- [ ] No `new GameState()` / `getLegacyRoundState()` in production code
- [ ] `runPlayerFacade.ts`, `roundFacade.ts`, `roundLegacy.ts` deleted
- [ ] Shop/booster/trail/consumable **writes** only through `store/actions/*`
- [ ] `ConsumablesSystem` and `TrailEventsSystem` are Phaser-free and facade-free
- [ ] Save/autosave snapshots read stores only; legacy pending fields removed or migrated
- [ ] `bun test` and `bun run build` green
- [ ] Manual smoke checklist from `ZUSTAND_7.md` passed once

---

## Suggested agent order

1. **Phase A** (Shop + Booster) — highest Phaser `getPlayerState` count  
2. **Phase B** (Consumables + Trail logic) — unblocks GameScene  
3. **Phase C** (Round legacy) — largest `GameScene` diff  
4. **Phase D** (Modals)  
5. **Phase E** (Save v5, optional)  
6. **Phase F–G** (EventBus, tests, docs)

Each phase: `bun test` → focused manual smoke → `bun run build`.

## Import-cycle rules (still apply)

- `uiSelectors.ts` imports only `./runSelectors` / `./roundSelectors` — **not** `./index.ts`
- Do **not** add `import { runActions } from '../runStore'` to `actions/index.ts` merged spreads
- No `EventBus` imports in `src/game/store/actions/*`
