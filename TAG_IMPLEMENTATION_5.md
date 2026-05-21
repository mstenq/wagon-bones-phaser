# Step 5: Tag Stack UI & Polish

Create the visual tag stack above the dice pouch, add tooltips, and finalize all scene flow wiring.

## 5.1 — TagStack UI Component

Pending tags that haven't fired yet display as small icons stacked vertically **above the dice pouch button**. This mirrors Balatro's tag icons stacked above the deck (visible in the reference screenshot).

### File: `src/phaser/ui/TagStack.ts`

```typescript
// ─── TagStack ───
// Renders pending trail tag icons stacked vertically above the dice pouch.
// Each tag is a small colored badge with a tooltip on hover.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { TrailTagInstance } from '../../game/types';

// Tag category → badge color
const TAG_COLORS: Record<string, number> = {
  shop:                0x44aa44,  // green
  shop_aura:           0x9966cc,  // purple
  boss:                0xcc4444,  // red
  immediate_pack:      0x4488cc,  // blue
  immediate_money:     0xccaa44,  // gold
  immediate_equipment: 0x88aa44,  // olive
  immediate_upgrade:   0x5B9BD5,  // sky blue
  next_round:          0xcc8844,  // orange
  meta:                0xcccccc,  // silver (Twin Wagon)
};

const TAG_BADGE_SIZE = 40;
const TAG_BADGE_GAP = 4;
const TAG_BADGE_RADIUS = 6;

export class TagStack extends GameObjects.Container {
  private badges: GameObjects.Container[] = [];
  private tooltip: GameObjects.Container | null = null;

  constructor(scene: Scene, private pouchX: number, private pouchY: number) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(150);
    this.refresh();
  }

  /** Rebuild the tag stack from current player state */
  refresh(): void {
    // Clear existing badges
    for (const badge of this.badges) badge.destroy();
    this.badges = [];
    this.hideTooltip();

    const player = getPlayerState();
    const tags = player.pendingTags;

    if (tags.length === 0) return;

    // Stack badges upward from just above the dice pouch
    const startY = this.pouchY - TAG_BADGE_GAP;

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const badgeY = startY - (i + 1) * (TAG_BADGE_SIZE + TAG_BADGE_GAP) + TAG_BADGE_SIZE;
      const badge = this.createBadge(tag, this.pouchX, badgeY);
      this.badges.push(badge);
    }

    // Twin Wagon indicator (if active)
    if (player.twinWagonCount > 0) {
      const twY = startY - (tags.length + 1) * (TAG_BADGE_SIZE + TAG_BADGE_GAP) + TAG_BADGE_SIZE;
      const twBadge = this.createTwinWagonBadge(player.twinWagonCount, this.pouchX, twY);
      this.badges.push(twBadge);
    }
  }

  private createBadge(tag: TrailTagInstance, x: number, y: number): GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const color = TAG_COLORS[tag.def.category] ?? 0x888888;

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(color, 0.9);
    bg.fillRoundedRect(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE, TAG_BADGE_RADIUS);
    bg.lineStyle(1, 0xffffff, 0.3);
    bg.strokeRoundedRect(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE, TAG_BADGE_RADIUS);
    container.add(bg);

    // Category icon (first letter or emoji)
    const iconText = this.getTagIcon(tag.def.id);
    const icon = this.scene.add.text(TAG_BADGE_SIZE / 2, TAG_BADGE_SIZE / 2 - 2, iconText, {
      fontSize: '16px',
    }).setOrigin(0.5);
    container.add(icon);

    // Copies badge (if > 1)
    if (tag.copies > 1) {
      const copyBg = this.scene.add.graphics();
      copyBg.fillStyle(0xff4444, 1);
      copyBg.fillCircle(TAG_BADGE_SIZE - 4, 4, 8);
      container.add(copyBg);

      const copyText = this.scene.add.text(TAG_BADGE_SIZE - 4, 4, `×${tag.copies}`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '9px',
        color: '#ffffff',
      }).setOrigin(0.5);
      container.add(copyText);
    }

    // Interactive
    container.setSize(TAG_BADGE_SIZE, TAG_BADGE_SIZE);
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE),
      Phaser.Geom.Rectangle.Contains
    );

    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE, TAG_BADGE_RADIUS);
      bg.lineStyle(2, 0xffffff, 0.6);
      bg.strokeRoundedRect(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE, TAG_BADGE_RADIUS);
      this.showTooltip(tag, x, y);
    });

    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 0.9);
      bg.fillRoundedRect(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE, TAG_BADGE_RADIUS);
      bg.lineStyle(1, 0xffffff, 0.3);
      bg.strokeRoundedRect(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE, TAG_BADGE_RADIUS);
      this.hideTooltip();
    });

    container.setDepth(150);
    this.add(container);
    return container;
  }

  private createTwinWagonBadge(count: number, x: number, y: number): GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0xcccccc, 0.9);
    bg.fillRoundedRect(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE, TAG_BADGE_RADIUS);
    bg.lineStyle(2, 0xffdd44, 0.8);
    bg.strokeRoundedRect(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE, TAG_BADGE_RADIUS);
    container.add(bg);

    // "×2" or "×N" indicator
    const text = this.scene.add.text(TAG_BADGE_SIZE / 2, TAG_BADGE_SIZE / 2, `×${count + 1}`, {
      fontFamily: FONTS.HEADING,
      fontSize: '16px',
      color: '#ffdd44',
    }).setOrigin(0.5);
    container.add(text);

    container.setSize(TAG_BADGE_SIZE, TAG_BADGE_SIZE);
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, TAG_BADGE_SIZE, TAG_BADGE_SIZE),
      Phaser.Geom.Rectangle.Contains
    );

    container.on('pointerover', () => {
      this.showTwinWagonTooltip(count, x, y);
    });
    container.on('pointerout', () => {
      this.hideTooltip();
    });

    container.setDepth(150);
    this.add(container);
    return container;
  }

  private showTooltip(tag: TrailTagInstance, badgeX: number, badgeY: number): void {
    this.hideTooltip();

    const tooltipW = 200;
    const tooltipH = 60;
    const tx = badgeX - tooltipW - 8;
    const ty = badgeY;

    this.tooltip = this.scene.add.container(tx, ty);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 8);
    bg.lineStyle(1, 0x444466, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 8);
    this.tooltip.add(bg);

    const name = this.scene.add.text(8, 6, tag.def.name, {
      fontFamily: FONTS.HEADING,
      fontSize: '13px',
      color: TEXT_COLORS.GOLD,
    });
    this.tooltip.add(name);

    const desc = this.scene.add.text(8, 24, tag.def.description, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '10px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: tooltipW - 16 },
    });
    this.tooltip.add(desc);

    // Adjust tooltip height to fit description
    const actualH = Math.max(tooltipH, desc.y + desc.height + 8);
    bg.clear();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, actualH, 8);
    bg.lineStyle(1, 0x444466, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, actualH, 8);

    this.tooltip.setDepth(200);
    this.add(this.tooltip);
  }

  private showTwinWagonTooltip(count: number, badgeX: number, badgeY: number): void {
    this.hideTooltip();

    const tooltipW = 180;
    const tooltipH = 50;
    const tx = badgeX - tooltipW - 8;
    const ty = badgeY;

    this.tooltip = this.scene.add.container(tx, ty);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 8);
    bg.lineStyle(1, 0x444466, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 8);
    this.tooltip.add(bg);

    const name = this.scene.add.text(8, 6, 'Twin Wagon', {
      fontFamily: FONTS.HEADING,
      fontSize: '13px',
      color: '#ffdd44',
    });
    this.tooltip.add(name);

    const desc = this.scene.add.text(8, 24, `Next tag earned is duplicated ×${count + 1}`, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '10px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: tooltipW - 16 },
    });
    this.tooltip.add(desc);

    this.tooltip.setDepth(200);
    this.add(this.tooltip);
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  private getTagIcon(tagId: string): string {
    const icons: Record<string, string> = {
      tag_uncommon: '🏷️',
      tag_rare: '🍺',
      tag_ghost: '👻',
      tag_icy: '❄️',
      tag_fire: '🔥',
      tag_holy: '✝️',
      tag_investment: '💰',
      tag_permit: '📜',
      tag_boss: '🔄',
      tag_dice_mega: '🎲',
      tag_supply_mega: '📦',
      tag_trail_guide_mega: '🗺️',
      tag_equipment_mega: '🔧',
      tag_frontier: '👁️',
      tag_well_traveled: '🥾',
      tag_pack_rat: '🐀',
      tag_company_store: '🏪',
      tag_twin_wagon: '🔁',
      tag_wide_saddle: '🐎',
      tag_free_reroll: '🎫',
      tag_top_up: '🗑️',
      tag_shortcut: '⚡',
      tag_surveyor: '📐',
      tag_bank_deposit: '🏦',
    };
    return icons[tagId] ?? '🏷️';
  }
}
```

