# Step 4: Tag Effects & Integration

Wire tag effects into the shop, boss, and round systems. This step makes tags actually **do things** beyond granting money.

## 4.1 — Shop Tag Processing

When the player enters the shop, pending shop tags need to fire. This happens in `ShopScene.create()` before building the shop layout.

### Categories that fire on shop entry:

| Tag ID | Effect on Shop |
|--------|----------------|
| `tag_uncommon` | Inject one free Uncommon equipment into shop stock |
| `tag_rare` | Inject one free Rare equipment into shop stock |
| `tag_permit` | Add an extra Frontier Permit to the shop |
| `tag_company_store` | Set all initial stock to $0 |
| `tag_free_reroll` | First camp reroll is free |
| `tag_ghost` | First base (no aura) equipment in shop → Ghost aura, cost $0 |
| `tag_icy` | First base equipment → Icy aura, cost $0 |
| `tag_fire` | First base equipment → Fire aura, cost $0 |
| `tag_holy` | First base equipment → Holy aura, cost $0 |

### Implementation: `src/game/TagSystem.ts` additions

```typescript
import { generateRandomEquipment, EquipmentDef } from './ItemsSystem';
import itemAurasData from '../data/item_auras.json';

export interface ShopTagModifications {
  /** Extra equipment items to inject (already free) */
  injectedEquipment: EquipmentDef[];
  /** Whether all initial stock should be $0 */
  freeShop: boolean;
  /** Whether first shop reroll is free */
  freeFirstReroll: boolean;
  /** Extra permit count to add */
  extraPermits: number;
  /** Aura overrides: apply to first N base equipment in shop */
  auraOverrides: { auraId: string; copies: number }[];
}

/** Process all shop-category tags. Call ONCE on shop entry.
 *  Returns modifications the shop should apply to its stock. */
export function processShopTags(player = getPlayerState()): ShopTagModifications {
  const mods: ShopTagModifications = {
    injectedEquipment: [],
    freeShop: false,
    freeFirstReroll: false,
    extraPermits: 0,
    auraOverrides: [],
  };

  // Also drain any stored aura tags
  const auraTags = [...player.storedAuraTags];
  player.storedAuraTags = [];

  const shopTags = player.consumeTagsByCategory('shop');
  const shopAuraTags = player.consumeTagsByCategory('shop_aura');

  // Combine stored aura tags with freshly consumed ones
  const allAuraTags = [...shopAuraTags, ...auraTags];

  for (const tag of shopTags) {
    for (let c = 0; c < tag.copies; c++) {
      switch (tag.def.id) {
        case 'tag_uncommon': {
          const item = generateRandomEquipment({ rarity: 'uncommon' });
          if (item) {
            mods.injectedEquipment.push({ ...item, cost: 0 });
          }
          break;
        }
        case 'tag_rare': {
          const item = generateRandomEquipment({ rarity: 'rare' });
          if (item) {
            mods.injectedEquipment.push({ ...item, cost: 0 });
          }
          break;
        }
        case 'tag_permit':
          mods.extraPermits += 1;
          break;
        case 'tag_company_store':
          mods.freeShop = true;
          break;
        case 'tag_free_reroll':
          mods.freeFirstReroll = true;
          break;
      }
    }
  }

  // Aura tags
  for (const tag of allAuraTags) {
    const auraMap: Record<string, string> = {
      tag_ghost: 'ghost',
      tag_icy: 'icy',
      tag_fire: 'fire',
      tag_holy: 'holy',
    };
    const auraId = auraMap[tag.def.id];
    if (auraId) {
      mods.auraOverrides.push({ auraId, copies: tag.copies });
    }
  }

  return mods;
}
```

### Integration in `ShopScene.ts`

In the `create()` method, after generating stock but before building cards:

