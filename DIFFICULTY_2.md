# Step 2: Difficulty Selection Scene (UI)

## Goal

Create `DifficultySelectScene` that displays after profession selection and before round select. Player picks a difficulty level (1–8). Higher levels are unlocked progressively (for now, all unlocked for development).

## Files to Create/Modify

### 1. Create `src/phaser/scenes/DifficultySelectScene.ts`

Scene layout:
- Title: "Choose Your Trail"
- 8 difficulty cards arranged in a 2×4 or horizontal scrolling row
- Each card shows:
  - Colored difficulty badge (matching `DifficultyDef.color`)
  - Name (e.g. "Clear Skies")
  - Description text
  - Cumulative effects list (grayed out effects from lower levels, white for new)
- Selected card gets a highlight border
- "Embark" button confirms selection

```typescript
import { Scene } from 'phaser';
import { getPlayerState } from '../../game/PlayerState';
import { DIFFICULTIES } from '../../game/Constants';
import { DifficultyLevel } from '../../game/types';
import { EventBus, Events } from '../../game/EventBus';

export class DifficultySelectScene extends Scene {
  private selectedLevel: DifficultyLevel = 1;

  constructor() {
    super('DifficultySelect');
  }

  create(): void {
    // Background
    // Title text
    // Render 8 difficulty cards
    // Confirm button
    // Wire up selection → PlayerState.setDifficulty()
    // Transition to RoundSelect
    EventBus.emit(Events.SCENE_READY, this);
  }
}
```

**Card Visual Structure:**
```
┌────────────────────┐
│  ● Clear Skies     │  ← colored dot + name
│                    │
│  Base difficulty.  │  ← description
│  The trail is     │
│  calm.            │
│                    │
│  (no effects)     │  ← cumulative effects
└────────────────────┘
```

### 2. Modify `src/phaser/scenes/ProfessionSelectScene.ts`

Change transition target from `'RoundSelect'` to `'DifficultySelect'`:

```typescript
// Before:
this.scene.start('RoundSelect');

// After:
this.scene.start('DifficultySelect');
```

### 3. Register Scene in `src/game/main.ts`

Add `DifficultySelectScene` to the scene list in the Phaser config.

### 4. Modify `src/phaser/scenes/DifficultySelectScene.ts` — Confirm Flow

On confirm:
```typescript
const player = getPlayerState();
player.setDifficulty(this.selectedLevel);
this.scene.start('RoundSelect');
```

## UI Design Notes

- Cards should use the same visual style as profession cards (dark bg, rounded corners, glowing border on hover)
- The selected card should pulse or have a bright border (COLORS.SELECTION)
- Lower difficulties show as "completed" with a checkmark if previously beaten
- For now, all 8 are selectable (unlock gating is a future feature)
- Layout: 4 cards per row, 2 rows — fits nicely in 1024×768

## Color Palette for Difficulty Badges

| Level | Color | Hex |
|-------|-------|-----|
| 1 | White | `0xffffff` |
| 2 | Red | `0xff6666` |
| 3 | Green | `0x66cc66` |
| 4 | Black/Dark | `0x333333` |
| 5 | Blue | `0x6688ff` |
| 6 | Purple | `0xaa44ff` |
| 7 | Orange | `0xff8800` |
| 8 | Gold | `0xffd700` |

## Verification

- Scene appears after profession select
- All 8 difficulties render with correct names/colors
- Selecting a card updates visual highlight
- Confirming sets `PlayerState.difficulty` and transitions to RoundSelect
- Back button returns to ProfessionSelect
