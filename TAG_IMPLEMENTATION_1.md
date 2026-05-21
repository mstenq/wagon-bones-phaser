# Step 1: Data & Types

Define all Trail Tag data structures, the JSON data file, and TypeScript types.

## 1.1 — Create `src/data/trail_tags.json`

This file defines every tag's static data. It mirrors how `bosses.json`, `packs.json`, etc. work.

```jsonc
[
  {
    "id": "tag_uncommon",
    "name": "Outfitter's Pick",
    "description": "Next camp shop includes one free Uncommon equipment.",
    "category": "shop",
    "minLeg": 1,
    "weight": 4
  },
  {
    "id": "tag_rare",
    "name": "Saloon Find",
    "description": "Next camp shop includes one free Rare equipment.",
    "category": "shop",
    "minLeg": 1,
    "weight": 2
  },
  {
    "id": "tag_ghost",
    "name": "Haunted Relic",
    "description": "Next base equipment in shop becomes Ghost aura and is free.",
    "category": "shop_aura",
    "minLeg": 2,
    "weight": 1.5
  },
  {
    "id": "tag_icy",
    "name": "Frosted Tin",
    "description": "Next base equipment in shop becomes Icy aura (+50 miles) and is free.",
    "category": "shop_aura",
    "minLeg": 1,
    "weight": 3
  },
  {
    "id": "tag_fire",
    "name": "Branded Iron",
    "description": "Next base equipment in shop becomes Fire aura (+10 mult) and is free.",
    "category": "shop_aura",
    "minLeg": 1,
    "weight": 3
  },
  {
    "id": "tag_holy",
    "name": "Gilded Cross",
    "description": "Next base equipment in shop becomes Holy aura (×1.5 mult) and is free.",
    "category": "shop_aura",
    "minLeg": 1,
    "weight": 2
  },
  {
    "id": "tag_investment",
    "name": "Bounty Payout",
    "description": "Gain $25 after defeating the next boss.",
    "category": "boss",
    "minLeg": 1,
    "weight": 3
  },
  {
    "id": "tag_permit",
    "name": "Permit Stamp",
    "description": "Adds a Frontier Permit to the next shop.",
    "category": "shop",
    "minLeg": 1,
    "weight": 2
  },
  {
    "id": "tag_boss",
    "name": "Change of Guard",
    "description": "Re-roll the boss assigned to this leg's Showdown.",
    "category": "boss",
    "minLeg": 1,
    "weight": 2
  },
  {
    "id": "tag_dice_mega",
    "name": "Wagon Load",
    "description": "Immediately open a free Mega Dice Grab Bag (pick 2 of 5).",
    "category": "immediate_pack",
    "minLeg": 2,
    "weight": 2
  },
  {
    "id": "tag_supply_mega",
    "name": "Supply Drop",
    "description": "Immediately open a free Mega Supply Pack (pick 2 of 5).",
    "category": "immediate_pack",
    "minLeg": 1,
    "weight": 2
  },
  {
    "id": "tag_trail_guide_mega",
    "name": "Surveyor's Cache",
    "description": "Immediately open a free Mega Trail Guide Pack (pick 2 of 5).",
    "category": "immediate_pack",
    "minLeg": 2,
    "weight": 2
  },
  {
    "id": "tag_equipment_mega",
    "name": "Outfitter's Wagon",
    "description": "Immediately open a free Mega Equipment Pack (pick 2 of 4).",
    "category": "immediate_pack",
    "minLeg": 2,
    "weight": 1.5
  },
  {
    "id": "tag_frontier",
    "name": "Spirit Walk",
    "description": "Immediately open a free Frontier Pack (pick 1 of 2).",
    "category": "immediate_pack",
    "minLeg": 2,
    "weight": 1.5
  },
  {
    "id": "tag_well_traveled",
    "name": "Well-Traveled",
    "description": "Gain $1 for each day scored this run.",
    "category": "immediate_money",
    "minLeg": 2,
    "weight": 2
  },
  {
    "id": "tag_pack_rat",
    "name": "Pack Rat",
    "description": "Gain $1 for each unused reroll remaining across the whole run.",
    "category": "immediate_money",
    "minLeg": 2,
    "weight": 2
  },
  {
    "id": "tag_company_store",
    "name": "On the House",
    "description": "Next shop: initial equipment, consumables, and booster packs cost $0.",
    "category": "shop",
    "minLeg": 1,
    "weight": 1.5
  },
  {
    "id": "tag_twin_wagon",
    "name": "Twin Wagon",
    "description": "Duplicate the next tag earned (excluding Twin Wagon).",
    "category": "meta",
    "minLeg": 1,
    "weight": 2
  },
  {
    "id": "tag_wide_saddle",
    "name": "Wide Saddle",
    "description": "+3 dice hand size for the next round only.",
    "category": "next_round",
    "minLeg": 1,
    "weight": 3
  },
  {
    "id": "tag_free_reroll",
    "name": "Coupon Book",
    "description": "Next shop: first camp reroll costs $0.",
    "category": "shop",
    "minLeg": 1,
    "weight": 3
  },
  {
    "id": "tag_top_up",
    "name": "Junk Pile",
    "description": "Create up to 2 Common equipment (if you have space).",
    "category": "immediate_equipment",
    "minLeg": 2,
    "weight": 2
  },
  {
    "id": "tag_shortcut",
    "name": "Shortcut",
    "description": "Gain $5 for each round skipped this run.",
    "category": "immediate_money",
    "minLeg": 1,
    "weight": 3
  },
  {
    "id": "tag_surveyor",
    "name": "Surveyor's Mark",
    "description": "Upgrade a random hand type by 3 trail guide levels.",
    "category": "immediate_upgrade",
    "minLeg": 2,
    "weight": 1.5
  },
  {
    "id": "tag_bank_deposit",
    "name": "Bank Deposit",
    "description": "Double your money (adds at most $40).",
    "category": "immediate_money",
    "minLeg": 1,
    "weight": 2
  }
]
```

