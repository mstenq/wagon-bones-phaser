# Refactor 13: Split Tooltip Rendering Internals

## Goal

Make `ItemCardTooltip` simpler, smaller, and easier to change without altering tooltip behavior.

This is a follow-up to `REFACTOR_4.md`. The tooltip code moved out of `ItemCard.ts`, but the hard part is still concentrated in one long method.

## Why

`src/phaser/ui/itemCard/ItemCardTooltip.ts` has a high-complexity `show()` method that handles every tooltip concern at once:

- suppression checks
- display resolution
- title creation
- segment measurement
- chip rendering
- rarity line
- aura line
- modifier lines
- background sizing
- screen clamping

This shrank `ItemCard.ts`, but mostly moved complexity around. The next pass should delete complexity by introducing a small tooltip rendering model and focused helpers.

## Files To Inspect First

- `src/phaser/ui/itemCard/ItemCardTooltip.ts`
- `src/phaser/ui/itemCard/itemCardHintStyles.ts`
- `src/phaser/ui/itemCard/itemCardTypes.ts`
- `src/phaser/ui/ItemCard.ts`
- `src/game/EquipmentModifierDisplay.ts`
- `src/game/displayContext.ts`

## Target Shape

Keep `ItemCardTooltip` as the public helper owned by `ItemCard`, but split internals into small pure-ish helpers where possible.

Suggested helpers:

```ts
type TooltipLine =
  | { kind: 'segments'; row: HintSegment[] }
  | { kind: 'text'; text: string; color: string; fontStyle?: string; gapTop?: number };
```

Possible functions:

- `buildTooltipLines(...)`
- `measureSegmentRow(scene, row)`
- `renderSegmentRow(scene, row, measurements, y)`
- `renderTextLine(scene, line, y)`
- `computeTooltipPosition(...)`
- `createTooltipBackground(...)`

The exact names do not matter. The key is that `show()` becomes orchestration.

## Implementation Plan

1. Read `ItemCardTooltip.show()` end-to-end and write down the current visual order.
2. Extract tooltip line/model construction:
   - display tooltip rows
   - rarity label
   - aura line
   - modifier lines
3. Extract segment-row measurement into a helper.
4. Extract segment-row rendering into a helper.
5. Extract plain/meta text rendering into a helper.
6. Extract background creation and position clamping.
7. Keep the existing public methods unchanged:
   - `setContext`
   - `setSuppressTooltip`
   - `setInteractionTooltipSuppressed`
   - `setFaceDown`
   - `show`
   - `hide`
   - `destroy`
8. Run Fallow health/audit and confirm `ItemCardTooltip.show()` complexity drops.

## Behavioral Requirements

- Tooltip title, colors, rarity text, aura text, modifier lines, and hint chips render as before.
- Dynamic item display text remains state-aware.
- Tooltip suppress/face-down behavior remains unchanged.
- Tooltip placement still flips to the right when there is not enough left-side space.
- Tooltip stays clamped inside the scene bounds.
- Hover show/hide behavior remains unchanged.

## Pitfalls

- Do not change `ItemCard`'s public API.
- Do not introduce Phaser dependencies into game logic.
- Do not make static tooltip text replace dynamic `display()` output.
- Do not over-model this into a generic rich text framework.
- Do not accidentally leak temporary measurement text objects.

## Acceptance Criteria

- `ItemCardTooltip.show()` is mostly orchestration.
- Tooltip helper functions have clear single responsibilities.
- Tooltip visuals are unchanged in normal, shop, aura, and modifier cases.
- Fallow complexity for `ItemCardTooltip.show()` drops materially.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
