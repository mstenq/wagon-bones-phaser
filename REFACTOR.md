# Phaser UI Refactor Plan

This plan breaks the Phaser-side UI cleanup into eight handoff-ready steps. The goal is to reduce duplicated input/action-tab code, split oversized UI classes, and move feature logic back to the layer that owns it without changing gameplay behavior.

The work is ordered by dependency and risk. Earlier steps remove duplicated primitives and make later decomposition easier. Later steps tackle large files and cross-layer cleanup.

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

## Suggested Execution Order

Do the steps in numeric order. Steps 1 and 2 are the highest-leverage cleanup and should land first. Steps 3 through 7 can be separate PRs once the shared primitives are in place. Step 8 is intentionally a first decomposition pass, not a full rewrite.

## Shared Review Checklist

For every step:

- Confirm there are no accidental behavior changes in the affected scenes.
- Verify touch and mouse input paths where input behavior changed.
- Remove dead fields and helpers after migration.
- Do not leave both old and new abstractions active for the same responsibility.
- Avoid adding compatibility shims for unshipped branch work.
- Keep docs and comments concise.

## Baseline Problem Summary

The Phaser layer currently has strong primitives, but they are not applied consistently:

- `pointerDragTrack.ts` and `pointerDragSession.ts` exist, but `BoosterPackScene` still has a full bespoke dice-lineup drag state machine.
- `CardBar` centralizes many card-bar behaviors, but Shop and BoosterPack scenes still reimplement action-tab open/dismiss behavior.
- `createLayout()` handles shared chrome, but scenes repeat layout/playback/consumable wiring.
- `ItemCard.ts`, `GameScene.ts`, `ShopScene.ts`, and `BoosterPackScene.ts` are oversized and hard to change safely.
- Fallow reported many Phaser clone groups, especially around drag settle tweens, action tabs, modal shells, and catalog/modal list rendering.

The refactor should make the existing architecture more consistent rather than inventing a new UI framework.
