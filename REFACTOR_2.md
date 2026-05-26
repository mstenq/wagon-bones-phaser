# REFACTOR 2 — Playback queue API on run store

**Prerequisites:** [REFACTOR_1.md](./REFACTOR_1.md)  
**Next:** [REFACTOR_3.md](./REFACTOR_3.md)

---

## Goal

Add the **blessed API** for enqueueing and consuming playback commands. Deprecate `enqueueUiEffect` / `takeUiEffects` with thin wrappers so existing code keeps working until REFACTOR_3–4.

---

## Scope

### Create

| File | Purpose |
|------|---------|
| `src/game/playback/queue.ts` | `enqueuePlayback`, `takePlayback`, `clearPlayback` |

### Modify

| File | Change |
|------|--------|
| `src/game/store/runStore.ts` | `runActions.enqueuePlayback`, `takePlayback`, `clearPlayback`; deprecate ui effect methods |
| `src/game/store/serialization.ts` | Strip `playbackQueue` on serialize (like `uiEffects`) |
| `src/game/store/index.ts` | Export playback helpers |
| `src/game/__tests__/store/store.test.ts` | Tests for new queue (mirror ui effect tests) |

---

## API

```typescript
// src/game/playback/queue.ts
import type { PlaybackCommand } from './types';
import { runStore } from '../store/runStore';

export function enqueuePlayback(command: PlaybackCommand): void {
  runStore.setState((s) => ({ playbackQueue: [...s.playbackQueue, command] }));
}

export function takePlayback(predicate: (cmd: PlaybackCommand) => boolean): PlaybackCommand[] {
  // Same semantics as takeUiEffects: remove matching from queue, return removed
}

export function clearPlayback(): void {
  runStore.setState({ playbackQueue: [] });
}
```

### `runActions` wrappers

```typescript
enqueuePlayback(cmd: PlaybackCommand) { enqueuePlayback(cmd); }
takePlayback(pred) { return takePlayback(pred); }
clearPlayback() { clearPlayback(); }

/** @deprecated Use enqueuePlayback */
enqueueUiEffect(effect: UiEffect) {
  this.enqueuePlayback(migrateUiEffectToPlayback(effect));
}
/** @deprecated Use takePlayback */
takeUiEffects(pred) { return this.takePlayback(pred); }
```

Implement `migrateUiEffectToPlayback` in `playback/migrate.ts`:

- `consumable-anim` → `consumable-playback`
- all other kinds: same `kind` string where possible

---

## Dual-write period (this step only)

For safety, `enqueuePlayback` should **also** push to `uiEffects` using reverse migration until REFACTOR_4 removes consumers:

```typescript
// Temporary — delete in REFACTOR_4
uiEffects: [...s.uiEffects, playbackToLegacyUiEffect(command)],
```

Document with `// REFACTOR_2_DUAL_WRITE` grep tag.

---

## Tasks

- [ ] Implement queue helpers
- [ ] Wire `runActions`
- [ ] Deprecation JSDoc on old methods
- [ ] `createInitialRunState`: ensure both queues start `[]`
- [ ] Add tests: enqueue + take + ordering + non-matching preserved
- [ ] Update `uiEffectHelpers.ts` to call `enqueuePlayback` internally (still exported name ok for now)

---

## Acceptance criteria

- [ ] All existing tests pass (dual-write keeps Phaser behavior)
- [ ] New tests cover `takePlayback` exclusivity
- [ ] `bun run typecheck` && `bun run check`

---

## Verification

```bash
bun test src/game/__tests__/store/
bun run typecheck
bun run check
```

---

## Pitfalls

- `takePlayback` must be **atomic** (one store update) — same bug class as historical `takeUiEffects`.
- Do not remove `uiEffects` field yet — saves and tests still reference it.

---

## Out of scope

- Migrating producers off `enqueueUiEffect` (REFACTOR_3)
- Phaser runner (REFACTOR_4)
