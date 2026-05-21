# Trail Tags — Implementation Plan

This document breaks the Trail Tags feature into **5 sequential implementation steps**, each in its own file. Tags are Wagon Bones' equivalent of Balatro's Tags — rewards earned by **skipping** a non-boss round.

## Reference

- [GAME_TAGS_OVERVIEW.md](GAME_TAGS_OVERVIEW.md) — Full design spec, tag list, categories, open questions

## Design Decisions (Pre-Implementation)

These are the answers to the open questions from the overview, locked in for implementation:

1. **Skip timing** — Player can skip **both** Mile Marker (round 1) and River Ford (round 2) per leg. Boss (round 3) is **never** skippable.
2. **Tag choice** — Player is shown **1 random tag** from the eligible pool. Twin Wagon duplicates that tag (no choice from multiple).
3. **Showdown skip** — Always blocked.
4. **Well-Traveled / Pack Rat counting** — `daysScored` increments each time `calculateScore()` fires. `unusedRerollsTotal` sums `rerollsRemaining` at each `round-won` event.
5. **Spirit Walk** — Normal Frontier Pack only (pick 1 of 2).

## Current Scene Flow

```
PayoutScene → advanceRound() → TrailEventScene → ShopScene → "Hit the Trail" → GameScene
                                                                                    ↓
                                                                              (round-won)
                                                                                    ↓
                                                                              PayoutScene
```

## Proposed Scene Flow

```
ShopScene → "Hit the Trail" → RoundSelectScene ──[Play]──→ GameScene → (round-won) → PayoutScene
                                    │                                                     ↓
                                    ├──[Skip R1/R2]──→ Tag granted → advanceRound()       │
                                    │                       ↓                              │
                                    │                 (immediate tags fire)                 │
                                    │                       ↓                              │
                                    │                 RoundSelectScene (next round)         │
                                    │                                                      │
                                    └──[Play Boss]───→ GameScene                           │
                                                                                           ↓
                                                                              TrailEventScene
                                                                                           ↓
                                                                                      ShopScene
```

Key changes:
- **RoundSelectScene** is a new scene inserted between ShopScene and GameScene
- Skipping bypasses GameScene entirely — just calls `advanceRound()` and grants a tag
- Multiple skips loop back to RoundSelectScene for the next round
- Boss round always forces Play (no skip button)
- Pending tags that affect the shop fire when entering ShopScene

## Tag Display: Stacking Above Dice Pouch

Earned tags that are **pending** (waiting for shop, boss, or next round) display as small icons stacked vertically above the dice pouch button (bottom-right). This mirrors Balatro's tag stack above the deck.

```
  ┌──────┐
  │ Tag3 │  ← newest on top
  ├──────┤
  │ Tag2 │
  ├──────┤
  │ Tag1 │  ← oldest at bottom
  ├──────┤
  │  🎲  │  ← dice pouch button
  └──────┘
```

- Each tag icon is ~40×40px with a tooltip on hover showing name + description
- Twin Wagon tags show a special "×2" badge
- Immediate tags (pack openings, money grants) fire instantly and never appear in the stack
- Shop tags are consumed and removed from the stack when entering ShopScene
- Boss tags are consumed when entering the Showdown round

## Implementation Steps

| Step | File | Summary |
|------|------|---------|
| 1 | [TAG_IMPLEMENTATION_1.md](TAG_IMPLEMENTATION_1.md) | **Data & Types** — Tag definitions, types, pool/weights, JSON data |
| 2 | [TAG_IMPLEMENTATION_2.md](TAG_IMPLEMENTATION_2.md) | **PlayerState & Game Logic** — Tag queue, skip mechanics, stat tracking |
| 3 | [TAG_IMPLEMENTATION_3.md](TAG_IMPLEMENTATION_3.md) | **RoundSelectScene** — New scene: play vs. skip UI, tag reveal animation |
| 4 | [TAG_IMPLEMENTATION_4.md](TAG_IMPLEMENTATION_4.md) | **Tag Effects & Integration** — Shop hooks, pack hooks, immediate effects, aura application |
| 5 | [TAG_IMPLEMENTATION_5.md](TAG_IMPLEMENTATION_5.md) | **Tag Stack UI & Polish** — Pending tag icons above dice pouch, tooltips, Twin Wagon badge, scene flow wiring |

## Files Modified (Summary)

### New Files
- `src/data/trail_tags.json` — Tag definitions (id, name, description, category, minLeg, weight)
- `src/game/TagSystem.ts` — Pure game logic: tag pool, selection, granting, effect dispatch
- `src/phaser/scenes/RoundSelectScene.ts` — Play vs. skip UI scene
- `src/phaser/ui/TagStack.ts` — Pending tag icons stacked above dice pouch

### Modified Files
- `src/game/types.ts` — Add `TrailTagDef`, `TrailTagInstance`, `TagCategory` types
- `src/game/PlayerState.ts` — Add `pendingTags`, `storedAuraTags`, `roundsSkipped`, `daysScored`, `unusedRerollsTotal`, `twinWagonCount`
- `src/game/EventBus.ts` — Add `TAG_EARNED`, `ROUND_SKIPPED` events
- `src/game/GameState.ts` — Increment `daysScored` in `calculateScore()`, sum rerolls in round-won
- `src/game/ItemsSystem.ts` — Hook for tag-injected shop items (free uncommon/rare, aura overrides)
- `src/game/BoosterPackSystem.ts` — Helper to find mega pack defs by category
- `src/game/config.ts` — Register `RoundSelectScene`
- `src/game/Constants.ts` — Tag stack layout constants, tag colors
- `src/phaser/scenes/ShopScene.ts` — Consume shop tags on entry, "Hit the Trail" → `RoundSelectScene`
- `src/phaser/scenes/PayoutScene.ts` — Flow change: after `advanceRound()`, go to TrailEvent (unchanged) but track stats
- `src/phaser/scenes/TrailEventScene.ts` — After trail event, go to Shop (unchanged)
- `src/phaser/ui/SceneLayout.ts` — Create `TagStack` alongside `DicePouch`
- `src/game/__tests__/tags.test.ts` — New test file for tag logic

## Dependency Order

Steps must be implemented in order — each builds on the previous:

```
Step 1 (Data) → Step 2 (Logic) → Step 3 (Scene) → Step 4 (Effects) → Step 5 (UI + Wiring)
```

Step 1 and 2 can be tested with unit tests before any Phaser work begins.
