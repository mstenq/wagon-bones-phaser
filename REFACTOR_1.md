# Refactor 1: Consolidate Horizontal Drag Reorder

## Goal

Replace duplicated horizontal drag-reorder implementations with one reusable helper used by:

- `src/phaser/ui/CardBar.ts`
- `src/phaser/ui/rollDiceDragReorder.ts`
- `src/phaser/scenes/BoosterPackScene.ts`

This step should delete the bespoke BoosterPack dice-lineup drag state machine and reuse the touch-safe pointer session primitives already in the codebase.

## Why

The project already has:

- `src/phaser/ui/pointerDragTrack.ts`
- `src/phaser/ui/pointerDragSession.ts`
- `src/phaser/ui/rollDiceDragReorder.ts`

But `BoosterPackScene` still owns a parallel manual drag stack with fields like `lineupDragCandidate`, `lineupDragPointerId`, `lineupDragOffsetX`, `lineupDragVelocityX`, and custom pointermove/pointerup handlers.

Fallow reported a duplicate settle tween between `BoosterPackScene` and `rollDiceDragReorder`. The same swing and settle behavior also exists in `CardBar`.

## Files To Inspect First

- `src/phaser/ui/pointerDragTrack.ts`
- `src/phaser/ui/pointerDragSession.ts`
- `src/phaser/ui/rollDiceDragReorder.ts`
- `src/phaser/ui/CardBar.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/ui/DiceSprite.ts`

## Target Shape

Create a reusable helper in `src/phaser/ui/`, for example:

- `horizontalDragReorder.ts`

The helper should own:

- Pointer session creation through `createPointerDragSession`.
- Drag threshold behavior through `getPointerDragDistance`.
- Pointer offset tracking.
- Horizontal velocity and swing calculation.
- Finding the nearest target slot.
- Reordering the visual array.
- Animating non-dragged siblings into their slots.
- Settle tween chain on release.
- Cleanup when cancelled or destroyed.

Keep the helper concrete and boring. Do not build a general-purpose drag framework beyond what the current call sites need.

## Proposed API

One workable shape:

```ts
export interface HorizontalDragReorderConfig<T extends Phaser.GameObjects.GameObject> {
  scene: Phaser.Scene;
  getItems: () => T[];
  canStart: (item: T, pointer: Phaser.Input.Pointer) => boolean;
  canTap?: (item: T, pointer: Phaser.Input.Pointer) => boolean;
  onTap?: (item: T, pointer: Phaser.Input.Pointer) => void;
  onBegin?: (item: T) => void;
  onMoveItem: (item: T, pointer: Phaser.Input.Pointer, offset: { x: number; y: number }) => void;
  getSlotPositions: (count: number) => Array<{ x: number; y: number; rotation?: number }>;
  onSiblingMove?: (item: T, index: number, slot: { x: number; y: number; rotation?: number }) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  onSettleStart?: (item: T, index: number) => void;
  onSettleComplete?: (item: T, fromIndex: number, toIndex: number) => void;
}
```

If this feels too generic while implementing, narrow it. The important part is that the duplicate pointer and settle logic disappears.

## Implementation Plan

1. Add `src/phaser/ui/horizontalDragReorder.ts`.
2. Move the common velocity/swing/nearest-slot/settle-chain logic out of `rollDiceDragReorder.ts`.
3. Update `RollDiceDragReorder` to delegate to the new helper.
4. Update `CardBar` to delegate its reorder mechanics to the new helper while keeping card-specific concerns in `CardBar`:
   - suppressing card tooltips
   - stopping/resuming wobble
   - calling `onReorder`
   - restoring card depths
5. Replace BoosterPack's lineup fields and methods with the new helper:
   - Remove `lineupDragCandidate`
   - Remove `lineupDragPointerId`
   - Remove `lineupWasDragging`
   - Remove `lineupDragOffsetX`
   - Remove `lineupDragOffsetY`
   - Remove `lineupDragStartX`
   - Remove `lineupDragStartY`
   - Remove `lineupDragPrevX`
   - Remove `lineupDragVelocityX`
   - Remove `lineupPointerTracking`
   - Remove `startLineupPointerTracking`
   - Remove `stopLineupPointerTracking`
   - Remove `onLineupPointerMove`
   - Remove `onLineupPointerUp`
6. Preserve BoosterPack-specific parallel data ordering:
   - `lineupSprites`
   - `lineupDice`
   - `lineupLockIcons`
7. In BoosterPack, when sprites reorder, also reorder `lineupDice` and `lineupLockIcons` atomically in the same callback.
8. Replace hardcoded drag threshold `8` with the shared pointer session threshold behavior.
9. Add a `destroy` or `stop` call for the helper during scene shutdown.

## Behavioral Requirements

- Mouse drag reorder still works in the Game roll row.
- Touch drag reorder still works in the Game roll row.
- Equipment and consumable card reorder still works.
- BoosterPack dice lineup reorder still works.
- Tapping a BoosterPack die without dragging still selects/deselects it.
- Dragging a BoosterPack die does not also toggle selection.
- Lock icons continue to follow their dice after reorder.
- Tooltip suppression during dice/card drag still works.
- Store-backed reorder still happens after card settle, not before, for `CardBar`.

## Pitfalls

- Do not break CardBar's deferred `onReorder` timing. It currently waits for the settle tween to complete.
- Do not forget touch `pointerupoutside`; keep using `createPointerDragSession`.
- Do not leave the old BoosterPack pointer handlers registered.
- Do not mutate `lineupDice` without also mutating `lineupLockIcons`.
- Do not change dice selection rules while cleaning up drag.

## Acceptance Criteria

- `BoosterPackScene` no longer contains a manual pointermove/pointerup drag state machine for lineup dice.
- Shared settle tween logic exists in one helper.
- `rollDiceDragReorder.ts` is smaller and delegates common behavior.
- `CardBar.ts` has less drag bookkeeping, not more.
- No new `as any` casts are introduced.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
