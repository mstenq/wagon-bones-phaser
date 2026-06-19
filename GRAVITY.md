# Gravity Roll Bias Fix

**Status:** ready to implement
**New chat prompt:** Attach this file and say: "Implement the Gravity roll bias fix."

## Goal

Fix the new `gravity` item so it composes with loaded dice enhancement and `gamblers_dice_cup` instead of being bypassed by them.

Desired behavior:

- Loaded target `1` + Gravity mode `3` from two selected/rolled `3`s should give a loaded/cup-affected die about `1/6` chance to roll `1` and `1/6` chance to roll `3`.
- Gravity with five matching dice should guarantee the Gravity mode face, even if loaded enhancement or `gamblers_dice_cup` would otherwise pull toward a different loaded target.
- Loaded Dice equipment (`loaded_dice`) still doubles listed probabilities, including Gravity odds, capped at guaranteed.

## Current Problem

`src/game/DiceSystem.ts` currently checks loaded/cup bias first and returns immediately:

```ts
if (loadedTarget !== null) {
  const loadedChance = getLoadedFaceRollChance(equipment, die.enhancement);
  if (loadedChance > 0) {
    if (rngFloat('loadedDice') < loadedChance) return { ...die, value: loadedTarget };
    return { ...die, value: rngPick('loadedDice', otherFaces) };
  }
}

const gravityRoll = rollGravityBiasedDie(die, equipment, run);
if (gravityRoll) return gravityRoll;
```

That makes the systems mutually exclusive. Any loaded die, or any unenhanced die with `gamblers_dice_cup`, skips Gravity entirely.

## Decided Approach

Implement one shared face-bias roll path in `src/game/DiceSystem.ts`.

Use collected bias entries rather than priority branches:

```ts
type FaceRollBias = {
  face: number;
  chance: number;
  source: 'loaded' | 'gravity';
};
```

Composition semantics:

- Stone dice still return value `0` immediately.
- Collect the loaded/cup bias when `loadedTarget !== null` and `getLoadedFaceRollChance(...) > 0`.
- Collect the Gravity bias when the round is in `ROLL`, `gravity` equipment is present, and `getGravityModeFace(...)` returns a mode.
- If any Gravity bias has `chance >= 1`, return the Gravity face immediately. This encodes "guaranteed Gravity overwhelms loaded/cup."
- Otherwise, roll one categorical bucket across all bias entries.
- For different faces, each entry contributes its chance directly, capped by total chance `<= 1`.
- If multiple entries target the same face, combine their chances and cap at `1`.
- If the bias bucket misses, roll uniformly among the remaining non-biased faces.

The categorical roll should preserve the desired marginal odds:

- Biases `{ face: 1, chance: 1 / 6 }` and `{ face: 3, chance: 1 / 6 }` mean:
  - `1/6` chance to roll `1`
  - `1/6` chance to roll `3`
  - `4/6` chance to roll uniformly among faces other than `1` and `3`

## Implementation Checklist

- [ ] Replace `rollGravityBiasedDie` with helper(s) that collect biases and resolve them in one place.
- [ ] Keep `D12_FACES` in `DiceSystem.ts`.
- [ ] Add `FaceRollBias` type near the rolling helpers.
- [ ] Add `collectFaceRollBiases(die, equipment, run): FaceRollBias[]`.
- [ ] Add `resolveBiasedFaceRoll(die, biases): Die | null`.
- [ ] Update `rollDie` to call the shared bias path once, after the stone-die guard.
- [ ] Remove duplicated "target face else random other faces" logic from the loaded branch and Gravity branch.
- [ ] Keep chance math in `equipmentUtils.ts`; do not move item display logic into `DiceSystem.ts`.
- [ ] Add interaction tests before considering the fix done.

## Suggested Code Shape

```ts
type FaceRollBiasSource = 'loaded' | 'gravity';

type FaceRollBias = {
  face: number;
  chance: number;
  source: FaceRollBiasSource;
};

function collectFaceRollBiases(
  die: Die,
  equipment: ReturnType<typeof resolveEquipmentList>,
  run: ReturnType<typeof getRunState>,
): FaceRollBias[] {
  const biases: FaceRollBias[] = [];

  const loadedTarget = selectResolvedLoadedDieTarget(run);
  if (loadedTarget !== null) {
    const loadedChance = getLoadedFaceRollChance(equipment, die.enhancement);
    if (loadedChance > 0) {
      biases.push({ face: loadedTarget, chance: loadedChance, source: 'loaded' });
    }
  }

  const round = getRoundState();
  if (round?.phase === 'ROLL' && hasGravityEquipment(equipment)) {
    const mode = getGravityModeFace(rolledRefsToDice(round.rolledDice, round, run));
    if (mode) {
      const gravityChance = getGravityRollChance(mode.count, equipment);
      if (gravityChance > 0) {
        biases.push({ face: mode.face, chance: gravityChance, source: 'gravity' });
      }
    }
  }

  return biases;
}
```

`resolveBiasedFaceRoll` should combine same-face entries before rolling:

