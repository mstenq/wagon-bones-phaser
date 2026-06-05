# Refactor 6: Extract Catalog Modal Base

## Goal

Remove duplicated modal/list rendering between:

- `src/phaser/ui/BossTestModal.ts`
- `src/phaser/ui/EquipmentCatalogModal.ts`

Create a focused shared catalog/list modal primitive that both modals can use.

## Why

Fallow reported large clone groups between these files:

- around 65 lines for modal/list setup
- around 28 lines for item row/card rendering
- additional smaller duplicates around text and button layout

These modals are not identical in behavior, but they share enough structure that the duplication makes future modal changes harder.

## Files To Inspect First

- `src/phaser/ui/BossTestModal.ts`
- `src/phaser/ui/EquipmentCatalogModal.ts`
- `src/phaser/ui/Button.ts`
- `src/phaser/ui/modalShell.ts` if Step 5 already exists

## Target Shape

Add a reusable base/helper, for example:

- `src/phaser/ui/CatalogModal.ts`

Avoid subclassing unless it clearly simplifies the result. A function-based builder is likely better:

```ts
export interface CatalogModalOptions<T> {
  title: string;
  items: T[];
  getItemKey: (item: T) => string;
  renderItem: (item: T, index: number, ctx: CatalogItemRenderContext) => Phaser.GameObjects.GameObject;
  onClose?: () => void;
}
```

The shared helper should own:

- modal panel shell
- title
- close button
- scroll/list container if both modals use it
- row spacing
- clipping/mask if currently duplicated
- common empty-state rendering if needed

Each modal should still own:

- boss-specific test actions
- equipment-specific catalog data and filtering
- item-specific text and callbacks

## Implementation Plan

1. Read both modal files end-to-end.
2. Mark the duplicated responsibilities:
   - shell/panel
   - title/close
   - scroll/list layout
   - row/card chrome
   - button placement
3. If Step 5 added `modalShell.ts`, reuse it here. Do not create a second shell helper.
4. Add `CatalogModal.ts` or `catalogModal.ts`.
5. Migrate `EquipmentCatalogModal` first:
   - It is likely closer to a generic catalog.
   - Keep all equipment-specific filtering/rendering in the caller.
6. Migrate `BossTestModal` second:
   - Keep dev/test behavior local.
7. Remove duplicated local shell/list code.
8. Check whether any row rendering duplication remains. If only trivial text placement remains, leave it.

## Design Rules

- The shared catalog helper should not import game data modules directly.
- It should accept data and renderer callbacks from the caller.
- It should not know about bosses or equipment.
- It should not become a full UI framework.
- It should be easy to delete if the two modals diverge later.

## Behavioral Requirements

- Equipment catalog still lists the same equipment with the same text/images.
- Boss test modal still performs the same dev/test actions.
- Close/back behavior is unchanged.
- Scroll behavior, if present, is unchanged.
- Modal dimensions are unchanged unless the shared shell from Step 5 intentionally standardizes them.

## Pitfalls

- Do not collapse boss-specific and equipment-specific logic into a generic union type.
- Do not move dev-only boss test logic into a shared UI helper.
- Do not introduce inheritance just to share 20 lines.
- Do not duplicate modal shell code if Step 5 already extracted it.

## Acceptance Criteria

- The largest duplicate blocks between `BossTestModal` and `EquipmentCatalogModal` are gone.
- Shared modal/list code has no game-domain imports.
- Both modals remain readable and smaller.
- Fallow duplicate output for these two files is reduced.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
