# Refactor 4: Split ItemCard Concerns

## Goal

Turn `src/phaser/ui/ItemCard.ts` from a 1k+ line god object into a small façade composed from focused helpers.

Preserve the public behavior of `ItemCard` while moving tooltip, hint, action-tab, aura, and badge logic into dedicated modules.

## Why

`ItemCard` currently owns too many responsibilities:

- card chrome/background
- item image rendering
- price/sell overlays
- disabled and face-down overlays
- modifier badges
- aura glow and particles
- dynamic hints
- tooltip layout
- action tab layout and animation
- removal preparation

Fallow highlighted high-complexity methods including:

- `showTooltip`
- `showActionTabs`
- `addContent`
- `updateHints`

This makes small UI changes risky because unrelated card systems share private fields and rendering lifecycle.

## Files To Inspect First

- `src/phaser/ui/ItemCard.ts`
- `src/phaser/ui/AuraFX.ts`
- `src/phaser/ui/ModifierAssets.ts`
- `src/phaser/ui/CardBar.ts`
- `src/phaser/scenes/ShopScene.ts`
- `src/phaser/scenes/BoosterPackScene.ts`

## Target Modules

Create focused modules under `src/phaser/ui/itemCard/` or as sibling files. Prefer a folder if more than three helpers are introduced.

Suggested split:

- `itemCardTypes.ts`
  - `CardData`
  - `ItemCardOptions`
  - `CardActionTabConfig`
  - internal render metrics/types
- `ItemCardChrome.ts`
  - card background
  - shadow
  - sold overlay
  - face-down cover
  - disabled overlay
- `ItemCardContent.ts`
  - item image
  - name/rarity/cost/sell text
  - image fit logic
- `ItemCardHints.ts`
  - `updateHints`
  - hint segment rendering
  - hint cleanup
- `ItemCardTooltip.ts`
  - tooltip construction
  - tooltip positioning
  - tooltip cleanup
- `ItemCardActionTabs.ts`
  - right tabs
  - bottom tabs
  - tab hover redraw
  - tab lift amount
- `ItemCardBadges.ts`
  - modifier badges
  - perishable/leased/profession special badges
- `ItemCardAuras.ts`
  - aura sync, particles, glow cleanup

If this many files feels too granular during implementation, combine closely related concerns. The important rule is that `ItemCard.ts` should no longer own tooltip, hints, and tabs inline.

## Public API To Preserve

Before editing, list every public method/property currently used outside `ItemCard.ts`. Preserve names unless there is a strong reason to migrate call sites.

Known public surface includes:

- constructor
- `def`
- `equipment`
- `sold`
- `markSold`
- `prepareForRemoval`
- `setTooltipContext`
- `setSuppressTooltip`
- `setInteractionTooltipSuppressed`
- `setSuppressHints`
- `updateHints`
- `showActionTabs`
- `hideActionTabs`
- `setBossDisabled`
- `setFaceDown`
- `updateModifierBadges`
- `syncAuraFromEquipment`
- modifier flash/animation methods

Use `rg "new ItemCard|\\.showActionTabs|\\.hideActionTabs|\\.updateHints|\\.setTooltipContext"` to find call sites.

## Implementation Plan

1. Move type exports first. Keep re-exports from `ItemCard.ts` so imports do not all change at once.
2. Extract action tabs next. This is high-value and needed by other refactors.
3. Add a public method to replace private action-tab introspection:
   - `getActionTabContainers(): Phaser.GameObjects.Container[]`
   - or `containsActionTabHit(hitObjects: Phaser.GameObjects.GameObject[]): boolean`
4. Remove `BoosterPackScene`'s `(itemCard as any).actionTabs` access and use the new public API.
5. Extract tooltip code. Keep tooltip behavior identical.
6. Extract hint rendering. Keep hint styles and positions identical.
7. Extract badge rendering.
8. Extract aura rendering/cleanup. This may require typing improvements in `AuraFX`.
9. Extract content/chrome last, once the moving parts are smaller.
10. Keep `ItemCard.ts` as the façade that owns high-level lifecycle and delegates.

## Type Cleanup

Avoid introducing new `any` casts. Existing casts should be removed where practical:

- Replace private action-tab casts with public APIs.
- Give helper classes explicit constructor dependencies.
- If Phaser's type definitions require a cast for filters or graphics, keep the cast local to the lowest-level helper and document why.

## Behavioral Requirements

- Equipment cards render exactly as before.
- Consumable cards render exactly as before.
- Shop cards render exactly as before.
- Action tabs still open, hover, click, disable, and hide correctly.
- Bottom tabs still lift the card and restore it on hide.
- Tooltips still show dynamic display text and modifier lines.
- Boss hidden/disabled states still work.
- Aura visuals still apply and clean up.
- Modifier badges still update in place.

## Pitfalls

- Do not change card dimensions or origins accidentally.
- Do not break compact vs shop mode.
- Do not make helper classes reach back into `ItemCard` private state through casts.
- Do not move game logic into Phaser helpers.
- Do not leave duplicate tooltip or tab render paths after extraction.

## Acceptance Criteria

- `ItemCard.ts` is substantially smaller and mostly delegates.
- Tooltip code lives outside `ItemCard.ts`.
- Action-tab code lives outside `ItemCard.ts`.
- BoosterPack no longer reads private `ItemCard` fields through `as any`.
- No user-visible card rendering regressions.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
