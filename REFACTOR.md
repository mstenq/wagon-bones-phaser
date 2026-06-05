# Phaser UI Refactor Plan

This plan tracks the Phaser-side UI cleanup across handoff-ready steps. The goal is to reduce duplicated input/action-tab code, split oversized UI classes, and move feature logic back to the layer that owns it without changing gameplay behavior.

The work is ordered by dependency and risk. Earlier steps remove duplicated primitives and make later decomposition easier. Later steps tackle large files, cross-layer cleanup, and follow-up quality issues surfaced by Fallow.

## Guardrails

- Preserve gameplay behavior and scene flow.
- Keep `src/game/` Phaser-free except for the existing allowed bridge files.
- Prefer deleting bespoke UI state machines over wrapping them.
- Keep scene-specific code in scenes only when it truly coordinates scene content.
- Avoid nested ternaries.
- Use `bun` only. Do not use `npm`, `npx`, or `yarn`.
- After substantive implementation work, run:
  - `bun run typecheck`
  - `bun run check`
  - `bun run build` when Phaser scenes, Vite config, or production bundle behavior changed.

## Step Index

1. `REFACTOR_1.md` - Consolidate horizontal drag reorder.
2. `REFACTOR_2.md` - Extract click-away action-tab dismissal.
3. `REFACTOR_3.md` - Extract shared run scene shell wiring.
4. `REFACTOR_4.md` - Split `ItemCard` concerns.
5. `REFACTOR_5.md` - Extract settings modal shell and break modal cycles.
6. `REFACTOR_6.md` - Extract catalog modal base.
7. `REFACTOR_7.md` - Move shop die display logic to game layer.
8. `REFACTOR_8.md` - Begin `GameScene` decomposition.
9. `REFACTOR_9.md` - Finish shop stock ownership.
10. `REFACTOR_10.md` - Unify action-tab rendering.
11. `REFACTOR_11.md` - Collapse modal shell duplication.
12. `REFACTOR_12.md` - Remove new type-boundary casts.
13. `REFACTOR_13.md` - Split tooltip rendering internals.
14. `REFACTOR_14.md` - Continue scene hotspot decomposition.

## Suggested Execution Order

Do the steps in numeric order. Steps 1 and 2 are the highest-leverage cleanup and should land first. Steps 3 through 7 can be separate PRs once the shared primitives are in place. Step 8 is intentionally a first decomposition pass, not a full rewrite.

Steps 9 through 14 are the continuation pass after the first eight steps. They should focus on deleting remaining duplicated responsibilities rather than adding another layer around them. Each continuation step has its own handoff document.

## Shared Review Checklist

For every step:

- Confirm there are no accidental behavior changes in the affected scenes.
- Verify touch and mouse input paths where input behavior changed.
- Remove dead fields and helpers after migration.
- Do not leave both old and new abstractions active for the same responsibility.
- Avoid adding compatibility shims for unshipped branch work.
- Run `bunx fallow audit --format json --quiet --base HEAD --explain 2>/dev/null || true` after structural refactors and compare against the previous findings.
- Treat new `as any`, `as unknown`, inline type imports, and duplicated scene/game policy as blockers unless there is a clear Phaser typing limitation.
- Keep docs and comments concise.

## Continuation Steps

### 9. Finish Shop Stock Ownership

Move the remaining weighted shop stock policy out of `ShopScene`.

Targets:

- `src/phaser/scenes/ShopScene.ts`
- `src/game/store/shopStock.ts`
- `src/game/__tests__/store/shopStock.test.ts`

Current issue:

- `ShopScene.generateOneStockItem()` still duplicates category weights, dice permit checks, RNG selection, owned-item exclusion, and consumable/equipment selection that belong in `shopStock.ts`.
- Fallow still reports a clone between `shopStock.ts` and `ShopScene.ts`.

Target shape:

- Add a game-layer helper such as `generateAdditionalShopStockRows(existingRows, count, run)` or `generateOneShopStockRow(existingRows, run)`.
- Keep Phaser responsible for rendering and hydrating `ShopItem` objects only.
- Add shop-stock tests for appending slots after permits so the scene no longer owns that rule.

Acceptance:

- `ShopScene` no longer imports `SHOP_WEIGHTS`, `rngFloat`, `generateShopDie`, or random consumable helpers for stock generation.
- Shop slot expansion after buying a permit still preserves existing stock and appends new rows.
- Fallow no longer reports the `shopStock.ts` / `ShopScene.ts` stock-generation clone.

### 10. Unify Action-Tab Rendering

Delete the remaining parallel action-tab renderer.

Targets:

- `src/phaser/ui/itemCard/ItemCardActionTabs.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/ui/ItemCard.ts`

Current issue:

- `ItemCardActionTabs` exists, but `BoosterPackScene.showContainerActionTabs()` still renders a near-copy for plain dice-card containers.
- This leaves old and new action-tab implementations active for the same UI responsibility.

Target shape:

- Extract a card-agnostic action-tab primitive that can attach tabs to any `Phaser.GameObjects.Container`.
- Let `ItemCard` wrap that primitive instead of owning a bespoke tab class.
- Let BoosterPack dice-card containers use the same primitive, with only positioning/layout options supplied by the scene.

