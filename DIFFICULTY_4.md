# Step 4: Equipment Modifiers — Data Model & Types

## Goal

Define the data structures for the three new equipment modifiers (Cursed, Perishable, Leased) and update `EquipmentInstance` to support them.

## New Types

### `src/game/types.ts`

```typescript
export type EquipmentModifier = 'cursed' | 'perishable' | 'leased';
```

### Updated `EquipmentInstance`

```typescript
export interface EquipmentInstance {
  def: EquipmentDef;
  sellValue: number;
  state: Record<string, number>;
  // Equipment modifiers (difficulty system)
  modifiers: EquipmentModifier[];
  perishableRoundsLeft?: number;  // Only set when 'perishable' modifier is active
}
```

## Modifier Definitions

### Cursed
- **Field:** `modifiers` includes `'cursed'`
- **Behavior:** `sellValue` forced to -1 or a sentinel, sell action blocked in UI
- **No additional state needed**

### Perishable
- **Field:** `modifiers` includes `'perishable'`, `perishableRoundsLeft` starts at 5
- **Behavior:** Decrements each round. At 0, equipment is destroyed.
- **State:** `perishableRoundsLeft: number`

### Leased
- **Field:** `modifiers` includes `'leased'`
- **Behavior:** At round start, deducts $3. If player can't afford it, equipment is destroyed.
- **No additional counter needed**

## Combination Rules (Enforced at Spawn)

```typescript
function rollEquipmentModifiers(difficulty: DifficultyLevel): EquipmentModifier[] {
  const modifiers: EquipmentModifier[] = [];
  
  // Level 4+: Roll for Cursed
  if (difficulty >= 4 && Math.random() < EQUIPMENT_MODIFIER.CURSED_RATE) {
    modifiers.push('cursed');
  }
  
  // Level 7+: Roll for Perishable (incompatible with Cursed)
  if (difficulty >= 7 && !modifiers.includes('cursed') && Math.random() < EQUIPMENT_MODIFIER.PERISHABLE_RATE) {
    modifiers.push('perishable');
  }
  
  // Level 8+: Roll for Leased (compatible with both)
  if (difficulty >= 8 && Math.random() < EQUIPMENT_MODIFIER.LEASED_RATE) {
    modifiers.push('leased');
  }
  
  return modifiers;
}
```

**Order matters:** Cursed is rolled first. If Cursed succeeds, Perishable is skipped (incompatible). Leased rolls independently.

## Constants

```typescript
// In Constants.ts
export const EQUIPMENT_MODIFIER = {
  CURSED_RATE: 0.3,
  PERISHABLE_RATE: 0.3,
  PERISHABLE_ROUNDS: 5,
  LEASED_RATE: 0.3,
  LEASED_UPKEEP: 3,
  LEASED_BUY_PRICE: 1,  // Leased items cost $1 to buy regardless of normal price
} as const;
```

## Migration

All existing `EquipmentInstance` creation sites need to include `modifiers: []` by default. Search for places where equipment instances are created:

- `ItemsSystem.ts` — `createEquipmentInstance()`
- `PlayerState.ts` — profession special equipment
- `TrailEventsSystem.ts` — equipment granted by trail events
- `BoosterPackSystem.ts` — equipment from packs
- `ConsumablesSystem.ts` — equipment from consumable effects

Each creation site gets `modifiers: []` added. The modifier rolling happens in Step 5.

## Verification

- `EquipmentModifier` type is exported and usable
- All equipment instances have `modifiers: []` by default
- No runtime errors from missing `modifiers` field
- Existing tests pass unchanged
