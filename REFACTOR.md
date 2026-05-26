# UI-Readiness Refactor — Overview

This refactor prepares **Wagon Bones** for a potential rendering-engine swap by tightening the boundary between `src/game/` (logic) and `src/phaser/` (presentation). It does **not** split npm packages; new code may live under folders such as `src/game/facade/` and `src/game/playback/`.

**Companion docs:** Each step has a detailed implementation guide:

| Step | Doc | Summary |
|------|-----|---------|
| 1 | [REFACTOR_1.md](./REFACTOR_1.md) | Define unified `PlaybackCommand` type |
| 2 | [REFACTOR_2.md](./REFACTOR_2.md) | Playback queue API on run store |
| 3 | [REFACTOR_3.md](./REFACTOR_3.md) | Migrate all producers to playback queue |
| 4 | [REFACTOR_4.md](./REFACTOR_4.md) | Single Phaser playback runner |
| 5 | [REFACTOR_5.md](./REFACTOR_5.md) | Blessed round **reads** (selectors, drop `rs()`) |
| 6 | [REFACTOR_6.md](./REFACTOR_6.md) | Blessed round **writes** (drop `patchLegacyRoundState`) |
| 7 | [REFACTOR_7.md](./REFACTOR_7.md) | Facade folder + round/run commands |
| 8 | [REFACTOR_8.md](./REFACTOR_8.md) | Migrate `GameScene` to facade |
| 9 | [REFACTOR_9.md](./REFACTOR_9.md) | Facade for shop / pack / trail / meta scenes |
| 10 | [REFACTOR_10.md](./REFACTOR_10.md) | EventBus cleanup |
| 11 | [REFACTOR_11.md](./REFACTOR_11.md) | Remove legacy exports + update docs |

---

## Goals

1. **One blessed way** for UI integration: stores + actions + **facade** + **playback queue**.
2. **Remove legacy round bridge** (`readRoundState` / `patchLegacyRoundState`) from production UI paths.
3. **One animation channel** — all visual sequencing via `playbackQueue`, not ad-hoc `takeUiEffects` + inline `playScoreAnimation` + `bindConsumableUiEffects` + unused EventBus gameplay events.
4. **Facade** — Phaser scenes stop importing `*System.ts` directly; they call `gameFacade.*`.

## Non-goals (this refactor)

- Splitting into separate npm packages.
- Rewriting the effect registry or scoring math.
- Replacing Phaser or Solid.
- Moving `src/data/*` out of Phaser imports (note in [PUBLIC_API_SPEC.md](./PUBLIC_API_SPEC.md) only).

---

## Dependency graph

Execute steps **in order**. Do not start a step until its prerequisites pass CI.

```
REFACTOR_1 (types)
    └── REFACTOR_2 (queue API)
            └── REFACTOR_3 (producers)
                    └── REFACTOR_4 (Phaser runner)
                            ├── REFACTOR_5 (round reads)
                            │       └── REFACTOR_6 (round writes)
                            │               └── REFACTOR_7 (facade core)
                            │                       ├── REFACTOR_8 (GameScene)
                            │                       └── REFACTOR_9 (other scenes)
                            └── REFACTOR_10 (EventBus) — after 8 recommended
                                    └── REFACTOR_11 (cleanup + docs)
```

**REFACTOR_10** can run in parallel with 8–9 if needed, but prefer after `GameScene` no longer emits gameplay EventBus events for things playback/facade already handle.

---

## Rules for implementers (human or AI)

1. **Use `bun` only** — never npm/yarn (`AGENTS.md`).
2. **Before marking a step done:**
   - `bun run typecheck`
   - `bun run check` (tests + format)
3. **One step ≈ one PR** — easier review and bisect.
4. **No behavior changes** unless the step explicitly allows it (e.g. removing dead EventBus listeners is fine).
5. **Do not** add Phaser imports under `src/game/` except existing exceptions (`main.ts`, `config.ts`, `EventBus.ts`).
6. **Preserve save format** — `SAVE_VERSION` unchanged unless step explicitly bumps it (none of these steps should).
7. **Tests:** Update or add tests in `src/game/__tests__/` when touching logic; Phaser files rely on manual smoke test notes in each step.

