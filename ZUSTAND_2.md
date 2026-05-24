# Step 2 - Replace PlayerState With Run Store State And Actions

## Objective

Move cross-scene run ownership out of `PlayerState` and into `runStore`. After this step, gameplay code should not rely on `getPlayerState()` as the source of truth.

It is acceptable for some Phaser flows to break while call sites are converted. Do not create a long-lived compatibility bridge that keeps both `PlayerState` and `runStore` authoritative.

## Files To Inspect

- `src/game/PlayerState.ts`
- `src/game/Economy.ts`
- `src/game/ItemsSystem.ts`
- `src/game/EquipmentModifiers.ts`
- `src/game/ConsumablesSystem.ts`
- `src/game/TagSystem.ts`
- `src/game/PermitsSystem.ts`
- `src/game/TrailEventsSystem.ts`
- `src/game/BossEffectsSystem.ts`
- `src/game/DiceSystem.ts`
- `src/game/SaveLoad.ts`
- all tests that call `getPlayerState()` or `resetPlayerState()`

## Target API

Create action modules under `src/game/store/actions/`, for example:

- `runActions.ts`
- `economyActions.ts`
- `diceActions.ts`
- `equipmentActions.ts`
- `consumableActions.ts`
- `tagActions.ts`
- `permitActions.ts`
- `trailActions.ts`
- `bossActions.ts`

Actions should read/write `runStore` directly and return useful result objects:

```ts
const result = buyEquipment(defId);
if (!result.ok) return result.reason;
```

Avoid methods on a state class. State is data; behavior lives in action functions.

## Replace Economy Ownership

Move `Economy` state to a simple balance field:

- `balance: number`
- `canAfford(amount): boolean`
- `spend(amount): boolean`
- `earn(amount): void`
- `setBalance(amount): void`

If keeping `Economy.ts`, convert it into pure helper functions. Do not store an `Economy` instance in Zustand.

## Replace PlayerState Getters

Move derived values into selectors or pure helpers:

- available dice
- spent dice
- all dice spent
- refresh cost
- debt limit and min balance
- equipment slots used/free
- consumable slots used/free
- effective days
- effective rerolls
- target miles
- round reward
- current boss
- journey complete
- story victory offered

Selectors should accept `RunState` and return values. They should not read a singleton.

## Replace PlayerState Methods

Convert these method groups first:

- run setup/reset:
  - apply profession
  - finalize run setup
  - set difficulty
  - assign/restore bosses
- dice:
  - add die
  - mark spent
  - refresh spent dice
  - loaded die target/sync
- economy:
  - can afford
  - spend/earn
- equipment:
  - buy
  - sell
  - destroy
  - reorder
  - modifier changes
- consumables:
  - add
  - use
  - sell
  - reorder
- tags:
  - add
  - consume
  - consume by category
  - record round skipped
- permits:
  - buy
  - boss permit reroll
- progression:
  - advance round
  - story/endless transitions

Each action replaces the relevant slice immutably enough for Zustand subscribers to fire.

## Handling Definition Objects

Store IDs when possible:

- profession ID
- boss assignment IDs
- permit IDs
- trail event IDs
- consumable def IDs

Equipment and consumables may still need instance data:

- `defId`
- `sellValue`
- `state`
- `modifiers`
- `perishableRoundsLeft`
- aura data if currently baked into cloned definitions

If current systems mutate `EquipmentDef` copies for auras, introduce `EquipmentInstanceView` helpers that resolve `defId + aura/modifiers` into display data without storing full cloned defs.

## Break The Singleton

Once enough actions exist, change `getPlayerState()` usage intentionally:

- Prefer deleting or deprecating `getPlayerState()`.
- If tests still need a helper, make it return a read-only snapshot from `runStore`, not a mutable singleton.
- Replace `resetPlayerState()` with `resetRunState()` or `startNewRun()`.

Do not keep `PlayerState` synchronized with the store. That creates the same drift problem in a different place.

## Tests To Update

Update test helpers first:

- `setupGame()`
- `calculateTestScore()`
- `item()`
- dice helpers

Then update tests by category:

- scoring tests
- item/equipment tests
- consumable tests
- tags tests
- permits tests
- save/load tests
- shop stock tests

The new tests should create/reset store state, call actions, and assert store snapshots/selectors.

## Temporary Breakage Allowed

It is okay if Phaser scenes fail to compile before Step 5 as long as game tests for converted systems are being updated. Keep commits/working chunks coherent enough that the next step knows what still imports `PlayerState`.

## Done Criteria

- `RunState` in Zustand owns data formerly owned by `PlayerState`.
- Core run mutations are action functions.
- No new code writes to `PlayerState`.
- Tests for converted logic use run store actions/selectors.
- Remaining `getPlayerState()` references are listed for deletion or are already failing intentionally.
