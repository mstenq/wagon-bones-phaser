# Wagon Bones Phaser

A Balatro-inspired dice roguelike set on the Oregon Trail. Roll dice, build hands, collect equipment, and travel the frontier — one leg at a time.

## Concept

Instead of playing cards, you roll **d12** dice (values 1–12). Each day you roll **8** dice from your hand and score **5**. Pips on scored dice count as base miles traveled. Multipliers work like Balatro's mult system. You must reach each landmark within a limited number of days, and each leg of the journey raises the target.

**Key differences from Balatro:**

- **Dice instead of cards** — no suits or face cards; hand types are based on pairs, straights, and n-of-a-kind
- **Days instead of hands** — you have a limited number of days to reach your destination, with rerolls each day
- **Dice cycling** — scored dice go to a spent pile. You must use ALL your dice before any come back, even across days. Cherry-pick early and you'll suffer later
- **Equipment order matters** — equipment effects apply left-to-right during scoring, and cards can be drag-reordered

## The Journey

Travel 8 legs from Independence, Missouri to Oregon City:

1. Fort Kearny → 2. Chimney Rock → 3. Fort Laramie → 4. Independence Rock → 5. Fort Bridger → 6. Fort Hall → 7. The Dalles → 8. Oregon City

Each leg has a boss encounter and increasing mile targets.

## Hand Types

| Hand | Base Miles | Base Mult |
|------|-----------|-----------|
| High Value | 5 | 1 |
| Pair | 10 | 1 |
| Two Pair | 15 | 2 |
| 3 of a Kind | 20 | 3 |
| 3 Straight | 15 | 1 |
| Full House | 25 | 4 |
| 4 of a Kind | 40 | 5 |
| 4 Straight | 20 | 3 |
| 5 of a Kind | 50 | 6 |
| 5 Straight | 40 | 6 |

## Card Types

- **Equipment** — persistent items that modify scoring (add mult, bonus miles, conditional triggers). Can have auras (Fire, Arcane, Holy, Ghost)
- **Trail Guides** — level up specific hand types, increasing their base miles and mult (Balatro's planet cards)
- **Supply Cards** — one-use cards that enhance dice, manipulate your collection, or earn money (Balatro's tarot cards)
- **Frontier Encounters** — rare, powerful cards that add auras, duplicate equipment, or reshape your dice (Balatro's spectral cards)

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
| `bun run check` | Tests + format check |
| `bun run ci` | check + production build |

## Roadmap & issues

- [IDEAS.md](IDEAS.md) — improvement backlog and technical debt
- [BUGS.md](BUGS.md) — known bugs and balance notes

## Project Structure

| Path | Description |
|------|-------------|
| `src/game/` | Core game logic (no Phaser imports) — GameState, PlayerState, DiceSystem, EquipmentEffects, Economy |
| `src/phaser/scenes/` | Phaser scenes — GameScene, ShopScene, BoosterPackScene, MainMenu, etc. |
| `src/phaser/ui/` | Reusable UI components — ItemCard, DiceSprite, Sidebar, EquipmentBar, HUD |
| `src/phaser/animations/` | Scoring and roll animations |
| `src/data/` | Item definitions, hand tables, trail guides, supply cards, dice auras |
| `public/assets/` | Images, sounds, backgrounds |
