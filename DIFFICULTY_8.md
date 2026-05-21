# Step 8: Testing

## Goal

Add comprehensive tests for the difficulty system, equipment modifiers, and their interactions.

## Test Files

### 1. `src/game/__tests__/difficulty.test.ts` (New File — OK because this is a new system, not a new item)

Tests for core difficulty mechanics:

```typescript
describe('Difficulty System', () => {
  describe('Target Miles', () => {
    it('uses normal targets at difficulty 1-2', () => { ... });
    it('uses rough targets at difficulty 3-4', () => { ... });
    it('uses deadly targets at difficulty 6+', () => { ... });
    it('deadly overrides rough at difficulty 6', () => { ... });
  });
  
  describe('Thin Supplies (Level 2+)', () => {
    it('round 1 gives no money reward at difficulty 2+', () => { ... });
    it('rounds 2 and 3 give normal rewards at difficulty 2+', () => { ... });
    it('round 1 gives normal reward at difficulty 1', () => { ... });
  });
  
  describe('Harsh Rations (Level 5+)', () => {
    it('reduces max days by 1 at difficulty 5+', () => { ... });
    it('stacks with profession day modifiers', () => { ... });
    it('never goes below 1 day', () => { ... });
  });
});
```

### 2. `src/game/__tests__/equipmentModifiers.test.ts` (New File — new system)

Tests for equipment modifier spawn and runtime logic:

```typescript
describe('Equipment Modifiers', () => {
  describe('rollEquipmentModifiers', () => {
    it('returns empty array below difficulty 4', () => { ... });
    it('can return cursed at difficulty 4+', () => { ... });
    it('can return perishable at difficulty 7+', () => { ... });
    it('can return leased at difficulty 8+', () => { ... });
    it('never returns cursed + perishable together', () => { ... });
    it('can return cursed + leased together', () => { ... });
    it('can return perishable + leased together', () => { ... });
  });
  
  describe('Cursed', () => {
    it('prevents selling equipment', () => { ... });
    it('sets sell value to 0', () => { ... });
    it('still allows destruction by trail events', () => { ... });
    it('still allows destruction by boss effects', () => { ... });
  });
  
  describe('Perishable', () => {
    it('starts with configured rounds remaining', () => { ... });
    it('decrements each round', () => { ... });
    it('destroys equipment when reaching 0', () => { ... });
    it('does not decrement on skipped rounds', () => { ... });
  });
  
  describe('Leased', () => {
    it('deducts upkeep at round start', () => { ... });
    it('destroys equipment when player cannot afford upkeep', () => { ... });
    it('processes left-to-right (slot order)', () => { ... });
    it('partial payment — keeps items until money runs out', () => { ... });
  });
  
  describe('Modifier Combinations', () => {
    it('cursed + leased: cannot sell but must pay upkeep', () => { ... });
    it('perishable + leased: counts down AND pays upkeep', () => { ... });
    it('perishable + leased: destruction by timer stops upkeep', () => { ... });
  });
});
```

### 3. Existing Test Compatibility

All existing tests run at default difficulty (1) and should pass without modification. Verify by running:

```bash
bun test
```

## Test Helpers

Add to `src/game/__tests__/testHelpers.ts`:

```typescript
export function setDifficulty(level: DifficultyLevel): void {
  getPlayerState().setDifficulty(level);
}

export function equipWithModifiers(
  def: EquipmentDef, 
  modifiers: EquipmentModifier[]
): EquipmentInstance {
  return {
    def,
    sellValue: modifiers.includes('cursed') ? 0 : def.cost,
    state: { ...def.initialState },
    modifiers,
    perishableRoundsLeft: modifiers.includes('perishable') ? EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS : undefined,
  };
}
```

## Statistical Tests for Spawn Rates

For the modifier spawn logic, use a large sample to verify rates are approximately correct:

```typescript
it('cursed spawns at approximately 30% at difficulty 4', () => {
  let cursedCount = 0;
  const trials = 10000;
  for (let i = 0; i < trials; i++) {
    const mods = rollEquipmentModifiers(4);
    if (mods.includes('cursed')) cursedCount++;
  }
  // Allow 5% tolerance
  expect(cursedCount / trials).toBeCloseTo(0.3, 1);
});
```

## Verification

- All new tests pass
- All existing tests pass unchanged
- Statistical spawn rate tests confirm ~30% rates
- Modifier combination rules are enforced
- Runtime effects (sell block, countdown, upkeep) work correctly
- Edge cases (0 money, full cursed slots, profession interactions) are covered
