# Refactor 10: Unify Action-Tab Rendering

## Goal

Delete the remaining parallel action-tab renderer and make all card-like UI use one action-tab implementation.

This is a follow-up to `REFACTOR_2.md` and `REFACTOR_4.md`. Click-away dismissal is shared and `ItemCard` delegates tabs to `ItemCardActionTabs`, but `BoosterPackScene` still renders separate action tabs for plain dice-card containers.

## Why

Fallow still reports clone groups between:

- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/ui/itemCard/ItemCardActionTabs.ts`

The duplicate code covers:

- tab chrome drawing
- hover redraw
- pointerdown callback handling
- slide-out animation
- cleanup tagging

This leaves two implementations for one UI behavior. Future tab changes will drift.

## Files To Inspect First

- `src/phaser/ui/itemCard/ItemCardActionTabs.ts`
- `src/phaser/ui/ItemCard.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/ui/itemCard/itemCardTypes.ts`
- `src/phaser/ui/clickAwayDismiss.ts`

## Current Smell

`ItemCard` has:

```ts
showActionTabs(tabs: CardActionTabConfig[]): void
getActionTabContainers(): GameObjects.Container[]
```

But `BoosterPackScene` still has:

- `showContainerActionTabs`
- `hideContainerActionTabs`
- name-based cleanup with `actionTab`

That means action tabs were extracted for one card type, not made a true shared primitive.

## Target Shape

Create a card-agnostic tab helper under `src/phaser/ui/`, for example:

- `src/phaser/ui/actionTabs.ts`

Possible API:

```ts
export interface ActionTabsOptions {
  scene: Phaser.Scene;
  parent: Phaser.GameObjects.Container;
  layout: {
    cardW: number;
    cardH: number;
    cardScale?: number;
    tabAnchorX?: number;
    rightTabYOffset?: number;
  };
  liftParentForBottomTabs?: boolean;
  sound?: boolean;
}

export interface ActionTabsHandle {
  show(tabs: CardActionTabConfig[]): void;
  hide(animate?: boolean): void;
  getContainers(): Phaser.GameObjects.Container[];
  get visible(): boolean;
}
```

This is only a suggested shape. Keep it concrete and boring. Do not build a general UI framework.

## Implementation Plan

1. Extract the rendering/hover/click/animation code from `ItemCardActionTabs` into a card-agnostic helper.
2. Update `ItemCardActionTabs` to become either:
   - a thin wrapper around the shared helper, or
   - deleted entirely if `ItemCard` can own the shared handle directly.
3. Update `ItemCard` public methods to preserve existing call sites:
   - `showActionTabs`
   - `hideActionTabs`
   - `getActionTabContainers`
   - `tabsVisible`
4. Replace `BoosterPackScene.showContainerActionTabs()` with the shared helper.
5. Replace `BoosterPackScene.hideContainerActionTabs()` with the shared helper.
6. Store tab handles on the relevant `CardSprite` instead of finding children by name.
7. Ensure click-away hit testing includes the shared tab containers for both `ItemCard` and plain dice-card containers.
8. Remove name-based `actionTab` cleanup if it becomes dead.

## Behavioral Requirements

- Equipment/consumable cards still show action tabs in shop and inventory bars.
- Bottom tabs still lift and restore cards.
- BoosterPack dice-card tabs still slide out and click correctly.
- Disabled tabs still render disabled and do not fire callbacks.
- Clicking a tab does not immediately trigger click-away dismissal.
- Click-away dismissal still counts tabs as inside clicks.
- Tab cleanup still runs when cards are used, sold, dismissed, or destroyed.

## Pitfalls

- Do not make the shared helper know about `ItemCard`, shops, packs, dice selection, or game rules.
- Do not keep both the old BoosterPack implementation and the new helper active.
- Do not rely on child names for lifecycle if a typed handle can own cleanup.
- Do not accidentally change tab depth relative to card content.
- Do not break bottom-tab lift restoration when tabs are hidden without animation.

## Acceptance Criteria

- There is one action-tab rendering implementation.
- `BoosterPackScene` no longer has local tab drawing/hover/slide code.
- `ItemCard` keeps its public API for callers.
- Fallow no longer reports action-tab clone groups between BoosterPack and `ItemCardActionTabs`.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