## 5.2 — Integrate TagStack into SceneLayout

### In `src/phaser/ui/SceneLayout.ts`:

Add `TagStack` to the layout result and create it alongside the dice pouch:

```typescript
import { TagStack } from './TagStack';

export interface LayoutResult {
  // ... existing fields ...
  tagStack: TagStack;
}

// In createLayout(), after creating dicePouch:
const tagStack = new TagStack(
  scene,
  width - UI.POUCH_MARGIN - UI.POUCH_SIZE,
  height - UI.POUCH_MARGIN - UI.POUCH_SIZE,
);

return { sidebar, equipBar, consumableBar, dicePouch, tagStack, contentX, contentW, contentCX, sidebarW };
```

## 5.3 — Add Constants

### In `src/game/Constants.ts`:

```typescript
// ─── Tag Stack ───
export const TAG_STACK = {
  BADGE_SIZE: 40,
  BADGE_GAP: 4,
  BADGE_RADIUS: 6,
  TOOLTIP_WIDTH: 200,
} as const;
```

## 5.4 — Scene Flow Wiring (Final)

Ensure all scene transitions are correct:

### Complete Flow Diagram

```
MainMenu → ProfessionSelect → Shop (first visit, leg 1 round 1)
                                 ↓
                            RoundSelect ←──────────────────┐
                           /     |                         │
                     [Play]    [Skip]                      │
                        ↓        ↓                         │
                    GameScene   Grant tag                   │
                        ↓       Advance round              │
                   (round-won)  Process immediate           │
                        ↓       ↓                          │
                   PayoutScene  ├─ Pack tag → BoosterPack ─┘
                        ↓       └─ Loop back to RoundSelect
                   advanceRound()
                        ↓
                   TrailEvent
                        ↓
                      Shop ────────────────────────────────┘
```

