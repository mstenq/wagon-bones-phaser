# Step 2: PlayerState & Game Logic

Add tag tracking to `PlayerState`, create `TagSystem.ts` for pure game logic (pool selection, granting, effect dispatch), and wire up stat tracking for economy tags.

## 2.1 — Add Tag State to `PlayerState.ts`

Add these fields to the `PlayerState` class:

```typescript
// ─── Trail Tags ───
pendingTags: TrailTagInstance[] = [];      // tags waiting to fire (shop, boss, next_round)
storedAuraTags: TrailTagInstance[] = [];   // aura tags banked because no base equipment was in shop
roundsSkipped: number = 0;                // total rounds skipped this run (for Shortcut tag)
daysScored: number = 0;                   // total days where scoring occurred (for Well-Traveled)
unusedRerollsTotal: number = 0;           // cumulative unused rerolls at round-end (for Pack Rat)
twinWagonCount: number = 0;               // pending Twin Wagon multipliers
wideSaddleBonus: number = 0;              // temporary +handSize for next round only
```

### Methods to add to `PlayerState`:

```typescript
/** Add a tag to the pending queue. Twin Wagon increases copies. */
addTag(def: TrailTagDef): void {
  const copies = 1 + this.twinWagonCount;
  this.twinWagonCount = 0; // consumed

  if (def.id === 'tag_twin_wagon') {
    this.twinWagonCount += copies;
    return; // Twin Wagon doesn't go into pendingTags — it's a modifier
  }

  this.pendingTags.push({ def, copies });
}

/** Remove a specific pending tag by index. Returns the removed tag or null. */
consumeTag(index: number): TrailTagInstance | null {
  if (index < 0 || index >= this.pendingTags.length) return null;
  return this.pendingTags.splice(index, 1)[0];
}

/** Remove all pending tags matching a category. Returns removed tags. */
consumeTagsByCategory(category: TagCategory): TrailTagInstance[] {
  const consumed: TrailTagInstance[] = [];
  this.pendingTags = this.pendingTags.filter(t => {
    if (t.def.category === category) {
      consumed.push(t);
      return false;
    }
    return true;
  });
  return consumed;
}

/** Get pending tags for a specific category (read-only). */
getTagsByCategory(category: TagCategory): TrailTagInstance[] {
  return this.pendingTags.filter(t => t.def.category === category);
}
```

### Update `reset()`:

Add to the reset method:

```typescript
this.pendingTags = [];
this.storedAuraTags = [];
this.roundsSkipped = 0;
this.daysScored = 0;
this.unusedRerollsTotal = 0;
this.twinWagonCount = 0;
this.wideSaddleBonus = 0;
```

### Update `effectiveDays` (or `handSize` getter):

The `wideSaddleBonus` needs to feed into the hand size for the next round. Add it to `handSize` consumption in `GameState.startRound()`, not in PlayerState directly, since it's consumed once:

```typescript
// In GameState.startRound():
const wideSaddleBonus = player.wideSaddleBonus;
player.wideSaddleBonus = 0; // consumed for this round
this.config.rollSize += wideSaddleBonus;
```

### Update `advanceRound()`:

Add `roundsSkipped` increment when called from a skip context. Best done by adding an optional parameter:

```typescript
advanceRound(skipped: boolean = false): boolean {
  if (skipped) {
    this.roundsSkipped++;
  }
  // ... existing logic unchanged
}
```

## 2.2 — Create `src/game/TagSystem.ts`

Pure game logic — no Phaser imports.

