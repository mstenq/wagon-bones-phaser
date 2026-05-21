# Step 1: Data & Types

Define all Trail Tag data structures as a typed TypeScript file (following the `items.ts` pattern) and add shared types.

## 1.1 — Create `src/data/trail_tags.ts`

This file defines every tag's static data as a typed, exported array — same pattern as `src/data/items.ts`. Types are co-located at the top of the file and re-exported for use elsewhere.

```typescript
// ─── Trail Tag Definitions ───
// Typed tag data following the items.ts pattern.
// Each tag defines its pool weight, unlock leg, and category for dispatch.

// ─── Types ───

export type TagCategory =
  | 'shop'                // fires when entering next shop
  | 'shop_aura'           // applies aura to shop equipment (may bank if no base equipment)
  | 'boss'                // fires at next boss round
  | 'immediate_pack'      // opens a free pack immediately
  | 'immediate_money'     // grants money immediately
  | 'immediate_equipment' // creates equipment immediately
  | 'immediate_upgrade'   // upgrades a hand immediately
  | 'next_round'          // applies to the next round played
  | 'meta';               // modifies the next tag (Twin Wagon)

export interface TrailTagDef {
  id: string;
  name: string;
  description: string;
  category: TagCategory;
  minLeg: number;   // earliest leg this tag can appear
  weight: number;   // selection weight in the pool
}

export interface TrailTagInstance {
  def: TrailTagDef;
  /** Number of copies (Twin Wagon stacking) */
  copies: number;
}

// ─── Tag Definitions ───

const trailTags: TrailTagDef[] = [
  // ─── Shop Tags ───
  {
    id: 'tag_uncommon',
    name: "Outfitter's Pick",
    description: 'Next camp shop includes one free Uncommon equipment.',
    category: 'shop',
    minLeg: 1,
    weight: 4,
  },
  {
    id: 'tag_rare',
    name: 'Saloon Find',
    description: 'Next camp shop includes one free Rare equipment.',
    category: 'shop',
    minLeg: 1,
    weight: 2,
  },
  {
    id: 'tag_permit',
    name: 'Permit Stamp',
    description: 'Adds a Frontier Permit to the next shop.',
    category: 'shop',
    minLeg: 1,
    weight: 2,
  },
  {
    id: 'tag_company_store',
    name: 'On the House',
    description: 'Next shop: initial equipment, consumables, and booster packs cost $0.',
    category: 'shop',
    minLeg: 1,
    weight: 1.5,
  },
  {
    id: 'tag_free_reroll',
    name: 'Coupon Book',
    description: 'Next shop: first camp reroll costs $0.',
    category: 'shop',
    minLeg: 1,
    weight: 3,
  },

  // ─── Shop Aura Tags ───
  {
    id: 'tag_ghost',
    name: 'Haunted Relic',
    description: 'Next base equipment in shop becomes Ghost aura and is free.',
    category: 'shop_aura',
    minLeg: 2,
    weight: 1.5,
  },
  {
    id: 'tag_icy',
    name: 'Frosted Tin',
    description: 'Next base equipment in shop becomes Icy aura (+50 miles) and is free.',
    category: 'shop_aura',
    minLeg: 1,
    weight: 3,
  },
  {
    id: 'tag_fire',
    name: 'Branded Iron',
    description: 'Next base equipment in shop becomes Fire aura (+10 mult) and is free.',
    category: 'shop_aura',
    minLeg: 1,
    weight: 3,
  },
  {
    id: 'tag_holy',
    name: 'Gilded Cross',
    description: 'Next base equipment in shop becomes Holy aura (×1.5 mult) and is free.',
    category: 'shop_aura',
    minLeg: 1,
    weight: 2,
  },

  // ─── Boss Tags ───
  {
    id: 'tag_investment',
    name: 'Bounty Payout',
    description: 'Gain $25 after defeating the next boss.',
    category: 'boss',
    minLeg: 1,
    weight: 3,
  },
  {
    id: 'tag_boss',
    name: 'Change of Guard',
    description: "Re-roll the boss assigned to this leg's Showdown.",
    category: 'boss',
    minLeg: 1,
    weight: 2,
  },

  // ─── Immediate Pack Tags ───
  {
    id: 'tag_dice_mega',
    name: 'Wagon Load',
    description: 'Immediately open a free Mega Dice Grab Bag (pick 2 of 5).',
    category: 'immediate_pack',
    minLeg: 2,
    weight: 2,
  },
  {
    id: 'tag_supply_mega',
    name: 'Supply Drop',
    description: 'Immediately open a free Mega Supply Pack (pick 2 of 5).',
    category: 'immediate_pack',
    minLeg: 1,
    weight: 2,
  },
  {
    id: 'tag_trail_guide_mega',
    name: "Surveyor's Cache",
    description: 'Immediately open a free Mega Trail Guide Pack (pick 2 of 5).',
    category: 'immediate_pack',
    minLeg: 2,
    weight: 2,
  },
  {
    id: 'tag_equipment_mega',
    name: "Outfitter's Wagon",
    description: 'Immediately open a free Mega Equipment Pack (pick 2 of 4).',
    category: 'immediate_pack',
    minLeg: 2,
    weight: 1.5,
  },
  {
    id: 'tag_frontier',
    name: 'Spirit Walk',
    description: 'Immediately open a free Frontier Pack (pick 1 of 2).',
    category: 'immediate_pack',
    minLeg: 2,
    weight: 1.5,
  },

  // ─── Immediate Money Tags ───
  {
    id: 'tag_well_traveled',
    name: 'Well-Traveled',
    description: 'Gain $1 for each day scored this run.',
    category: 'immediate_money',
    minLeg: 2,
    weight: 2,
  },
  {
    id: 'tag_pack_rat',
    name: 'Pack Rat',
    description: 'Gain $1 for each unused reroll remaining across the whole run.',
    category: 'immediate_money',
    minLeg: 2,
    weight: 2,
  },
  {
    id: 'tag_shortcut',
    name: 'Shortcut',
    description: 'Gain $5 for each round skipped this run.',
    category: 'immediate_money',
    minLeg: 1,
    weight: 3,
  },
  {
    id: 'tag_bank_deposit',
    name: 'Bank Deposit',
    description: 'Double your money (adds at most $40).',
    category: 'immediate_money',
    minLeg: 1,
    weight: 2,
  },

  // ─── Immediate Equipment Tags ───
  {
    id: 'tag_top_up',
    name: 'Junk Pile',
    description: 'Create up to 2 Common equipment (if you have space).',
    category: 'immediate_equipment',
    minLeg: 2,
    weight: 2,
  },

  // ─── Immediate Upgrade Tags ───
  {
    id: 'tag_surveyor',
    name: "Surveyor's Mark",
    description: 'Upgrade a random hand type by 3 trail guide levels.',
    category: 'immediate_upgrade',
    minLeg: 2,
    weight: 1.5,
  },

  // ─── Next Round Tags ───
  {
    id: 'tag_wide_saddle',
    name: 'Wide Saddle',
    description: '+3 dice hand size for the next round only.',
    category: 'next_round',
    minLeg: 1,
    weight: 3,
  },

  // ─── Meta Tags ───
  {
    id: 'tag_twin_wagon',
    name: 'Twin Wagon',
    description: 'Duplicate the next tag earned (excluding Twin Wagon).',
    category: 'meta',
    minLeg: 1,
    weight: 2,
  },
];

export default trailTags;

// ─── Lookup Helpers ───

/** Find a tag definition by ID */
export function getTrailTagById(id: string): TrailTagDef | undefined {
  return trailTags.find((t) => t.id === id);
}
```

