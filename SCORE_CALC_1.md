# SCORE_CALC Phase 1 - Stabilize Behavior And Add Safety Rails

Phase 1 goal: lock in current score behavior before moving logic.

This phase should not significantly alter architecture. It should create guardrails so later phases can refactor safely.

## Phase Outcome

When Phase 1 is done:

- score pipeline invariants are explicitly tested
- retrigger and lifecycle wiring has stronger coverage
- no gameplay behavior changes
- all gates pass

## Scope

In scope:

- tests and small helper extraction for testability only
- zero or minimal production logic changes
- optional tiny internal cleanup only when required to enable deterministic tests

Out of scope:

- major logic relocation
- new retrigger abstraction
- moving `scoreHand` out of `DiceSystem.ts`

## Files Expected To Be Touched

Primary test files (append to correct category files):

- `src/game/__tests__/scoring.test.ts`
- `src/game/__tests__/animEvents.test.ts`
- `src/game/__tests__/bosses.test.ts`
- `src/game/__tests__/trailEvents.test.ts`
- item category test files under `src/game/__tests__/items/` as needed

Optional helper touch (only if required for deterministic testing):

- `src/game/__tests__/testHelpers.ts`

Production files should generally not change in this phase.

## Step-By-Step Instructions

1. **Capture baseline signals**
   - Run the full validation gates once before edits.
   - Note any pre-existing failures and do not "fix" unrelated areas in this phase.

2. **Add phase-order characterization tests**
   - Add assertions that document the current score flow:
     - `scoreHand` result feeds held-die processing.
     - held result feeds additive/xMult pass.
     - final result matches composition assumptions already used by production.
   - Use existing helpers instead of building a parallel fake pipeline.

3. **Add retrigger parity coverage**
   - Add focused cases covering combinations that are easy to drift:
     - die sticker retrigger (`red_bullet`)
     - equipment retriggers (`PIP_RETRIGGER`, first/last die retriggers)
     - global retriggers (`ALL_RETRIGGER`, timed/final-day retriggers)
     - status trait retriggers where available
   - Validate both score impact and "Again!" event behavior where deterministic.

4. **Add lifecycle integration coverage (score-time hooks)**
   - Add integration tests that assert score-time lifecycle side effects are wired through real scoring, not only direct unit calls.
   - Priority examples:
     - lucky trigger lifecycle effects
     - diamond-destroy lifecycle effects
   - Keep tests deterministic with seeded RNG where possible.

5. **Add boss skip semantics guard**
   - Ensure boss-disabled dice do not accidentally apply enhancement/sticker/retrigger logic.
   - Include at least one test ensuring "disabled means fully skipped for score effects."

6. **Keep tests in existing category files**
   - Follow existing organization rules in `AGENTS.md`.
   - Do not create ad-hoc phase-named test files.

## Acceptance Criteria

Phase 1 is accepted only if all are true:

1. New tests clearly document score phase order and retrigger assumptions.
2. At least one integration test covers lucky lifecycle hook through real score path.
3. At least one integration test covers diamond-destroy lifecycle hook through real score path.
4. Boss-disabled score behavior has explicit regression coverage.
5. No behavior-changing production refactor was introduced.
6. Validation gates are green.

## Validation Checklist (Mandatory)

Run exactly:

1. `bun run typecheck`
2. `bun run check`
3. `bun test`

Recommended extra confidence:

4. `bun test src/game/__tests__/animEvents.test.ts`
5. `bun test src/game/__tests__/items`

## Common Failure Modes

- adding brittle RNG tests (flaky in CI)
- testing internals instead of game-observable behavior
- introducing hidden production logic changes "to help tests pass"
- placing tests in wrong files, causing discoverability drift

## Handoff Notes For Next Phase

Before Phase 2 starts, leave a short note in PR/commit description listing:

- which invariants are now locked by tests
- any known non-deterministic edges still not covered
- whether baseline had pre-existing failures
