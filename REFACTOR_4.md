# REFACTOR 4 — Single Phaser playback runner

**Prerequisites:** [REFACTOR_3.md](./REFACTOR_3.md)  
**Next:** [REFACTOR_5.md](./REFACTOR_5.md)

---

## Goal

One module in Phaser subscribes to `playbackQueue` and plays all commands. Delete scattered `takeUiEffects` usage and `bindConsumableUiEffects`.

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
| `score-events` | `playDieAnimEvents` |
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
- Sequential drain must not starve if `animating` flag blocks GameScene — runner owns `animating` or calls `ctx.setAnimating`.

---

## Out of scope

- Facade (REFACTOR_7+)
- `rs()` removal (REFACTOR_5)
