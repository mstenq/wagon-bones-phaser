# SCORE_CALC Phase 3 - Extract Dedicated Score Module And Finalize Boundaries

Phase 3 goal: move `scoreHand` out of `DiceSystem.ts` into a dedicated scoring module without changing behavior.

This is a structure/readability phase after behavior has already been protected in Phases 1-2.

## Prerequisites From Phase 2 (do not redo in Phase 3)

Scored-die retrigger rules are **done** and live in `src/game/effects/scoredRetrigger.ts`. When extracting `scoreHand`:

- **Import** `computeScoredDieRetriggers` from `./effects/scoredRetrigger` (or re-export via `effects/index.ts`).
- **Do not** move retrigger collection into `scoring/` or duplicate loops in the new module.
- **Do not** resurrect `buildScoredRetriggerSources` (removed).
- **Keep** `retriggerAnim.ts` for `pushRetriggerAgainEvent`, held-die sources, and held-die helpers.
- **Preserve** `echoCopies` / `scoringEnhancement` / boss-disable wiring at the `scoreHand` call site when building `ScoredDieRetriggerOptions`.

See **Handoff Notes For Next Phase** in `SCORE_CALC_2.md` for full detail and edge cases.

## Phase Outcome

When Phase 3 is done:

- `scoreHand` lives in a dedicated module (for example `src/game/scoring/scoreHand.ts`)
- `DiceSystem.ts` is focused on die lifecycle + hand detection responsibilities
- score-specific inline item branches are reduced and routed through existing lifecycle/effect patterns where practical
- tests still pass with unchanged gameplay behavior

## Scope

In scope:

- module extraction and import rewiring
- moving score-specific helpers to scoring-focused locations
- lightweight cleanup to improve readability and boundaries

Out of scope:

- broad gameplay redesign
- changing scoring formulas
- changing item data contracts in `src/data/items.ts` unless strictly required

## Target Architecture

- `src/game/DiceSystem.ts`
  - `createDie`, roll utilities, hand detection, die mutation helpers
  - minimal or no score orchestration internals
- `src/game/scoring/scoreHand.ts` (new)
  - score orchestration
  - per-trigger flow
  - calls into lifecycle/effect helpers
- `src/game/store/actions/roundActions.ts`
  - unchanged pipeline order, importing score function from new module

## Files Expected To Be Touched

Production:

- `src/game/DiceSystem.ts`
- `src/game/store/actions/roundActions.ts`
- `src/game/scoring/scoreHand.ts` (new)
- optional new local helpers under `src/game/scoring/`
- exports/index files if needed

Tests:

- only where imports or direct function references need updates
- no large assertion rewrites unless behavior intentionally changed (it should not be)

## Step-By-Step Instructions

1. **Create scoring module skeleton**
   - Add `src/game/scoring/scoreHand.ts`.
   - Move `scoreHand` implementation with minimal logic edits.
   - Keep function signature stable if possible to reduce blast radius.

2. **Move score-specific local helpers**
   - If helper functions are score-only (for example destruction chance helpers), colocate them with score module or a scoring helper file.
   - **Leave** `scoredRetrigger.ts` and `retriggerAnim.ts` under `effects/` — retrigger is not part of this extraction.
   - Keep imports explicit and type-safe (top-level type imports, no inline type import expressions).

3. **Rewire callers**
   - Update `roundActions.calculateScore` import site to use new module.
   - Confirm no old circular dependency is introduced.

4. **Trim `DiceSystem.ts` responsibilities**
   - Remove extracted score orchestration code.
   - Keep only responsibilities that are still naturally dice-domain.
   - Ensure public API compatibility for existing callers.

5. **Optional lifecycle migration cleanup**
   - If still safe and small, move remaining inline score-time item-specific branches into existing lifecycle handlers.
   - Do this only when phase behavior tests remain green.
   - If risky, leave TODO comments and avoid last-minute behavior churn.

6. **Document final boundary**
   - Add brief comments/doc note in module headers clarifying ownership:
     - where score orchestration lives
     - where effect handlers live
     - where die lifecycle logic lives

## Acceptance Criteria

Phase 3 is accepted only if all are true:

1. Dedicated score module exists and is used by production scoring path.
2. `DiceSystem.ts` is materially smaller and no longer the monolithic score owner.
3. Pipeline order remains unchanged (`scoreHand` -> held -> additive/xMult).
4. No scoring behavior drift in tests (miles/mult/mutations/anim events).
5. No new TypeScript or lint/format issues introduced.
6. Full validation gates pass.

## Validation Checklist (Mandatory)

Run exactly:

1. `bun run typecheck`
2. `bun run check`
3. `bun test`

Recommended targeted confidence runs:

4. `bun test src/game/__tests__/scoring.test.ts`
5. `bun test src/game/__tests__/animEvents.test.ts`
6. `bun test src/game/__tests__/items`
7. `bun test src/game/__tests__/bosses.test.ts`
8. `bun test src/game/__tests__/trailEvents.test.ts`

If any Phaser layer files were unexpectedly touched, also run:

9. `bun run build`

## Common Failure Modes

- accidental circular imports between scoring and dice/effects modules
- moving helper code without preserving mutation semantics
- hidden change in animation event ordering
- partial extraction leaving dead code paths that diverge

## Final Deliverables For This Refactor Series

At end of Phase 3, provide:

1. short architecture summary (before vs after)
2. list of files moved/created
3. list of intentionally deferred follow-ups (if any)
4. proof that validation gates passed
