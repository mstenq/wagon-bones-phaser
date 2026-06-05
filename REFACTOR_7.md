# Refactor 7: Move Shop Die Display Logic To Game Layer

## Goal

Move die display definition logic out of `ShopScene` and into the game/data layer that owns shop stock and die metadata.

Primary target:

- `src/phaser/scenes/ShopScene.ts`

Likely game-layer target:

- `src/game/store/shopStock.ts`
- or a new helper near existing shop stock generation

## Why

`ShopScene` currently builds an equipment-like display definition for shop dice. It creates local maps from dice enhancement and pip sticker data, then returns an `EquipmentDef`-shaped object.

That is game-domain presentation data, not Phaser rendering logic. Fallow reported a cross-layer clone between `src/game/store/shopStock.ts` and `src/phaser/scenes/ShopScene.ts`.

The Phaser scene should receive data that is ready to render, not know how to interpret die enhancement/sticker metadata.

## Files To Inspect First

- `src/phaser/scenes/ShopScene.ts`
- `src/game/store/shopStock.ts`
- `src/game/ConsumablesSystem.ts`
- `src/game/DiceSystem.ts`
- `src/game/types.ts`
- `src/data/dice_enhancements.ts`
- `src/data/pip_enhancements.ts`
- `src/data/items.ts`
- `src/phaser/ui/ItemCard.ts`

## Current Smell

ShopScene has local constants and helper logic similar to:

```ts
const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));
const STICKER_INFO = new Map(pipEnhancements.map((s) => [s.id, s]));

function buildShopDieDisplayDef(die: Die): EquipmentDef {
  // builds name, description, cost, display()
}
```

This should not live in the Phaser scene.

## Target Shape

Expose a game-layer helper such as:

```ts
export function buildShopDieDisplayDef(die: Die): EquipmentDef;
```

or better, if `ShopItem` can be game-owned:

```ts
export interface ShopDieDisplay {
  type: 'dice';
  die: Die;
  displayDef: EquipmentDef;
  cost: number;
}
```

Use the shape that best fits existing `shopStock.ts`.

## Implementation Plan

1. Inspect `shopStock.ts` to understand current stock generation and exported types.
2. Move `DICE_SHOP_COST`, enhancement map, sticker map, and `buildShopDieDisplayDef` into the game layer.
3. Export the helper from the canonical shop-stock module.
4. Update `ShopScene` imports to use the helper.
5. Remove direct imports of `diceEnhancements` and `pipEnhancements` from `ShopScene`.
6. If `ShopScene` defines a local `ShopItem` union only because dice need display data, consider moving that typed shape into `shopStock.ts`.
7. Keep Phaser-specific card construction in `ShopScene`; only move game/data interpretation.
8. Add or update tests if game-layer stock/display helpers already have tests.

## Test Guidance

If there is an existing shop stock test file, add coverage there. If not, add a focused game test in the appropriate existing test area.

At minimum, cover:

- plain die display name/description
- enhanced die display name/description
- sticker display description
- cost remains unchanged

Do not test Phaser rendering.

## Behavioral Requirements

- Shop dice still display the same names.
- Shop dice still display the same tooltip text.
- Shop dice still cost the same amount.
- Buying dice from the shop still works.
- Dev shop behavior still works if it uses the same display helper.

## Pitfalls

- Do not import Phaser into `src/game/`.
- Do not make `shopStock.ts` depend on `ItemCard`.
- Do not broaden `EquipmentDef` with UI-only fields unless the type already supports them.
- Do not preserve duplicate maps in both layers.
- Do not use `as any`; make the return type explicit.

## Acceptance Criteria

- `ShopScene` no longer imports dice enhancement or pip enhancement data directly.
- `buildShopDieDisplayDef` or equivalent lives in `src/game/`.
- The cross-layer duplicate reported by fallow is removed.
- Any added tests are game-logic tests only.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
