# Step 3 - Replace GameState With Round Store State And Actions

## Objective

Move active-round ownership out of `GameState` and into `roundStore`. The round finite-state machine should become action functions over store-owned `RoundRuntimeState`, not a mutable class with private listeners.

## Files To Inspect

- `src/game/GameState.ts`
- `src/game/types.ts`
- `src/game/DiceSystem.ts`
- `src/game/EquipmentEffects.ts`
- `src/game/BossEffectsSystem.ts`
- `src/game/effects/**`
- `src/game/scoreMath.ts`
- `src/game/__tests__/scoring.test.ts`
- item tests that instantiate `GameState`

## Target API

Create round actions such as:

- `createRound(config?: Partial<GameConfig>): RoundRuntimeState`
- `startRound(): RoundStartResult`
- `selectDiceForRoll(ids: string[]): void`
- `confirmRollSelection(): void`
- `rollSelectedDice(): RollResult`
- `toggleDieForScore(id: string): void`
- `scoreSelectedDice(): ScoreResult`
- `rerollAll(): RerollResult`
- `endDay(): DayEndResult`
- `continueAfterDay(): ContinueResult`
- `restoreRound(snapshot): void`
- `clearRound(): void`

These actions should read `runStore` when needed and write both `roundStore` and `runStore` through explicit actions.

## State Shape Changes

Avoid storing full die object copies in round state if possible. Prefer:

- hand die IDs
- selected die IDs
- rolled die IDs
- rolled face values by die ID
- scoring result objects

The run store owns dice metadata: enhancement, aura, sticker, ID, and permanent collection membership.

If a round needs a temporary die value, store that in round state as a round overlay:

```ts
rolledValuesByDieId: Record<string, number>
```

## Convert GameState Logic

Move logic from methods in `GameState.ts` into pure functions/actions:

- initial hand draw
- round start config calculation
- trail modifier consumption
- boss round initialization
- round-start equipment effects
- roll phase transitions
- reroll handling
- score selection and scoring
- day-end/win/loss transitions
- spent dice handling
- death prevention

Delete `GameState` listener APIs once no tests require them:

- `listeners`
- `on`
- `off`
- `emit`
- event type plumbing that only existed for this class

## Cross-Store Writes

Round actions will often update run state too. Keep this explicit:

- scoring may earn money
- scoring may mutate equipment state
- scoring may consume/destroy consumables
- round start may add dice/equipment/consumables
- day end may spend dice or reset spent dice
- round end may advance leg/round
- boss effects may update boss round state

Do not mutate run state by importing a mutable object. Call run actions or use a shared transaction helper.

## Scoring Pipeline

The scoring pipeline should accept state inputs instead of reading singletons:

```ts
applyEquipmentEffects({
  run,
  round,
  scoringDice,
  ...
});
```

Effects should return mutations and animation events. The round action applies returned mutations to the stores.

This may require broad type updates, and temporary breakage is acceptable.

## Tests

Update tests to:

- reset run and round stores
- seed run state through actions
- call round actions
- assert round store and run store snapshots

Add focused round-store tests:

- start round computes days/rerolls/target
- selecting and rolling changes phase/state
- reroll decrements rerolls
- scoring updates total miles and selected hand
- day end advances or ends round
- save/restore round snapshot reproduces state

## Phaser Impact

`GameScene` may break after this step. That is expected. Step 5 will rebind UI to selectors and new actions.

For now, expose enough round selectors for Phaser migration:

- phase
- instruction model
- button model
- hand dice render model
- rolled dice render model
- selected score model
- sidebar round model
- equipment hint context model

## Done Criteria

- `roundStore` owns active round state.
- Round actions replace `GameState` methods.
- Scoring and lifecycle logic no longer depend on a `GameState` instance.
- `GameState.on/off/emit` is removed or no longer used.
- Converted tests pass against store-owned round state.

## Step 3 Status (implemented)