### Transition Table

| From | To | Condition |
|------|----|-----------|
| ShopScene ("Hit the Trail") | **RoundSelectScene** | Always (was: GameScene) |
| TrailEventScene (skip shop) | **RoundSelectScene** | `skipNextShop === true` (was: GameScene) |
| TrailEventScene (normal) | ShopScene | `skipNextShop === false` (unchanged) |
| RoundSelectScene (Play) | GameScene | Player clicks Play |
| RoundSelectScene (Skip) | RoundSelectScene | After granting tag & advancing (self-restart) |
| RoundSelectScene (Skip → pack) | BoosterPackScene | Immediate pack tag |
| BoosterPackScene (from tag) | RoundSelectScene | `returnScene === 'RoundSelect'` |
| GameScene (round-won) | PayoutScene | Unchanged |
| PayoutScene (collect) | TrailEventScene | Unchanged |
| PayoutScene (journey complete) | GameOver | Unchanged |

### Files to Update

1. **ShopScene.ts** — "Hit the Trail" button: `this.scene.start('Game')` → `this.scene.start('RoundSelect')`
2. **TrailEventScene.ts** — Skip shop: `this.scene.start('Game')` → `this.scene.start('RoundSelect')`
3. **BoosterPackScene.ts** — When `returnScene` is provided, use it instead of `'Shop'`

## 5.5 — Refresh TagStack on State Changes

The TagStack needs to refresh whenever tags change. Connect it to the EventBus:

```typescript
// In any scene that has a TagStack (via layout):
EventBus.on(Events.TAG_EARNED, () => layout.tagStack.refresh());
EventBus.on(Events.ROUND_SKIPPED, () => layout.tagStack.refresh());

// Clean up in shutdown
this.events.on('shutdown', () => {
  EventBus.off(Events.TAG_EARNED);
  EventBus.off(Events.ROUND_SKIPPED);
});
```

## 5.6 — Tag Earned Animation (Optional Polish)

When a tag is earned in RoundSelectScene:

1. The tag badge flies from the round column to the tag stack position
2. It scales up briefly and settles into place
3. A small particle burst on arrival

```typescript
// In RoundSelectScene.onSkip(), after granting tag:
// Create a temporary badge at the column center
const tempBadge = this.add.graphics();
tempBadge.fillStyle(tagColor, 1);
tempBadge.fillRoundedRect(-20, -20, 40, 40, 6);
tempBadge.setPosition(columnCX, columnCY);

// Tween to tag stack position
this.tweens.add({
  targets: tempBadge,
  x: tagStackX,
  y: tagStackY,
  scale: { from: 1.5, to: 1 },
  duration: 600,
  ease: 'Back.easeIn',
  onComplete: () => {
    tempBadge.destroy();
    layout.tagStack.refresh();
  },
});
```

## Deliverables

| File | Action |
|------|--------|
| `src/phaser/ui/TagStack.ts` | **Create** — Tag badge stack component |
| `src/phaser/ui/SceneLayout.ts` | **Modify** — Add TagStack to layout |
| `src/game/Constants.ts` | **Modify** — Add TAG_STACK constants |
| `src/phaser/scenes/ShopScene.ts` | **Modify** — "Hit the Trail" → RoundSelect |
| `src/phaser/scenes/TrailEventScene.ts` | **Modify** — Skip shop → RoundSelect |
| `src/phaser/scenes/BoosterPackScene.ts` | **Modify** — Support returnScene parameter |
| `src/phaser/scenes/RoundSelectScene.ts` | **Modify** — Tag earned animation, TagStack refresh |

## Verification

1. `bun run dev` — full manual playthrough
2. Skip Round 1 → tag badge appears above dice pouch
3. Skip Round 2 → second tag badge stacks above first
4. Enter shop → shop tags consumed (badges disappear), effects applied
5. Twin Wagon → golden "×2" badge appears, next skip shows doubled tag
6. Hover any tag badge → tooltip shows name and description
7. Tags persist across scenes (shop, trail event, game) until consumed
8. Boss round → no skip button, only play
9. Pack tags → opens booster pack, returns to RoundSelect
10. Complete a full 8-leg run to verify no flow breaks

## Future Enhancements (Not in Scope)

- Custom tag artwork (replace emoji with pixel art sprites)
- Tag reveal animation with card-flip effect
- Sound effects for tag earned/consumed
- "Choose 1 of 3" tag selection at higher legs
- Tag collection screen in Journey Info modal
- Profession-specific tag pool weighting
