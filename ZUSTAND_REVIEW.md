# Zustand Migration Review (May 2026)

## Executive Take

The switch to Zustand looks **successful overall** and appears **worth it** for long-term maintainability.

Why:
- Store ownership is now clear (`runStore`, `roundStore`, `sceneStore`) and facade-era indirection is mostly gone.
- Full validation passes after this review pass:
  - `bun test` (full suite): pass
  - `bun run build`: pass
- The architecture is cleaner for future work (selectors/actions instead of scattered singleton/class writes).

The disappointment around out-of-sync behavior is still understandable: this migration removed a lot of implicit coupling, and a few edge paths were still relying on stale/imperative assumptions.

## Findings (Ordered by Severity)

### Fixed during this review

1. **Boss hand tracking write path bug** (`src/game/BossEffectsSystem.ts`)
   - `recordBossHandPlayed()` computed a new state object but never persisted it.
   - This could break boss rules like Preacher/Call Girl hand restrictions.
   - Fixed by mutating the boss round slice through `updateBossRoundState` correctly.

2. **Sidebar round fields stale when only round state changed** (`src/phaser/ui/Sidebar.ts`)
   - Days/rerolls/target data in sidebar came from a selector reading round state, but updates were only bound to `runStore`.
   - Fixed by adding a `roundStore` subscription trigger to re-apply the sidebar model.

3. **Shop consumable buy could charge money when inventory was full** (`src/game/store/actions/shopBuyActions.ts`)
   - Spend occurred before slot-capacity validation.
   - Fixed by checking consumable capacity first, then charging.
   - Added regression test in `src/game/__tests__/store/store.test.ts`.

4. **Permit-purchase shop stock not synced back to scene store** (`src/phaser/scenes/ShopScene.ts`)
   - Permit purchase could expand local stock but not persist to `sceneStore.shop`.
   - This was a save/restore drift risk.
   - Fixed by syncing shop scene state before rebuild; also synced dev swap helpers.

5. **Die enhancement updates could bypass store notifications in selection/scoring flows** (`src/game/DiceSelectionSystem.ts`, `src/game/DiceSystem.ts`)
   - Some enhancement mutations happened in-place on live die refs.
   - Fixed by routing through store-backed updates and preserving existing behavior for scored/pouch die mutation semantics.

6. **Coverage added for boss-hand persistence** (`src/game/__tests__/bosses.test.ts`)
   - Added tests to verify `recordBossHandPlayed()` behavior for Preacher and Call Girl.

## Remaining Risk Areas (Not blockers, but likely sources of occasional sync weirdness)

1. **Scene-local caches still coexist with store state in a few places**
   - Example class: `ShopScene` still keeps local arrays (`stockItems`, `packs`) and mirrors back to store.
   - This is workable, but any future missed sync call can reintroduce drift.

2. **Round/game HUD flow still partly imperative**
   - Some HUD fields are subscription-driven, some are still updated via scene methods.
   - This hybrid model can create timing-dependent UI mismatch during unusual transition paths.

3. **Mutable helper conventions still exist in parts of scoring/equipment flow**
   - The codebase often uses resolve/mutate/re-persist patterns.
   - It works, but future contributors can accidentally skip the final persist step.

## Was the migration worth it?

**Yes.** Even with the current rough edges, this migration was a net positive.

Benefits already visible:
- Cleaner boundaries between game logic and rendering.
- Better testability of game systems and actions.
- More explicit state transitions (easier to reason about and debug over time).
- Reduced dependence on "remember to refresh everything manually" patterns.

Cost paid:
- A temporary increase in sync bugs while hybrid paths are being tightened.
- More discipline required around immutable/update patterns.

Overall judgment:
- **Short-term pain, long-term gain**.
- You are past the hardest part. The remaining work is mostly consistency hardening rather than architecture replacement.

## Suggested next cleanup sprint (high ROI)

1. Consolidate remaining scene-local authoritative data into store-first reads/writes where practical.
2. Add a few targeted sync regression tests for:
   - round transitions (`endDay` / reroll / HUD updates),
   - shop permit + save/restore,
   - consumable use/sell edge-capacity cases.
3. Add light guardrails in review checklist: "no in-place run/round mutation without `setState` path."

