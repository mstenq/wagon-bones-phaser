# Difficulty System — Oregon Trail Stakes

## Overview

Inspired by Balatro's colored stakes, difficulty levels are themed around the perils of the Oregon Trail. Players choose a difficulty after selecting their profession and before entering round select. Each level stacks — higher difficulties include all effects from lower levels.

## Difficulty Levels

| Level | Name                          | Effect                                                                                      | Balatro Equivalent |
|-------|-------------------------------|---------------------------------------------------------------------------------------------|--------------------|
| 1     | **Clear Skies**               | Base difficulty. The trail is calm.                                                         | White Stake        |
| 2     | **Thin Supplies**             | Round 1 of each leg gives no money reward.                                                  | Red Stake          |
| 3     | **Rough Trail**               | Target miles use escalated scaling (`TARGET_MILES_BY_LEG_ROUGH`).                           | Green Stake        |
| 4     | **Cursed Relics**             | 30% of shop/pack equipment spawns **Cursed** (cannot be sold).                              | Black Stake        |
| 5     | **Harsh Rations**             | Lose 1 day (MAX_DAYS: 4 → 3).                                                              | Blue Stake         |
| 6     | **Deadly Frontier**           | Target miles use brutal scaling (`TARGET_MILES_BY_LEG_DEADLY`). Overrides Rough Trail.      | Purple Stake       |
| 7     | **Spoiled Goods**             | 30% of shop/pack equipment spawns **Perishable** (destroyed after 5 rounds).                | Orange Stake       |
| 8     | **Debt to the Company Store** | 30% of shop/pack equipment spawns **Leased** (costs $3 upkeep each round, sold if unpaid).  | Gold Stake         |

## Equipment Modifiers (New)

Three new equipment-level modifiers introduced by the difficulty system:

### Cursed (Level 4+)
- **Icon:** Lock symbol 🔒
- **Effect:** Equipment cannot be sold or discarded. Stays in your loadout permanently.
- **Spawn Rate:** 30% of newly acquired equipment at difficulty 4+.
- **Visual:** Lock badge on card.
- **Immune items:** `dynamite`, `nitro`, `bounty_contract`, `steam_engine`, `phantom_wagon`, `sheriffs_badge`, `guardian_totem`, `fading_memory`, `worn_deck`, `war_drums`, `flour_sack`

### Perishable (Level 7+)
- **Icon:** Clock/timer symbol ⏱
- **Effect:** Equipment is destroyed after 5 rounds of use. Counter shown on card.
- **Spawn Rate:** 30% of newly acquired equipment at difficulty 7+.
- **Visual:** Timer badge with remaining rounds count.
- **Immune items:** `bone_collector`, `rabbits_foot`, `bargain_bin`, `card_counter`, `book_of_the_dead`, `guide_lantern`, `tight_fist`, `haunted_totem`, `square_dance`, `new_blood`, `manifest_destiny`, `covered_wagon`, `diamond_coffin`, `five_mail_marker`, `grave_robber`, `six_feet_under`, `funeral_pyre`, `trail_tax`, `trailblazer`, `railroad_bonds`

### Leased (Level 8+)
- **Icon:** Money symbol 💰
- **Effect:** Equipment costs only $1 to buy, but $3 upkeep deducted at end of each round (before interest is calculated, same timing as gold dice). If you can't pay, item is automatically destroyed.
- **Spawn Rate:** 30% of newly acquired equipment at difficulty 8+.
- **Visual:** Money badge on card.

### Modifier Combinations

Equipment can receive multiple modifiers with these constraints:

| Combination            | Allowed? | Reason                                        |
|------------------------|----------|-----------------------------------------------|
| Perishable + Leased    | ✅ Yes   | Pay upkeep on a decaying item — brutal combo  |
| Cursed + Leased        | ✅ Yes   | Can't sell it AND must pay upkeep — very harsh |
| Cursed + Perishable    | ❌ No    | Opposing concepts (permanent vs. temporary)   |

Auras (fire, icy, holy) generate as normal on modified equipment.

### Notable Interactions

- **Skin Walker / Priest's Blessing + Cursed:** These items do NOT work on Cursed equipment. This means a player can repeatedly use them on a Cursed item without it being consumed — the copy retains the Curse. This is a deliberate exploit path: stack copies of a powerful Cursed item.
- **Gold Dice + Leased:** Gold dice money is calculated at the same time as lease upkeep (end of round, before interest), so gold dice income can offset lease costs.

## Implementation Plan

The implementation is broken into sequential steps, each documented in its own file:

| Step | File | Description |
|------|------|-------------|
| 1 | [DIFFICULTY_1.md](DIFFICULTY_1.md) | Types, constants, and PlayerState changes |
| 2 | [DIFFICULTY_2.md](DIFFICULTY_2.md) | Difficulty selection scene (UI) |
| 3 | [DIFFICULTY_3.md](DIFFICULTY_3.md) | Gameplay effects (target miles, rewards, days) |
| 4 | [DIFFICULTY_4.md](DIFFICULTY_4.md) | Equipment modifiers — data model & types |
| 5 | [DIFFICULTY_5.md](DIFFICULTY_5.md) | Equipment modifiers — spawn logic |
| 6 | [DIFFICULTY_6.md](DIFFICULTY_6.md) | Equipment modifiers — runtime effects (Cursed, Perishable, Leased) |
| 7 | [DIFFICULTY_7.md](DIFFICULTY_7.md) | Equipment modifiers — UI rendering (badges, indicators) |
| 8 | [DIFFICULTY_8.md](DIFFICULTY_8.md) | Testing |

## Scene Flow Change

```
MainMenu → ProfessionSelect → DifficultySelect → RoundSelect → GameScene
```

The new `DifficultySelectScene` sits between profession selection and round select.
