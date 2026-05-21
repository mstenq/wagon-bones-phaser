# Step 3: RoundSelectScene

Create the new scene where players choose to **Play** or **Skip** each round within a leg. This is the Balatro "Choose your next Blind" screen, adapted for Wagon Bones.

## 3.1 — Scene Design

The RoundSelectScene shows **3 columns** — one per round in the current leg:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Sidebar]  │                                                   │
│             │    Choose Your Next Round                          │
│             │                                                   │
│             │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│             │  │ Skipped  │  │  Select  │  │ Upcoming │        │
│             │  │──────────│  │──────────│  │──────────│        │
│             │  │  Mile    │  │  River   │  │ Showdown │        │
│             │  │  Marker  │  │   Ford   │  │          │        │
│             │  │          │  │          │  │ [Boss    │        │
│             │  │  Score   │  │  Score   │  │  Icon]   │        │
│             │  │ at least │  │ at least │  │          │        │
│             │  │  500     │  │   750    │  │  Score   │        │
│             │  │          │  │──────────│  │ at least │        │
│             │  │ SKIPPED  │  │ [Tag     │  │  1,000   │        │
│             │  │          │  │  Reveal] │  │          │        │
│             │  │          │  │──────────│  │ Reward:  │        │
│             │  │          │  │[Skip Btn]│  │  $$$+    │        │
│             │  └──────────┘  └──────────┘  └──────────┘        │
│             │                                                   │
│  [Equip]    │                                                   │
│  [Pouch]    │                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Visual States per Column

Each round column has one of 4 states:

1. **Skipped** — Grayed out, "SKIPPED" text overlaid diagonally, tag icon shown
2. **Select** — Active, highlighted border, shows "Play" button and "Skip" button with tag reveal
3. **Upcoming** — Dimmed, shows round info but no interaction
4. **Completed** — (Not shown in this scene — completed rounds move past this scene)

### Column Contents

Each column displays:
- **Header**: "Skipped" / "Select" / "Upcoming"
- **Round name**: "Mile Marker" / "River Ford" / "Showdown"
- **Round icon/emblem** (optional — can use a simple colored circle/badge for now)
- **Target miles**: "Score at least [X]"
- **Reward**: Dollar signs indicating round reward tier
- **Boss info** (round 3 only): Boss name + description + icon
- **Tag preview** (Select column only): The tag that will be earned if skipped
- **Skip button** (Select column, rounds 1-2 only): "Skip Round" with tag icon
- **Play button** (Select column): "Play Round"

### Boss Column (Round 3)

- Always shows boss name, effect description, and icon
- Never shows a Skip button
- Shows "Play" button when it's the active round

## 3.2 — Scene Flow

```
Entry conditions:
  - From ShopScene ("Hit the Trail")
  - From itself (after skipping a round)

On Play:
  → scene.start('Game')

On Skip (Round 1 or 2):
  → Animate tag earned
  → Process immediate tags (money, upgrade)
  → For immediate_pack tags: scene.start('BoosterPack', { ... returnScene: 'RoundSelect' })
  → For immediate_equipment tags: create equipment, show briefly
  → Call player.advanceRound(true)
  → If next round is still skippable, refresh scene (show next round as Select)
  → If next round is boss, show boss as Select (Play only)

On Play (boss round):
  → scene.start('Game')
```

## 3.3 — Implementation Outline

### File: `src/phaser/scenes/RoundSelectScene.ts`