```typescript
// ─── TagSystem (No Phaser imports) ───
// Tag pool selection, random tag generation, and immediate effect dispatch.

import { TrailTagDef, TrailTagInstance, TagCategory, HandType } from './types';
import { getPlayerState } from './PlayerState';
import trailTagsData from '../data/trail_tags.json';

const ALL_TAGS: TrailTagDef[] = trailTagsData as TrailTagDef[];

/** Get the weighted tag pool for the current leg, excluding Twin Wagon from random selection if twinWagonCount > 0 */
export function getTagPool(leg: number): TrailTagDef[] {
  return ALL_TAGS.filter(t => t.minLeg <= leg);
}

/** Select a random tag from the pool using weights */
export function selectRandomTag(leg: number): TrailTagDef {
  const pool = getTagPool(leg);
  const totalWeight = pool.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const tag of pool) {
    roll -= tag.weight;
    if (roll <= 0) return tag;
  }

  return pool[pool.length - 1]; // fallback
}

/** Grant a tag to the player. Handles Twin Wagon stacking.
 *  Returns the granted tag instance (with copies reflecting Twin Wagon).
 *  Immediate tags are NOT auto-fired here — caller must dispatch them. */
export function grantTag(tagDef: TrailTagDef): TrailTagInstance {
  const player = getPlayerState();
  player.addTag(tagDef);

  // Return the instance that was just added (or the twin wagon info)
  if (tagDef.id === 'tag_twin_wagon') {
    return { def: tagDef, copies: 1 };
  }

  // The most recently added tag
  return player.pendingTags[player.pendingTags.length - 1];
}

/** Process all immediate tags (money, packs, equipment, upgrades).
 *  Returns an array of effect results for the UI to animate. */
export function processImmediateTags(player = getPlayerState()): ImmediateTagResult[] {
  const results: ImmediateTagResult[] = [];

  // Process immediate money tags
  const moneyTags = player.consumeTagsByCategory('immediate_money');
  for (const tag of moneyTags) {
    const result = processImmediateMoneyTag(tag, player);
    if (result) results.push(result);
  }

  // Process immediate upgrade tags
  const upgradeTags = player.consumeTagsByCategory('immediate_upgrade');
  for (const tag of upgradeTags) {
    const result = processImmediateUpgradeTag(tag, player);
    if (result) results.push(result);
  }

  // immediate_pack and immediate_equipment are handled by the scene
  // (they need to open pack UI or create equipment with player choice)

  return results;
}

export interface ImmediateTagResult {
  tagDef: TrailTagDef;
  copies: number;
  type: 'money' | 'upgrade';
  amount?: number;          // money earned
  handType?: HandType;      // hand upgraded
  levelsGained?: number;    // levels added
}

function processImmediateMoneyTag(
  tag: TrailTagInstance,
  player = getPlayerState()
): ImmediateTagResult | null {
  let amount = 0;

  for (let c = 0; c < tag.copies; c++) {
    switch (tag.def.id) {
      case 'tag_well_traveled':
        amount += player.daysScored;
        break;
      case 'tag_pack_rat':
        amount += player.unusedRerollsTotal;
        break;
      case 'tag_shortcut':
        // $5 per round skipped (minimum $5 — this skip counts)
        amount += Math.max(5, player.roundsSkipped * 5);
        break;
      case 'tag_bank_deposit': {
        if (player.economy.balance < 0) {
          player.economy.setBalance(0);
        } else {
          const gain = Math.min(player.economy.balance, 40);
          amount += gain;
        }
        break;
      }
    }
  }

  if (amount > 0) {
    player.economy.earn(amount);
  }

  return { tagDef: tag.def, copies: tag.copies, type: 'money', amount };
}

function processImmediateUpgradeTag(
  tag: TrailTagInstance,
  player = getPlayerState()
): ImmediateTagResult | null {
  // Surveyor's Mark: upgrade random hand by 3 levels
  if (tag.def.id !== 'tag_surveyor') return null;

  const handTypes = Object.values(HandType);
  const randomHand = handTypes[Math.floor(Math.random() * handTypes.length)];
  const levels = 3 * tag.copies;
  player.upgradeHandLevel(randomHand, levels);

  return {
    tagDef: tag.def,
    copies: tag.copies,
    type: 'upgrade',
    handType: randomHand,
    levelsGained: levels,
  };
}

/** Get the pack definition ID for a pack tag */
export function getPackDefIdForTag(tagId: string): string | null {
  switch (tagId) {
    case 'tag_dice_mega': return 'dice_mega';
    case 'tag_supply_mega': return 'supply_mega';
    case 'tag_trail_guide_mega': return 'trail_guide_mega';
    case 'tag_equipment_mega': return 'equipment_mega';
    case 'tag_frontier': return 'frontier_standard'; // Normal, not mega
    default: return null;
  }
}

/** Check if a tag fires immediately (no shop/boss wait) */
export function isImmediateTag(category: TagCategory): boolean {
  return category.startsWith('immediate_') || category === 'next_round';
}

/** Check if a tag is pending for the shop */
export function isShopTag(category: TagCategory): boolean {
  return category === 'shop' || category === 'shop_aura';
}
```

## 2.3 — Wire Up Stat Tracking

### In `GameState.calculateScore()`:

After the score is calculated and before returning, increment `daysScored`:

```typescript
// Near the end of calculateScore(), after score is finalized:
player.daysScored++;
```

