# Consumables targeting refactor plan

This document captures the recommended structural cleanup for the consumables targeting refactor. **Do not start this work until `consumableFlows.test.ts` is green** — those tests lock in behavior via `consumableFlowHarness.ts` without Phaser.

Goals reference: [GAME_CONSUMABLES_OVERVIEW.md](GAME_CONSUMABLES_OVERVIEW.md)

---

## What is already in good shape (leave alone)

- `src/game/consumables/consumableTargetingSession.ts` — session lifecycle, validation, snapshot
- `src/game/consumables/applyConsumableTargeting.ts` — commit → dice effect → consume
- `src/game/consumables/consumableUseContext.ts` — `useMode` eligibility
- `useMode` on data defs (`supply_cards.ts`, `frontier_encounters.ts`)
- `DiceSelectionScene` removed
- `ConsumableBarTargetingBridge` shared between `GameScene` and `BoosterPackScene` for **bar** cards

---

## 1. Unify pack-card targeting with the bar bridge (high priority)

**Problem:** Pack cards use a hand-rolled duplicate in `BoosterPackScene` (`beginPackCardTargeting`, `onUsePackDiceCard`) while bar cards go through `ConsumableBarTargetingBridge`. Behavior has already diverged:

| Behavior | Bar (`ConsumableBarTargetingBridge`) | Pack card (`BoosterPackScene`) |
|----------|---------------------------------------|--------------------------------|
| Too many pre-selected dice | Hard fail: `Select at most N dice` | Silently truncated via `toggleDie` max cap |
| Tab enabled state | `snapshot.ready` / `isTargetingCommitReady` | `isDiceSelectionReady` only |
| Instruction copy | `getConsumableTargetingSnapshot()` (game) | Hand-rolled strings in `updateInstructionText` |

**Fix:**

1. Extend `consumableFlowHarness.ts` (or rename to `consumableTargetingOrchestration.ts`) with `armPackCard` / shared `commitTargeting` used by both paths.
2. Point `ConsumableBarTargetingBridge` at the harness (drop inline begin/seed/commit).
3. Point `BoosterPackScene` pack-card USE at the same harness.
4. **Pick one seed validation policy** (recommend: fail loud everywhere, matching bar). Update `consumableFlows.test.ts` when changed.

**Delete:** `beginPackCardTargeting` and inline commit logic from `BoosterPackScene` once harness is wired.

---

## 2. Unify pre-selection model (high priority)

**Problem:** “Pick dice first, then card” uses two mechanisms:

- **GameScene:** ephemeral `consumablePrePickIds` `Set` (cleared on phase transitions)
- **BoosterPack:** `lineupSelectedDieIds` in scene store + session when armed

`onLineupDieClick` branches on `targeting.active()` — ambient store vs session.

**Fix:**

1. One ambient selection store (scene store field or `packLineupSelection` generalized to `ambientDiceSelection`).
2. Always writable when no session; session seeds from ambient on arm and takes over.
3. `cancel` restores ambient from session (already partially true for pack via `cancelConsumableTargeting`).
4. Remove `consumablePrePickIds` from `GameScene`; use the shared store or harness-level seed passed from play-area selection synced to store.

**Tests to update:** `consumableFlows.test.ts` `set_seed` / `preselect_pack` steps should converge to one `preselect` step.

---

## 3. Decompose `BoosterPackScene` (high priority)

**Problem:** File is ~1430 lines and grew during this refactor. Targeting, lineup, and tab-dismiss logic belong elsewhere.

**Extract:**

| Module | Responsibility |
|--------|----------------|
| `BoosterPackLineupController.ts` | Render lineup, drag-reorder, click → selection, sync from session |
| `PackCardTargetingBridge.ts` or harness callbacks | Pack-card arm/commit (or fold into unified harness) |
| `formatTargetingInstruction.ts` | Shared instruction text from `getConsumableTargetingSnapshot()` |

`BoosterPackScene` should wire layout, card sprites, and shell — not own targeting policy.

