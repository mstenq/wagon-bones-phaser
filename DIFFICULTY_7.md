# Step 7: Equipment Modifiers — UI Rendering

## Goal

Display modifier badges on equipment cards so players can see at a glance which items are Cursed, Perishable, or Leased.

## Badge Design

Each modifier gets a small badge rendered in the top-right corner of the equipment card, stacked vertically if multiple modifiers are present.

### Badge Specs

| Modifier | Icon | Color | Badge BG |
|----------|------|-------|----------|
| Cursed | 🔒 Lock | White | Dark gray `0x333333` |
| Perishable | ⏱ Timer + number | White | Orange `0xff8800` |
| Leased | 💰 $ symbol | White | Gold `0xffd700` |

### Badge Layout
- Size: 20×20px rounded square
- Position: top-right corner of card, offset -4px from edge
- Stack: if multiple modifiers, stack vertically with 2px gap
- Perishable badge includes the remaining round count as small text

```
┌──────────────────┐
│              [🔒]│  ← Cursed badge
│              [$] │  ← Leased badge (stacked below)
│                  │
│   Card Content   │
│                  │
│                  │
└──────────────────┘
```

## Files to Modify

### 1. `src/phaser/ui/ItemCard.ts` — Add Badge Rendering

After rendering the card content, check `equipment.modifiers` and render badges:

```typescript
private renderModifierBadges(equipment: EquipmentInstance): void {
  const badges: { icon: string; color: number; text?: string }[] = [];
  
  if (equipment.modifiers.includes('cursed')) {
    badges.push({ icon: '🔒', color: 0x333333 });
  }
  if (equipment.modifiers.includes('perishable')) {
    badges.push({ icon: '⏱', color: 0xff8800, text: `${equipment.perishableRoundsLeft}` });
  }
  if (equipment.modifiers.includes('leased')) {
    badges.push({ icon: '$', color: 0xffd700 });
  }
  
  badges.forEach((badge, i) => {
    const x = this.x + UI.CARD_W / 2 - 14;
    const y = this.y - UI.CARD_H / 2 + 14 + i * 22;
    // Draw rounded rect bg
    // Draw icon text
  });
}
```

### 2. Sell Button State

In the shop/sell UI, when equipment is Cursed:
- Sell button is grayed out / hidden
- Tooltip: "Cursed — Cannot be sold"
- Sell value shows "—" instead of a dollar amount

### 3. Perishable Counter Update

Each round end, update the badge number on perishable items. When `perishableRoundsLeft` reaches 1, flash the badge red as a warning.

### 4. Leased Upkeep Indicator

At round start, briefly flash the leased badge and show "-$3" floating text for each leased item that pays upkeep.

### 5. Destruction Animation

When equipment is destroyed by Perishable expiry or Leased default:
- Card crumbles/fades with particle effect
- Brief text popup: "Spoiled!" or "Repossessed!"
- Sound effect (reuse existing card destruction sound or add new)

## Tooltip Enhancement

Equipment tooltips should mention active modifiers:

```
┌─────────────────────────────┐
│  Wagon Wheel                │
│  +3 Mult                    │
│                             │
│  🔒 Cursed — Cannot sell    │
│  ⏱ Perishable — 3 rounds   │
│  $ Leased — $3/round        │
└─────────────────────────────┘
```

Modifier lines are appended below the normal tooltip content with appropriate coloring:
- Cursed: gray text
- Perishable: orange text with countdown
- Leased: gold text with cost

## Hint Display Integration

If `hintDisplay` exists on the equipment, modifier info is shown BELOW the hint segments as a separate section with a divider line.

## Verification

- Cursed items show lock badge and disabled sell button
- Perishable items show timer badge with correct countdown number
- Leased items show money badge
- Multiple badges stack correctly
- Tooltips include modifier information
- Badges update when perishable counter decrements
- Destruction has visual feedback