```typescript
// ─── RoundSelectScene ───
// Balatro-style "Choose your next Blind" screen.
// Shows 3 round columns for the current leg: play vs. skip.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS, GAMEPLAY } from '../../game/Constants';
import { createLayout, LayoutResult } from '../ui/SceneLayout';
import { Button } from '../ui/Button';
import { selectRandomTag, grantTag, processImmediateTags, getPackDefIdForTag } from '../../game/TagSystem';
import { formatScore } from '../../game/formatScore';

export class RoundSelectScene extends Scene {
  private layout: LayoutResult;
  private selectedTag: TrailTagDef | null = null;

  constructor() {
    super('RoundSelect');
  }

  create() {
    const player = getPlayerState();

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.layout = createLayout(this, {
      bgKey: null,
      felt: true,
      sidebarTitle: 'TRAIL MAP',
    });

    // Pre-select the tag the player will get if they skip
    if (player.round <= 2) {
      this.selectedTag = selectRandomTag(player.leg);
    }

    this.buildRoundColumns();

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildRoundColumns(): void {
    const player = getPlayerState();
    const { contentCX, contentW, contentX } = this.layout;
    const { height } = this.scale;

    // Title
    this.add.text(contentCX, 80, 'Choose Your Next Round', {
      fontFamily: FONTS.HEADING,
      fontSize: '32px',
      color: TEXT_COLORS.PRIMARY,
    }).setOrigin(0.5);

    // Column layout
    const colW = Math.min(220, (contentW - 60) / 3);
    const colH = height * 0.6;
    const gap = 20;
    const totalW = colW * 3 + gap * 2;
    const startX = contentCX - totalW / 2;
    const colY = 120;

    for (let r = 1; r <= GAMEPLAY.ROUNDS_PER_LEG; r++) {
      const x = startX + (r - 1) * (colW + gap);
      this.buildColumn(x, colY, colW, colH, r, player.round);
    }
  }

  private buildColumn(
    x: number, y: number, w: number, h: number,
    round: number, currentRound: number
  ): void {
    const player = getPlayerState();
    const isSkipped = round < currentRound; // already skipped/completed earlier rounds
    const isActive = round === currentRound;
    const isUpcoming = round > currentRound;
    const isBoss = round === GAMEPLAY.ROUNDS_PER_LEG;

    // Column background
    const bg = this.add.graphics();
    const bgColor = isActive ? 0x1a2a1a : 0x0d0d1a;
    const borderColor = isActive ? 0x44aa44 : 0x333355;
    bg.fillStyle(bgColor, 0.85);
    bg.fillRoundedRect(x, y, w, h, 12);
    bg.lineStyle(isActive ? 3 : 2, borderColor, isActive ? 1 : 0.6);
    bg.strokeRoundedRect(x, y, w, h, 12);

    const cx = x + w / 2;
    let cy = y + 20;

    // Header
    const headerText = isSkipped ? 'Skipped' : isActive ? 'Select' : 'Upcoming';
    const headerColor = isSkipped ? TEXT_COLORS.SECONDARY : isActive ? '#44ff44' : TEXT_COLORS.SECONDARY;
    this.add.text(cx, cy, headerText, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '14px',
      color: headerColor,
    }).setOrigin(0.5);
    cy += 30;

    // Round name
    const names = ['Mile Marker', 'River Ford', 'Showdown'];
    this.add.text(cx, cy, names[round - 1], {
      fontFamily: FONTS.HEADING,
      fontSize: '20px',
      color: TEXT_COLORS.PRIMARY,
    }).setOrigin(0.5);
    cy += 40;

    // Boss icon (round 3 only)
    if (isBoss) {
      const boss = player.getBossForLeg(player.leg);
      if (boss) {
        this.add.text(cx, cy, boss.name, {
          fontFamily: FONTS.HEADING,
          fontSize: '16px',
          color: TEXT_COLORS.GOLD,
          wordWrap: { width: w - 20 },
          align: 'center',
        }).setOrigin(0.5);
        cy += 30;

        this.add.text(cx, cy, boss.description, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '11px',
          color: TEXT_COLORS.SECONDARY,
          wordWrap: { width: w - 20 },
          align: 'center',
        }).setOrigin(0.5);
        cy += 40;
      }
    }

    // Target miles
    const effectiveLegIndex = Math.max(0, player.leg - 1 - player.permitScoreReduction);
    const baseMiles = GAMEPLAY.TARGET_MILES_BY_LEG[effectiveLegIndex] ?? GAMEPLAY.TARGET_MILES;
    const roundMult = GAMEPLAY.ROUND_MULTIPLIERS[round - 1] ?? 1;
    const target = Math.ceil(baseMiles * roundMult);

    this.add.text(cx, cy, 'Score at least', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: TEXT_COLORS.SECONDARY,
    }).setOrigin(0.5);
    cy += 20;

    this.add.text(cx, cy, formatScore(target), {
      fontFamily: FONTS.HEADING,
      fontSize: '24px',
      color: TEXT_COLORS.SCORE_GREEN,
    }).setOrigin(0.5);
    cy += 30;

    // Reward
    const rewardDollars = '$'.repeat(GAMEPLAY.ROUND_REWARDS[round - 1] ?? 3);
    this.add.text(cx, cy, `Reward: ${rewardDollars}+`, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: TEXT_COLORS.MONEY,
    }).setOrigin(0.5);
    cy += 30;

    // Skipped overlay
    if (isSkipped) {
      // TODO: Show the tag that was earned with diagonal "SKIPPED" text
      this.add.text(cx, y + h / 2, 'SKIPPED', {
        fontFamily: FONTS.HEADING,
        fontSize: '28px',
        color: '#ff4444',
      }).setOrigin(0.5).setRotation(-0.3).setAlpha(0.7);
    }

    // Active round: buttons
    if (isActive) {
      const btnW = w - 30;
      const btnY = y + h - 80;

      // Play button
      new Button(this, cx, btnY, 'Play', btnW, 44)
        .setColor(0x2d6b2d, 0x3d8b3d)
        .onClick(() => this.onPlay());

      // Skip button (rounds 1-2 only)
      if (!isBoss && this.selectedTag) {
        // Tag preview
        const tagPreviewY = btnY - 60;
        this.add.text(cx, tagPreviewY, this.selectedTag.name, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: TEXT_COLORS.GOLD,
          wordWrap: { width: w - 20 },
          align: 'center',
        }).setOrigin(0.5);
        this.add.text(cx, tagPreviewY + 18, this.selectedTag.description, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '10px',
          color: TEXT_COLORS.SECONDARY,
          wordWrap: { width: w - 20 },
          align: 'center',
        }).setOrigin(0.5);

        new Button(this, cx, btnY + 52, 'Skip Round', btnW, 44)
          .setColor(0x8b2020, 0xb03030)
          .onClick(() => this.onSkip());
      }
    }
  }

  private onPlay(): void {
    this.scene.start('Game');
  }

  private onSkip(): void {
    if (!this.selectedTag) return;
    const player = getPlayerState();

    // Grant the tag
    const tagInstance = grantTag(this.selectedTag);

    // Advance round (skip)
    player.advanceRound(true);

    // Emit events
    EventBus.emit(Events.ROUND_SKIPPED, { tag: tagInstance });

    // Process immediate tags
    const immediateResults = processImmediateTags(player);

    // Check for immediate pack tags
    const packTags = player.consumeTagsByCategory('immediate_pack');
    if (packTags.length > 0) {
      // Open the first pack tag (chain remaining ones via BoosterPackScene return)
      const packTag = packTags[0];
      const packDefId = getPackDefIdForTag(packTag.def.id);
      if (packDefId) {
        // Store remaining pack tags to process when returning
        // TODO: Queue remaining pack tags
        this.scene.start('BoosterPack', {
          packDefId,
          free: true,
          returnScene: 'RoundSelect',
        });
        return;
      }
    }

    // Check for immediate equipment tags (Junk Pile)
    const equipTags = player.consumeTagsByCategory('immediate_equipment');
    for (const tag of equipTags) {
      // Create common equipment
      // TODO: Implement Junk Pile equipment creation
    }

    // If journey is complete after advancing, go to victory
    if (player.journeyComplete) {
      this.scene.start('GameOver', { won: true, victory: true });
      return;
    }

    // Refresh scene for next round
    this.selectedTag = null;
    this.scene.restart();
  }

  private onResize(): void {
    this.scene.restart();
  }
}
```