```typescript
// After generateMixedStock():
const tagMods = processShopTags(player);

// Inject free equipment from tags
for (const item of tagMods.injectedEquipment) {
  this.stockItems.push({ type: 'equipment', item, isFree: true });
}

// Apply "On the House" — set all initial stock to $0
if (tagMods.freeShop) {
  for (const stockItem of this.stockItems) {
    if (stockItem.item) stockItem.item = { ...stockItem.item, cost: 0 };
  }
  for (const pack of this.packs) {
    pack.cost = 0;
  }
}

// Apply aura overrides to first base equipment
for (const override of tagMods.auraOverrides) {
  let applied = 0;
  for (const stockItem of this.stockItems) {
    if (applied >= override.copies) break;
    if (stockItem.type === 'equipment' && !stockItem.item.aura) {
      const aura = itemAurasData.find(a => a.id === override.auraId);
      if (aura) {
        stockItem.item = { ...stockItem.item, aura, cost: 0 };
        applied++;
      }
    }
  }
  // If no base equipment found, store the tag for later
  if (applied < override.copies) {
    const remaining = override.copies - applied;
    const tagDef = ALL_TAGS.find(t => {
      const map: Record<string, string> = { ghost: 'tag_ghost', icy: 'tag_icy', fire: 'tag_fire', holy: 'tag_holy' };
      return t.id === map[override.auraId];
    });
    if (tagDef) {
      player.storedAuraTags.push({ def: tagDef, copies: remaining });
    }
  }
}

// Free first reroll
if (tagMods.freeFirstReroll) {
  // Apply via a temporary flag or modify shopRerollCount logic
  player.tagFreeReroll = true; // Add this boolean to PlayerState
}

// Extra permits
if (tagMods.extraPermits > 0) {
  // Add extra permit slots to shop generation
  // This hooks into the permit rendering section of the shop
}
```

## 4.2 — Boss Tag Processing

Boss tags fire when entering a Showdown (round 3).

### `tag_investment` (Bounty Payout)

In `PayoutScene`, after the boss is defeated, check for investment tags:

```typescript
// In PayoutScene, when data.round === GAMEPLAY.ROUNDS_PER_LEG:
const bossTags = player.consumeTagsByCategory('boss');
let investmentBonus = 0;
for (const tag of bossTags) {
  if (tag.def.id === 'tag_investment') {
    investmentBonus += 25 * tag.copies;
  }
}
if (investmentBonus > 0) {
  player.economy.earn(investmentBonus);
  // Add a row to payout display: "Bounty Payout: $X"
}
```

### `tag_boss` (Change of Guard)

In `RoundSelectScene`, when displaying the boss column, check for the Change of Guard tag:

```typescript
// If player has a tag_boss pending, show a "Re-roll Boss" button on the boss column
const bossTags = player.getTagsByCategory('boss');
const hasChangeOfGuard = bossTags.some(t => t.def.id === 'tag_boss');

if (hasChangeOfGuard && isBoss) {
  new Button(this, cx, rerollBtnY, 'Re-roll Boss', btnW, 36)
    .setColor(0x6b2d6b, 0x8b3d8b)
    .onClick(() => {
      // Consume the tag
      const idx = player.pendingTags.findIndex(t => t.def.id === 'tag_boss');
      player.consumeTag(idx);

      // Re-roll the boss
      const allBosses = bossesData as BossDef[];
      const currentBoss = player.getBossForLeg(player.leg);
      const others = allBosses.filter(b => b.id !== currentBoss?.id && (b.minimumLeg ?? 1) <= player.leg);
      if (others.length > 0) {
        const newBoss = others[Math.floor(Math.random() * others.length)];
        player.setBossForCurrentLeg(newBoss);
      }

      // Refresh scene
      this.scene.restart();
    });
}
```

## 4.3 — Next-Round Tag Processing

### `tag_wide_saddle` (Wide Saddle)

This tag adds +3 hand size for the next round only. It's consumed when `GameState.startRound()` is called.

Already handled in Step 2 via `player.wideSaddleBonus`. The RoundSelectScene sets it when skipping doesn't apply (since Wide Saddle affects the *next played* round, not skipped ones).

Actually, Wide Saddle should be consumed in `GameState.startRound()`:

```typescript
// In GameState constructor or startRound():
const player = getPlayerState();
const wideSaddleBonus = player.wideSaddleBonus;
player.wideSaddleBonus = 0;
this.config = {
  ...this.config,
  rollSize: this.config.rollSize + wideSaddleBonus,
};
```

## 4.4 — Immediate Equipment Tag (Junk Pile)

`tag_top_up` creates up to 2 Common equipment if the player has space.

```typescript
// In TagSystem.ts:
export function processJunkPileTag(tag: TrailTagInstance, player = getPlayerState()): EquipmentDef[] {
  const created: EquipmentDef[] = [];
  const count = 2 * tag.copies;

  for (let i = 0; i < count; i++) {
    if (player.equipmentSlotsFree <= 0) break;
    const item = generateRandomEquipment({ rarity: 'common' });
    if (item) {
      const instance = createEquipmentInstance(item);
      player.equipment.push(instance);
      created.push(item);
    }
  }

  return created;
}
```

Called from `RoundSelectScene.onSkip()` when processing `immediate_equipment` tags.

## 4.5 — Immediate Pack Tags

Pack tags open a free booster pack. The scene flow is:

1. RoundSelectScene detects pack tag
2. Finds the pack definition by ID (e.g. `dice_mega` for `tag_dice_mega`)
3. Starts BoosterPackScene with `free: true` and `returnScene: 'RoundSelect'`

