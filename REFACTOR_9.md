# Refactor 9: Finish Shop Stock Ownership

## Goal

Move the remaining weighted shop stock generation policy out of `ShopScene` and into the game layer that already owns shop stock.

This is a follow-up to `REFACTOR_7.md`. That step moved dice display metadata into `src/game/store/shopStock.ts`, but `ShopScene` still owns a second one-off stock generator for permit-driven slot expansion.

## Why

`ShopScene.generateOneStockItem()` still duplicates game-domain policy:

- category weights from `SHOP_WEIGHTS`
- permit dice checks through `hasPermitDiceInShop`
- RNG category selection through `rngFloat('shop')`
- owned/current-stock exclusion
- equipment / consumable / dice row creation

Fallow still reports a clone between `src/game/store/shopStock.ts` and `src/phaser/scenes/ShopScene.ts`.

The Phaser scene should not know how to roll shop stock. It should hydrate store rows into renderable cards and coordinate UI.

## Files To Inspect First

- `src/phaser/scenes/ShopScene.ts`
- `src/game/store/shopStock.ts`
- `src/game/store/sceneStore.ts`
- `src/game/store/types.ts`
- `src/game/__tests__/store/shopStock.test.ts`
- `src/game/facade/shop.ts`
- `src/game/PermitsSystem.ts`

## Current Smell

`ShopScene` appends new stock after buying a permit:

```ts
while (this.stockItems.length < newSlotCount) {
  this.stockItems.push(this.generateOneStockItem());
}
```

The helper it calls duplicates stock generation from `shopStock.ts`. That means new shop rules can drift between normal shop open/reroll and permit slot expansion.

## Target Shape

Add a game-layer helper in `src/game/store/shopStock.ts`, for example:

```ts
export function generateAdditionalShopStockRows(
  existingRows: ShopStockGenRow[],
  targetSlotCount: number,
  run?: RunState,
): ShopStockGenRow[];
```

or:

```ts
export function appendShopStockRowsForSlots(
  rows: ShopStockGenRow[],
  targetSlotCount: number,
  run?: RunState,
): ShopStockGenRow[];
```

Use whichever shape best preserves the existing `generateShopStockRows` / `shopRowsToStored` flow.

The game-layer helper should:

- preserve existing stock rows
- append only enough rows to reach the new slot count
- exclude owned items and existing stock item ids
- use the same stock category selection path as normal generation
- return rows that can be serialized with `shopRowsToStored`

## Implementation Plan

1. Extract the weighted category selection inside `generateShopStockRows` into a small game-layer helper.
2. Extract row creation for one category into a game-layer helper.
3. Add a public append helper for permit slot expansion.
4. Update `ShopScene.onBuyPermit()` to call the helper and hydrate/serialize rows instead of generating stock itself.
5. Remove `ShopScene.generateOneStockItem()`.
6. Remove `ShopScene.getOwnedItemIds()` if it only supported one-off stock generation.
7. Remove scene imports that are no longer needed:
   - `SHOP_WEIGHTS`
   - `rngFloat`
   - `generateShopDie`
   - `hasPermitDiceInShop`
   - random consumable helpers used only by stock generation
8. Add tests in `src/game/__tests__/store/shopStock.test.ts`.

## Test Guidance

Use game-layer tests only. Do not test Phaser rendering.

Cover:

- appending rows preserves existing stock rows
- appending rows reaches the new slot count
- appended equipment/consumables exclude owned ids and existing stock ids
- dice rows can still appear when dice-shop permits are active
- no rows are appended when existing stock already meets or exceeds the target slot count

If randomness makes a precise category assertion brittle, use the existing repeated-roll style from `shopStock.test.ts`.

## Behavioral Requirements

- Buying a permit that increases shop slots still keeps existing visible stock.
- Newly unlocked slots still fill with valid stock.
- Shop reroll behavior stays unchanged.
- Initial shop open behavior stays unchanged.
- Stored scene shop state stays serializable and loadable.
- Dev shop swaps still work.

## Pitfalls

- Do not move Phaser card construction into `src/game/`.
- Do not make `shopStock.ts` depend on `ItemCard`, scenes, or Phaser.
- Do not duplicate exclusion logic in both scene and store.
- Do not accidentally reroll existing shop rows after buying a permit.
- Do not forget equipment previews; stored equipment rows need a preview instance.

## Acceptance Criteria

- `ShopScene` no longer owns weighted stock generation.
- `ShopScene` no longer imports stock-generation dependencies that belong to `src/game/`.
- Permit shop-slot expansion is covered in `shopStock.test.ts`.
- Fallow no longer reports the `shopStock.ts` / `ShopScene.ts` stock-generation clone.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