## 1.2 — Add Types to `src/game/types.ts`

Append these types at the end of the file:

```typescript
// ─── Trail Tags ───

export type TagCategory =
  | 'shop'           // fires when entering next shop
  | 'shop_aura'      // applies aura to shop equipment (may bank if no base equipment)
  | 'boss'           // fires at next boss round
  | 'immediate_pack' // opens a free pack immediately
  | 'immediate_money'// grants money immediately
  | 'immediate_equipment' // creates equipment immediately
  | 'immediate_upgrade'   // upgrades a hand immediately
  | 'next_round'     // applies to the next round played
  | 'meta';          // modifies the next tag (Twin Wagon)

export interface TrailTagDef {
  id: string;
  name: string;
  description: string;
  category: TagCategory;
  minLeg: number;     // earliest leg this tag can appear
  weight: number;     // selection weight in the pool
}

export interface TrailTagInstance {
  def: TrailTagDef;
  /** Number of copies (Twin Wagon stacking) */
  copies: number;
}
```

## 1.3 — Verify JSON Loads

Create a simple import test to ensure the JSON loads and has the expected shape:

```typescript
// In src/game/__tests__/tags.test.ts (initial)
import { describe, it, expect } from 'bun:test';
import trailTagsData from '../../data/trail_tags.json';

describe('Trail Tags Data', () => {
  it('loads all 24 tags', () => {
    expect(trailTagsData.length).toBe(24);
  });

  it('every tag has required fields', () => {
    for (const tag of trailTagsData) {
      expect(tag.id).toBeTruthy();
      expect(tag.name).toBeTruthy();
      expect(tag.description).toBeTruthy();
      expect(tag.category).toBeTruthy();
      expect(typeof tag.minLeg).toBe('number');
      expect(typeof tag.weight).toBe('number');
    }
  });

  it('has unique tag IDs', () => {
    const ids = trailTagsData.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

## Deliverables

| File | Action |
|------|--------|
| `src/data/trail_tags.json` | **Create** — 24 tag definitions |
| `src/game/types.ts` | **Append** — `TagCategory`, `TrailTagDef`, `TrailTagInstance` |
| `src/game/__tests__/tags.test.ts` | **Create** — Basic data loading tests |

## Verification

```bash
bun test src/game/__tests__/tags.test.ts
```

All 3 tests should pass before moving to Step 2.
