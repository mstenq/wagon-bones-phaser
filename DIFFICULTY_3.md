# Step 3: Gameplay Effects (Target Miles, Rewards, Rerolls)

## Goal

Wire the first 6 difficulty levels' gameplay effects into the game logic. These are the non-modifier effects that change numbers/rules.

## Effects by Level (Cumulative)

| Level | Effect | Implementation |
|-------|--------|---------------|
| 2 | No Round 1 reward | `roundReward` returns 0 when `round === 1` |
| 3 | Rough Trail scaling | `targetMiles` uses `TARGET_MILES_BY_LEG_ROUGH` |
| 5 | -1 Reroll | `maxRerolls` reduced by 1 |
| 6 | Deadly Frontier scaling | `targetMiles` uses `TARGET_MILES_BY_LEG_DEADLY` (overrides level 3) |

## Files to Modify

### 1. `src/game/PlayerState.ts` — targetMiles Getter

```typescript
get targetMiles(): number {
  const effectiveLegIndex = Math.max(0, this.leg - 1 - this.permitScoreReduction);
  
  let targets = GAMEPLAY.TARGET_MILES_BY_LEG;
  if (this.difficulty >= 6) {
    targets = GAMEPLAY.TARGET_MILES_BY_LEG_DEADLY;
  } else if (this.difficulty >= 3) {
    targets = GAMEPLAY.TARGET_MILES_BY_LEG_ROUGH;
  }
  
  const base = targets[effectiveLegIndex] ?? GAMEPLAY.TARGET_MILES;
  const multiplier = GAMEPLAY.ROUND_MULTIPLIERS[this.round - 1] ?? 1;
  return Math.ceil(base * multiplier);
}
```

### 2. `src/game/PlayerState.ts` — effectiveRerolls

Apply the -1 reroll penalty in `effectiveRerolls` (used by `GameState` when starting a round):

```typescript
get effectiveRerolls(): number {
  // ... base + permits + profession - trail penalties ...
  if (this.difficulty >= 5) rerolls -= 1; // Harsh Rations
  return Math.max(0, rerolls);
}
```

### 3. `src/game/GameState.ts` — Round Reward

In the payout/round-end logic, check difficulty before awarding round money:

```typescript
getRoundReward(): number {
  const player = getPlayerState();
  if (player.difficulty >= 2 && player.round === 1) return 0;
  return GAMEPLAY.ROUND_REWARDS[player.round - 1] ?? 3;
}
```

### 4. `src/phaser/scenes/PayoutScene.ts` — Display Change

When showing round rewards on the payout screen, if reward is 0 due to Thin Supplies, show "Thin Supplies: No reward" in red/muted text so the player understands why.

## Edge Cases

- Profession reroll bonuses stack with the -1 penalty (e.g. +1 reroll profession at difficulty 5 stays at base 4).
- `Math.max(0, rerolls)` prevents going below 0 rerolls.
- Difficulty 6 completely overrides difficulty 3 (Deadly replaces Rough), they don't stack.

## Verification

- At difficulty 1: all values unchanged from current behavior
- At difficulty 2: Round 1 gives $0, rounds 2/3 give normal rewards
- At difficulty 3: targetMiles uses ROUGH array
- At difficulty 5: one fewer reroll available
- At difficulty 6: targetMiles uses DEADLY array
- All existing tests pass (they run at default difficulty 1)
