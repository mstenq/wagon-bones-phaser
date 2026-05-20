# Implementation Plan: Registry + Pipeline Refactoring (Remaining Work)

Steps 1–3, 5, and 8 are complete (registry created, additive/xMult/heldDie/lifecycle handlers migrated and consumed by `applyEquipmentEffects()`). This document covers the remaining steps.

**Current status**: Steps 4, 7 (partial), and 9 are done. Remaining: Issues 1, 2, 3, 5 and Step 6.

**Safety net**: Run `bun test` after every step. All 996 tests must remain green throughout.

---

## Table of Contents

1. [Issues to Fix in Completed Steps](#issues-to-fix-in-completed-steps)
2. [Step 4: Wire Per-Die Handlers into scoreHand() ✅ DONE](#step-4-wire-per-die-handlers-into-scorehand---done)
3. [Step 6: Decompose scoreHand() into Passes](#step-6-decompose-scorehand-into-passes)
4. [Step 7: Extract Scoring Mutations ✅ PARTIAL](#step-7-extract-scoring-mutations---partial)
5. [Step 9: Break the DiceSystem → EquipmentEffects Import ✅ DONE](#step-9-break-the-dicesystem--equipmenteffects-import---done)

---

## Issues to Fix in Completed Steps

These bugs/inconsistencies exist in the already-implemented handler code. Fix these first.

### 1. Double-earn in `src/game/effects/perDie/enhancementEffects.ts`

Handlers like `GOLD_DICE_MONEY`, `ENHANCED_SCORE_MONEY`, `LUCKY_DICE_MONEY` call BOTH:
```typescript
getPlayerState().economy.earn(value);  // Eagerly applies
ctx.mutations.moneyEarned += value;     // Also tracked
```
If `applyScoringMutations()` is ever called, money is doubled. **Fix**: Remove `ctx.mutations.moneyEarned += value` lines (keep only the eager call for now; Step 7 will flip this).

### 2. `equipIndex: -1` in `src/game/effects/additive/conditional.ts`

Several handlers hardcode `equipIndex: -1` in animEvents instead of using the `equipIndex` parameter:
```typescript
ctx.animEvents.push({ target: { kind: 'equip', equipIndex: -1 }, ... });
```
**Fix**: Replace `-1` with the `equipIndex` parameter that's passed to the handler.

### 3. `handTypeMatches` imported from EquipmentEffects into effects/

`src/game/effects/xmult/conditional.ts` and `src/game/effects/additive/handBonuses.ts` import `handTypeMatches` from `../../EquipmentEffects`. This creates a reverse dependency (effects/ → EquipmentEffects).

**Fix**: Move `handTypeMatches()` to `src/game/effects/helpers.ts` and update imports in the handler files.

### 4. `HELD_LOWEST_MULT` reads `lowestValue` from `effectParams`

The handler in `src/game/effects/heldDie/handlers.ts` reads `p.lowestValue` from effectParams, but the original code computed it dynamically as `Math.min(...heldDice.map(d => d.value))`. If `effectParams.lowestValue` is not being pre-set by the caller, this is semantically wrong.

**Fix**: Compute inline using `ctx.heldDice` instead of reading from effectParams:
```typescript
const lowestValue = Math.min(...ctx.heldDice.map(d => d.value));
```

### 5. Re-export in types.ts

`src/game/effects/types.ts` has `export { effectRegistry } from './registry'` — a re-export of a runtime value from a "types" file. Move this export to `index.ts` only and remove it from `types.ts`.

---

## Step 4: Wire Per-Die Handlers into scoreHand() ✅ DONE

### Status
All sub-steps completed. The per-die switch in `scoreHand()` has been replaced with `effectRegistry.getPerDie()` dispatch. A `ScoringPipelineContext` is constructed at the top of the per-die loop and locals are synced after.

### Verification
- ✅ `bun test` — 996 pass, 0 fail
- ✅ `grep -n "from.*EquipmentEffects" src/game/DiceSystem.ts` — no results
- ✅ `grep -n "switch.*effectType" src/game/DiceSystem.ts` — no results (switch removed)

#### 4a. Import the registry in DiceSystem.ts

```typescript
import { effectRegistry } from './effects';
import type { ScoringPipelineContext } from './effects/types';
```

#### 4b. Create a `ScoringPipelineContext` at the top of `scoreHand()`

The per-die handlers need a pipeline context. Construct one from the existing locals:

```typescript
const pipelineCtx: ScoringPipelineContext = {
  handResult,
  scoringDice: handResult.scoringDice,
  heldDice: [],
  equipment,
  rerollsRemaining: scoreContext?.rerollsRemaining ?? 0,
  currentDay: scoreContext?.currentDay ?? 1,
  maxDays: scoreContext?.maxDays ?? 5,
  allDice: scoreContext?.allDice ?? [],
  handType: handResult.handType,
  playerBalance: getPlayerState().economy.balance,
  totalValue: 0,
  bonusMult: 0,
  xMult: 1,
  bonusMiles: 0,
  animEvents,
  mutations: { moneyEarned: 0, diceDestroyed: [], diceEnhanced: [], consumablesGranted: [], diceCopied: [], dieBonusMilesAdded: [] },
};
```

#### 4c. Replace the per-die equipment switch in `scoreHand()`

Find the inner loop that iterates equipment for each scored die and contains `switch (effectType)`. Replace the switch body with:

```typescript
      const handler = effectRegistry.getPerDie(equip.def.effectType);
      if (handler) {
        handler(pipelineCtx, equip, eIdx, die, t);
      }
```

#### 4d. Sync locals after the per-die loop

After the per-die loop completes, read accumulated values back:
```typescript
totalValue = pipelineCtx.totalValue;
bonusMult = pipelineCtx.bonusMult;
xMult = pipelineCtx.xMult;
```

#### 4e. Remove the dead switch cases

After wiring up the registry dispatch, delete the old switch statement entirely.

### Verification
```bash
bun test
```

---

## Step 6: Decompose scoreHand() into Passes

### Goal
Break the monolithic `scoreHand()` (DiceSystem.ts, ~400 lines) into named functions that each do one thing.

### Current Structure of scoreHand()

```
scoreHand(handResult, equipment, scoreContext):
  1. Pre-scoring pass (Graverobber strips enhancements)     ~30 lines
  2. Calculate retrigger counts                              ~5 lines
  3. Per-die scoring loop:                                   ~200 lines
     a. Base value (die.value or stone 50)
     b. Bonus miles (die.bonusMiles)
     c. Enhancement effects (bone/wooden/diamond/lucky/stone)
     d. Aura effects (fire/icy/holy)
     e. Sticker effects (purple_flower/golden_dollar)
     f. Per-die equipment triggers (← replaced by registry in Step 4)
  4. Post-scoring special effects:                           ~80 lines
     a. SOLO_FIRST_DAY_ENHANCE / FIRST_DAY_SOLO_COPY
     b. FIRST_HAND_ENHANCED_SIX
     c. ENHANCED_RETRIGGER (Moonshine destruction)
  5. Final calculation                                       ~10 lines
```

### Target Structure

```typescript
export function scoreHand(handResult: HandResult, equipment: EquipmentInstance[], scoreContext?: ScoreContext): ScoreResult {
  const ctx = createScoringContext(handResult, equipment, scoreContext);

  preScoringPass(ctx);
  perDieScoringPass(ctx);
  postScoringSpecialEffects(ctx);

  return finalizeScoringResult(ctx);
}
```

### Instructions

#### 6a. Extract `preScoringPass()`

Move the Graverobber enhancement-stripping loop into:

```typescript
function preScoringPass(ctx: ScoringPipelineContext): void {
  const { equipment, scoringDice, animEvents } = ctx;
  const maxCopyDepth = equipment.length;

  for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
    let equip = equipment[eIdx];
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, eIdx, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
    }
    if (equip.def.effectType !== 'GRAVEROBBER_XMULT') continue;
    // ... rest of graverobber logic
  }
}
```

#### 6b. Extract `perDieScoringPass()`

Contains retrigger calculation and the main per-die loop with:
- Base value addition
- Bonus miles
- Enhancement effects (bone/wooden/diamond/lucky/stone switch)
- Aura effects (fire/icy/holy switch)
- Sticker effects
- Per-die equipment triggers (registry dispatch from Step 4)

```typescript
function perDieScoringPass(ctx: ScoringPipelineContext): void {
  const { handResult, equipment, animEvents } = ctx;
  const player = getPlayerState();
  const globalRetriggerCount = getScoredRetriggerCount(equipment, { currentDay: ctx.currentDay, maxDays: ctx.maxDays });

  for (const die of handResult.scoringDice) {
    let triggers = die.sticker === 'red_bullet' ? 2 : 1;
    // ... retrigger calculation
    triggers += globalRetriggerCount;

    for (let t = 0; t < triggers; t++) {
      applyDieBaseValue(ctx, die, t);
      applyDieEnhancement(ctx, die, t);
      applyDieAura(ctx, die, t);
      applyDieSticker(ctx, die, t);
      applyPerDieEquipment(ctx, die, t);  // uses registry
    }
  }
}
```

#### 6c. Extract sub-functions for die processing

```typescript
function applyDieBaseValue(ctx: ScoringPipelineContext, die: Die, triggerIndex: number): void {
  const dieMiles = die.enhancement === 'stone' ? 50 : die.value;
  ctx.totalValue += dieMiles;
  ctx.animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: dieMiles, dieId: die.id });

  if (die.bonusMiles > 0) {
    ctx.totalValue += die.bonusMiles;
    ctx.animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: die.bonusMiles, dieId: die.id });
  }
}

function applyDieEnhancement(ctx: ScoringPipelineContext, die: Die, triggerIndex: number): void {
  switch (die.enhancement) {
    case 'bone': ctx.bonusMult += 4; /* + animEvent */ break;
    case 'wooden': ctx.totalValue += 10; /* + animEvent */ break;
    case 'diamond': ctx.xMult *= 2; /* + animEvent */ break;
    case 'lucky': /* ... */ break;
  }
}

function applyDieAura(ctx: ScoringPipelineContext, die: Die, triggerIndex: number): void {
  switch (die.aura) {
    case 'fire': ctx.bonusMult += 10; /* + animEvent */ break;
    case 'icy': ctx.totalValue += 50; /* + animEvent */ break;
    case 'holy': ctx.xMult *= 1.5; /* + animEvent */ break;
  }
}

function applyDieSticker(ctx: ScoringPipelineContext, die: Die, triggerIndex: number): void {
  if (die.sticker === 'purple_flower') { /* ... */ }
  if (die.sticker === 'golden_dollar') { /* ... */ }
}
```

#### 6d. Extract `postScoringSpecialEffects()`

Move SOLO_FIRST_DAY_ENHANCE, FIRST_DAY_SOLO_COPY, FIRST_HAND_ENHANCED_SIX, and ENHANCED_RETRIGGER logic.

#### 6e. Extract `finalizeScoringResult()`

```typescript
function finalizeScoringResult(ctx: ScoringPipelineContext): ScoreResult {
  const mult = (ctx.handResult.baseMult + ctx.bonusMult) * ctx.xMult;
  const miles = (ctx.handResult.baseMiles + ctx.totalValue) * mult;
  return { handResult: ctx.handResult, totalValue: ctx.totalValue, miles, mult, animEvents: ctx.animEvents };
}
```

### Important Notes

- All extracted functions are **module-private** (not exported). Only `scoreHand()` is exported.
- The `matchesParity()` helper stays as-is (already a separate function).
- Keep console.log statements in place — they're used for debugging.

### Verification
```bash
bun test
```

---

## Step 7: Extract Scoring Mutations

### Goal
Stop calling `player.economy.earn()`, `player.dice.splice()`, `player.consumables.push()` deep inside scoring. Instead, collect mutations and apply them at the boundary.

### Current Mutation Sites in Scoring

| Location | Mutation | Code |
|----------|----------|------|
| `scoreHand()` lucky enhancement | `player.economy.earn(20)` | Earn money |
| `scoreHand()` golden_dollar sticker | `player.economy.earn(3)` | Earn money |
| `scoreHand()` GOLD_DICE_MONEY | `player.economy.earn(p.value)` | Earn money |
| `scoreHand()` ENHANCED_SCORE_MONEY | `player.economy.earn(p.value)` | Earn money |
| `scoreHand()` LUCKY_DICE_MONEY | `player.economy.earn(p.value)` | Earn money |
| `scoreHand()` PIP_SUPPLY_CHANCE | `player.consumables.push(...)` | Grant consumable |
| `scoreHand()` purple_flower sticker | `player.consumables.push(...)` | Grant consumable |
| `scoreHand()` PERMANENT_DIE_MILES_GAIN | `die.bonusMiles += ...` | Modify die |
| `scoreHand()` Graverobber | `die.enhancement = null` | Strip enhancement |
| `scoreHand()` SOLO_FIRST_DAY_ENHANCE | `target.enhancement = ...` | Enhance die |
| `scoreHand()` FIRST_DAY_SOLO_COPY | `player.dice.push(copy)` | Create die |
| `scoreHand()` FIRST_HAND_ENHANCED_SIX | `player.dice.splice(idx, 1)` | Destroy die |
| `scoreHand()` ENHANCED_RETRIGGER | `player.dice.splice(idx, 1)` | Destroy die |
| `processHeldInHand()` | `moneyEarned` (returned, applied by caller) | Already correct! |

### Instructions

#### 7a. Replace direct mutations with mutation collection

In each handler/pass where `player.economy.earn(X)` is called:
```typescript
// Before:
player.economy.earn(p.value as number);

// After:
ctx.mutations.moneyEarned += p.value as number;
```

For consumable grants:
```typescript
// Before:
const supplyDef = getRandomSupplyDef();
player.consumables.push(createConsumableInstance(supplyDef));

// After:
const supplyDef = getRandomSupplyDef();
ctx.mutations.consumablesGranted.push(supplyDef.id);
```

For die destruction:
```typescript
// Before:
player.dice.splice(idx, 1);

// After:
ctx.mutations.diceDestroyed.push(die.id);
```

For die enhancement changes:
```typescript
// Before:
target.enhancement = 'bone';

// After:
ctx.mutations.diceEnhanced.push({ id: target.id, enhancement: 'bone' });
```

#### 7b. Use `applyMutations.ts` (already exists)

`src/game/effects/applyMutations.ts` already has `applyScoringMutations()`. Verify it handles all mutation types above.

#### 7c. Call `applyScoringMutations()` in `GameState.calculateScore()`

After `scoreHand()` returns, apply mutations:
```typescript
const baseResult = scoreHand(leveledResult, player.equipment, { currentDay, maxDays });
applyScoringMutations(baseResult.mutations); // NEW
```

This requires `scoreHand()` to return mutations on its result. Add `mutations: ScoringMutations` to the `ScoreResult` interface in `types.ts`.

#### 7d. Special handling: Graverobber

Graverobber strips enhancements from dice that are ABOUT TO BE SCORED — the stripped enhancement affects the scoring calculation itself. This mutation MUST be applied eagerly (before the die loop), not deferred:

```typescript
// Strip from the scored die (local copy — affects this scoring run)
die.enhancement = null;
// Defer the permanent strip to the pouch
ctx.mutations.diceEnhanced.push({ id: die.id, enhancement: null });
```

#### 7e. Special handling: PERMANENT_DIE_MILES_GAIN (Cowboy Boots)

This modifies `die.bonusMiles` on the scored die copy AND on the pouch die. The scored copy modification affects retriggers in the same scoring run:
```typescript
die.bonusMiles += p.value as number; // affects this scoring run (retriggers)
ctx.mutations.dieBonusMilesAdded.push({ id: die.id, amount: p.value as number }); // persist to pouch
```

### Verification
```bash
bun test
```

**Warning**: This step has the highest risk of breaking tests because mutations happen at a different time now. Run tests after EACH sub-step. If tests break, check whether any test relies on `player.economy.balance` being updated MID-scoring.

**Known issue**: `MILES_PER_DOLLAR` uses `context.playerBalance` which is snapshotted at scoring start. If money is earned during scoring (e.g., from GOLD_DICE_MONEY), the old code would see the updated balance mid-scoring. With deferred mutations, it won't. Check if any test catches this — if so, keep those specific economy mutations eager.

---

## Step 9: Break the DiceSystem → EquipmentEffects Import ✅ DONE

### Status
- ✅ `processEquipmentOnLuckyTrigger` → `dispatchLifecycle(equipment, 'on-lucky-trigger')`
- ✅ `processEquipmentOnDiamondDestroyed` → `dispatchLifecycle(equipment, 'on-diamond-destroyed')`
- ✅ DiceSystem.ts imports updated
- ✅ No remaining `DiceSystem.ts → EquipmentEffects.ts` imports
- ✅ `dispatchLifecycle` handlers registered in `src/game/effects/lifecycle/onSell.ts`

### Verification
```bash
bun test
```

#### 9a. `getScoredRetriggerCount` already in `src/game/effects/helpers.ts`

This function is already duplicated there. Remove the copy from `EquipmentEffects.ts` and import from `./effects` instead:

```typescript
import { getScoredRetriggerCount } from './effects/helpers';
```

Keep a re-export in `EquipmentEffects.ts` for any other consumers:
```typescript
export { getScoredRetriggerCount } from './effects/helpers';
```

#### 9b. Replace `processEquipmentOnLuckyTrigger` with lifecycle dispatch

In the lucky enhancement handling inside `scoreHand()`:

```typescript
// Before:
processEquipmentOnLuckyTrigger(equipment);

// After:
import { dispatchLifecycle } from './effects/lifecycle/dispatch';
dispatchLifecycle(equipment, 'on-lucky-trigger');
```

#### 9c. Replace `processEquipmentOnDiamondDestroyed` with lifecycle dispatch

```typescript
// Before:
processEquipmentOnDiamondDestroyed(equipment);

// After:
dispatchLifecycle(equipment, 'on-diamond-destroyed');
```

#### 9d. Update DiceSystem.ts imports

```typescript
// Remove:
import { getScoredRetriggerCount, processEquipmentOnLuckyTrigger, processEquipmentOnDiamondDestroyed } from './EquipmentEffects';

// Add:
import { effectRegistry, getScoredRetriggerCount } from './effects';
import { dispatchLifecycle } from './effects/lifecycle/dispatch';
```

#### 9e. Verify no remaining DiceSystem → EquipmentEffects imports

```bash
grep -n "from.*EquipmentEffects" src/game/DiceSystem.ts
```

Should return no results.

### Verification
```bash
bun test
```

---

## Final Verification Checklist

After ALL steps are complete:

1. `bun test` — all tests pass
2. `bun run build` — no TypeScript errors
3. `bun run dev` — game plays correctly (manual smoke test)
4. Verify DiceSystem.ts no longer imports from EquipmentEffects.ts ✅
5. Verify the switch statement in the per-die loop of `scoreHand()` is gone ✅
6. Verify `scoreHand()` is under 50 lines (orchestration only) — NOT YET (Step 6)
7. Verify no handler file imports from `../../EquipmentEffects`

### Remaining Steps

| Step | Status | Notes |
|------|--------|-------|
| Issue 1 | ❌ | Double-earn in enhancementEffects.ts |
| Issue 2 | ❌ | equipIndex: -1 in conditional.ts |
| Issue 3 | ❌ | handTypeMatches import from EquipmentEffects |
| Issue 4 | ✅ | Already fixed in code |
| Issue 5 | ❌ | Re-export in types.ts |
| Step 4 | ✅ | Per-die handlers wired |
| Step 6 | ❌ | Decompose scoreHand() |
| Step 7 | ⚠️ | Partial — mutations interface + merge done |
| Step 9 | ✅ | Import broken |

---

## Rollback Plan

If at any step tests break and the fix is non-obvious:

1. `git stash` or `git checkout -- .` the current step's changes
2. Re-examine the specific test failure
3. The most likely issue: **handler execution order** differs from switch order. Ensure handlers are called in the same equipment index order as the original loop.
4. Second most likely: **variable scoping** — a handler reads a variable that was set by a previous case in the same switch. If handlers modify shared state, they must do so through `ctx`.

---

## What NOT to Change

- **ScoreAnimEvent system** — Already works perfectly as-is.
- **GameState.calculateScore() orchestration** — Keep it as the top-level coordinator.
- **Test files** — Don't modify test assertions. If tests break, the implementation is wrong.
- **Phaser layer** — Nothing in `src/phaser/` changes.
- **Constants.ts** — No changes.
