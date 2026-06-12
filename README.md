# Wagon Bones Phaser

A Balatro-inspired dice roguelike set on the Oregon Trail. Roll dice, build hands, collect equipment, and travel the frontier — one leg at a time.

## Concept

Instead of playing cards, you roll **d12** dice (values 1–12). Each day you draw **8** dice from your pouch, roll them, and score up to **5**. Pips on scored dice count as base miles traveled. Multipliers work like Balatro's mult system. You must reach each landmark within a limited number of days (4 by default, with 4 rerolls per day), and each leg of the journey raises the target.

**Key differences from Balatro:**

- **Dice instead of cards** — no suits or face cards; hand types are based on pairs, straights, and n-of-a-kind
- **Days instead of hands** — you have a limited number of days to reach your destination each round, with rerolls each day
- **Dice cycling** — scored dice go to a spent pile. You must use ALL your dice before any come back, even across days. Cherry-pick early and you'll suffer later
- **Equipment order matters** — equipment effects apply left-to-right during scoring, and cards can be drag-reordered

## The Journey

Start in Independence, Missouri and travel **8 legs** to Oregon City. Each leg has **3 rounds** (two trail rounds plus a boss showdown) with increasing mile targets. After the story route, endless mode can continue up to leg 39.

Landmarks along the main route:

1. Fort Kearny → 2. Chimney Rock → 3. Fort Laramie → 4. Independence Rock → 5. Fort Bridger → 6. Fort Hall → 7. The Dalles → 8. Oregon City

## Hand Types

| Hand | Base Miles | Base Mult |
|------|-----------|-----------|
| High Value | 5 | 1 |
| Pair | 10 | 1 |
| Two Pair | 15 | 2 |
| 4 Straight | 15 | 2 |
| Three of a Kind | 20 | 3 |
| Full House | 25 | 4 |
| 5 Straight | 30 | 4 |
| Four of a Kind | 40 | 5 |
| Five of a Kind | 50 | 6 |

## Card Types

- **Equipment** — persistent items that modify scoring (add mult, bonus miles, conditional triggers). Can have auras (Holy, Fire, Arcane, Ghost)
- **Trail Guides** — level up specific hand types, increasing their base miles and mult (Balatro's planet cards)
- **Supply Cards** — one-use cards that enhance dice, manipulate your collection, or earn money (Balatro's tarot cards)
- **Frontier Encounters** — rare, powerful cards that add auras, duplicate equipment, or reshape your dice (Balatro's spectral cards)
- **Permits** — run modifiers bought in the shop (extra slots, aura rates, economy tweaks)
- **Trail Tags** — skip-round rewards and shop modifiers earned from bosses and events
- **Professions** — starting characters that change your run (rerolls, money, slots, shop behavior)

## Tech Stack

- **Phaser 4** — game engine
- **SolidJS** — UI wrapper
- **TypeScript** — strict mode
- **Vite** — bundler
- **Bun** — runtime / package manager

## Getting Started

```bash
bun install
bun run dev
```

Dev server runs at `http://localhost:8080`.

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Production build to `dist/` |
| `bun test` | Run game logic tests |
| `bun run typecheck` | TypeScript check (`tsc --noEmit`) |
| `bun run format` | Format `src/` with Prettier |
| `bun run check` | Tests + format check |
| `bun run ci` | check + production build |

## Documentation

- [AGENTS.md](AGENTS.md) — contributor and AI agent instructions (architecture, testing, conventions)
- [BUGS.md](BUGS.md) — known bugs and balance notes
- [GAME_OVERVIEW.md](GAME_OVERVIEW.md) — core loop, scoring sequence, professions
- [GAME_EQUIPMENT_OVERVIEW.md](GAME_EQUIPMENT_OVERVIEW.md) · [GAME_DICE_OVERVIEW.md](GAME_DICE_OVERVIEW.md) · [GAME_BOSS_OVERVIEW.md](GAME_BOSS_OVERVIEW.md)
- [GAME_SUPPLY_CARD_OVERVIEW.md](GAME_SUPPLY_CARD_OVERVIEW.md) · [GAME_TRAIL_GUIDE_OVERVIEW.md](GAME_TRAIL_GUIDE_OVERVIEW.md) · [GAME_FRONTIER_ENCOUNTER_OVERVIEW.md](GAME_FRONTIER_ENCOUNTER_OVERVIEW.md)
- [GAME_PERMITS_OVERVIEW.md](GAME_PERMITS_OVERVIEW.md) · [GAME_TAGS_OVERVIEW.md](GAME_TAGS_OVERVIEW.md)

## Project Structure

| Path | Description |
|------|-------------|
| `src/game/` | Pure game logic (no Phaser scene imports) — stores, `gameFacade`, scoring, equipment effects, economy |
| `src/phaser/scenes/` | Phaser scenes — GameScene, ShopScene, BoosterPackScene, MainMenu, etc. |
| `src/phaser/ui/` | Reusable UI components — ItemCard, DiceSprite, Sidebar, EquipmentBar, HUD |
| `src/phaser/animations/` | Scoring and roll animations |
| `src/data/` | Typed defs — items, hands, bosses, supply cards, trail guides, auras |
| `public/assets/` | Images, sounds, backgrounds |
