# Refactor 8: Begin GameScene Decomposition

## Goal

Make the first safe split of `src/phaser/scenes/GameScene.ts` by extracting cohesive UI/input controllers while preserving behavior.

This is not a full rewrite. The goal is to stop `GameScene` from being the owner of every gameplay UI concern.

## Why

`GameScene.ts` is more than 2,000 lines. It owns:

- shared layout setup
- rolled dice sprites
- held/selected dice movement
- roll-row click handling
- drag reorder wiring
- marquee selection
- scoring phase layout
- consumable targeting
- playback runner callbacks
- floating text
- dev controls
- resize handling

This makes any UI feature risky. The scene should coordinate controllers, not contain all controller internals.

## Files To Inspect First

- `src/phaser/scenes/GameScene.ts`
- `src/phaser/ui/rollDiceDragReorder.ts`
- `src/phaser/ui/DiceSprite.ts`
- `src/phaser/ui/SceneLayout.ts`
- `src/phaser/animations/ScoreAnimation.ts`
- `src/phaser/playback/PlaybackRunner.ts`
- `src/game/facade/`
- `src/game/store/selectors/roundSelectors.ts`

## Extract In This Order

Do not try to split everything at once. Extract one cohesive block, run checks, then continue.

Recommended first pass:

1. `RollMarqueeSelection`
2. `RollRowController`
3. `ScoreRowLayout`
4. `GameSceneDevPanel`

Leave consumable targeting for a later pass unless the first extractions are clean.

## Extraction 1: RollMarqueeSelection

Create:

- `src/phaser/scenes/game/RollMarqueeSelection.ts`

Owns:

- marquee zone creation/destruction
- pointer tracking via `attachPointerDragTrack`
- marquee graphics
- rectangle calculation
- hit testing rolled dice
- cleanup

Inputs:

- `scene`
- `canUseMarquee`
- `getRollSprites`
- `getContentBounds` or specific bounds callback
- `onSpriteHit(sprite, playSound)`
- `onSelectionComplete`

Move these responsibilities out of `GameScene`:

- `rollMarqueeZone`
- `marqueeGfx`
- `marqueeStartX`
- `marqueeStartY`
- `marqueePointerId`
- `marqueeActive`
- `detachMarqueeTrack`
- `setupRollMarqueeZone`
- `createRollMarqueeZone`
- `destroyRollMarqueeZone`
- `stopMarqueeTracking`
- `onMarqueePointerMove`
- `onMarqueePointerUp`
- `drawMarqueeGfx`
- `getDiceWorldBounds`
- `getMarqueeRect`
- `getDiceInMarquee`
- `cleanupMarquee`

Behavior must remain identical.

## Extraction 2: RollRowController

Create:

- `src/phaser/scenes/game/RollRowController.ts`

Owns:

- rolled dice sprite list
- roll row x positions
- pointerdown wiring for dice
- `RollDiceDragReorder`
- roll die click routing
- updating roll buttons callback
- tooltip suppression during drag

Do not move game scoring logic here. This controller should be Phaser input/layout only.

Inputs:

- `scene`
- `contentCenterX`
- spacing constants
- callbacks for click/right-click
- callbacks for drag begin/end
- accessors for current phase/targeting state

Outputs:

- `getRollSprites()`
- `refreshSprites(...)` or explicit add/remove APIs
- `destroy()`

## Extraction 3: ScoreRowLayout

Create:

- `src/phaser/scenes/game/ScoreRowLayout.ts`

Owns:

- selected dice score row positions
- held dice row positions
- score phase enter/exit layout tweens
- score layout gate promise if possible

This extraction should reduce the amount of layout math inside `GameScene`.

Keep scoring rules and score calculation in existing game/facade paths.

## Extraction 4: GameSceneDevPanel

Create:

- `src/phaser/scenes/game/GameSceneDevPanel.ts`

Owns dev-only controls:

- loaded dice controls
- sync/clear buttons
- dev button font-size tweaks
- any dev panel display labels

Inputs should be callbacks into `GameScene` or game facade. Do not move production UI into this panel.

## Implementation Plan

1. Create `src/phaser/scenes/game/` folder.
2. Extract `RollMarqueeSelection` first.
3. Wire it into `GameScene.create` or `finishBuildLayout`.
4. Delete old marquee fields/methods from `GameScene`.
5. Run typecheck.
6. Extract `RollRowController`.
7. Replace direct roll sprite manipulation only where ownership is clear.
8. Run typecheck and manual smoke test.
9. Extract `ScoreRowLayout`.
10. Run typecheck and smoke test scoring phase.
11. Extract `GameSceneDevPanel`.
12. Remove dead imports/fields.

## Behavioral Requirements

- Rolling dice still displays the same row.
- Clicking dice still selects/lifts as before.
- Right-click behavior still works.
- Drag reorder still works.
- Marquee select still works.
- Scoring phase still lays out selected/held dice correctly.
- Score animations still receive the same sprite references.
- Consumable targeting still works after extraction.
- Dev controls still work in dev mode.
- Resize behavior remains correct.

## Pitfalls

- Do not move game logic into scene controllers.
- Do not make controllers import stores directly unless the scene already did and the ownership is clearly UI selection state.
- Prefer callbacks/accessors over hidden global reads for controller coordination.
- Do not extract code that still needs five mutable `GameScene` internals unless you also move those internals.
- Do not make controllers subclasses of Phaser Scene.
- Do not leave duplicate methods in `GameScene` after extraction.

## Acceptance Criteria

- `GameScene.ts` is meaningfully smaller after this step.
- At least marquee selection and one additional cohesive concern are extracted.
- New files live under `src/phaser/scenes/game/`.
- Extracted modules are Phaser UI/input modules only.
- No gameplay rules move from `src/game/` into Phaser.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
