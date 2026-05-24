# Step 5 - Convert Phaser Shared UI To Zustand Subscriptions

## Status: implemented

Shared layout UI subscribes to Zustand via `bindGameObject` / `bindStore`. **1393 tests pass**; **`bun run build`** succeeds.

### What landed

| Area | Implementation |
| --- | --- |
| Selectors | `src/game/store/selectors/uiSelectors.ts` |
| Subscribe helper | `src/phaser/store/subscribe.ts` (`bindGameObject`, `bindStore`) |
| Hint bridge | `src/game/displayContext.ts` → `getItemDisplayPlayer()` for `ItemCard` until step 7 |
| DicePouch | `selectDicePouchCounts` |
| TagStack | `selectTagStackModel`; `SceneLayout` EventBus tag listeners removed |
| Sidebar | `selectRunSidebarModel`, `selectRoundSidebarModel`; `refreshMoney()` removed |
| CardBar | public `refresh()` → protected `rebuildCards()` |
| EquipmentBar | snapshot + slot label + round hint subscriptions; `equipmentActions` sell/reorder; `setHintGame(game)` |
| ConsumableBar | snapshot + `selectCanUseSecondHelpings`; `consumableActions` use/sell/reorder |
| Scenes | Removed bar/sidebar refresh calls that only mirrored store state (Game, Shop, BoosterPack, TrailEvent, RoundSelect) |
| Animations | Removed bar `refresh()` from score/pop-in/fire-destroy paths |

### Intentional leftovers (steps 6–7)

- `Sidebar.updateData()` for scoring presentation (title, miles/mult, hand name/level)
- `EquipmentBar.updateHints()` deprecated wrapper → `setHintGame()`
- Equipment/consumable **card instances** from `getFacadeEquipmentCache()` / `getFacadeConsumableCache()`
- `equipment-changed`, `consumable-changed`, `consumable-used` container events for scene side effects
- `ShopScene.updateDisplays()` for **shop stock** affordability (not shared bars)
- Modals / `RoundInfo` / etc. still call `getPlayerState()` where not in step 5 scope

### Pitfall for later agents

**Do not import selectors from `store/selectors/index.ts` inside `uiSelectors.ts`** — use `./runSelectors` and `./roundSelectors` only. Importing from `index` caused `SyntaxError: Export named 'selectBalance' not found` (circular re-export).

---

## Objective

Rebind Phaser UI to store selectors. After this step, shared UI components should update because state changed, not because scenes remembered to call `refresh()`.

## Carryover from step 4 (read first)

Step 4 left these in place; **step 5 should not reintroduce `getPlayerState()` in UI**:

- **`PlayerState` / `GameState` facades** still exist — UI may import them today; migrate reads to selectors and writes to actions.
- **`facadeSync` equipment/consumable caches** — `EquipmentBar` hints may still mirror cache; prefer `runSelectors` + `resolveEquipmentList(getRunState())` where performance allows.
- **`roundSelectors` + `roundResolve`** already expose phase, rolled dice, and hint context — use in `GameScene` instead of `game.state` / `game.config` setters.
- **`GameScene` direct `gameState.state` mutations** — replace with `roundActions`, not new facade patches.
- **Restore after load** — stores are hydrated before scene start (step 4); scenes should read initial render from selectors, not `init(data)` restore blobs (except `{}`).
- **Boss Land Slide display order** — `getBossRoundState()` may be held by reference; after reorder/sell, re-fetch or subscribe to boss slice (see `bossRoundState.ts` in-place patch note in `ZUSTAND_4.md`).

Full deferral table: `ZUSTAND_4.md` → “Step 5 prerequisites”.

## Components In Scope

- `src/phaser/ui/DicePouch.ts`
- `src/phaser/ui/TagStack.ts`
- `src/phaser/ui/Sidebar.ts`
- `src/phaser/ui/CardBar.ts`
- `src/phaser/ui/EquipmentBar.ts`
- `src/phaser/ui/ConsumableBar.ts`
- `src/phaser/ui/ItemCard.ts`
- `src/phaser/ui/SceneLayout.ts`
- `src/phaser/scenes/GameScene.ts`
- `src/phaser/scenes/ShopScene.ts`
- `src/phaser/scenes/BoosterPackScene.ts`
- `src/phaser/scenes/TrailEventScene.ts`
- `src/phaser/scenes/RoundSelectScene.ts`

## General Pattern

Each shared component should:

1. Subscribe to a selector in its constructor or `bind()` method.
2. Render immediately from selector data.
3. Unsubscribe automatically on scene shutdown or object destroy.
4. Call store actions for state changes.
5. Keep only visual interaction state locally.

Do not use `getPlayerState()` or `GameState` in render methods.

## DicePouch

Replace `refresh()` with subscription rendering:

- selector: available dice count, total dice count
- render: update count text
- actions: none, click still opens modal

Remove scene calls to `dicePouch.refresh()`.

## TagStack

Replace EventBus refresh wiring:

- selector: visible pending tags and copies
- render: rebuild stack
- actions: none from stack unless it consumes tags in future

Remove tag listeners from `SceneLayout`.

## Sidebar

Split sidebar data into:

- run selector fields:
  - money
  - leg/round
  - target miles
  - effective days/rerolls
  - profession
  - difficulty
- round selector fields:
  - phase score
  - miles base
  - mult
  - current hand
  - hand level
  - boss
  - trail debuffs
- scene override fields:
  - title
  - shop labels
  - payout labels

Delete `refreshMoney()`. Keep a narrowly named method for scene-only labels if needed.

## EquipmentBar

Selector should include:

- equipment render list in display order
- slot label
- sell availability and sell values
- cursed/perishable/leased modifier badges
- boss hidden/disabled/hints-hidden flags
- tooltip/hint context from run and round stores

Actions:

- sell equipment
- reorder equipment
- dev aura change if dev mode remains

Keep visual helpers:

- `getCardByEquipIndex()`
- destruction animations
- leased/perishable badge flashes

Remove `equipment-changed` container events once scenes call actions directly or subscriptions cover the result.

## ConsumableBar

Selector should include:

- consumable render list
- slot label
- use availability
- sell values
- last used consumable ID for `second_helpings`
- scene-specific use capability if needed

Actions:

- use consumable
- sell consumable
- reorder consumable

Keep `consumable-used` only if a scene needs to run an effect after removal animation. Prefer moving that into a store action/UI effect in Step 6.

## CardBar

Make full rebuild an internal implementation detail:

- public `refresh()` should disappear
- subclasses call `rebuildCards(model)` from subscription callbacks
- drag/reorder remains local visual behavior
- sell/use animations call actions at the appropriate point

Do not remove Phaser canvas texture `refresh()` calls in `ItemCard`; those are graphics updates, not state sync.

## Scenes

Remove calls that only mirror state:

- `sidebar.refreshMoney()`
- `dicePouch.refresh()`
- `equipBar.refresh()`
- `consumableBar.refresh()`
- `layout.tagStack.refresh()`
- broad `updateDisplays()` if it only updates subscribed values
- `updateEquipHints()` if hints are selector-driven

Scene handlers should call actions and let subscriptions update UI.

## Done Criteria

- [x] Shared UI renders from Zustand selectors.
- [x] Manual refresh calls listed above are gone or marked visual-only exceptions.
- [x] Shared bars/pouch/tag stack/sidebar live fields do not import `getPlayerState()` for rendering (hints use `getItemDisplayPlayer()` bridge).
- [x] Game, shop, booster, trail event shared layout UI updates through subscriptions.
- [ ] All Phaser UI free of `getPlayerState()` — deferred modals, shop stock UI, journey info (steps 6–7).
