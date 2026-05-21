# Step 5: Equipment Modifiers — Spawn Logic

## Goal

When equipment is acquired (shop purchase, booster pack, trail event), roll for modifiers based on the current difficulty level.

## Where Modifiers Are Applied

Modifiers are rolled **at the moment equipment enters the player's inventory**, not when it's generated for display. This means:

1. **Shop purchase** — roll when player buys
2. **Booster pack** — roll when card is selected/confirmed
3. **Trail event grant** — roll when equipment is awarded
4. **Profession starting equipment** — NO modifiers (always clean)

## Implementation

### 1. Create `src/game/EquipmentModifiers.ts`

```typescript
import { DifficultyLevel, EquipmentModifier } from './types';
import { EQUIPMENT_MODIFIER } from './Constants';

/** Items immune to Cursed modifier */
export const CURSED_IMMUNE = new Set([
  'dynamite', 'nitro', 'bounty_contract', 'steam_engine', 'phantom_wagon',
  'sheriffs_badge', 'guardian_totem', 'fading_memory', 'worn_deck', 'war_drums', 'flour_sack',
]);

/** Items immune to Perishable modifier */
export const PERISHABLE_IMMUNE = new Set([
  'bone_collector', 'rabbits_foot', 'bargain_bin', 'card_counter', 'book_of_the_dead',
  'guide_lantern', 'tight_fist', 'haunted_totem', 'square_dance', 'new_blood',
  'manifest_destiny', 'covered_wagon', 'diamond_coffin', 'five_mail_marker',
  'grave_robber', 'six_feet_under', 'funeral_pyre', 'trail_tax', 'trailblazer', 'railroad_bonds',
]);

/**
 * Roll equipment modifiers based on current difficulty level.
 * Returns array of modifiers to apply (may be empty).
 */
export function rollEquipmentModifiers(difficulty: DifficultyLevel, itemId: string): EquipmentModifier[] {
  const modifiers: EquipmentModifier[] = [];
  
  // Level 4+: Roll for Cursed (30%) — skip if item is immune
  if (difficulty >= 4 && !CURSED_IMMUNE.has(itemId) && Math.random() < EQUIPMENT_MODIFIER.CURSED_RATE) {
    modifiers.push('cursed');
  }
  
  // Level 7+: Roll for Perishable (30%) — incompatible with Cursed, skip if immune
  if (difficulty >= 7 && !modifiers.includes('cursed') && !PERISHABLE_IMMUNE.has(itemId) && Math.random() < EQUIPMENT_MODIFIER.PERISHABLE_RATE) {
    modifiers.push('perishable');
  }
  
  // Level 8+: Roll for Leased (30%) — compatible with both
  if (difficulty >= 8 && Math.random() < EQUIPMENT_MODIFIER.LEASED_RATE) {
    modifiers.push('leased');
  }
  
  return modifiers;
}

/**
 * Apply rolled modifiers to an equipment instance.
 * Mutates the instance in place.
 */
export function applyModifiersToEquipment(
  instance: { modifiers: EquipmentModifier[]; perishableRoundsLeft?: number; sellValue: number },
  modifiers: EquipmentModifier[],
  originalCost: number,
): void {
  instance.modifiers = modifiers;
  
  if (modifiers.includes('perishable')) {
    instance.perishableRoundsLeft = EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS;
  }
  
  if (modifiers.includes('cursed')) {
    instance.sellValue = 0; // Cannot be sold — UI blocks the action
  }
  
  if (modifiers.includes('leased')) {
    // Leased items cost only $1 to buy (upkeep is $3/round)
    instance.sellValue = 0;
  }
}
```

**Leased Buy Price:** When an item rolls `leased`, its shop purchase price is overridden to $1 (regardless of original cost). The real cost is the $3/round upkeep.

### 2. Modify `src/game/ItemsSystem.ts` — Shop Purchase

In the function that handles buying equipment from the shop:

```typescript
import { rollEquipmentModifiers, applyModifiersToEquipment } from './EquipmentModifiers';
import { getPlayerState } from './PlayerState';

// After creating the EquipmentInstance:
const modifiers = rollEquipmentModifiers(getPlayerState().difficulty);
applyModifiersToEquipment(instance, modifiers);
```

### 3. Modify `src/game/BoosterPackSystem.ts` — Pack Equipment

When equipment is selected from a booster pack:

```typescript
const modifiers = rollEquipmentModifiers(getPlayerState().difficulty);
applyModifiersToEquipment(instance, modifiers);
```

### 4. Modify `src/game/TrailEventsSystem.ts` — Event Grants

When a trail event awards equipment:

```typescript
const modifiers = rollEquipmentModifiers(getPlayerState().difficulty);
applyModifiersToEquipment(instance, modifiers);
```

### 5. Profession Starting Equipment — NO Modifiers

The starting equipment from profession selection should always have `modifiers: []`. Do NOT call `rollEquipmentModifiers` for profession grants.

## Loaded Dice Interaction

Loaded Dice affects probability-based effects. Since modifier rolls are pure random chance:
- Loaded Dice does **NOT** affect modifier spawn rates
- These are penalties, not benefits — Loaded Dice only boosts positive probabilities

## Skin Walker / Priest's Blessing Interaction

These items transform/copy equipment but **do NOT work on Cursed items**. This creates an intentional exploit:
- If a powerful item is Cursed, the player can repeatedly attempt Skin Walker / Priest's Blessing on it
- Since the effect fails on Cursed items, the consumable is not consumed
- The player can then use it on a different target
- If the copy effect DID succeed, the copy would retain the Curse

This should be enforced in the Skin Walker / Priest's Blessing effect handlers: check `modifiers.includes('cursed')` and skip/fail gracefully.

## Verification

- At difficulty 1–3: no modifiers ever appear
- At difficulty 4: ~30% of acquired equipment is Cursed
- At difficulty 7: ~30% Cursed OR ~30% Perishable (never both)
- At difficulty 8: Leased rolls independently on top of Cursed/Perishable
- Profession starting equipment is never modified
- Modifier combinations respect incompatibility rules
