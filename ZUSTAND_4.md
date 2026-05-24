# Step 4 - Move Pure Systems And Save/Load Onto Store Data

## Objective

Convert pure game systems to operate on store-owned state and make save/load serialize the stores directly. This step removes hidden singleton reads from the logic layer.

## Carryover from step 3 (remove here, not in step 7)

Step 3 intentionally left these in place; **step 4 should own their removal**:

1. **`roundActions.calculateScore` and boss/effect hooks** — still call `getPlayerState()`, `getFacadeEquipmentCache()`, and `applyScoringMutations()` that mutates the player facade. Refactor to explicit `run` + resolved equipment context (see Effect Pipeline below).

2. **`patchFromLegacy` / `ensureDiceInRun`** — tests that set `game.state.rolledDice` with dice not in `runStore` rely on auto-adding dice. Update tests to seed via `diceActions.addDie` / `runStore` and delete `ensureDiceInRun` once no caller needs it.

3. **Save/load round snapshots** — still use `RoundState` with full `Die[]` via `legacyRoundStateToRuntime` / `runtimeToLegacyRoundState`. Serialize `RoundRuntimeState` + run dice separately; shrink or delete conversion helpers if nothing else needs legacy `RoundState`.

4. **`roundActions` import layout** — exported from `store/index.ts` but not merged into `actions/index.ts` to avoid `PlayerState` ↔ `roundActions` circular imports. Re-merge the barrel after systems no longer pull `getPlayerState()` at module init.

5. **`types.ts` `PayoutBreakdown` import from `PlayerState`** — if step 4 touches store types, move payout types to `store/types.ts` to reduce facade coupling.

## Files To Inspect

- `src/game/DiceSystem.ts`
- `src/game/EquipmentEffects.ts`
- `src/game/effects/**`
- `src/game/ItemsSystem.ts`
- `src/game/EquipmentModifiers.ts`
- `src/game/ConsumablesSystem.ts`
- `src/game/BoosterPackSystem.ts`
- `src/game/DiceSelectionSystem.ts`
- `src/game/TrailEventsSystem.ts`
- `src/game/TagSystem.ts`
- `src/game/PermitsSystem.ts`
- `src/game/BossEffectsSystem.ts`
- `src/game/SaveLoad.ts`
- `src/game/AutoSave.ts`
- `src/phaser/SaveLoadIO.ts`
- `src/phaser/AutoSaveManager.ts`

## System Conversion Rule

Pure systems should not call:

- `getPlayerState()`
- `resetPlayerState()`
- `new GameState()`
- `gameState.state`

Instead, systems should either:

- accept state and return a result/mutation object, or
- be store action modules that read/write Zustand directly.

Prefer pure functions for effect calculations and store actions for orchestration.

## Effect Pipeline

Convert effect handlers to receive explicit context:

```ts
interface EffectContext {
  run: RunState;
  round: RoundRuntimeState | null;
  equipment: EquipmentInstanceState[];
  professionId: string | null;
  difficulty: DifficultyLevel;
}
```

Handlers should return mutations:

- equipment state updates
- dice updates
- money updates
- consumable updates
- tag updates
- round score updates
- UI animation events

The caller applies these mutations through store actions.

## Dice System

Keep pure helpers like hand detection and score math pure. Update helpers that assumed die arrays from `PlayerState`:

- draw from available dice IDs
- resolve rolled values with round overlays
- mark spent through run actions
- create dice with run-store ID allocation

Tests should seed dice through run actions, not `player.dice.push(...)`.

## Tags, Permits, Bosses, Trail Events

Move all state writes into actions:

- tags mutate `run.tags`
- permits mutate permit IDs and modifier fields
- boss rerolls mutate boss assignment IDs and balance
- trail events mutate trail event modifier slices and active scene slice

Delete or rewrite functions whose only job was mutating `PlayerState`.

## Save/Load

Make snapshots store-native:

```ts
interface GameSaveSnapshot {
  version: number;
  exportedAt: string;
  activeScene: ActiveScene;
  run: SerializedRunState;
  round: SerializedRoundRuntimeState | null;
  scene: SerializedSceneRuntimeState;
  runSeed: string;
  rngState: RunRngState;
}
```