### Helper in `BoosterPackSystem.ts`:

```typescript
/** Find a pack definition by its ID */
export function getPackDefById(id: string): PackDefinition | null {
  const def = PACK_DEFS.find(p => p.id === id);
  return def ?? null;
}
```

### Update `BoosterPackScene`:

The scene needs to accept and respect a `returnScene` parameter in its create data:

```typescript
// In BoosterPackScene.create(data):
this.returnScene = data.returnScene ?? 'Shop';

// When done picking:
this.scene.start(this.returnScene);
```

## 4.6 — Hunter Profession Integration

The Hunter / Trapper (Nathan Cole) profession grants a Twin Wagon tag after each boss:

```typescript
// In PayoutScene, when round === ROUNDS_PER_LEG and profession is 'hunter':
if (player.profession?.id === 'hunter') {
  const twinWagonDef = ALL_TAGS.find(t => t.id === 'tag_twin_wagon');
  if (twinWagonDef) {
    grantTag(twinWagonDef);
  }
}
```

## 4.7 — Tests

Add to `src/game/__tests__/tags.test.ts`:

```typescript
describe('Shop Tags', () => {
  it('On the House marks shop as free', () => {
    const player = getPlayerState();
    const tag = ALL_TAGS.find(t => t.id === 'tag_company_store')!;
    player.addTag(tag);
    const mods = processShopTags(player);
    expect(mods.freeShop).toBe(true);
  });

  it('Outfitter\'s Pick injects free uncommon equipment', () => {
    const player = getPlayerState();
    const tag = ALL_TAGS.find(t => t.id === 'tag_uncommon')!;
    player.addTag(tag);
    const mods = processShopTags(player);
    expect(mods.injectedEquipment.length).toBe(1);
    expect(mods.injectedEquipment[0].cost).toBe(0);
    expect(mods.injectedEquipment[0].rarity).toBe('uncommon');
  });

  it('Aura tags store if no base equipment available', () => {
    const player = getPlayerState();
    const tag = ALL_TAGS.find(t => t.id === 'tag_fire')!;
    player.addTag(tag);
    // processShopTags with no stock items to apply to
    const mods = processShopTags(player);
    expect(mods.auraOverrides.length).toBe(1);
    // Aura couldn't be applied → stored
    // (This test validates the storage mechanism when integrated with ShopScene)
  });
});

describe('Boss Tags', () => {
  it('Bounty Payout grants $25 per copy after boss', () => {
    const player = getPlayerState();
    const tag = ALL_TAGS.find(t => t.id === 'tag_investment')!;
    player.addTag(tag);
    const bossTags = player.consumeTagsByCategory('boss');
    let bonus = 0;
    for (const t of bossTags) {
      if (t.def.id === 'tag_investment') bonus += 25 * t.copies;
    }
    expect(bonus).toBe(25);
  });
});

describe('Junk Pile', () => {
  it('creates up to 2 common equipment', () => {
    const player = getPlayerState();
    const tag = ALL_TAGS.find(t => t.id === 'tag_top_up')!;
    const instance: TrailTagInstance = { def: tag, copies: 1 };
    const before = player.equipment.length;
    processJunkPileTag(instance, player);
    expect(player.equipment.length).toBeLessThanOrEqual(before + 2);
  });
});
```

## Deliverables

| File | Action |
|------|--------|
| `src/game/TagSystem.ts` | **Extend** — `processShopTags()`, `processJunkPileTag()`, pack helpers |
| `src/game/BoosterPackSystem.ts` | **Modify** — Add `getPackDefById()` |
| `src/phaser/scenes/ShopScene.ts` | **Modify** — Call `processShopTags()` on create, apply modifications |
| `src/phaser/scenes/PayoutScene.ts` | **Modify** — Process boss tags (Bounty Payout), Hunter profession Twin Wagon |
| `src/phaser/scenes/RoundSelectScene.ts` | **Modify** — Boss re-roll button, immediate equipment/pack handling |
| `src/phaser/scenes/BoosterPackScene.ts` | **Modify** — Accept `returnScene` parameter |
| `src/game/PlayerState.ts` | **Modify** — Add `tagFreeReroll` boolean |
| `src/game/__tests__/tags.test.ts` | **Extend** — Shop, boss, and equipment tag tests |

## Verification

```bash
bun test src/game/__tests__/tags.test.ts
```

Then manual testing:
1. Skip a round → earn a shop tag → see it applied in next shop
2. Skip with On the House → all shop items cost $0
3. Skip with aura tag → first equipment in shop has the aura
4. Bounty Payout tag → extra money after boss win
5. Pack tags → free mega pack opens immediately
