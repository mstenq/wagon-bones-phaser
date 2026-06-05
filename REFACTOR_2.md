# Refactor 2: Extract Click-Away Action-Tab Dismissal

## Goal

Centralize the repeated "click outside this active card/tab area to dismiss" behavior used by action tabs.

The helper should be used by:

- `src/phaser/ui/CardBar.ts`
- `src/phaser/scenes/ShopScene.ts`
- `src/phaser/scenes/BoosterPackScene.ts`

## Why

Several files manually install a delayed scene-level `pointerdown` handler that:

- runs after a short delay
- calls `input.hitTestPointer(pointer)`
- checks whether the active card or one of its children was clicked
- dismisses the active tabs otherwise
- unregisters the previous handler

ShopScene contains this logic more than once. BoosterPackScene has a more complex version because lineup dice also count as inside clicks. CardBar has another version.

This is duplicated control flow and a common source of leaks if a handler is not removed on shutdown.

## Files To Inspect First

- `src/phaser/ui/CardBar.ts`
- `src/phaser/scenes/ShopScene.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/ui/ItemCard.ts`

## Target Shape

Add a small helper, for example:

- `src/phaser/ui/clickAwayDismiss.ts`

The helper should install and return a cleanup function:

```ts
export interface ClickAwayDismissOptions {
  delayMs?: number;
  isInside: (hitObjects: Phaser.GameObjects.GameObject[], pointer: Phaser.Input.Pointer) => boolean;
  onDismiss: () => void;
}

export function installClickAwayDismiss(
  scene: Phaser.Scene,
  options: ClickAwayDismissOptions,
): () => void;
```

The helper owns:

- delayed install via `scene.time.delayedCall`
- `scene.input.on('pointerdown', handler)`
- `scene.input.off('pointerdown', handler)`
- cleanup if called before the delay fires

It should not know about cards, tabs, shops, packs, or dice. Call sites provide `isInside`.

## Additional Helper

Add a small reusable hit-test helper:

```ts
export function hitIncludesObjectOrChild(
  hitObjects: Phaser.GameObjects.GameObject[],
  target: Phaser.GameObjects.GameObject | null,
): boolean;
```

It should return true when:

- `target` is directly in `hitObjects`
- a hit object's `parentContainer` is `target`

If a call site needs deeper parent traversal, implement it explicitly and test it by behavior.

## Implementation Plan

1. Add `clickAwayDismiss.ts`.
2. Replace `dismissHandler` management in `CardBar` with a cleanup function:
   - old field: `dismissHandler`
   - new field: `dismissClickAway: (() => void) | null`
3. Replace ShopScene's duplicated dismiss installation with the helper.
4. Replace BoosterPackScene's dismiss installation with the helper.
5. For BoosterPackScene, keep the extra "inside" rules:
   - active card container
   - active `ItemCard`
   - action tabs
   - lineup dice
   - lineup dice children
6. Ensure each class calls the cleanup function in:
   - normal dismiss
   - card removal
   - scene shutdown or destroy
7. Remove dead `dismissHandler` fields after migration.

## Behavioral Requirements

- Clicking an active card does not dismiss its tabs.
- Clicking an action tab does not dismiss before the tab callback runs.
- Clicking outside dismisses the active tabs.
- In BoosterPack, clicking lineup dice does not dismiss tabs when a dice-selection card is active.
- Dismiss cleanup still runs when cards are sold, used, destroyed, or scenes shut down.

## Pitfalls

- Do not make the helper depend on `ItemCard`. It should be a UI input primitive.
- Do not skip the delayed install. Existing code delays to avoid the opening click immediately dismissing the tab.
- Do not leave old handlers registered.
- Do not use `setTimeout`; use Phaser's scene clock.
- Do not inspect private `ItemCard` state from scenes.

## Acceptance Criteria

- There is one shared click-away dismiss helper.
- `ShopScene` no longer has two local copies of the same dismiss-handler logic.
- `CardBar` uses the helper.
- `BoosterPackScene` uses the helper and preserves lineup dice exceptions.
- No new `as any` casts are introduced.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