`buildSaveSnapshot()` reads stores only. `applySaveSnapshot()` hydrates stores only.

Scene classes should not be the source of save data anymore. `SaveLoadIO` should route to a scene after store hydration.

## Autosave

Autosave should snapshot stores, not active scene objects.

Target behavior:

- debounced snapshot after important actions
- explicit `persistNow()` for critical transitions
- boot restore hydrates stores first, then starts the right scene

This replaces timing hacks such as keeping `player.pendingTrailEvent` aligned with scene fields.

## Tests

Update save/load tests to assert:

- snapshot contains run/round/scene store data
- applying a snapshot hydrates stores exactly
- shop, booster, trail event, and active game round restore without scene getter methods
- RNG state and next die ID remain deterministic

Update system tests to assert actions/mutations rather than singleton fields.

## Done Criteria

- Pure game systems no longer read hidden player/round singletons.
- Save/load serializes and hydrates Zustand state.
- Autosave no longer depends on active Phaser scene getters.
- Store-native tests cover key systems and snapshot restore.

## Step 4 status (implemented)

**Verification (as of step 4 completion):** `bun test` — 1393 pass; `bun run build` — OK.

### Done criteria checklist

| Criterion | Status | Notes |
| --- | --- | --- |
| Pure systems avoid `getPlayerState()` | **Mostly** | Converted: `TagSystem`, `DiceSelectionSystem`, `BoosterPackSystem` (logic), `BossEffectsSystem`, `PermitsSystem` (purchase effects), scoring mutations, most effect lifecycle handlers, `DiceSystem.scoreHand` run writes |
| Save/load store-native | **Yes** | v4 snapshot; v3 migrated on load |
| Autosave off scene getters | **Partial** | Snapshot reads stores; `SaveLoadIO.syncSceneStoreFromScene()` still copies scene → `sceneStore` at persist time |
| Store-native tests | **Partial** | `saveLoad.test.ts`, `store/*.test.ts`; many item tests still use `getPlayerState()` / `game.state` |

### Systems converted (store reads/writes)

- **Save/load:** `serialization.ts`, `SaveLoad.ts` v4, `SaveLoadIO` hydrate-then-start-scene, scene restore hooks in Game/Shop/BoosterPack/TrailEvent
- **Scoring mutations:** `effects/applyMutations.ts` → `runStore`, `economyActions`, `consumableActions`
- **Tags:** `TagSystem.ts` → `tagActions`, `runActions`, selectors; legacy `player` args ignored
- **Dice selection:** `DiceSelectionSystem.ts` → `getRunState`, `diceActions`, in-place die mutation
- **Packs:** `BoosterPackSystem.ts` → `getRunState`, `getFacadeEquipmentCache`; `getPlayerState()` **only** for equipment `display(null, player)` tooltips
- **Permits:** `applyPermitEffectToRun()`; deprecated `applyPermitEffect(permit, player)` kept for facade
- **Bosses:** `BossEffectsSystem.ts` → `getRunState`, `bossRoundState`, `economyActions`, `diceActions`
- **Effects:** `professionId` on scoring/lifecycle context; `onRoundEnd`/`onPackOpened`/handlers updated; `EquipmentEffects` uses `selectProfession(getRunState())`

### Not converted in step 4 (explicit deferrals)

| Area | Still uses | Suggested step |
| --- | --- | --- |
| `ConsumablesSystem.ts` | `PlayerState` params on use/grant helpers | Step 4 follow-up or **7** |
| `TrailEventsSystem.ts` | `PlayerState` throughout | **6–7** (trail + scene store) |
| `ItemsSystem.isEquipmentUnlocked` | `getPlayerState()` default for `unlockCondition(game, player)` | **7** — pass `RunState` + resolved equipment or thin unlock context |
| `EquipmentModifiers.ts` | `applyEquipmentModifierDestructions(player, …)` | **7** |
| `DevMode.ts` | `getPlayerState()` | Low priority; **7** |
| Phaser scenes | Local fields + manual refresh | **5** shared bars done; **6** shop/trail scene store |

