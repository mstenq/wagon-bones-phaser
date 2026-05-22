# Wagon Bones — Ideas & Improvement Backlog

Living document from a codebase audit (May 2026). Use with [AGENTS.md](AGENTS.md) for implementation conventions and [BUGS.md](BUGS.md) for known defects.

---

## Where We Lack Most (TL;DR)

| Area | Severity | Why it hurts |
|------|----------|--------------|
| **Trail event modifiers (dead code)** | High | Events set penalties that never apply — players get “fake” consequences |
| **Tooltip / information design** | High | ~100 items have `display()` but many effects still feel opaque; no live state in hover (shop preview, Second Helpings, Trade, …) |
| **Game feel & UI polish** | High | Strong systems under the hood; Phaser UI is functional more than delightful |
| **Doc ↔ code drift** | Medium | README/GAME_OVERVIEW still describe d6 / 5-dice roll; confuses design and agents |
| **Art consistency** | Medium | `BUGS.md` lists weak item art; trail spy assets are a big investment |
| **Balance pass** | Medium | Many items untuned; skipped tests (e.g. Bone Collector) signal uncertainty |
| **Test hygiene** | Medium | 1280+ tests but 1 failing + 4 skipped; no CI script for `format:check` in package.json |
| **Content wiring** | Medium | Equipment/tags/permits exist; not all design-doc items may be implemented or reachable in a full run |

**Best ROI order:** fix dead trail modifiers → stateful tooltips → one “juice” pass on GameScene scoring → balance/doc cleanup → spyglass UX finish → broader content.

---

## 1. Correctness & Trust (Do First)

### Trail event modifiers not applied

`TrailEventsSystem` accumulates modifiers on `player.trailEventModifiers`, but several fields are **never read** in `GameState`, `DiceSystem`, `Economy`, or scenes:

- `flatMilesPenalty`
- `moneyPerDayLoss`
- `disableRerollDay1`
- `standardDiceDay1`
- `diamondCrackDoubled`
- `luckyOddsHalved`
- `scoredDiceDestroyChance`

**Working today:** `dayPenalty`, `rerollPenalty`, `handSizePenalty`, `scoreMultiplier`, `bossUpgradeMultiplier`, `skipNextShop`, `loseAllRerolls`.

**Options:**

- **Implement** each modifier in the right layer (day 1 rules in `GameState.startRound` / first day tick; money loss on `DAY_END`; flat miles subtract from round score or target; lucky/diamond/scored-destroy in `DiceSystem`).
- **Or remove** effect types from trail data until ready — avoids lying to the player.

### Known bugs ([BUGS.md](BUGS.md))

- **Fading Memory** — first round should start at +20 mult; decay at round **end**, not start.
- **Mystery Crate** — failing test (`ROUND_START_ADD_DICE`); round-start dice injection vs `rollSize` likely drifted.
- **Scene `start` data** — not every transition passes `{}`; stale `init` data risk (see AGENTS.md).

### Skipped / flaky tests

- Bone Collector (`ENHANCED_SPENT_MILES_GAIN`) — 4 skipped tests; either fix effect or update design.
- Run `bun test` before releases; treat failures as release blockers.

---

## 2. Player Experience & Game Feel

### Information the player needs but does not get

- **Stateful tooltips** — extend the `display(game, player)` pattern to shop hover, supply cards, and equipment tooltips so previews show *this run’s* outcomes (next Second Helpings card, Trade payout, copy targets, etc.).
- **Scoring forecast** — optional “if you play this hand now” miles/mult breakdown before locking score (reduces Balatro-like confusion).
- **Trail event clarity** — show which modifiers are active on the HUD between rounds (icon strip or journey modal).
- **Boss telegraph** — boss restriction summary on round select and day 1 of boss round.
- **Spent pouch UX** — spent-pile cycling is core; make “what comes back when” obvious (pouch modal exists — tie it to day planning).

### Juice & polish (Phaser layer)

Use `game-designer` / `game-ui-design` skills intentionally on:

- Score popups (anticipation, xMult punch, screen shake tiers by magnitude)
- Roll phase (dice tumble, lock-in sting, reroll counter feedback)
- Round win / fail (landmark art, wagon movement metaphor)
- Shop (reroll animation, purchase confirm, broke-state humor)
- Trail events — **Scout’s Spyglass** ([SCOUTS_SPYGLASS_UPDATE.md](SCOUTS_SPYGLASS_UPDATE.md)): matte + movable spyglass, Investigate +20 mi / Avoid risk-reward, optional lens distortion
- Audio pass — `GameAudio` / preferences exist; map more events (tag earned, permit bought, trail choice)

### Onboarding

- First-run tutorial or “practice leg” (Independence only, no meta loss)
- Hand reference pinned in sidebar (levels from trail guides)
- Profession picker — show *starting dice faces* and rules delta, not just text

---

## 3. Balance & Design

Pull from [BUGS.md](BUGS.md) balance section and playtest notes:

| Item / area | Direction |
|-------------|-----------|
| Bone Collector | Increase miles scaling (tests skipped) |
| Gold Tooth | Unlock only if player has ≥1 gold die |
| Spare Wagon Parts | Rework: block negative trail events; per negative avoided → x0.75 mult (stacking rules TBD) |
| Scout’s Spyglass | Investigate +20 mi; avoid = skip event (design doc) |
| Rail Splitter | Consider 10 mult |
| 4 Straight | Align stats with two pair tier |
| Covered Wagon | Deprecate (overlap with Wood Axe) |
| Difficulty stakes | 8 levels exist — verify reward curve vs mile targets (`TARGET_MILES_BY_LEG_*`) |
| Economy | Interest cap, shop reroll cost, round rewards — sim late-leg runs |

