# REFACTOR 4 — Single Phaser playback runner

**Prerequisites:** [REFACTOR_3.md](./REFACTOR_3.md)  
**Next:** [REFACTOR_5.md](./REFACTOR_5.md)

---

## Goal

One module in Phaser subscribes to `playbackQueue` and plays all commands. Delete scattered `takeUiEffects` usage and `bindConsumableUiEffects`.

---

## REFACTOR 3 handoff

What landed in step 3 — read this before wiring the runner.

### State is applied in logic; runner is visuals only

| Command | Logic already done before enqueue | Runner must NOT |
|---------|-----------------------------------|-----------------|
| `score` | `applyScoringMutations` in `roundActions.calculateScore` | Re-apply mutations or miles |
| `score-events` with `label: 'round-end-held'` | `roundActions.processRoundEndHeldDice` (from `endDay` on `won` / `lost`): blue-moon `applyScoringMutations`, gold `economyActions.earn` | Re-apply consumables or money |

Handlers call `playScoreAnimation` / `playDieAnimEvents` only.

### Round-end held sequencing (required)

After REFACTOR 3, `endDay` enqueues `score-events` / `round-end-held` during `GameScene.onContinue`, but `finishDayEndAfterEquipmentDestroyed` goes straight to `runRoundEndModifierFeedback` — it does **not** wait for that queue.

**Blessed order on leg end (`won` / `lost`):**

1. Deferred equipment destruction anims (existing `animateEndOfRoundSelfDestructs` path)
2. **Drain** `score-events` where `label === 'round-end-held'` (`playDieAnimEvents`)
3. `runRoundEndModifierFeedback` → `transitionAfterRoundEnd`

Implement via runner `onComplete` for that command, or an explicit `await drainPlaybackForLabel('round-end-held')` before modifier feedback. Do not start modifier feedback while round-end held is still queued.

### Interim behavior until this step ships

- **Score:** `enterScorePhase` still calls `playScoreAnimation` directly; `calculateScore` also enqueues `kind: 'score'`. Remove the scene call when the runner handles score or you get double playback.
- **Round-end held:** Commands are enqueued but not consumed on the leg-end path — manual smoke #5 (gold held anim) will fail until the runner drains with the sequencing above.

### Timing note (gold held)

Gold money is earned in logic **before** the held anim is enqueued (old `GameScene` paid after anim). Do not move `economyActions.earn` into the Phaser handler unless you intentionally want the old feel back.

---

## Scope

### Create

| File | Purpose |
|------|---------|
| `src/phaser/playback/PlaybackRunner.ts` | `bindPlaybackRunner(scene, handlers)` |
| `src/phaser/playback/handlers.ts` | Map each `PlaybackCommand.kind` → existing anim functions |

### Delete or gut

| File | Action |
|------|--------|
| `src/phaser/store/consumableUiEffects.ts` | Delete; logic moved to runner |
| Dual-write in `playback/queue.ts` / `runStore` | Remove `uiEffects` mirroring |

### Modify

| File | Change |
|------|--------|
| `src/phaser/scenes/GameScene.ts` | `bindPlaybackRunner` in `create()`; remove `takeDiceAddedUiEffects`, `consumeRoundStartUiEffects`, direct `playScoreAnimation` call in `enterScorePhase` |
| `src/phaser/scenes/BoosterPackScene.ts` | Remove consumable bind if present; rely on runner |
| `src/phaser/scenes/ShopScene.ts` | Runner handles shop consumable playback if queue used |

---

## Handler interface

```typescript
// src/phaser/playback/PlaybackRunner.ts
export interface PlaybackRunnerContext {
  scene: Phaser.Scene;
  equipBar: EquipmentBar;
  consumableBar: ConsumableBar;
  sidebar: Sidebar;
  getDiceSprites: () => DiceSprite[];
  destroyDice: (ids: string[]) => Promise<void>;
  onScoreComplete: () => void; // calls GameScene.onContinue path
  // …round-start hooks GameScene had private
}

export function bindPlaybackRunner(ctx: PlaybackRunnerContext): () => void;
```