### Carryover from step 3 — resolution

| Step 3 bridge | Step 4 outcome |
| --- | --- |
| `roundActions.patchFromLegacy` | **Removed** from `roundActions`; equivalent logic on `GameState` facade (`applyLegacyRoundPatch`) for tests only |
| `ensureDiceInRun` | **Moved** to private helper in `GameState.ts` (not in store actions) |
| `PayoutBreakdown` on `PlayerState` | **Moved** to `store/types.ts` |
| Scoring / boss hooks `getPlayerState()` | **Mostly fixed** in `roundActions.calculateScore` path and effect handlers |
| `roundActions` in `actions/index.ts` | **Still separate export** — barrel merge still causes circular import with `PlayerState` |
| Save round `RoundState` + `Die[]` | **v4** uses serialized round runtime; legacy conversion kept for v3 migration and `restoreRound` |

### Temporary compatibility (do not extend)

| Bridge | Location | Why | Remove in |
| --- | --- | --- | --- |
| Facade equipment/consumable caches | `store/facadeSync.ts` | Runtime `EquipmentInstance[]` mirrors `run.equipment` JSON; writers call `persistFacadeCachesToStore()` | **7** — or resolve per-scoring from store |
| Scene → store sync at save only | `SaveLoadIO.syncSceneStoreFromScene` | Shop/pack/trail state lives on scene during visit | **6** |
| `getPlayerState()` for display hooks | `BoosterPackSystem`, `ItemsSystem` | `EquipmentDef.display(null, player)` expects facade API | **7** — extend `display` to accept run context |
| TagSystem optional legacy arg | `TagSystem.ts` `currentRun(_legacy?)` | Phaser/tests pass `player`; ignored | **7** |
| Boss round in-place patch | `bossRoundState.patchBossRoundState` | Preserves object identity for stale `const state = getBossRoundState()` refs | **5–7** when callers re-fetch |
| `applyPermitEffect(permit, player)` | `PermitsSystem.ts` | Deprecated wrapper for facade callers | **7** |
| `runMutationActions` | ~~`actions/index.ts`~~ | **Deleted** — caused TDZ circular import; do not reintroduce without fixing load order | N/A |
| v3 save migration | `SaveLoad.normalizeSnapshot` | One-time upgrade path | Keep until v5 or drop old saves |

### Step 5 prerequisites — **done** (see `ZUSTAND_5.md` status)

Implemented: `uiSelectors.ts`, shared UI subscriptions, manual bar/sidebar refresh removal, `displayContext.ts` for hints. Remaining for 6–7: shop stock `updateDisplays`, `Sidebar.updateData` scoring fields, facade caches, `GameScene` `game.state` mutations → `roundActions`.

### Step 6 prerequisites (read first)

- **Authoritative scene state** (shop stock, pack contents, trail event step) should live in `sceneStore` during the visit, not only in `getSaveContext()` at autosave.
- Replace `syncSceneStoreFromScene()` pull model with actions that update `sceneStore` when the player buys/sells/opens choices.
- Trail event `player.pendingTrailEvent` alignment hacks retire when trail slice is store-owned.

### Step 7 prerequisites (read first)

- Delete `PlayerState.ts` and `GameState.ts` only after Phaser and tests call stores/actions directly.
- Grep for remaining `getPlayerState()` / `new GameState()` / `game.state` before deleting facades.
- Merge `roundActions` into `actions/index.ts` once `PlayerState` no longer imports the barrel at module init.
- Remove `legacyRoundStateToRuntime` / `RoundState` from save path if v3 migration no longer needed.
- Remove facade caches if all equipment/consumable reads go through `resolveEquipmentList(getRunState())` or equivalent.

### Dice / identity note for later steps

When mutating dice in the run store, **prefer in-place mutation** on objects already in `run.dice` (via `setDieEnhancement`, etc.) rather than replacing with `{ ...d, enhancement: null }` spreads. Tests and facades often hold references to dice objects in the store array; spread-replace leaves stale refs (Graverobber, dice selection ENHANCE regressions during step 4).