---

## 4. Shared instruction text (medium priority)

**Problem:** `GameConsumableTargetingController.updateInstructionText` uses `getConsumableTargetingSnapshot()`. `BoosterPackScene.updateInstructionText` reimplements min/max/clone copy.

**Fix:** `formatTargetingInstruction(snapshot, { cloneOrderHint?: boolean })` in `src/game/consumables/` (pure). Both scenes call it.

---

## 5. Remove debug logging (must do before merge)

Strip `[consumable-tabs]` `console.log` from:

- `src/phaser/ui/ConsumableBar.ts`
- `src/phaser/scenes/game/ConsumableBarTargetingBridge.ts`

---

## 6. Preserve dice selection order on commit (medium priority)

**Problem:** `applyConsumableTargeting.selectPackDice` / `selectGameDice` filter the visible row by id but return dice in **row order**, not `commit.selectedDieIds` order. Mirage / CLONE uses `selectedDice[0]` as left and `selectedDice[1]` as right — wrong when pick order differs from lineup/hand order.

**Fix:** Map `commit.selectedDieIds` to dice in that order (drop missing ids). Add harness test for pack mirage with out-of-order preselect once fixed.

---

## 7. Atomic commit order (medium priority)

**Problem:** `applyConsumableTargetingCommit` applies dice **before** `consumableActions.useConsumable`. Stale bar index after reorder could mutate dice then fail consume.

**Fix (pick one):**

- Validate consumable index / instance id before applying dice, then apply dice, then consume; or
- Document as explicit invariant + add harness test that reorder during targeting cannot happen (UI already blocks).

---

## 8. Boundary cleanup (low priority)

- `BoosterPackScene` imports `packCardUseDispatcher` from `src/game/consumables/` — route through `gameFacade.pack` per AGENTS.md.
- Consider moving `packCardUseDispatcher.ts` under `src/game/facade/pack.ts` or `src/game/pack/`.
- Rename `getTargetingState().diceReady` → `diceCountReady` and `ready` → `commitReady` to avoid misuse.

---

## 9. `ConsumableBar` gesture-race machinery (follow-up)

`suppressTabDismissCancel`, `suppressStoreRebuild`, multiple `delayedCall(0)` — works but fragile. Longer-term: fix at `CardBar` / pointer-session level instead of feature flags in `ConsumableBar`.

**Not testable in bun** without browser automation. Manual QA checklist after refactor.

---

## 10. Refactor sequence (recommended order)

1. ✅ **Lock behavior:** `consumableFlowHarness.ts` + `consumableFlows.test.ts` (this PR)
2. Remove `console.log`s
3. Wire bridge → harness; green tests
4. Wire pack-card path → harness; align seed validation; update tests if policy changes
5. Extract `formatTargetingInstruction`
6. Unify pre-selection store; remove `consumablePrePickIds`
7. Extract `BoosterPackLineupController` + shrink `BoosterPackScene`
8. Facade import cleanup
9. `bun run check` + `bun run build`

---

## Out of scope for bun tests (Playwright/manual if needed)

- Action-tab pointer-up dismiss races
- Tab slide / card lift animations
- Resize reflow (`onResize` rebuild)
- Visual disabled state (alpha vs `disabled` flag)

---

## Harness ↔ UI mapping

When refactoring, every UI path should delegate to the harness:

| UI gesture | Harness step / function |
|------------|-------------------------|
| Pre-pick lineup dice (pack) | `preselect_pack` / `setPackLineupSelectedDieIds` |
| Pre-pick hand dice (game SELECT) | `set_seed` |
| Consumable bar USE (dice card) | `arm_bar` → optional toggles → `commit` |
| Pack card tab open (dice card) | `arm_pack_card` |
| Pack / bar USE confirm | `commit` (+ `bump` if medicine) |
| Dismiss tabs / cancel | `cancel` |
| Lineup die click while armed | `toggle` |

If a scene does something not expressible as harness steps, add a step or fix the scene.