**Source of truth:** `roundStore` + `roundActions` in `src/game/store/actions/roundActions.ts`.

**Permanent additions (keep):**

- `RoundRuntimeState` with die IDs, `rolledDice` refs, and `dieValuesByDieId` for rolled/carryover faces.
- `src/game/store/roundResolve.ts` — resolve run dice + round overlays into `Die[]` for scoring/UI.
- `src/game/store/selectors/roundSelectors.ts` — render/hint slices for Phaser (step 5).
- `BossRoundState` + `EMPTY_BOSS_ROUND_STATE` in `src/game/store/types.ts` (avoids `runStore` ↔ `BossEffectsSystem` circular import; `BossEffectsSystem` re-exports for existing imports).

**Removed in this step:**

- `GameState` listener map (`on` / `off` / `emit`) — nothing listened; do not reintroduce.

## Temporary compatibility (remove in later steps)

Do not treat these as the long-term API. Each item notes when to delete it.

| Bridge | Location | Why it exists | Remove in |
| --- | --- | --- | --- |
| `GameState` class facade | `src/game/GameState.ts` | Legacy `new GameState()`, `game.startRound()`, tests, Phaser, `items.ts` `display(game, player)` | **Step 7** — delete file; callers use `roundActions` + selectors |
| `legacyRoundStateProxy` + `game.state` setter | `GameState.ts` | Supports `game.state.phase = 'ROLL'` etc. in tests and `GameScene` without rewriting every caller | **Steps 5–7** — GameScene uses actions/selectors; tests use `roundActions` / `patch()` |
| ~~`roundActions.patchFromLegacy()`~~ | ~~`roundActions.ts`~~ | **Step 4:** removed from `roundActions`; replaced by `GameState.applyLegacyRoundPatch()` | **Step 7** with `GameState` deletion |
| `roundActions.seedConstructorRound()` | `roundActions.ts` | Old constructor drew a hand before `startRound()`; tests touch `game.state` early | **Step 7** — tests/scenes never read round state before `startRound()` |
| ~~`ensureDiceInRun()` inside `patchFromLegacy`~~ | ~~`roundActions.ts`~~ | **Step 4:** private in `GameState.ts` only | **Step 7** — tests seed dice via `diceActions` |
| `runtimeToLegacyRoundState` / `legacyRoundStateToRuntime` | `roundResolve.ts` | v3 save migration, `restoreRound`, tests — v4 save uses serialized runtime | **Step 7** — keep until v3 migration dropped |
| `RoundState` in `src/game/types.ts` | `types.ts` | Facade, tests, v3 migration | **Step 7** (DTO only or delete) |
| `roundActions` exported outside `actions/index.ts` | `store/index.ts` | Import cycle with `PlayerState`; **do not** merge `runMutationActions` (TDZ crash) | **Step 7** |
| `resetPlayerState()` clears round via `roundStore.setState(null)` | `PlayerState.ts` | Cannot import `roundActions` from `PlayerState` | **Step 7** |
| ~~Scoring uses `getPlayerState()` inside `roundActions.calculateScore`~~ | `roundActions.ts`, effects | **Step 4:** largely converted to `getRunState()` + facade cache | **Step 7** — drop facade cache |
| Direct `gameState.state` / nested mutations in `GameScene` | `GameScene.ts` | Not converted in step 3 | **Steps 5–7** |

**Not done yet (still step 3 gaps vs brief):**

- ~~Effect/scoring functions do not yet take `{ run, round }` context everywhere~~ — **mostly addressed in step 4**; facade equipment cache remains.
- `GameScene` still mutates `gameState.state` in many places; rely on `GameState` facade until step 5+.
- Item tests should migrate from `game.state.x =` to `roundActions.patch()` / store seeding when convenient (optional before step 7).

See **`ZUSTAND_4.md` → “Step 4 status (implemented)”** for full deferral list and step 5–7 prerequisites.
