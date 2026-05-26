# REFACTOR 7 — Facade folder and core commands

**Prerequisites:** [REFACTOR_6.md](./REFACTOR_6.md)  
**Next:** [REFACTOR_8.md](./REFACTOR_8.md)

---

## Goal

Introduce `src/game/facade/` as the **only** module Phaser should import for orchestration (beyond stores, selectors, Constants, playback types). First slice: **round session** + **run** helpers.

---

## Folder layout

```
src/game/facade/
  index.ts          // export gameFacade singleton
  types.ts          // FacadeResult types, shared errors
  round.ts          // startRound, submitScore, endDay, reroll, …
  run.ts            // resetRun, prepareNewLeg, payout helpers
  playback.ts       // re-export enqueuePlayback for scenes that must queue (minimize)
```

**No Phaser imports** in any facade file.

---

## `gameFacade` API (round.ts)

```typescript
export const gameRound = {
  /** Wraps initRoundSession + startRoundSession + tag consumption rules from GameScene.create */
  beginRoundSession(options?: { restored?: boolean }): void,

  selectDiceForRoll(ids: string[]): boolean,
  rollLockedDice(lockedIds: string[]): boolean,
  rerollUnlockedDice(unlockedIds: string[]): boolean,

  /** Validates, calculateScore (enqueues playback), returns result */
  submitScore(selectedIds: string[]): ScoreResult | null,

  cancelScore(): void,

  /** Full endDay pipeline; enqueues held-dice / modifier playback */
  endDay(options?: { deferEquipmentDestructionAnimation?: boolean }): EndDayResult,

  /** Dev only */
  forceWinRound(): void,
};
```

Implement by **delegating** to existing `roundActions`, `roundWrites`, `TagSystem.consumeNextRoundTags`, trail effect patch on restore — copy logic from `GameScene.create()` into `beginRoundSession` without behavior change.

### `gameRun` (run.ts)

```typescript
export const gameRun = {
  resetAll(): void, // resetAllGameStores
  preparePayoutPresentation(): PayoutSceneState, // extract from GameScene.transitionAfterRoundEnd
};
```

### Export

```typescript
// facade/index.ts
export const gameFacade = {
  round: gameRound,
  run: gameRun,
};
```

---

## What stays outside facade (for now)

- Shop buy flows (REFACTOR_9)
- Low-level selectors — Phaser may import selectors directly
- `Constants`, `formatScore`, `displayContext`
- Data modules (`src/data/*`)

---

## Tasks

- [ ] Create facade files with implementations moved **verbatim** from GameScene where possible
- [ ] Add unit tests `src/game/__tests__/facade/round.test.ts` for `submitScore` / `endDay` using existing test helpers (`setupGame`, `playScoredDayAndEnd`)
- [ ] Export facade from `src/game/facade/index.ts`
- [ ] **Do not** wire GameScene yet (REFACTOR_8) except optional one-method pilot

---

## Acceptance criteria

- [ ] Facade has zero Phaser imports
- [ ] Tests cover `beginRoundSession` + `submitScore` on a seeded round
- [ ] `bun run check` passes
- [ ] No scene files changed yet **or** only trivial import of unused facade (ok to skip scene changes entirely)

---

## Verification

```bash
bun test src/game/__tests__/facade/
bun run typecheck
```

---

## Pitfalls

- Duplicating boss/trail logic — import existing systems **inside** facade, not in scenes.
- `preparePayoutPresentation` must call `computePayoutBreakdown`, `processBossPayoutTags`, profession hooks exactly as GameScene does today.

---

## Out of scope

- Rewiring all scenes (REFACTOR_8–9)
