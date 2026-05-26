# REFACTOR 9 — Facade for shop, pack, trail, meta scenes

**Prerequisites:** [REFACTOR_8.md](./REFACTOR_8.md)  
**Next:** [REFACTOR_10.md](./REFACTOR_10.md)

---

## REFACTOR 8 handoff

- **GameScene** uses `gameFacade` only (no `*System.ts` imports). Facade modules: `round`, `run`, `consumable`, `boss`, `diceSelection`, `equipment`, `dice`.
- **Round-end modifier feedback** (`processModifiersEndOfRound` / `applyModifierDestructions`) still runs in `GameScene.runRoundEndModifierFeedback` after playback — not folded into `endDay` or `PlaybackRunner` yet.
- **`handlers.ts`** still imports `revealLandSlideHints` from `BossEffectsSystem` — switch to `gameFacade.boss.revealLandSlideHints` in REFACTOR_10 or here.
- **Types:** import `ConsumableDef` / `DiceSelectionConfig` from `game/facade/*` subpaths or re-export from `facade/index.ts` if you want a single import.

---

## Goal

Extend facade so **non-Game** Phaser scenes stop importing game systems directly. Target scenes: `ShopScene`, `BoosterPackScene`, `TrailEventScene`, `RoundSelectScene`, `PayoutScene`, `ProfessionSelectScene`, `DifficultySelectScene`.

---

## New facade modules

```
src/game/facade/
  shop.ts       openShop, rerollShop, buy*, markSold
  pack.ts       openPack, pickCard, skipPack
  trail.ts      enterEvent, resolveChoice, spyglassInvestigate
  meta.ts       setupProfession, setupDifficulty, skipRound, advanceProgression
```

### `gameShop`

Wrap: `shopSceneActions.openShop`, `rerollShop`, `shopBuyActions.*`, `processEquipmentOnShopEnd`, `generateShopStock` usage inside open/reroll only.

Scene still renders stock from `getSceneState().shop`.

### `gamePack`

Wrap: `generatePackContents`, `acquireEquipmentInstance`, `processEquipmentOnPackOpened/Skipped`, `consumableActions`, `diceActions`, `enqueuePlayback` for pop-in.

### `gameTrail`

Wrap: `TrailEventsSystem.resolveChoice`, `equipmentActions` for destroy-on-choice, `sceneActions` patches.

### `gameMeta`

Wrap: `setupActions`, `bossActions`, `progressionActions`, `tagActions`, `economyActions` for round select / payout.

---

## Per-scene checklist

| Scene | Remove imports (examples) | Use |
|-------|---------------------------|-----|
| `ShopScene.ts` | `ItemsSystem.generateShopStock`, `shopBuyActions` | `gameFacade.shop` |
| `BoosterPackScene.ts` | `BoosterPackSystem`, `EquipmentEffects`, `ConsumablesSystem` execute paths | `gameFacade.pack` |
| `TrailEventScene.ts` | `TrailEventsSystem` resolve | `gameFacade.trail` |
| `RoundSelectScene.ts` | `TagSystem`, `progressionActions`, `bossActions` | `gameFacade.meta` |
| `PayoutScene.ts` | `progressionActions`, `economyActions` | `gameFacade.meta` |
| `ProfessionSelectScene.ts` | `setupActions`, `createDie` | `gameFacade.meta` |
| `DifficultySelectScene.ts` | `setupActions`, `bossActions`, `RunRng` | `gameFacade.meta` |

**Keep:** `sceneStore`, `getRunState`, selectors, `Constants`, `SaveLoad` serialize helpers, `data/*` for defs/art.

---

## Tests

Add `src/game/__tests__/facade/shop.test.ts` — open shop, buy item, stock marked sold (integration via store).

---

## Tasks

- [x] Implement facade modules
- [x] Migrate each scene (one commit per scene ok)
- [x] `rg "from '../../game/[A-Z]" src/phaser/scenes` — only facade, store, Constants, formatScore, displayContext, SaveLoad, RunRng if needed for display-only
- [x] `bun run check`

---

## Acceptance criteria

- [x] No scene imports `EquipmentEffects`, `ItemsSystem`, `ConsumablesSystem`, `TagSystem`, `TrailEventsSystem`, `BoosterPackSystem` except via facade
- [x] `SaveLoadIO` unchanged (still uses `applySaveSnapshot`)
- [x] `bun run check` passes

---

## Manual smoke

New run: profession → difficulty → round select (skip tag) → play → shop buy → pack open → trail event choice → payout.

---

## Pitfalls

- Shop serialization (`serializeEquipmentInstance`) stays in scene or moves to `facade/shop.ts` — either is fine; must remain callable from scene save hooks.
- `RunRng` shuffle for pack animation can stay in scene (presentation) or facade — prefer scene for shuffle-only.

---

## Out of scope

- `JourneyInfoModal`, `BossTestModal` dev tools — may keep `DevMode` imports
- EventBus (REFACTOR_10)