Subscribe via `bindStore(ctx.scene, runStore, (s) => s.playbackQueue.length, …)` or selector `(s) => s.playbackQueue` with shallow length check — on change, `takePlayback(() => true)` **or** take one-at-a-time for sequential play.

**Blessed consumption:** process queue **sequentially** (await each command):

```typescript
async function drainPlaybackQueue(ctx) {
  const batch = runActions.takePlayback(() => true);
  for (const cmd of batch) {
    await playCommand(ctx, cmd);
  }
}
```

Use a re-entrancy lock (`draining`) so nested enqueues during play schedule another drain.

### Kind → existing code

| `kind` | Call |
|--------|------|
| `dice-added` | GameScene logic that animates new dice into hand |
| `round-start-destructions` | `animateEquipmentFireDestructionSequence` |
| `round-start-equipment-created` | `animateJunkDealerCreation` |
| `equipment-created-count` | `playEquipmentCreatedPopIn` |
| `consumable-playback` | `applyConsumableAnimEvents` |
| `score` | `playScoreAnimation` + hand upgrades |
| `score-events` | `playDieAnimEvents` — if `label === 'round-end-held'`, visuals only (rewards already in `processRoundEndHeldDice`) |
| `modifier-feedback` | `equipBar.animateModifierDestructions` + floating text (replace EventBus emits — REFACTOR_10) |

---

## GameScene changes

1. `enterScorePhase(result)` — **remove** `playScoreAnimation`; only layout dice if needed. Score anim exclusively from runner when `kind: 'score'` dequeued.
   - **Alternative:** `enterScorePhase` only runs layout; enqueue already happened in `calculateScore`. Flow: `submitScore` → layout callback → runner plays score.
2. Remove private methods that only existed for `takeUiEffects` if fully subsumed.
3. `create()`: call `bindPlaybackRunner` once.

---

## Remove `uiEffects` field

After runner works:

- [ ] Remove `uiEffects` from `RunState`
- [ ] Remove `enqueueUiEffect` / `takeUiEffects` from `runActions`
- [ ] Remove `UiEffect` type alias if fully replaced
- [ ] Update serialization, tests

---

## Tasks

- [ ] Implement runner + handlers
- [ ] Wire `GameScene`
- [ ] Delete `consumableUiEffects.ts`
- [ ] Remove dual-write
- [ ] Remove `uiEffects` field and deprecated APIs
- [ ] Full test + manual smoke

---

## Acceptance criteria

- [ ] `rg 'takeUiEffects|bindConsumableUiEffects|uiEffects' src/` → no matches (except changelog/history in docs)
- [ ] `rg 'playScoreAnimation' src/phaser/scenes/GameScene` → only inside `playback/handlers.ts` (or runner), not `enterScorePhase`
- [ ] `bun run check` passes

---

## Manual smoke test

1. New run → round start destruction/junk dealer anim
2. Score a hand → full score anim
3. Use supply card → consumable anim
4. Shop buy equipment → pop-in
5. End day with gold die held → held anim
6. Lease/perishable equipment → modifier feedback

---

## Pitfalls

- **Double score anim** if both `enterScorePhase` and runner play — grep `playScoreAnimation`.
- **Round-end held skipped or racing modifier feedback** — see [REFACTOR 3 handoff](#refactor-3-handoff) sequencing; `finishDayEndAfterEquipmentDestroyed` does not await the queue today.
- **Re-applying gold / blue-moon rewards in handlers** — mutations and earn already ran in `processRoundEndHeldDice`.
- Sequential drain must not starve if `animating` flag blocks GameScene — runner owns `animating` or calls `ctx.setAnimating`.

---

## Out of scope

- Facade (REFACTOR_7+)
- `rs()` removal (REFACTOR_5)
