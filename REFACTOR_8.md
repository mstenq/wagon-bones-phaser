# REFACTOR 8 — Migrate `GameScene` to facade

**Prerequisites:** [REFACTOR_7.md](./REFACTOR_7.md), [REFACTOR_4.md](./REFACTOR_4.md)  
**Next:** [REFACTOR_9.md](./REFACTOR_9.md)

---

## Goal

`GameScene` becomes a **thin** Phaser scene: input → `gameFacade.round.*`, render from selectors, animations → `PlaybackRunner` only.

---

## Remove direct system imports from GameScene

Replace imports / calls:

| Current import | Facade / alternative |
|----------------|---------------------|
| `TagSystem.consumeNextRoundTags`, `grantTag`, `processBossPayoutTags` | `gameFacade.run.preparePayout` / `gameFacade.round.beginRoundSession` |
| `TrailEventsSystem.hasActiveTrailRoundEffects`, `trailRoundEffectsFromModifiers` | `gameFacade.round.beginRoundSession` |
| `EquipmentModifiers.applyEquipmentModifierDestructions`, `processEquipmentModifiersEndOfRound` | `gameFacade.round.endDay` + runner |
| `EquipmentEffects.processGoldHeldAtRoundEnd`, `processBlueMoonHeldAtRoundEnd` | inside `endDay` (REFACTOR_3) |
| `applyScoringMutations`, `createEmptyScoringMutations` | inside facade score/endDay |
| `ConsumablesSystem.executeConsumableEffect`, `grantGhostMedicine` | `gameFacade.consumable.use` (add to facade in this step if missing) |
| `BossEffectsSystem.*` | `gameFacade.round` wrappers or `gameFacade.boss.*` |
| `detectBestHand` | facade helper for UI preview only |
| `DiceSelectionSystem` | `gameFacade.diceSelection.*` |
| `roundActions` direct | `gameFacade.round` only |
| `economyActions` in payout transition | `gameFacade.run.preparePayoutPresentation` |

**Allowed imports after this step:**

- `gameFacade`
- `getRunState`, selectors, `getRoundState`
- `Constants`, `formatScore`, `displayContext`, `GameplayPreferences`
- Phaser UI components, `PlaybackRunner`, animations (via runner only)
- `EventBus` / `Events.SCENE_READY` only until REFACTOR_10

---

## Extend facade (this step)

Add to `src/game/facade/` as needed:

```typescript
// consumable.ts
useConsumable(slotIndex: number): UseConsumableResult | null

// boss.ts  
revealLandSlideHints(): void
applyBossRollDiceState(): BossRollUiState // or return flags for scene to tint sprites

// diceSelection.ts
openDiceSelection(config: DiceSelectionConfig): void // returns via scene transition — ok to keep scene call with facade applying effect
```

Keep **sprite tinting** in Phaser; facade returns **what** to tint, not **how**.

---

## GameScene method mapping

| GameScene handler | Call |
|-------------------|------|
| `create()` round init | `gameFacade.round.beginRoundSession({ restored })` |
| Ready / roll / reroll / score buttons | `gameFacade.round.*` |
| `onScore` / `calculateScore` | `gameFacade.round.submitScore(ids)` |
| `onContinue` / end day | `gameFacade.round.endDay({ deferEquipmentDestructionAnimation })` |
| Win transition | `gameFacade.run.preparePayoutPresentation()` then `sceneActions.enterPayout` |
| Consumable click | `gameFacade.consumable.use` |

---

## Tasks

- [ ] Add facade modules for consumable, boss, dice selection
- [ ] Replace GameScene logic calls (grep `from '../../game/` imports — target **&lt; 10** non-facade game imports)
- [ ] Remove dead private methods
- [ ] Manual full leg playthrough
- [ ] `bun run check`

---

## Acceptance criteria

- [ ] `GameScene.ts` does not import any `*System.ts` except none — **systems only via facade**
- [ ] `rg "from '../../game/(Tag|Equipment|Consumable|Boss|Trail)" src/phaser/scenes/GameScene` → empty
- [ ] Line count of GameScene materially reduced OR complexity moved to facade (comment in PR)
- [ ] `bun run check` passes

---

## Manual smoke test

Complete one leg: 3 rounds, shop, trail event, boss, payout, booster pack return to game.

---

## Pitfalls

- Scene still needs `DiceSprite` sync — use `roundWrites.syncRolledDiceFromFaces` via facade.
- Do not break `deferEquipmentDestructionAnimation` path used in tests (`playScoredDayAndEnd`).

---

## Out of scope

- Other scenes (REFACTOR_9)