## 1.2 — Add Shared Types to `src/game/types.ts`

Re-export the types from the data file so game logic can import from either place:

```typescript
// ─── Trail Tags (re-export from data layer) ───
export type { TagCategory, TrailTagDef, TrailTagInstance } from '../data/trail_tags';
```

## 1.3 — Verify Data Loads

Create a simple import test to ensure the typed file exports correctly:

```typescript
// In src/game/__tests__/tags.test.ts (initial)
import { describe, it, expect } from 'bun:test';
import trailTags, { getTrailTagById } from '../../data/trail_tags';
import type { TrailTagDef } from '../../data/trail_tags';

describe('Trail Tags Data', () => {
  it('exports all 24 tags', () => {
    expect(trailTags.length).toBe(24);
  });

  it('every tag has required fields', () => {
    for (const tag of trailTags) {
      expect(tag.id).toBeTruthy();
      expect(tag.name).toBeTruthy();
      expect(tag.description).toBeTruthy();
      expect(tag.category).toBeTruthy();
      expect(typeof tag.minLeg).toBe('number');
      expect(typeof tag.weight).toBe('number');
    }
  });

  it('has unique tag IDs', () => {
    const ids = trailTags.map((t: TrailTagDef) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getTrailTagById finds a tag', () => {
    const tag = getTrailTagById('tag_twin_wagon');
    expect(tag).toBeDefined();
    expect(tag!.name).toBe('Twin Wagon');
    expect(tag!.category).toBe('meta');
  });

  it('getTrailTagById returns undefined for unknown ID', () => {
    expect(getTrailTagById('tag_nonexistent')).toBeUndefined();
  });
});
```

## Deliverables

| File | Action |
|------|--------|
| `src/data/trail_tags.ts` | **Create** — 24 typed tag definitions + `getTrailTagById` helper |
| `src/game/types.ts` | **Append** — Re-export `TagCategory`, `TrailTagDef`, `TrailTagInstance` |
| `src/game/__tests__/tags.test.ts` | **Create** — Basic data loading tests |

## Verification

```bash
bun test src/game/__tests__/tags.test.ts
```

All 5 tests should pass before moving to Step 2.
