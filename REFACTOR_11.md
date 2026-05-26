# REFACTOR 11 — Cleanup, deprecations, documentation

**Prerequisites:** [REFACTOR_9.md](./REFACTOR_9.md), [REFACTOR_10.md](./REFACTOR_10.md)  
**Next:** None — refactor complete

---

## Goal

Delete dead code, finalize exports, update docs so the new boundary is obvious to the next UI implementation.

---

## Delete or archive

| Item | Action |
|------|--------|
| `src/game/store/roundView.ts` | Delete `readRoundState`, `patchLegacyRoundState` if tests migrated; keep `initRoundSession`/`startRoundSession` in `facade/round.ts` |
| `legacyRoundStateToRuntime` / `runtimeToLegacyRoundState` in `roundResolve.ts` | Keep only if tests use; else delete and test via `roundActions` only |
| `src/game/__tests__/testGameState.ts` | Rewrite to facade + `roundActions` or mark deprecated |
| `UiEffect` type name | Remove alias |
| Dual-write comments `REFACTOR_2_DUAL_WRITE` | Grep and remove |

---

## Export policy

### `src/game/store/index.ts`

- Export `gameFacade` re-export: `export { gameFacade } from '../facade'`
- Remove deprecated `readRoundState`, `patchLegacyRoundState` from barrel
- Export `enqueuePlayback`, `takePlayback` from `playback/`

### `AGENTS.md`

Add section:

```markdown
### UI integration (post-refactor)

- Phaser scenes call `gameFacade` for orchestration.
- Animations: logic enqueues `PlaybackCommand`; `PlaybackRunner` in phaser plays them.
- Round state: reads via `selectHandDice` etc.; writes via `roundActions` / `roundWrites` / facade.
```

### `PUBLIC_API_SPEC.md`

Update sections:

1. Add **Facade** (`src/game/facade/`) as primary UI entry
2. Replace **UiEffect** with **PlaybackCommand** + queue API
3. Mark EventBus as **SCENE_READY only**
4. Remove round view adapter section or mark removed
5. Update blessed patterns table to match [REFACTOR.md](./REFACTOR.md)

---

## Enforcement grep (CI-friendly)

Document expected zero hits (add to REFACTOR.md or a script later):

```bash
rg 'patchLegacyRoundState|readRoundState' src/phaser && exit 1
rg 'enqueueUiEffect|takeUiEffects' src/ && exit 1
rg 'from .*/(TagSystem|EquipmentEffects|ConsumablesSystem)' src/phaser/scenes && exit 1
```

Optional: add `scripts/check-ui-boundary.sh` — not required in this step but list in doc.

---

## Tasks

- [ ] Delete dead files/functions per table above
- [ ] Update `AGENTS.md`, `PUBLIC_API_SPEC.md`, `REFACTOR.md` checklist (mark all steps done)
- [ ] Run full CI: `bun run ci`
- [ ] Brief changelog entry in REFACTOR.md "Completion notes"

---

## Acceptance criteria

- [ ] `bun run ci` passes
- [ ] REFACTOR.md "Definition of done" all checked
- [ ] No `@deprecated` symbols left without removal plan
- [ ] Grep enforcement commands pass

---

## Final manual regression

1. New run full leg
2. Save mid-shop → reload
3. Auto-save restore from main menu
4. Score + consumable + equipment destroy + payout
5. Endless/story victory flags on game over

---

## Pitfalls

- Do not bump `SAVE_VERSION` unless snapshot shape changed (it should not).
- Preloader / Boot unaffected — smoke boot once.
