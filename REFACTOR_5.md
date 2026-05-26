# REFACTOR 5 — Blessed round reads (remove `rs()`)

**Prerequisites:** [REFACTOR_4.md](./REFACTOR_4.md) recommended (not strictly required)  
**Next:** [REFACTOR_6.md](./REFACTOR_6.md)

---

## REFACTOR 4 handoff

- **Playback:** `bindPlaybackRunner` in `GameScene` / `ShopScene` / `BoosterPackScene` (`src/phaser/playback/`). Scoring layout stays in `enterScorePhase`; `kind: 'score'` plays via runner after `scoreLayoutGate` releases.
- **Leg end:** `finishDayEndAfterEquipmentDestroyed` calls `playbackRunner.drainRoundEndHeld()` before `runRoundEndModifierFeedback` (held rewards already applied in `processRoundEndHeldDice`).
- **`rs()` / `patchRound`:** Still used throughout `GameScene` for reads/writes — this step replaces reads only.

---

## Goal

`GameScene` must read round state via **`getRoundState()` + selectors** from `store/selectors/roundSelectors.ts` and `roundResolve.ts` — not `readRoundState()` / `rs()`.

---

## Existing selectors (use these)

Already in `src/game/store/selectors/roundSelectors.ts`:

| Selector | Replaces |
|----------|----------|
| `selectRoundPhase` | `rs().phase` |
| `selectRoundTotalMiles` | `rs().totalMiles` |
| `selectRoundConfig` | `getActiveRoundConfig()` for config slice |
| `selectHandDice` | `rs().hand` |
| `selectRolledDice` | `rs().rolledDice` |
| `selectSelectedForScore` | `rs().selectedForScore` |
| `selectRoundSidebarModel` | HUD sidebar fields |

From `runSelectors.ts`:

| Selector | Replaces |
|----------|----------|
| `selectSpentDice` | `rs().spent` |
| `selectAvailableDice` | pouch / draw logic |

`getActiveRoundConfig()` in `roundView.ts` — **keep** for now (reads `getRoundState()?.config`); move to `roundSelectors.ts` as `selectRoundConfig` in REFACTOR_6.

---

## Scope

### Modify

| File | Change |
|------|--------|
| `src/phaser/scenes/GameScene.ts` | Remove `rs()`, `readRoundState` import; use selectors |
| `src/game/store/selectors/roundSelectors.ts` | Add any missing helpers (see below) |

### Optional new selectors

```typescript
export function selectSelectedForRoll(state = getRoundState()): Die[] {
  if (!state) return [];
  return resolveDiceByIds(state.selectedForRollIds, state);
}

export function selectCurrentHandType(state = getRoundState()): HandType | null {
  return state?.currentHandType ?? null;
}

export function selectRerollsRemaining(state = getRoundState()) {
  return state?.rerollsRemaining ?? 0;
}

export function selectRoundDay(state = getRoundState()) {
  return state?.day ?? 1;
}
```

---

## Migration pattern

**Before:**

```typescript
const rolled = this.rs().rolledDice;
```

**After:**

```typescript
import { selectRolledDice } from '../../game/store/selectors/roundSelectors';

const rolled = selectRolledDice();
```

For methods called often, cache in local const at start of handler.

---

## Tasks

- [ ] Add missing selectors if any `rs()` field lacks one
- [ ] Replace all `this.rs()` in `GameScene.ts` (~40+ uses) — mechanical
- [ ] Remove `private rs()` method
- [ ] Remove `readRoundState` import from GameScene
- [ ] `bun run typecheck` — fix null round (`getRoundState()` null) with early returns where needed

---

## Acceptance criteria

- [ ] `rg 'readRoundState|\.rs\(\)' src/phaser` → no matches
- [ ] `GameScene` still imports `getRoundState` where raw runtime needed (phase checks ok via selector)
- [ ] `bun run check` passes

---

## Verification

```bash
rg 'readRoundState|rs\(\)' src/phaser/scenes/GameScene.ts
bun run check
```

Manual: full round — select, roll, score, continue day.

---

## Pitfalls

- `selectRolledDice` uses `rolledRefsToDice` — same as legacy `rs().rolledDice` when values synced (REFACTOR_6 fixes writes).
- `Decimal` methods on `totalMiles` — `selectRoundTotalMiles` returns `Decimal | null`; handle null.

---

## Out of scope

- `patchRound` / writes (REFACTOR_6)
- Deleting `roundView.ts` (REFACTOR_6)
