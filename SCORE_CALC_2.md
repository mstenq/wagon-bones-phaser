# SCORE_CALC Phase 2 - Retrigger Deduplication (No Gameplay Change)

Phase 2 goal: remove duplicated retrigger logic while keeping behavior exactly the same.

This is the highest-leverage cleanup and should happen before moving `scoreHand` modules.

## Phase Outcome

When Phase 2 is done:

- retrigger counting/sourcing logic is centralized
- `DiceSystem.ts` no longer maintains an independent retrigger rules copy
- retrigger animation source mapping consumes the same logic path
- all existing retrigger behavior remains unchanged

## Scope

In scope:

- create a shared retrigger computation utility/module
- route both scoring and retrigger animation source generation through it
- keep existing public behavior and effect type semantics

Out of scope:

- changing item balance or retrigger formulas
- introducing a brand-new effect category API unless strictly needed
- extracting `scoreHand` to another directory (that is Phase 3)

## Files Expected To Be Touched

Likely production files:

- `src/game/DiceSystem.ts`
- `src/game/effects/retriggerAnim.ts`
- `src/game/effects/helpers.ts`
- `src/game/effects/index.ts` (if exports need updating)
- a new shared module under `src/game/effects/` (choose a clear name)

Likely tests:

- `src/game/__tests__/animEvents.test.ts`
- relevant `src/game/__tests__/items/*.test.ts` files (retrigger categories)
- `src/game/__tests__/scoring.test.ts` (if aggregate expectations need explicit parity checks)

## Required Design Rules

1. **Single source of truth** for scored-die retrigger count and source attribution.
2. Keep trigger ordering identical to current behavior.
3. Preserve copy-resolution behavior (`COPY_RIGHT`/`COPY_LEFTMOST`) exactly.
4. Preserve boss-disable behavior for retriggers.
5. Preserve red bullet handling for "Again!" indexing semantics.
6. Preserve status-trait retrigger contribution where currently applied.

## Step-By-Step Instructions

1. **Create shared retrigger computation contract**
   - Define one function (or small set) that returns:
     - total trigger count for a die
     - ordered retrigger source list for "Again!" popups
   - Inputs should include:
     - die
     - equipment list
     - score context (day/max day)
     - first/last die ids
     - enhancement/stacked-deck context
     - status trait context as needed

2. **Refactor `DiceSystem.scoreHand` to consume shared contract**
   - Replace inline retrigger loops with shared utility calls.
   - Do not change per-trigger scoring operations in this phase.

3. **Refactor `buildScoredRetriggerSources` usage**
   - Ensure animation source generation uses the same computed source order from the shared contract.
   - Avoid maintaining separate duplicated rules.

4. **Reconcile helper duplication**
   - Update/remove any now-redundant helper logic (`getScoredRetriggerCount`) only if replacement is complete and behavior-equivalent.
   - If a legacy helper remains for external callers, make it delegate to the shared logic.

5. **Add/adjust parity tests**
   - Include tests proving:
     - trigger count equality before/after refactor
     - source order used for "Again!" popups is unchanged
     - loaded-chamber or other known drift-prone paths are covered

## Acceptance Criteria

Phase 2 is accepted only if all are true:

1. There is one canonical scored retrigger rules implementation.
2. `DiceSystem.ts` no longer contains duplicated retrigger rule trees.
3. "Again!" animation source order is preserved (or explicitly corrected with tests proving intentional change).
4. Retrigger-related tests pass without loosening assertions.
5. Full validation gates pass.

## Validation Checklist (Mandatory)

Run exactly:

1. `bun run typecheck`
2. `bun run check`
3. `bun test`

Recommended focused runs before full suite:

4. `bun test src/game/__tests__/animEvents.test.ts`
5. `bun test src/game/__tests__/items/loadedDice.test.ts`
6. `bun test src/game/__tests__/items/nonScoring.test.ts`
7. `bun test src/game/__tests__/items/pipEffects.test.ts`

## Common Failure Modes

- keeping subtle duplicated branches in two places "temporarily" and drifting later
- silently changing trigger ordering
- missing copy-equipment resolution parity
- incorrect treatment of disabled equipment/boss constraints
- red-bullet indexing mismatch in "Again!" source attribution

## Handoff Notes For Next Phase (completed)

### Canonical retrigger logic

| Concern | Location |
|---------|----------|
| Scored-die trigger count + equip source order | `src/game/effects/scoredRetrigger.ts` → `computeScoredDieRetriggers()` |
| Global-only retrigger count (War Drums, Last Stand, Seventh Trumpet) | `collectGlobalScoredRetriggerSources()`; public `getGlobalScoredRetriggerCount()` (= `.length`) |
| Per-die equip sources (PIP, first/last, enhanced, Loaded Chamber) | `collectPerDieScoredRetriggerSources()` (private) |
| Copy/boss resolution for all walks | `forEachResolvedEquipment()` (private) |
| "Again!" popup wiring | `src/game/effects/retriggerAnim.ts` → `pushRetriggerAgainEvent()` |
| Held-die / round-end held retriggers | `buildHeldRetriggerSources()` in `retriggerAnim.ts` + `EquipmentEffects.ts` (unchanged; not scored-die) |

### Removed / delegated

- **`buildScoredRetriggerSources`** — removed (no callers). Use `computeScoredDieRetriggers()` only.
- **`getScoredRetriggerCount`** — alias of `getGlobalScoredRetriggerCount` (exported from `effects/index.ts` and `EquipmentEffects.ts` for tests). Not a second rules implementation.
- **Inline retrigger loop in `DiceSystem.scoreHand`** — replaced by `computeScoredDieRetriggers()`.

### Edge cases intentionally unchanged

- **`red_bullet`**, **Echo of the Damned**, **Loaded Chamber** add `triggerCount` but are **not** in `equipSources`; `pushRetriggerAgainEvent` adjusts index for `red_bullet`.
- **Loaded Chamber** uses `unattributedTriggerCount` in `computeScoredDieRetriggers` (same as pre-refactor: retrigger without equip "Again!" card).
- **Boss-disabled** scoring dice: `triggerCount === 1`, `equipSources === []`.
- **Global count invariant:** `getGlobalScoredRetriggerCount(equipment, ctx) === collectGlobalScoredRetriggerSources(...).length` (single walk; do not reintroduce a separate counter loop).

### Tests locking behavior

- `src/game/__tests__/animEvents.test.ts` — `retrigger parity contract` describe block
- Existing item tests for retriggers unchanged (still use `getScoredRetriggerCount` where only global stack matters)
