# Refactor 3: Extract Shared Run Scene Shell Wiring

## Goal

Reduce repeated scene setup for run scenes that share:

- `createLayout`
- sidebar/equipment/consumable bars
- consumable-use handling
- playback runner binding
- scene-ready emission
- resize/shutdown cleanup patterns where applicable

This should keep each scene focused on its unique content.

## Why

Several scenes repeat the same high-level wiring:

- `GameScene`
- `ShopScene`
- `BoosterPackScene`
- `PayoutScene`
- `TrailEventScene`
- `RoundSelectScene`

The repeated sequence is usually:

1. `createLayout(...)`
2. keep references to `sidebar`, `equipBar`, `consumableBar`
3. set consumable predicate
4. listen for `consumable-used`
5. call `bindScenePlaybackRunner(...)`
6. route consumable result through `handleStandardConsumableResult(...)`
7. emit `EventBus.emit(Events.SCENE_READY, this)`

This duplication increases the chance that one scene misses a playback option, uses a different consumable anchor, or forgets a cleanup.

## Files To Inspect First

- `src/phaser/ui/SceneLayout.ts`
- `src/phaser/playback/bindScenePlaybackRunner.ts`
- `src/phaser/playback/PlaybackRunner.ts`
- `src/phaser/scenes/consumableResult.ts`
- `src/phaser/scenes/GameScene.ts`
- `src/phaser/scenes/ShopScene.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/scenes/PayoutScene.ts`
- `src/phaser/scenes/TrailEventScene.ts`
- `src/phaser/scenes/RoundSelectScene.ts`

## Target Shape

Add a helper such as:

- `src/phaser/scenes/runSceneShell.ts`

Possible API:

```ts
export interface RunSceneShellOptions {
  layout?: LayoutOptions;
  consumableReturnScene: string;
  canUseConsumable?: (def: ConsumableDef) => boolean;
  playback?: Omit<ScenePlaybackBindOptions, 'scene' | 'equipBar' | 'consumableBar' | 'sidebar'>;
  consumableCancelAnchor?: () => { x: number; y: number };
}

export interface RunSceneShell {
  layout: LayoutResult;
  playbackRunner: PlaybackRunnerHandle;
  handleConsumableResult: (result: UseConsumableResult) => void;
  destroy: () => void;
}
```

Do not over-generalize. The helper only needs to cover patterns shared by current scenes.

## Implementation Plan

1. Add `runSceneShell.ts`.
2. Move common layout/playback/consumable-bar setup into this helper.
3. Keep scene-specific playback options at the call site:
   - Game dice sprites
   - Game destroy dice callback
   - score layout gate
   - animating flag
   - tag origins
4. Update `PayoutScene` first. It is smaller and lower risk.
5. Update `TrailEventScene` next. It is similar to Payout but has more unique content.
6. Update `ShopScene` after that.
7. Update `BoosterPackScene` only after confirming the helper handles its return scene and playback needs.
8. Update `RoundSelectScene` if the helper genuinely simplifies it.
9. Leave `GameScene` for last or only partially migrate; it has many unique callbacks and should not be forced into the helper if that creates awkward optional fields.
10. Remove dead local fields only where the helper fully owns the lifecycle.

## What Not To Do

- Do not make one giant scene superclass.
- Do not hide scene-specific behavior inside the helper.
- Do not add a long list of nullable callbacks just to support every scene.
- Do not make scene flow implicit.
- Do not change `this.scene.start(...)` data behavior. Continue passing explicit data objects.

## Playback Wrapper Cleanup

While doing this step, inspect whether `bindScenePlaybackRunner.ts` is still useful. It currently mostly forwards options into `bindPlaybackRunner`.

Choose one of these outcomes:

- Keep it if `runSceneShell` makes it a clear convenience boundary.
- Delete it and call `bindPlaybackRunner` directly if the wrapper remains a pass-through.
- Merge duplicated option types so there is one canonical playback context contract.

Do not keep two nearly identical option interfaces.

## Behavioral Requirements

- All migrated scenes still show sidebar, equipment bar, consumable bar, dice pouch/tag stack as before.
- Consumables still work in each migrated scene.
- Playback commands still drain in the same order.
- Scene ready events still fire.
- Auto-save/background music behavior from `createLayout` is preserved.
- Scene-specific anchors for consumable cancel feedback remain correct.

## Acceptance Criteria

- At least `PayoutScene`, `TrailEventScene`, and `ShopScene` use the shared shell or a clearly justified subset of it.
- Repeated layout/playback/consumable setup code is reduced.
- No scene loses unique playback behavior.
- No new inheritance hierarchy is introduced.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
