# Score Calculation Refactor Master Plan

This document is the master handoff for refactoring score calculation out of `src/game/DiceSystem.ts` into clearer modules while preserving exact gameplay behavior.

Use this with:

- `SCORE_CALC_1.md` - Phase 1 (stabilize and characterization tests)
- `SCORE_CALC_2.md` - Phase 2 (deduplicate retrigger logic)
- `SCORE_CALC_3.md` - Phase 3 (extract dedicated `scoreHand` module and finalize boundaries)

## Why This Refactor Exists

`scoreHand` currently mixes:

1. Core dice scoring orchestration.
2. Equipment dispatch through `effectRegistry`.
3. Several inline item-specific behaviors and direct store mutations.

The system works today, so this is a maintainability refactor, not a redesign.

## Core Rule: No Behavioral Drift

The refactor is successful only if gameplay outcomes remain identical:

- same `miles`, `mult`, `totalValue`
- same item proc behavior and timing
- same die destruction/copy/grant behavior
- same `animEvents` order and content where intentionally ordered
- same persistence outcomes in run/round stores

If unsure, prefer keeping old behavior over code cleanup.

## Global Constraints For All Phases

1. Use `bun` only (`npm/yarn/npx` are forbidden).
2. Keep existing effect types and item data contracts stable unless phase explicitly says otherwise.
3. Do not rewrite unrelated systems.
4. Keep file moves small and reviewable.
5. Do not remove tests to make failures disappear.
6. At end of each phase, all validation gates must pass.

## Important Existing Boundaries

Keep these conceptual boundaries unless phase instructions explicitly move them:

- `DiceSystem.ts`: die lifecycle (create/roll/hand detect); **`scoreHand` moves to `scoring/` in Phase 3**.
- `effects/scoredRetrigger.ts`: scored-die retrigger count and "Again!" source order (Phase 2 complete).
- `effects/retriggerAnim.ts`: "Again!" popup + held-die retrigger sources.
- `effects/*`: item effect handlers by category and lifecycle.
- `roundActions.calculateScore`: pipeline order (`scoreHand` -> held -> additive/xMult).
- `EquipmentEffects.ts`: held-dice pass and additive/xMult orchestration.

## Required Validation Gates After Each Phase

Run in this order and do not skip failures:

1. `bun run typecheck`
2. `bun run check`
3. `bun test`

Optional but recommended when touching score animation behavior heavily:

- `bun test src/game/__tests__/animEvents.test.ts`

If a phase touches Phaser scene/render code (unlikely here), also run:

- `bun run build`

## Definition Of Done For This Refactor Series

All three phase docs complete with green gates, and final state achieves:

- dedicated score module (not monolithic inside `DiceSystem.ts`)
- retrigger logic no longer duplicated across multiple files
- inline item-specific score branches minimized or moved behind existing lifecycle/effect patterns
- tests documenting the intended phase order and score contracts

## Fast Rollback Guidance

If a phase causes uncertain behavior drift:

1. revert only the phase-specific commits/changes
2. re-run validation gates
3. resume from last green checkpoint

Do not continue into later phases with red tests.
