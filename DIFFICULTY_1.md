# Step 1: Types, Constants, and PlayerState Changes

## Goal

Define the difficulty type system, add constants for all 8 levels, and wire difficulty into `PlayerState`.

## Files to Modify

### 1. `src/game/types.ts` — Add Difficulty Types

```typescript
// ─── Difficulty ───
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface DifficultyDef {
  level: DifficultyLevel;
  id: string;
  name: string;
  description: string;
  color: number;        // Hex color for UI badge/icon
  effects: string[];    // Human-readable list of cumulative effects
}

// ─── Equipment Modifiers ───
export type EquipmentModifier = 'cursed' | 'perishable' | 'leased';
```

### 2. `src/game/Constants.ts` — Add Difficulty Definitions

```typescript
export const DIFFICULTIES: DifficultyDef[] = [
  {
    level: 1,
    id: 'clear_skies',
    name: 'Clear Skies',
    description: 'Base difficulty. The trail is calm.',
    color: 0xffffff,
    effects: [],
  },
  {
    level: 2,
    id: 'thin_supplies',
    name: 'Thin Supplies',
    description: 'Round 1 of each leg gives no money reward.',
    color: 0xff6666,
    effects: ['No reward for Round 1'],
  },
  {
    level: 3,
    id: 'rough_trail',
    name: 'Rough Trail',
    description: 'Target miles escalate faster each leg.',
    color: 0x66cc66,
    effects: ['No reward for Round 1', 'Increased mile targets'],
  },
  {
    level: 4,
    id: 'cursed_relics',
    name: 'Cursed Relics',
    description: '30% of equipment spawns Cursed (cannot sell).',
    color: 0x333333,
    effects: ['No reward for Round 1', 'Increased mile targets', '30% Cursed equipment'],
  },
  {
    level: 5,
    id: 'harsh_rations',
    name: 'Harsh Rations',
    description: 'Lose 1 day per round.',
    color: 0x6688ff,
    effects: ['No reward for Round 1', 'Increased mile targets', '30% Cursed equipment', '-1 Day'],
  },
  {
    level: 6,
    id: 'deadly_frontier',
    name: 'Deadly Frontier',
    description: 'Mile targets become brutal.',
    color: 0xaa44ff,
    effects: ['No reward for Round 1', 'Brutal mile targets', '30% Cursed equipment', '-1 Day'],
  },
  {
    level: 7,
    id: 'spoiled_goods',
    name: 'Spoiled Goods',
    description: '30% of equipment spawns Perishable (destroyed after 5 rounds).',
    color: 0xff8800,
    effects: ['No reward for Round 1', 'Brutal mile targets', '30% Cursed equipment', '-1 Day', '30% Perishable equipment'],
  },
  {
    level: 8,
    id: 'debt_to_company_store',
    name: 'Debt to the Company Store',
    description: '30% of equipment spawns Leased ($3/round upkeep).',
    color: 0xffd700,
    effects: ['No reward for Round 1', 'Brutal mile targets', '30% Cursed equipment', '-1 Day', '30% Perishable equipment', '30% Leased equipment'],
  },
];

export const EQUIPMENT_MODIFIER = {
  CURSED_RATE: 0.3,
  PERISHABLE_RATE: 0.3,
  PERISHABLE_ROUNDS: 5,
  LEASED_RATE: 0.3,
  LEASED_UPKEEP: 3,
} as const;
```

### 3. `src/game/PlayerState.ts` — Store Difficulty

Add to the class:

```typescript
difficulty: DifficultyLevel = 1;

setDifficulty(level: DifficultyLevel): void {
  this.difficulty = level;
}
```

Modify `targetMiles` getter to respect difficulty:

```typescript
get targetMiles(): number {
  const effectiveLegIndex = Math.max(0, this.leg - 1 - this.permitScoreReduction);
  
  // Pick target array based on difficulty
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

Modify `maxDays` getter (or add one):

```typescript
get maxDays(): number {
  let days = GAMEPLAY.MAX_DAYS + (this.professionModifiers.days ?? 0);
  if (this.difficulty >= 5) days -= 1; // Harsh Rations
  return Math.max(1, days);
}
```

Modify round rewards:

```typescript
get roundReward(): number {
  const base = GAMEPLAY.ROUND_REWARDS[this.round - 1] ?? 3;
  if (this.difficulty >= 2 && this.round === 1) return 0; // Thin Supplies
  return base;
}
```

Reset difficulty on `resetPlayerState()`.

### 4. `src/game/types.ts` — Extend EquipmentInstance

```typescript
interface EquipmentInstance {
  def: EquipmentDef;
  sellValue: number;
  state: Record<string, number>;
  // New modifier fields:
  modifiers: EquipmentModifier[];      // Active modifiers on this instance
  perishableRounds?: number;           // Rounds remaining (if perishable)
}
```

## Verification

- `DifficultyLevel` type is importable across game logic
- `PlayerState.difficulty` defaults to 1
- `targetMiles` switches array based on difficulty
- `maxDays` subtracts 1 at level 5+
- Round 1 reward is 0 at level 2+
- `EquipmentInstance` has `modifiers` array
- All existing tests still pass (no behavior change at difficulty 1)
