# REFACTOR 6 — Blessed round writes (remove legacy bridge)

**Prerequisites:** [REFACTOR_5.md](./REFACTOR_5.md)  
**Next:** [REFACTOR_7.md](./REFACTOR_7.md)

---

## REFACTOR 5 handoff

- **`GameScene` reads:** All `rs()` / `readRoundState` removed; uses `selectRoundPhase`, `selectHandDice`, `selectRolledDice`, `selectSelectedForScore`, `selectRerollsRemaining`, `selectRoundDay`, `selectRoundTotalMiles`, `selectSpentDice(getRunState())`.
- **Writes unchanged:** `patchRound` → `patchLegacyRoundState` still used for `syncSelectedForScore`, `syncRolledDiceFromSprites`, consumable destruction, raid refill, `refreshDiceSpritesAfterEffect`, etc. Replace with `roundWrites.ts` helpers per this step.
- **`getActiveRoundConfig()`:** Still imported from `roundView.ts` in `GameScene`; move to `selectRoundConfig` in `roundSelectors.ts` when touching config reads.
- **Null `totalMiles`:** `enterScorePhase` / round-end transitions use `selectRoundTotalMiles() ?? D(0)` where legacy assumed a live round.

---

## Goal

Remove **`patchLegacyRoundState` / `readRoundState`** from production UI. All round mutations go through **`roundActions`** or **`roundActions.patch`** with **ID-based** `RoundRuntimeState` fields.

---

## Scope

### Create

| File | Purpose |
|------|---------|
| `src/game/store/roundWrites.ts` | Small helpers for UI-initiated sync writes |

Suggested helpers:

```typescript
/** Sync rolled faces from UI dice sprites into round store */
export function syncRolledDiceFromFaces(dice: Die[]): void {
  const round = getRoundState();
  if (!round) return;
  roundActions.patch({
    rolledDice: dice.map((d) => ({ id: d.id, value: d.value })),
    dieValuesByDieId: syncDieValuesFromRefs(round.dieValuesByDieId, dice.map(...)),
  });
}

/** Update hand dice IDs (SELECT phase) */
export function setHandDiceIds(ids: string[]): void { … }

/** Set locked selection for score preview (or use roundActions.selectForScore) */
export function setSelectedForScoreIds(ids: string[]): void { … }
```

Use `syncDieValuesFromDice` / `syncDieValuesFromRefs` from `roundResolve.ts`.

### Modify

| File | Change |
|------|--------|
| `src/phaser/scenes/GameScene.ts` | Remove `patchRound`, `patchLegacyRoundState` import; call `roundWrites` / `roundActions` |
| `src/game/store/roundView.ts` | Keep `startRoundSession`, `initRoundSession`, move `getActiveRoundConfig` to selectors; **deprecate** `readRoundState`, `patchLegacyRoundState` |
| `src/game/store/index.ts` | Stop exporting legacy functions **or** export with `@deprecated` |
| `src/game/__tests__/testGameState.ts` | Keep legacy shim for tests only OR migrate tests to `roundActions.patch` |

### `patchRound` call sites in GameScene (grep targets)

| Location | Replacement |
|----------|-------------|
| `selectedForScore` sync before score | `roundActions.selectForScore(ids)` or `setSelectedForScoreIds` |
| `rolledDice` from sprites | `syncRolledDiceFromFaces` |
| `hand` filter after destroy | `roundActions.patch({ handDiceIds: … })` + update `dieValuesByDieId` |
| Dev win `totalMiles` + phase | `roundActions.patch({ totalMiles, phase: 'DAY_END' })` |
| Draw hand / fill hand | `setHandDiceIds` |

---

## Move `getActiveRoundConfig`

```typescript
// roundSelectors.ts
export function selectRoundConfig(state = getRoundState()): GameConfig {
  return state?.config ?? DEFAULT_CONFIG;
}
export const getActiveRoundConfig = selectRoundConfig; // alias for compatibility
```

Update imports in GameScene from `roundView` → `roundSelectors`.

---

## Tasks

- [ ] Implement `roundWrites.ts`
- [ ] Replace every `patchRound` in GameScene
- [ ] Remove `patchRound` private method
- [ ] Deprecate `readRoundState` / `patchLegacyRoundState` in `roundView.ts`
- [ ] Migrate `testGameState.ts` to use `roundActions` + selectors (keep file for test ergonomics)
- [ ] `rg 'patchLegacyRoundState' src/phaser` → zero

---

## Acceptance criteria

- [ ] No Phaser imports from `roundView` except `initRoundSession` / `startRoundSession` (or move those to `facade/round.ts` in REFACTOR_7)
- [ ] `bun run check` passes
- [ ] Manual: reroll, lock dice, score, dice destruction mid-round, draw phase

---

## Verification

```bash
rg 'patchLegacy|readRoundState|patchRound' src/phaser
bun run check
```

---

## Pitfalls

- Forgetting `runActions.patch({ spentDiceIds })` when moving spent dice — spent lives on **run** store (`spentDiceIds`), not only round.
- `handDiceIds` vs `dice` in run store — hand is IDs in round; die defs in `run.dice`.

---

## Out of scope

- Deleting `roundView.ts` entirely (REFACTOR_11) — tests may still use legacy convert functions in `roundResolve.ts`
