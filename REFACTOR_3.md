# REFACTOR 3 — Migrate producers to playback queue

**Prerequisites:** [REFACTOR_2.md](./REFACTOR_2.md)  
**Next:** [REFACTOR_4.md](./REFACTOR_4.md)

---

## Goal

All game logic that triggers UI animation must **`enqueuePlayback`** instead of relying on the scene to call animation functions directly or use deprecated `enqueueUiEffect`.

---

## Scope

### Modify (producers)

| File | Current behavior | Target |
|------|------------------|--------|
| `store/actions/roundActions.ts` | `enqueueUiEffect` for dice-added, round-start destructions, junk dealer | `enqueuePlayback` |
| `store/uiEffectHelpers.ts` | `enqueueUiEffect` consumable | `enqueuePlayback({ kind: 'consumable-playback', … })` |
| `store/actions/roundActions.ts` → `calculateScore` | Returns `ScoreResult`; scene calls `playScoreAnimation` | After building result, `enqueuePlayback({ kind: 'score', result })` — scene must not call `playScoreAnimation` directly after REFACTOR_4 |
| `EquipmentEffects.ts` / `roundActions.endDay` | Gold/blue moon held anims returned to scene | `enqueuePlayback({ kind: 'score-events', events, label: 'round-end-held' })` from facade or roundActions wrapper — **move enqueue to logic** in `roundActions.endDay` or new `facade/roundEnd.ts` stub |
| `phaser/scenes/BoosterPackScene.ts` | `enqueueUiEffect({ equipment-created-count })` | `enqueuePlayback` via `gameFacade` or direct `runActions.enqueuePlayback` until facade exists |
| `phaser/scenes/GameScene.ts` | `takeUiEffects` for round-start | Leave consumption for REFACTOR_4; **remove any new enqueueUiEffect** |

### Tests

| File | Change |
|------|--------|
| `__tests__/store/uiEffectHelpers.test.ts` | Assert `playbackQueue` not `uiEffects` |
| `__tests__/store/sceneActions.test.ts` | Use `takePlayback` |
| `__tests__/store/store.test.ts` | Use `playbackQueue` |

---

## Score enqueue detail

In `roundActions.calculateScore()` after `finalResult` is ready:

```typescript
runActions.enqueuePlayback({ kind: 'score', result: finalResult });
return finalResult;
```

**Do not** enqueue if `calculateScore` returns `null`.

Hand upgrades: keep inside `ScoreResult.handUpgrades`; playback runner plays them after score (REFACTOR_4). Optional separate `hand-upgrades` command only if runner needs it without full score replay.

### Round-end held dice

Where `GameScene.finishDayEndAfterEquipmentDestroyed` builds `roundEndHeldEvents`:

1. Move `processGoldHeldAtRoundEnd` / `processBlueMoonHeldAtRoundEnd` calls into `roundActions.endDay` **or** a function called from `endDay` before return.
2. `enqueuePlayback({ kind: 'score-events', events: [...gold, ...blueMoon], label: 'round-end-held' })`.
3. Apply `economyActions.earn` and `applyScoringMutations` in logic **before** enqueue (same order as today).

Return type of `endDay` may gain `{ playbackEnqueued: true }` — scene only awaits runner.

---

## Tasks

- [ ] Replace all `enqueueUiEffect` in `src/game/` with `enqueuePlayback`
- [ ] Score + round-end held migrated
- [ ] Update tests
- [ ] Grep: zero `enqueueUiEffect` in `src/game/` except deprecated wrapper in `runStore.ts`
- [ ] `BoosterPackScene` uses `enqueuePlayback` for equipment pop-in

---

## Acceptance criteria

- [ ] `rg 'enqueueUiEffect' src/game` → only `runStore` deprecation shim
- [ ] `calculateScore` enqueues `kind: 'score'`
- [ ] `bun run check` passes
- [ ] Gameplay smoke: score hand still works when runner not yet migrated (dual-write + scene may still play score until REFACTOR_4 — **if dual-write removed early, coordinate with REFACTOR_4 in same PR**)

**Note:** If REFACTOR_3 and 4 land separately, keep dual-write until REFACTOR_4 switches consumer; otherwise score may play twice. **Recommended:** land REFACTOR_3 and REFACTOR_4 back-to-back.

---

## Verification

```bash
rg 'enqueueUiEffect' src/
bun run check
```

Manual (after REFACTOR_4): play a hand, end day with gold dice held.

---

## Pitfalls

- Do not enqueue score anim on cancel/failed validation paths.
- `applyScoringMutations` must still run in logic before UI plays balance popups.

---

## Out of scope

- Deleting `bindConsumableUiEffects` (REFACTOR_4)
- Removing dual-write (REFACTOR_4)