Acceptance:

- There is one tab rendering implementation.
- BoosterPack keeps dice-card tab behavior without duplicating hover redraw, slide-out, disabled state, or cleanup.
- Click-away hit testing still works through a public `getActionTabContainers()` or equivalent API.

### 11. Collapse Modal Shell Duplication

Make catalog/list modals reuse the general modal shell instead of carrying a second shell.

Targets:

- `src/phaser/ui/modalShell.ts`
- `src/phaser/ui/catalogModal.ts`
- `src/phaser/ui/BossTestModal.ts`
- `src/phaser/ui/EquipmentCatalogModal.ts`

Current issue:

- `catalogModal.ts` duplicates dim background, panel chrome, title, and close-button setup already extracted in `modalShell.ts`.

Target shape:

- `catalogModal.ts` should compose `createModalShell()` or smaller shell primitives from `modalShell.ts`.
- Keep catalog-specific list viewport, clipping, scroll input, and row rendering in `catalogModal.ts`.

Acceptance:

- Modal dim/panel/title/close chrome lives in one place.
- Catalog helper remains domain-free and does not import boss/equipment data.
- Fallow duplicate output between modal shell and catalog modal is reduced.

### 12. Remove New Type-Boundary Casts

Clean up casts introduced or exposed by the refactor.

Targets:

- `src/phaser/scenes/game/GameSceneDevPanel.ts`
- `src/phaser/ui/Button.ts`
- `src/phaser/scenes/ShopScene.ts`
- Any touched files with new `as any`, `as unknown`, or inline type imports.

Current issue:

- `GameSceneDevPanel` reaches into private `Button.label` through `as any`.
- `ShopScene` still uses cast-heavy permit/pack helpers.

Target shape:

- Add narrow public APIs to shared UI primitives when callers need legitimate styling hooks, such as `Button.setLabelFontSize()`.
- Replace cast-heavy data conversions with explicit types or small typed builders.

Acceptance:

- No new `as any` casts remain from this refactor series.
- No inline type imports are introduced.
- Phaser typing workarounds, if unavoidable, are isolated in the lowest-level rendering helper.

### 13. Split Tooltip Rendering Internals

Do not stop at moving tooltip code out of `ItemCard`; simplify the tooltip renderer itself.

Target:

- `src/phaser/ui/itemCard/ItemCardTooltip.ts`

Current issue:

- `ItemCardTooltip.show()` is still a long high-complexity method. The extraction shrank `ItemCard.ts`, but mostly moved the tooltip pipeline intact.

Target shape:

- Split tooltip work into small helpers:
  - collect tooltip model rows and meta lines
  - measure segment rows
  - render segment rows
  - append rarity/aura/modifier lines
  - clamp tooltip position
- Keep the public `ItemCard` API unchanged.

Acceptance:

- `show()` becomes orchestration rather than layout/rendering internals.
- Tooltip visuals and dynamic display text remain unchanged.
- Fallow complexity for `ItemCardTooltip.show()` drops materially.

### 14. Continue Scene Hotspot Decomposition

Continue the safe scene-controller extraction after Step 8.

Targets:

- `src/phaser/scenes/GameScene.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/scenes/ShopScene.ts`

Likely next extractions:

- Game consumable targeting controller.
- Game play-area dice layout/controller.
- BoosterPack card-use dispatcher that separates category handling from animation/store finalization.
- Shop card purchase controller or helpers for common buy/sell animation and hover behavior.
- Shared dice row geometry adoption in BoosterPack.

Acceptance:

- Scene files coordinate controllers instead of owning each low-level UI state machine.
- No gameplay rules move into Phaser controllers.
- Fallow hotspot and introduced duplication counts improve or stay flat after each pass.

## Baseline Problem Summary

The Phaser layer currently has strong primitives, but they are not applied consistently:

- `pointerDragTrack.ts` and `pointerDragSession.ts` exist, but `BoosterPackScene` still has a full bespoke dice-lineup drag state machine.
- `CardBar` centralizes many card-bar behaviors, but Shop and BoosterPack scenes still reimplement action-tab open/dismiss behavior.
- `createLayout()` handles shared chrome, but scenes repeat layout/playback/consumable wiring.
- `ItemCard.ts`, `GameScene.ts`, `ShopScene.ts`, and `BoosterPackScene.ts` are oversized and hard to change safely.
- Fallow reported many Phaser clone groups, especially around drag settle tweens, action tabs, modal shells, and catalog/modal list rendering.

Post-step-8 review found additional quality work:

- Shop stock ownership is improved but not complete; one-off stock generation still lives in `ShopScene`.
- Action tabs were extracted for `ItemCard`, but BoosterPack still has a second container-tab renderer.
- Catalog modals share list behavior, but duplicate shell chrome instead of reusing `modalShell.ts`.
- Some new helpers expose missing type boundaries through casts rather than public APIs.
- Tooltip code moved out of `ItemCard`, but its internal complexity still needs a real split.

The refactor should make the existing architecture more consistent rather than inventing a new UI framework.
