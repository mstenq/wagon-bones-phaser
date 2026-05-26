# REFACTOR 1 — Unified `PlaybackCommand` type

**Prerequisites:** None  
**Next:** [REFACTOR_2.md](./REFACTOR_2.md)

---

## Goal

Replace the ad-hoc `UiEffect` union with a single, explicit **`PlaybackCommand`** type that will become the only channel from game logic → UI animations. This step is **types + file layout only** — no behavior changes yet.

---

## Scope

### Create

| File | Purpose |
|------|---------|
| `src/game/playback/types.ts` | `PlaybackCommand` discriminated union |
| `src/game/playback/index.ts` | Re-export types |

### Modify

| File | Change |
|------|--------|
| `src/game/store/types.ts` | Import `PlaybackCommand`; alias `UiEffect` → deprecated alias (or replace field type) |

**Do not** change Phaser files in this step.

---

## Design

### `PlaybackCommand` union

Merge existing `UiEffect` kinds + score playback + inline anim paths that scenes run today.

```typescript
// src/game/playback/types.ts
import type { ConsumableAnimEvent } from '../ConsumablesSystem';
import type { HandUpgradeInfo, ScoreAnimEvent, ScoreResult } from '../types';

/** Single queue item for UI animation / feedback. Logic enqueues; UI dequeues and plays. */
export type PlaybackCommand =
  | { kind: 'dice-added'; dieIds: string[] }
  | { kind: 'round-start-destructions'; entries: { sourceIdx: number; victimIdx: number }[] }
  | { kind: 'round-start-equipment-created'; count: number }
  | { kind: 'equipment-created'; equipmentIndices: number[] }
  | { kind: 'equipment-created-count'; count: number }
  | { kind: 'equipment-destroyed'; sourceIdx: number; victimIdx: number }
  | { kind: 'consumable-playback'; events: ConsumableAnimEvent[]; equipmentCreatedCount?: number }
  | { kind: 'score'; result: ScoreResult }
  | { kind: 'score-events'; events: ScoreAnimEvent[]; label?: 'round-end-held' }
  | { kind: 'hand-upgrades'; upgrades: HandUpgradeInfo[] }
  | { kind: 'tag-earned'; tagId: string }
  | { kind: 'modifier-feedback'; leasePaid: …; perished: …; leaseDefaulted: … }
  ;
```

**Mapping from old `UiEffect`:**

| Old `UiEffect.kind` | New `PlaybackCommand.kind` |
|---------------------|----------------------------|
| `consumable-anim` | `consumable-playback` |
| `score-anim` | `score-events` (was unused in prod; keep for parity) |
| `consumable-used` | **Remove** — never enqueued; bar uses Phaser event today |

### Modifier feedback type

Define a small struct mirroring `processEquipmentModifiersEndOfRound` return slices used in `GameScene.runRoundEndModifierFeedback`:

```typescript
export interface ModifierFeedbackPayload {
  leasePaid: { index: number; equipmentName: string; cost: number }[];
  perished: { index: number; equipmentName: string }[];
  leaseDefaulted: { index: number; equipmentName: string }[];
}
```

Add `kind: 'modifier-feedback'; payload: ModifierFeedbackPayload`.

### Run state field (prepare only)

In `RunState`, add **alongside** existing field (both until step 2):

```typescript
/** @deprecated Use playbackQueue — removed in REFACTOR_2 */
uiEffects: UiEffect[];
/** Authoritative animation queue for UI */
playbackQueue: PlaybackCommand[];
```

Initialize `playbackQueue: []` in `createInitialRunState()`.

Keep `uiEffects` working for now so tests do not break.

---

## Tasks

- [ ] Create `src/game/playback/types.ts` with full union + exported helper `isPlaybackCommand(value: unknown): value is PlaybackCommand` (optional, for tests).
- [ ] Create `src/game/playback/index.ts` exporting `*` from `./types`.
- [ ] In `store/types.ts`:
  - [ ] `import type { PlaybackCommand } from '../playback'`
  - [ ] Add `playbackQueue: PlaybackCommand[]` to `RunState`
  - [ ] Add `@deprecated` JSDoc on `UiEffect` pointing to `PlaybackCommand`
  - [ ] Type alias: `export type UiEffect = PlaybackCommand` **OR** keep old union and add conversion note in REFACTOR_2 — **prefer alias** if shapes align after rename `consumable-anim` → `consumable-playback`
- [ ] Update `createInitialRunState()` for `playbackQueue: []`
- [ ] Update `serialization.ts` `SerializedRunState` to omit `playbackQueue` same as `uiEffects` (transient, not saved)

---

## Acceptance criteria

- [ ] `bun run typecheck` passes
- [ ] `bun run check` passes
- [ ] No Phaser imports added under `src/game/`
- [ ] `PlaybackCommand` documented with one-line comment per `kind`

---

## Verification

```bash
bun run typecheck
bun run check
```

---

## Pitfalls

- Do not rename `consumable-anim` in producers yet — only define `consumable-playback` in the new type; REFACTOR_3 migrates call sites.
- `ScoreResult` contains `animEvents` — `kind: 'score'` carries full result; runner will use `result.animEvents` (do not duplicate events in a second command unless needed).

---

## Out of scope

- `enqueuePlayback` / `takePlayback` APIs (REFACTOR_2)
- Changing Phaser