---

## Blessed patterns (target end state)

| Concern | Blessed API | Avoid |
|---------|-------------|--------|
| Run state read | `getRunState()`, selectors | Scattered `runStore.getState()` without selector |
| Run state write | `runActions`, domain `*Actions`, **facade** | `runActions.patch` from Phaser except facade internals |
| Round read | `getRoundState()`, `selectHandDice`, `selectRolledDice`, … | `readRoundState()`, `GameScene.rs()` |
| Round write | `roundActions.*`, `roundActions.patch` with ID fields | `patchLegacyRoundState` |
| Scoring | `gameFacade.submitScore()` or `roundActions.calculateScore` via facade | `calculateScore` + manual `playScoreAnimation` in scene |
| Animations | `playbackQueue` + single runner | `takeUiEffects` in scenes, `bindConsumableUiEffects`, inline anim from systems in scenes |
| Equipment mutations | `equipmentActions` / facade (resolves + persists) | `resolveEquipmentList` in scene without `replaceEquipmentList` |
| Store subscribe (Phaser) | `bindStore` / `bindGameObject` from `src/phaser/store/subscribe.ts` | Raw `subscribeRunSelector` in Phaser (logic may use it) |
| Scene ↔ host | `EventBus.emit(Events.SCENE_READY)` only | Gameplay `EventBus` for things stores already expose |
| UI entry | `import { gameFacade } from '../game/facade'` | `import { … } from '../game/BossEffectsSystem'` in scenes |

---

## Using these docs with cheaper AI models

Each `REFACTOR_N.md` includes:

- **Scope** — exact files
- **API sketches** — copy-paste friendly types
- **Checklist** — ordered tasks with checkboxes
- **Acceptance criteria** — objective done conditions
- **Verification** — commands and smoke tests
- **Pitfalls** — common mistakes

**Prompt template:**

```text
Implement REFACTOR_11 for Wagon Bones. Read REFACTOR.md and REFACTOR_11.md fully.
Follow AGENTS.md. Do not skip steps. Run bun run typecheck and bun run check before finishing.
Do not change unrelated files. One PR scope only. If you have notes for later steps, add handoff notes to the step that will need the info.
```

---

## Definition of done (whole refactor)

- [x] `UiEffect` renamed/replaced by `PlaybackCommand`; `uiEffects` → `playbackQueue` on `RunState`
- [x] Zero `takeUiEffects` / `enqueueUiEffect` in `src/phaser/` (only playback runner)
- [x] `bindConsumableUiEffects.ts` deleted or folded into playback runner
- [x] `GameScene` does not import `readRoundState`, `patchLegacyRoundState`, or game `*System.ts` files (except via facade)
- [x] `roundView.ts` not imported from `src/phaser/` (file removed in step 11)
- [x] `gameFacade` used by all scenes that previously imported 3+ game systems
- [x] Gameplay `Events.*` removed or documented as host-only; `SCENE_READY` remains
- [x] [PUBLIC_API_SPEC.md](./PUBLIC_API_SPEC.md) updated to describe facade + playback
- [x] `bun run ci` passes

---

## Completion notes (REFACTOR 11)

Refactor complete. Legacy `roundView.ts` (`readRoundState`, `patchLegacyRoundState`) removed; round session bootstrap lives in `src/game/facade/round.ts`. `legacyRoundStateToRuntime` / `runtimeToLegacyRoundState` remain for v3 save migration and `testGameState.ts` legacy die-object proxy.

**UI boundary enforcement** (run locally or add `scripts/check-ui-boundary.sh` later):

```bash
rg 'patchLegacyRoundState|readRoundState' src/phaser && exit 1
rg 'enqueueUiEffect|takeUiEffects' src/ && exit 1
rg 'from .*/(TagSystem|EquipmentEffects|ConsumablesSystem)' src/phaser/scenes && exit 1
```

Expected: all three commands produce no matches (exit 0).

---

## Related docs

- [PUBLIC_API_SPEC.md](./PUBLIC_API_SPEC.md) — current UI boundary (update in step 11)
- [AGENTS.md](./AGENTS.md) — project conventions and test layout
