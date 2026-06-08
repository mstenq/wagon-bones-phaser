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

## 1. Unify pack-card targeting with the bar bridge (high priority) — ✅ done

**Problem:** Pack cards used a hand-rolled duplicate in `BoosterPackScene` while bar cards went through `ConsumableBarTargetingBridge`.

**Done:**

- `ConsumableBarTargetingBridge` delegates to `consumableFlowHarness` (`armBarConsumableTargeting`, `commitConsumableTargetingFlow`)
- `BoosterPackScene` pack-card USE delegates to the same harness (`armPackCardTargeting`, `commitConsumableTargetingFlow`)
- Pack-card arm now **fails loud** on too many pre-selected dice (matches bar policy)

---

## 2. Unify pre-selection model (high priority) — ✅ done

**Done:**

- `ambientDiceSelection.ts` — shared ambient read/write for `game` and `booster_pack`
- Game SELECT pre-picks live in `scene.consumableSeedDieIds` (not ephemeral `Set`)
- `cancelConsumableTargeting` restores game ambient seeds from session (pack already did this)
- `consumablePrePickIds` removed from `GameScene`

---

## 3. Decompose `BoosterPackScene` (high priority) — pending

**Problem:** File is ~1400 lines. Targeting orchestration is now in the harness; lineup rendering/drag still lives in the scene.

**Extract (still TODO):**

| Module | Responsibility |
|--------|----------------|
| `BoosterPackLineupController.ts` | Render lineup, drag-reorder, click → selection, sync from session |
| `formatTargetingInstruction.ts` | ✅ Shared instruction text |
| Harness callbacks | ✅ Pack-card arm/commit via harness |

`BoosterPackScene` should wire layout, card sprites, and shell — not own targeting policy.

---

## 4. Shared instruction text (medium priority) — ✅ done

- `src/game/consumables/formatTargetingInstruction.ts`
- `GameConsumableTargetingController` and `BoosterPackScene` call it

---

## 5. Remove debug logging (must do before merge) — ✅ done

Stripped `[consumable-tabs]` `console.log` from `ConsumableBar.ts` and `ConsumableBarTargetingBridge.ts`.

---

## 6. Preserve dice selection order on commit (medium priority) — ✅ done

`applyConsumableTargeting` maps `commit.selectedDieIds` to dice in pick order (not row order). Harness test added for pack mirage out-of-order preselect.

---

## 7. Atomic commit order (medium priority) — pending

**Problem:** `applyConsumableTargetingCommit` applies dice **before** `consumableActions.useConsumable`.

**Fix (pick one):**

- Validate consumable index / instance id before applying dice, then apply dice, then consume; or
- Document as explicit invariant + add harness test that reorder during targeting cannot happen (UI already blocks).

---

## 8. Boundary cleanup (low priority) — partial

- ✅ `BoosterPackScene` routes pack-card dispatch through `gameFacade.pack`
- Consider moving `packCardUseDispatcher.ts` under `src/game/facade/pack.ts` or `src/game/pack/`
- Rename `getTargetingState().diceReady` → `diceCountReady` and `ready` → `commitReady` to avoid misuse

---

## 9. `ConsumableBar` gesture-race machinery (follow-up)

`suppressTabDismissCancel`, `suppressStoreRebuild`, multiple `delayedCall(0)` — works but fragile. Longer-term: fix at `CardBar` / pointer-session level instead of feature flags in `ConsumableBar`.

**Not testable in bun** without browser automation. Manual QA checklist after refactor.

---

## 10. Refactor sequence (recommended order)

1. ✅ **Lock behavior:** `consumableFlowHarness.ts` + `consumableFlows.test.ts`
2. ✅ Remove `console.log`s
3. ✅ Wire bridge → harness; green tests
4. ✅ Wire pack-card path → harness; align seed validation; update tests
5. ✅ Extract `formatTargetingInstruction`
6. ✅ Unify pre-selection store; remove `consumablePrePickIds`
7. ⬜ Extract `BoosterPackLineupController` + shrink `BoosterPackScene`
8. ⬜ Facade import cleanup (rename targeting state fields)
9. ⬜ `bun run check` + `bun run build`

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
| Pre-pick hand dice (game SELECT) | `set_seed` / `setGameConsumableSeedDieIds` |
| Consumable bar USE (dice card) | `arm_bar` → optional toggles → `commit` |
| Pack card tab open (dice card) | `arm_pack_card` |
| Pack / bar USE confirm | `commit` (+ `bump` if medicine) |
| Dismiss tabs / cancel | `cancel` |
| Lineup die click while armed | `toggle` |

If a scene does something not expressible as harness steps, add a step or fix the scene.