**Macro balance tools:**

- DevMode boss/item shortcuts (`BossTestModal`) — expand into balance sandbox (seeded runs, export score log).
- Simple script: run N automated random hands per leg and plot miles distribution.

---

## 4. Content & Systems Completion

### Equipment (~100 defs in `items.ts`)

- Audit [GAME_EQUIPMENT_OVERVIEW.md](GAME_EQUIPMENT_OVERVIEW.md) vs `items.ts` — deprecated entries, phase gaps, missing art.
- Items with weak art ([BUGS.md](BUGS.md)) — batch commission or placeholder style guide.
- Unlock conditions (`equipmentUnlock.ts`) — ensure UI shows locked reason in catalog.

### Trail events

- Finish spyglass image parity (`trailEventAssets.test.ts` — good pattern; extend to full catalog).
- Remove or implement dead modifier effects (section 1).
- `trail-events-old/` assets — delete or migrate to avoid duplicate IDs.

### Tags, permits, frontier

- [GAME_TAGS_OVERVIEW.md](GAME_TAGS_OVERVIEW.md) — confirm every tag in data is earnable and rewarded in UI (`TagStack`, `TagTooltip`).
- Permits — shop offer cadence per leg; test with `permits.test.ts` scenarios in real UI.
- Frontier encounters — rarity in shop vs Demon Hunter profession.

### Bosses

- All boss effects wired in `BossEffectsSystem` + tests in `bosses.test.ts`.
- Boss portraits loaded in Preloader — missing PNG = silent broken portrait.

### Professions

- 13 professions in design doc — verify each modifier in code + profession select tooltips (`ProfessionStartingDiceTooltip`).

---

## 5. Technical Debt

| Task | Benefit |
|------|---------|
| **JSON → typed TS** for `trail_guides`, `supply_cards`, `packs`, `permits`, `professions` | Safer refactors, no runtime shape guesses |
| **Migrate round-start/day-end** fully into `effectRegistry` lifecycle | One pattern for new equipment |
| **`hintDisplay` naming** | Rename stragglers to `display` or document both |
| **package.json metadata** | Still says “Phaser 3 template” — update name/description |
| **CI script** | `bun test && bun run format:check` in one npm script or GitHub Action |
| **Phaser import boundary** | Optional: replace `EventBus` Phaser emitter with `eventemitter3` to drop game-layer Phaser dep |
| **Scene transition audit** | Grep `scene.start` — enforce `{}` or explicit payloads |
| **README accuracy** | d12, roll size 8, link to IDEAS/BUGS |

### Architecture wins (larger)

- **Run summary / seed** — encoded seed for reproducible bug reports.
- **Telemetry hooks** (local only) — hand type frequency, loss reason, shop buys (balance data).
- **Extract TrailEventScene spyglass** to own scene/module ([SCOUTS_SPYGLASS_UPDATE.md](SCOUTS_SPYGLASS_UPDATE.md)).

---

## 6. Documentation Hygiene

- Single source of truth for dice: **d12**, roll **8**, score **5** — fix README + GAME_OVERVIEW.
- Link IDEAS.md from README “Contributing / roadmap”.
- When adding equipment, update GAME_EQUIPMENT_OVERVIEW *or* mark “implemented only in items.ts”.
- Keep AGENTS.md updated when adding systems (last synced with repo structure May 2026).

---

## 7. Suggested Roadmap

### Phase A — Trust (1–2 weeks)

1. Wire or remove dead trail modifiers.
2. Fix Fading Memory + Mystery Crate test.
3. Stateful tooltip MVP (shop + top 10 variable items).
4. README / GAME_OVERVIEW dice & roll size fix.

### Phase B — Feel (2–3 weeks)

1. Spyglass scene polish + investigate/avoid miles.
2. Score/roll animation pass on GameScene.
3. HUD: active trail modifiers + boss recap.
4. Replace worst item art batch from BUGS.md.

### Phase C — Depth (ongoing)

1. Balance pass with DevMode sandbox.
2. Tutorial / first leg.
3. Tag + permit UX completeness.
4. JSON → TS migration.
5. CI + release checklist (`test`, `format:check`, `build`).

---

## 8. Wildcards (Fun but Larger)

- **Daily challenge** — fixed seed, leaderboard localStorage.
- **Endless / NG+** — post–Oregon City mileage inflation.
- **Achievement ledger** — “won on Deadly Frontier as Outlaw with 3 cursed items”.
- **Dice skin cosmetics** — pure visual, monetization-friendly if ever needed.
- **Narrative voice** — trail event writer pass for tone consistency.
- **Controller support** — focus order in shop/game (game-ui-design skill).

---

## 9. Quick Wins (< half day each)

- [ ] Fix `GameState.ts` header comment (`DRAW` → `SELECT`).
- [ ] Add `bun run check` → test + format:check.
- [ ] Document failing test in BUGS.md with owner.
- [ ] HUD line: “Trail: −2 days, −1 reroll” from `trailEventModifiers`.
- [ ] Equipment catalog: show locked `unlockCondition` text.
- [ ] Delete unused `trail-events-old` assets after confirming no references.
- [ ] Main menu: “Continue” only if autosave valid (already partially there — verify UX).

---

*Add ideas below as you playtest. Strike items when shipped or rejected.*
