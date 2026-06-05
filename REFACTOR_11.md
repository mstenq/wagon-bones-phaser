# Refactor 11: Collapse Modal Shell Duplication

## Goal

Make catalog/list modals reuse the general modal shell primitives instead of carrying their own duplicated shell chrome.

This is a follow-up to `REFACTOR_5.md` and `REFACTOR_6.md`.

## Why

`modalShell.ts` now owns shared modal chrome:

- dim background
- panel background
- title
- common back/close button placement helpers

`catalogModal.ts` shares list and scroll behavior between `BossTestModal` and `EquipmentCatalogModal`, but it still recreates dim/panel/title/close-button chrome directly. That means the refactor reduced duplication between two catalog modals while introducing a second modal shell path.

## Files To Inspect First

- `src/phaser/ui/modalShell.ts`
- `src/phaser/ui/catalogModal.ts`
- `src/phaser/ui/BossTestModal.ts`
- `src/phaser/ui/EquipmentCatalogModal.ts`
- `src/phaser/ui/Button.ts`

## Current Smell

`catalogModal.ts` directly creates:

- dim graphics
- panel graphics
- title text
- close button
- panel frame

Most of that overlaps with `modalShell.ts`. Catalog-specific code should focus on:

- list viewport
- clipping bands
- scroll input
- row rendering hooks

## Target Shape

`catalogModal.ts` should compose `modalShell.ts`.

Possible approach:

1. Extend `modalShell.ts` with a lower-level `createModalShellFromLayout()` if the current option shape is too settings-modal-specific.
2. Or adapt `createCatalogModalShell()` to call:
   - `createModalDim`
   - `createModalPanel`
   - `createModalTitle`
   - a shared close/back button helper
3. Keep catalog clipping and scroll setup local to `catalogModal.ts`.

Do not force all modals into the exact same layout options if that makes call sites awkward. The point is one chrome implementation, not one giant modal abstraction.

## Implementation Plan

1. Read `modalShell.ts` and `catalogModal.ts` end-to-end.
2. Identify which catalog shell objects duplicate modal-shell primitives.
3. Add any missing primitive to `modalShell.ts` only if more than one modal shape needs it.
4. Replace catalog dim/panel/title/close construction with modal-shell helpers.
5. Keep catalog-specific cover bands, list frame, scroll container, and scroll input unchanged.
6. Ensure `destroyManagedObjects()` still destroys every scene-owned object it creates or tracks.
7. Verify `BossTestModal` and `EquipmentCatalogModal` still close and scroll correctly.

## Behavioral Requirements

- Equipment catalog layout remains visually unchanged unless shell standardization intentionally changes a shared value.
- Boss test modal layout remains visually unchanged.
- Scroll input and clipping still work.
- Close button behavior is unchanged.
- Modal dim background still blocks clicks behind the modal.
- No game-domain imports are added to shared modal helpers.

## Pitfalls

- Do not create a third shell helper.
- Do not make `modalShell.ts` know about catalogs, bosses, equipment, or scroll lists.
- Do not break depth ordering; catalog clipping/cover bands currently depend on explicit depths.
- Do not lose cleanup for objects created outside the parent container.
- Do not introduce inheritance for modal sharing.

## Acceptance Criteria

- Modal dim/panel/title/close chrome lives in one shared path.
- `catalogModal.ts` owns catalog/list behavior only.
- `BossTestModal` and `EquipmentCatalogModal` are still domain-specific wrappers over the shared catalog helper.
- Fallow duplicate output between modal shell and catalog modal is reduced.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