```ts
function resolveBiasedFaceRoll(die: Die, biases: FaceRollBias[]): Die | null {
  if (biases.length === 0) return null;

  const guaranteedGravity = biases.find((bias) => bias.source === 'gravity' && bias.chance >= 1);
  if (guaranteedGravity) return { ...die, value: guaranteedGravity.face };

  const chanceByFace = new Map<number, number>();
  for (const bias of biases) {
    const current = chanceByFace.get(bias.face) ?? 0;
    chanceByFace.set(bias.face, Math.min(1, current + bias.chance));
  }

  let roll = rngFloat('loadedDice');
  for (const [face, chance] of chanceByFace) {
    if (roll < chance) return { ...die, value: face };
    roll -= chance;
  }

  const biasedFaces = new Set(chanceByFace.keys());
  const otherFaces = D12_FACES.filter((face) => !biasedFaces.has(face));
  return { ...die, value: rngPick('loadedDice', otherFaces) };
}
```

Then `rollDie` should become approximately:

```ts
export function rollDie(die: Die): Die {
  if (die.enhancement === 'stone') return { ...die, value: 0 };

  const run = getRunState();
  const equipment = resolveEquipmentList();
  const biasedRoll = resolveBiasedFaceRoll(die, collectFaceRollBiases(die, equipment, run));
  if (biasedRoll) return biasedRoll;

  return { ...die, value: rngInt('dice', 1, 12) };
}
```

Important: if total combined chance can exceed `1` for non-guaranteed mixed faces, cap or normalize deliberately. The simplest rule is to process entries in insertion order and stop once cumulative chance reaches `1`. With current expected values, the critical cases are below or equal to `1`, except same-face stacking or multiple Loaded Dice copies.

## Tests To Add

Add tests in `src/game/__tests__/items/loadedDice.test.ts` unless splitting out `gravity.test.ts` first.

Required tests:

- [ ] `gravity + gamblers_dice_cup` with loaded target `1` and Gravity mode `3` from two matching dice:
  - Monte Carlo around `20_000` rolls.
  - Assert `P(1)` is roughly `1/6`.
  - Assert `P(3)` is roughly `1/6`.
- [ ] `gravity + loaded enhancement` with loaded target `1` and Gravity mode `3` from two matching dice:
  - A loaded die normally has `1/3` loaded chance; decide if the expected loaded side is `1/3` or `1/6` here.
  - User example says "loaded die value was 1 but you had 2 selected 3s ... 1 in 6 chance to be 1 and 1 in 6 chance to be 3"; follow that unless the designer clarifies otherwise.
- [ ] `guaranteed gravity overwhelms loaded enhancement`:
  - Five matching `3`s in rolled dice.
  - Loaded target `1`.
  - Rolling a loaded die always returns `3`.
- [ ] `guaranteed gravity overwhelms gamblers_dice_cup`:
  - Five matching `3`s in rolled dice.
  - Loaded target `1`.
  - Equipment includes `gravity` and `gamblers_dice_cup`.
  - Rolling an unenhanced die always returns `3`.
- [ ] Same-face stacking behavior:
  - Loaded target equals Gravity mode face.
  - Assert the chosen rule, likely combined chance capped at `1`.

Existing Gravity tests should continue to pass:

- Helper odds table.
- Gravity inactive on first roll / `SELECT` phase.
- Five matches guarantee in Gravity-only case.
- Player reroll path applies Gravity.
- Copy incompatibility.
- Scoring neutrality.

## Key Files

| File | Why |
|------|-----|
| `src/game/DiceSystem.ts` | Main fix: replace exclusive roll branches with shared composed face-bias resolver. |
| `src/game/equipmentUtils.ts` | Keep chance helpers here: `getLoadedFaceRollChance`, `getGravityRollChance`, `getGravityModeFace`. |
| `src/data/items.ts` | Gravity display uses `getGravityModeFace` and `formatGravityOddsLabel`; may need wording tweaks only. |
| `src/game/__tests__/items/loadedDice.test.ts` | Existing loaded/cup tests and new Gravity tests live here currently. |
| `src/game/Constants.ts` | `GRAVITY` is already copy-incompatible; leave this in place. |

## Constraints

- Use `bun`, not `npm`, `npx`, or `yarn`.
- Keep game logic in `src/game`; do not add Phaser dependencies to roll logic.
- Avoid nested ternaries.
- Do not add save/load migration code for this; the game is pre-ship.
- Do not preserve the old exclusive-branch behavior.
- Do not add aliases or separate visual/gameplay IDs for Gravity.

## Rejected (Do Not Implement)

- Do not keep `rollDie` as `loaded branch -> return -> gravity branch`.
- Do not make Gravity a separate post-roll correction after loaded/cup has already chosen a value.
- Do not duplicate the same target-face/random-other-face algorithm in another helper.
- Do not solve this only with tests; the roll distribution is currently structurally wrong.

## Open Questions

- Confirm whether loaded enhancement with Gravity mode from two matches should be `1/6` toward loaded target as the user example says, or retain the current loaded enhancement base chance of `1/3`. If no clarification is available, follow the user example in this document.
- Decide exact same-face stacking semantics. Recommended: combine chances for the same face and cap at `1`.

## Verification

- `bun test src/game/__tests__/items/loadedDice.test.ts`
- `bun run typecheck`
- `bun run check`