## 3.4 — Register the Scene

### In `src/game/config.ts`:

```typescript
import { RoundSelectScene } from '../phaser/scenes/RoundSelectScene';

// Add to scene array (after ShopScene, before GameScene):
scene: [
  // ...
  ShopScene,
  RoundSelectScene,  // NEW
  BoosterPackScene,
  // ...
]
```

## 3.5 — Update Scene Transitions

### ShopScene: "Hit the Trail" → RoundSelectScene

In `ShopScene.ts`, change the "Hit the Trail" button:

```typescript
// Before:
this.scene.start('Game');

// After:
this.scene.start('RoundSelect');
```

### TrailEventScene: Skip shop → RoundSelectScene

In `TrailEventScene.ts`, when `skipNextShop` is true:

```typescript
// Before:
this.scene.start('Game');

// After:
this.scene.start('RoundSelect');
```

### BoosterPackScene: Return to RoundSelect

When BoosterPackScene is opened from a tag, it needs to return to RoundSelectScene. This requires the BoosterPackScene to accept a `returnScene` parameter (it likely already returns to ShopScene — check for this pattern and extend).

## Deliverables

| File | Action |
|------|--------|
| `src/phaser/scenes/RoundSelectScene.ts` | **Create** — Full scene implementation |
| `src/game/config.ts` | **Modify** — Register RoundSelectScene |
| `src/phaser/scenes/ShopScene.ts` | **Modify** — "Hit the Trail" → RoundSelect |
| `src/phaser/scenes/TrailEventScene.ts` | **Modify** — Skip-shop → RoundSelect |
| `src/phaser/scenes/BoosterPackScene.ts` | **Modify** — Support `returnScene` parameter |

## Verification

1. Run `bun run dev`
2. Play through to first shop
3. Click "Hit the Trail" — should see RoundSelectScene with 3 columns
4. Round 1 (Mile Marker) should be active with Play and Skip buttons
5. Click Play → goes to GameScene as normal
6. Click Skip → shows tag earned, advances to round 2 column becoming active
7. Boss column should never show a Skip button

## Visual Polish (Later)

- Tag reveal animation (card flip or fade-in)
- "SKIPPED" text with diagonal stamp effect
- Boss icon loaded from `assets/bosses/`
- Column entrance animations (slide in from bottom)
- Tag icon matches the tag's category color
