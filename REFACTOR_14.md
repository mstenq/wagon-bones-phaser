# Refactor 14: Continue Scene Hotspot Decomposition

## Goal

Continue reducing `GameScene`, `BoosterPackScene`, and `ShopScene` complexity by extracting cohesive UI/input controllers and deleting duplicated scene-local helpers.

This is a continuation of `REFACTOR_8.md`, not a rewrite. Extract one clean responsibility at a time.

## Why

After the first decomposition pass, the scenes are smaller but still own too many UI state machines and category dispatch paths.

Fallow still identifies these as high-risk hotspots:

- `src/phaser/scenes/GameScene.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/scenes/ShopScene.ts`

The right next move is not to invent a scene framework. It is to keep extracting obvious cohesive controllers until scenes mostly coordinate shared helpers.

## Files To Inspect First

- `src/phaser/scenes/GameScene.ts`
- `src/phaser/scenes/game/RollRowController.ts`
- `src/phaser/scenes/game/RollMarqueeSelection.ts`
- `src/phaser/scenes/game/ScoreRowLayout.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/scenes/ShopScene.ts`
- `src/phaser/scenes/game/diceRowGeometry.ts`
- `src/phaser/playback/PlaybackRunner.ts`
- `src/game/facade/`

## Candidate Extraction 1: Game Consumable Targeting

Create a controller under `src/phaser/scenes/game/`, for example:

- `GameConsumableTargetingController.ts`

Owns:

- entering/exiting consumable targeting
- visible target ids
- confirm/cancel buttons
- saved selected/reroll-locked dice ids
- target instruction text coordination
- target die click handling where it is purely UI selection

Keep in `GameScene`:

- calls into `gameFacade.consumable`
- scene transition decisions
- high-level phase coordination

Acceptance:

- `GameScene` no longer owns all consumable targeting fields directly.
- Consumable targeting works for roll-row and play-area dice as before.
- Gameplay rules remain in `src/game/` and facade calls.

## Candidate Extraction 2: Game Play-Area Dice Layout

Create a small controller under `src/phaser/scenes/game/`, for example:

- `PlayAreaDiceController.ts`

Owns:

- pre-roll hand dice sprites
- play-area row positioning
- play-area arc/depth/lift behavior
- pointer wiring for consumable-target clicks
- cleanup

Reuse:

- `diceRowGeometry.ts`
- `DiceSprite`

Acceptance:

- `GameScene.createDiceRow`, `getPlayAreaXPositions`, and `repositionPlayArea` move out or collapse into the controller.
- Draw/select phase layout behavior remains unchanged.

## Candidate Extraction 3: BoosterPack Card-Use Dispatcher

Split `BoosterPackScene.onUseCard()` into a small dispatcher and category-specific handlers.

Possible shape:

```ts
type PackCardUseOutcome = {
  queuedPlayback: boolean;
  equipmentPopInCount: number;
  consumableResult?: UseConsumableResult;
};
```

Targets:

- dice selection validation/application
- equipment acquisition
- dice acquisition
- consumable direct-use categories
- instant effects
- shared finish/animation path

Acceptance:

- `onUseCard()` becomes high-level orchestration.
- Category-specific logic is readable without scanning the full method.
- Playback draining and finish behavior stay serialized as before.

## Candidate Extraction 4: Shop Card Interaction Helpers

Reduce repeated shop card hover/open/buy flows.

Targets:

- shared hover scale behavior
- active-card tab open/dismiss
- common buy success/failure animation
- common pack hydration helper

Acceptance:

- Fallow duplicate groups inside `ShopScene.ts` are reduced.
- Shop equipment, consumable, permit, and pack interactions behave as before.
- Do not hide shop-specific business rules inside generic UI helpers.

## Candidate Extraction 5: Shared Dice Row Geometry Adoption

Finish adopting `src/phaser/scenes/game/diceRowGeometry.ts`.

Targets:

- `BoosterPackScene.getArcOffset`
- `BoosterPackScene.getLineupRowXPositions`
- any remaining local row-position helpers that duplicate `getRowXPositions`

Acceptance:

- Dice row X/arc math has one implementation.
- BoosterPack lineup layout is visually unchanged.

## Implementation Plan

1. Run Fallow audit and note current introduced complexity/duplication counts.
2. Pick one candidate extraction only.
3. Read all call sites for the state being moved.
4. Extract the smallest cohesive controller/helper that owns that state.
5. Delete the old scene fields/methods immediately after migration.
6. Run `bun run typecheck`.
7. Smoke test the affected scene behavior manually if possible.
8. Repeat for the next candidate only after the previous one is stable.

## Behavioral Requirements

- Game roll/select/score flow remains unchanged.
- Consumable targeting remains unchanged.
- BoosterPack card use and dice selection remain unchanged.
- Shop buy/sell/reroll/permit flows remain unchanged.
- Playback commands still drain in order.
- Resize/shutdown cleanup remains correct.

## Pitfalls

- Do not create Phaser Scene subclasses for controllers.
- Do not make controllers read global stores secretly when callbacks/accessors are clearer.
- Do not move game rules into Phaser controllers.
- Do not extract code that still needs five mutable scene internals unless those internals move too.
- Do not keep duplicate methods in scenes after extraction.
- Do not batch multiple risky scene extractions without running checks between them.

## Acceptance Criteria

- At least one additional cohesive scene responsibility is extracted.
- The touched scene loses meaningful state/method complexity.
- No gameplay rules move from `src/game/` into Phaser.
- Fallow hotspot/duplication counts improve or stay flat.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