### In `GameState` round-won handler (or `endDay()`):

When round is won, record unused rerolls:

```typescript
// In endDay(), when won === true, before emitting 'round-won':
player.unusedRerollsTotal += this.state.rerollsRemaining;
```

## 2.4 — Update EventBus

Add two new events:

```typescript
export const Events = {
  // ... existing events ...
  TAG_EARNED: 'game:tag-earned',
  ROUND_SKIPPED: 'game:round-skipped',
} as const;
```

## 2.5 — Tests

Add to `src/game/__tests__/tags.test.ts`:

```typescript
describe('TagSystem', () => {
  describe('Tag Pool', () => {
    it('filters tags by minLeg', () => {
      const pool1 = getTagPool(1);
      const pool2 = getTagPool(2);
      expect(pool2.length).toBeGreaterThan(pool1.length);
      expect(pool1.every(t => t.minLeg <= 1)).toBe(true);
    });
  });

  describe('Twin Wagon', () => {
    it('doubles the next tag', () => {
      const player = getPlayerState();
      player.addTag(ALL_TAGS.find(t => t.id === 'tag_twin_wagon')!);
      expect(player.twinWagonCount).toBe(1);

      player.addTag(ALL_TAGS.find(t => t.id === 'tag_shortcut')!);
      expect(player.twinWagonCount).toBe(0);
      expect(player.pendingTags[0].copies).toBe(2);
    });

    it('stacks multiple Twin Wagons', () => {
      const player = getPlayerState();
      const tw = ALL_TAGS.find(t => t.id === 'tag_twin_wagon')!;
      player.addTag(tw);
      player.addTag(tw); // second Twin Wagon
      expect(player.twinWagonCount).toBe(3); // 1 + (1+1 from first TW)

      player.addTag(ALL_TAGS.find(t => t.id === 'tag_shortcut')!);
      expect(player.pendingTags[0].copies).toBe(4); // 1 + 3
    });
  });

  describe('Immediate Money Tags', () => {
    it('Well-Traveled pays $1 per day scored', () => {
      const player = getPlayerState();
      player.daysScored = 10;
      const tag = ALL_TAGS.find(t => t.id === 'tag_well_traveled')!;
      player.addTag(tag);
      const balanceBefore = player.economy.balance;
      processImmediateTags(player);
      expect(player.economy.balance).toBe(balanceBefore + 10);
    });

    it('Bank Deposit doubles money capped at +$40', () => {
      const player = getPlayerState();
      player.economy.setBalance(50);
      const tag = ALL_TAGS.find(t => t.id === 'tag_bank_deposit')!;
      player.addTag(tag);
      processImmediateTags(player);
      expect(player.economy.balance).toBe(90); // 50 + min(50, 40)
    });

    it('Shortcut pays $5 per skipped round', () => {
      const player = getPlayerState();
      player.roundsSkipped = 3;
      const tag = ALL_TAGS.find(t => t.id === 'tag_shortcut')!;
      player.addTag(tag);
      const before = player.economy.balance;
      processImmediateTags(player);
      expect(player.economy.balance).toBe(before + 15);
    });
  });

  describe('Surveyor\'s Mark', () => {
    it('upgrades a random hand by 3 levels', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find(t => t.id === 'tag_surveyor')!;
      player.addTag(tag);
      const results = processImmediateTags(player);
      expect(results.length).toBe(1);
      expect(results[0].levelsGained).toBe(3);
      // Verify the hand was actually upgraded
      const stats = player.getHandStats(results[0].handType!);
      expect(stats.level).toBe(4); // 1 + 3
    });
  });
});
```

## Deliverables

| File | Action |
|------|--------|
| `src/game/PlayerState.ts` | **Modify** — Add tag fields, `addTag()`, `consumeTag()`, `consumeTagsByCategory()`, reset logic |
| `src/game/TagSystem.ts` | **Create** — Tag pool, selection, granting, immediate effect processing |
| `src/game/EventBus.ts` | **Modify** — Add `TAG_EARNED`, `ROUND_SKIPPED` |
| `src/game/GameState.ts` | **Modify** — Increment `daysScored` in `calculateScore()`, sum rerolls on round-won |
| `src/game/__tests__/tags.test.ts` | **Extend** — Tag logic unit tests |

## Verification

```bash
bun test src/game/__tests__/tags.test.ts
```

All tag logic tests should pass. No Phaser dependency — pure TypeScript.
