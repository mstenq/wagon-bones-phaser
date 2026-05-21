# Step 6: Equipment Modifiers — Runtime Effects

## Goal

Implement the actual gameplay consequences of each modifier during play.

## Cursed — Block Selling

### Where to Enforce

1. **`PlayerState.sellEquipment(index)`** — Check if equipment has `'cursed'` modifier, reject sale
2. **Shop UI** — Disable/hide sell button on cursed equipment
3. **Trail events that force-sell** — Cursed items are skipped (cannot be selected for discard)

### Implementation

```typescript
// In PlayerState or wherever sell logic lives:
sellEquipment(index: number): boolean {
  const equip = this.equipment[index];
  if (!equip) return false;
  if (equip.modifiers.includes('cursed')) return false; // Cannot sell cursed items
  
  // ... existing sell logic
}
```

### Edge Cases
- If the player's equipment is full and all slots are Cursed, they still can't sell — they just can't buy new equipment
- Trail events that "destroy" equipment (not "sell") CAN affect Cursed items — destruction ≠ selling
- Boss effects that destroy equipment CAN destroy Cursed items

## Perishable — Round Countdown & Destruction

### Lifecycle Hook

Register a lifecycle handler for `'round_end'` (or `'round_start'` of next round):

```typescript
// In src/game/effects/lifecycle/ or a new EquipmentModifiers lifecycle handler

function processPerishableEquipment(player: PlayerState): void {
  const toDestroy: number[] = [];
  
  for (let i = 0; i < player.equipment.length; i++) {
    const equip = player.equipment[i];
    if (equip.modifiers.includes('perishable') && equip.perishableRoundsLeft !== undefined) {
      equip.perishableRoundsLeft -= 1;
      if (equip.perishableRoundsLeft <= 0) {
        toDestroy.push(i);
      }
    }
  }
  
  // Remove destroyed equipment (iterate in reverse to preserve indices)
  for (let i = toDestroy.length - 1; i >= 0; i--) {
    player.destroyEquipment(toDestroy[i]);
  }
}
```

### When to Trigger
- **End of each round** (after scoring, before shop)
- Decrement happens regardless of whether the equipment was "used" that round
- Emit an event so the UI can animate the destruction

### EventBus Events
```typescript
Events.EQUIPMENT_PERISHED = 'equipment:perished';  // { equipmentName, index }
```

## Leased — End-of-Round Upkeep

### Lifecycle Hook

At **end of each round** (before interest is calculated, same timing as gold dice), deduct upkeep for each leased item:

```typescript
function processLeasedEquipment(player: PlayerState): void {
  const toDestroy: number[] = [];
  
  for (let i = 0; i < player.equipment.length; i++) {
    const equip = player.equipment[i];
    if (equip.modifiers.includes('leased')) {
      if (player.money >= EQUIPMENT_MODIFIER.LEASED_UPKEEP) {
        player.economy.spend(EQUIPMENT_MODIFIER.LEASED_UPKEEP);
        // Emit upkeep paid event for UI feedback
      } else {
        // Can't pay — mark for destruction
        toDestroy.push(i);
      }
    }
  }
  
  // Remove equipment that couldn't be paid for
  for (let i = toDestroy.length - 1; i >= 0; i--) {
    player.destroyEquipment(toDestroy[i]);
  }
}
```

### When to Trigger
- **End of each round** (after scoring, before interest calculation)
- Same timing window as gold dice money generation — they can offset each other
- Player sees upkeep deductions in a brief animation/popup
- If player can't afford ALL leased items, process left-to-right (slot order matters)

### Processing Order
Process leased items left-to-right. Each deduction reduces available money for subsequent items. This means slot order affects which items you keep when money is tight.

### Buy Price
Leased equipment costs only **$1** in the shop (regardless of normal price). The real cost is the $3/round upkeep.

### EventBus Events
```typescript
Events.LEASE_PAID = 'equipment:lease_paid';        // { equipmentName, index, cost }
Events.LEASE_DEFAULTED = 'equipment:lease_defaulted'; // { equipmentName, index }
```

## Interaction with Existing Systems

| System | Cursed | Perishable | Leased |
|--------|--------|------------|--------|
| Sell | ❌ Blocked | ✅ Normal | ✅ Normal |
| Trail event destroy | ✅ Can destroy | ✅ Can destroy | ✅ Can destroy |
| Boss destroy | ✅ Can destroy | ✅ Can destroy | ✅ Can destroy |
| Copy (Mirror Lake) | Copy works normally | Copy works normally | Copy works normally |
| Auras | Normal | Normal | Normal |
| Effect triggering | Normal | Normal | Normal |

## PlayerState.destroyEquipment()

May need a new method distinct from `sellEquipment`:

```typescript
destroyEquipment(index: number): void {
  // Remove from array without granting sell value
  // Emit destruction event
  this.equipment.splice(index, 1);
  EventBus.emit(Events.EQUIPMENT_DESTROYED, { index });
}
```

## Verification

- Cursed equipment cannot be sold via any player-initiated sell action
- Perishable equipment counts down each round and is destroyed at 0
- Leased equipment deducts money at round start
- Leased equipment with insufficient funds is destroyed
- Multiple modifiers work together (Cursed+Leased: can't sell, must pay upkeep)
- Perishable+Leased: pays upkeep AND counts down
