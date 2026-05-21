# Trail Tags Overview

Trail Tags are Wagon Bones' version of Balatro's **Tags** — small rewards earned by **skipping** a travel round instead of playing it. They are themed as labels, chalk marks, and stamped vouchers you'd find on a wagon crate at a frontier camp.

This document maps every Balatro tag to an Oregon Trail equivalent and records design notes for implementation.

## Also See

- [GAME_OVERVIEW.md](GAME_OVERVIEW.md) — core loop, legs, rounds, days
- [GAME_EQUIPMENT_OVERVIEW.md](GAME_EQUIPMENT_OVERVIEW.md) — equipment (jokers), auras
- [GAME_PERMITS_OVERVIEW.md](GAME_PERMITS_OVERVIEW.md) — frontier permits (vouchers)
- [GAME_SUPPLY_CARD_OVERVIEW.md](GAME_SUPPLY_CARD_OVERVIEW.md) — supply cards (tarot)
- [GAME_TRAIL_GUIDE_OVERVIEW.md](GAME_TRAIL_GUIDE_OVERVIEW.md) — trail guides (planets)
- [GAME_FRONTIER_ENCOUNTER_OVERVIEW.md](GAME_FRONTIER_ENCOUNTER_OVERVIEW.md) — frontier encounters (spectral)
- [GAME_DICE_OVERVIEW.md](GAME_DICE_OVERVIEW.md) — dice enhancements, pip stickers, dice aura
- [GAME_BOSS_OVERVIEW.md](GAME_BOSS_OVERVIEW.md) — boss encounters

---

## Terminology Map (Balatro → Wagon Bones)

| Balatro | Wagon Bones | Notes |
|---------|-------------|-------|
| Ante | **Leg** (1–8) | Independence → Oregon City |
| Small Blind | **Round 1** — Mile Marker | Lowest mile target (1× leg base) |
| Big Blind | **Round 2** — River Ford | 1.5× mile target |
| Boss Blind | **Round 3** — Showdown | 2× mile target + boss effect |
| Skip a blind | **Skip a round** | Earn a tag; advance without playing |
| Joker | **Equipment** | Persistent scoring items |
| Voucher | **Frontier Permit** | One offered per leg in shop |
| Planet card | **Trail Guide** | Levels a hand type |
| Tarot card | **Supply card** | One-use consumable |
| Spectral card | **Frontier Encounter** | Rare, high-impact consumable |
| Playing card pack | **Dice Grab Bag** | Adds/enhances dice in your pouch |
| Edition (Foil / Holo / Poly / Negative) | **Equipment aura** (Icy / Fire / Holy / Ghost) | Ghost = “negative” (no slot) |
| Hand size | **Dice hand size** | How many dice you can hold in the pick phase |
| Hand played | **Day scored** | One scoring play per day |
| Discard | **Unused reroll** | Rerolls left at end of day/round |
| Shop reroll | **Camp reroll** | Pay to refresh shop stock |

---

## How Tags Are Earned

At the start of each **leg**, the player faces three rounds before the next camp shop:

1. **Mile Marker** (round 1)
2. **River Ford** (round 2)
3. **Showdown** (round 3 — boss)

After winning a round (or at the round-select screen, TBD), the player may **skip** the next round to receive a random Trail Tag instead of playing it. Skipping the boss round is not allowed.

- **Hunter / Trapper Nathan Cole** — After each boss, gain a **Twin Wagon** tag (doubles the next tag reward, like Balatro's Double tag).
- **Bounty Contract** (equipment) — Sell to gain a free **Twin Wagon** tag.
- **Shortcut Trail** (equipment) — Tracks `roundsSkipped` for scaling mult; separate from tag payout.

Skipped rounds still advance `leg` / `round` counters and pay no round reward. Tag rewards apply when their trigger condition is met (next shop, next boss, immediately, etc.).

---

## Trail Tags (Full List)

**Leg** = earliest leg the tag can appear when skipping (higher legs = later unlock). Mirrors Balatro's Ante column.

| Tag ID | Name | Benefit | Balatro Source | Leg | Notes |
|--------|------|---------|----------------|-----|-------|
| `tag_uncommon` | **Outfitter's Pick** | Next camp shop includes one free **Uncommon** equipment (extra shop slot roll, guaranteed uncommon). | Uncommon | 1 | Stacks with aura tags on the same item. Not reduced by permits that skew shop weights. |
| `tag_rare` | **Saloon Find** | Next camp shop includes one free **Rare** equipment. | Rare | 1 | Same generation rules as Outfitter's Pick. |
| `tag_ghost` | **Haunted Relic** | Next **base** (no aura) equipment in shop becomes **Ghost** aura and is free. | Negative | 2+ | If no base equipment in next shop, tag is **stored**. Stacks until consumed. Works with Pick/Saloon if the rolled item has no aura. |
| `tag_icy` | **Frosted Tin** | Next base equipment in shop becomes **Icy** aura (+50 miles when scored) and is free. | Foil | 1 | Stored if no base equipment. |
| `tag_fire` | **Branded Iron** | Next base equipment in shop becomes **Fire** aura (+10 mult) and is free. | Holographic | 1 | Stored if no base equipment. |
| `tag_holy` | **Gilded Cross** | Next base equipment in shop becomes **Holy** aura (×1.5 mult) and is free. | Polychrome | 1 | Stored if no base equipment. |
| `tag_investment` | **Bounty Payout** | Gain **$25** after defeating the next boss (Showdown). | Investment | 1 | Stacks on one boss; each tag +$25. |
| `tag_permit` | **Permit Stamp** | Adds a **Frontier Permit** to the next shop. | Voucher | 1 | Stacks until all available permits for this leg are shown (excludes already purchased and unrevealed stage-2 permits). Does not carry to later legs. |
| `tag_boss` | **Change of Guard** | Re-roll the boss assigned to this leg's Showdown. | Boss | 1 | Uses **Bounty Board** / **Wanted Dead or Alive** reroll if redeemed. |
| `tag_dice_mega` | **Wagon Load** | Immediately open a free **Mega Dice Grab Bag** (pick 2 of 5). | Standard | 2+ | Triggers pack-open side effects (Leftovers, Tight Fist, etc.). |
| `tag_supply_mega` | **Supply Drop** | Immediately open a free **Mega Supply Pack** (pick 2 of 5). | Charm | 1 | |
| `tag_trail_guide_mega` | **Surveyor's Cache** | Immediately open a free **Mega Trail Guide Pack** (pick 2 of 5). | Meteor | 2+ | |
| `tag_equipment_mega` | **Outfitter's Wagon** | Immediately open a free **Mega Equipment Pack** (pick 2 of 4). | Buffoon | 2+ | |
| `tag_frontier` | **Spirit Walk** | Immediately open a free **Frontier Pack** (normal size: pick 1 of 2). | Ethereal | 2+ | Only pack tag that is **not** Mega-sized. |
| `tag_well_traveled` | **Well-Traveled** | Gain **$1** for each **day scored** this run. | Handy | 2+ | Counts all days where you entered the score phase with a valid hand. |
| `tag_pack_rat` | **Pack Rat** | Gain **$1** for each **unused reroll** remaining across the whole run. | Garbage | 2+ | Sums leftover rerolls at day end (or round end — pick one rule and stick to it). |
| `tag_company_store` | **On the House** | Next shop: initial equipment, consumables, and booster packs cost **$0**. | Coupon | 1 | Permits and items added **after** camp rerolls still cost normal price. |
| `tag_twin_wagon` | **Twin Wagon** | Duplicate the **next** tag earned (excluding Twin Wagon). | Double | 1 | Each stacked Twin Wagon adds **one more copy** of that tag (not a literal ×2). |
| `tag_wide_saddle` | **Wide Saddle** | **+3 dice hand size** for the **next round only**. | Juggle | 1 | Stacks on the same round (+3 per tag). |
| `tag_free_reroll` | **Coupon Book** | Next shop: first camp reroll costs **$0** (price still escalates +$1 per reroll as usual). | D6 | 1 | Distinct from the Coupon Book **equipment** — same idea, consumable tag. |
| `tag_top_up` | **Junk Pile** | Create up to **2 Common** equipment (if you have space). | Top-up | 2+ | Generated items cannot be Eternal / Perishable / Rental (when those stickers exist). |
| `tag_shortcut` | **Shortcut** | Gain **$5** for each round **skipped** this run (minimum $5 — includes the round you skipped to earn this tag). | Speed | 1 | Synergizes with Shortcut Trail equipment. |
| `tag_surveyor` | **Surveyor's Mark** | Upgrade a **random hand type** by **3 trail guide levels**. | Orbital | 2+ | Can hit a hand you've already played; secret hands eligible if discovered. |
| `tag_bank_deposit` | **Bank Deposit** | Double your money (adds at most **$40**). | Economy | 1 | If balance is negative, set to **$0** (tag wasted). Same cap spirit as Treasure Map supply card. |

---

## Tag Categories

### Shop — next camp

| Tag | When it fires |
|-----|----------------|
| Outfitter's Pick, Saloon Find | Next shop visit |
| Haunted Relic, Frosted Tin, Branded Iron, Gilded Cross | Next shop; may bank |
| Permit Stamp | Next shop |
| On the House | Next shop |

### Boss — next Showdown

| Tag | When it fires |
|-----|----------------|
| Bounty Payout | After winning Showdown |
| Change of Guard | Before starting Showdown (or at round select) |

### Immediate — no shop wait

| Tag | When it fires |
|-----|----------------|
| Wagon Load, Supply Drop, Surveyor's Cache, Outfitter's Wagon, Spirit Walk | As soon as tag is chosen |
| Junk Pile | As soon as tag is chosen |
| Bank Deposit, Well-Traveled, Pack Rat, Shortcut | As soon as tag is chosen (run totals) |
| Surveyor's Mark | As soon as tag is chosen |
| Wide Saddle | Applies to next round entered |

### Meta

| Tag | When it fires |
|-----|----------------|
| Twin Wagon | Modifies the **next** tag selection |

---

## Aura Tags vs. Future Editions

Balatro **edition tags** modify joker editions. Wagon Bones currently implements equipment bonuses through **auras** only (see `item_auras.json`):

| Balatro Edition | Wagon Bones Aura Tag | Scoring effect |
|---------------|----------------------|----------------|
| Negative (+1 slot) | **Haunted Relic** → Ghost | Occupies no equipment slot |
| Foil (+50 chips) | **Frosted Tin** → Icy | +50 miles |
| Holographic (+10 mult) | **Branded Iron** → Fire | +10 mult |
| Polychrome (×1.5 mult) | **Gilded Cross** → Holy | ×1.5 mult |

If separate **foil / holographic / polychrome equipment editions** are added later (stacking with aura), these tags should grant editions first and fall back to aura when editions are unavailable.

---

## Pack Tag Reference

| Balatro Pack | Wagon Bones Pack | Mega? |
|--------------|------------------|-------|
| Standard (playing cards) | Dice Grab Bag | Mega = pick 2 |
| Arcana (tarot) | Supply Pack | Mega = pick 2 |
| Celestial (planets) | Trail Guide Pack | Mega = pick 2 |
| Buffoon (jokers) | Equipment Pack | Mega = pick 2 |
| Spectral | Frontier Pack | **Normal only** for Spirit Walk tag |

---

## Economy & Scaling Tags

| Tag | Design intent |
|-----|----------------|
| **Well-Traveled** | Rewards aggressive play (many days scored per round). Outlaw profession may skew value. |
| **Pack Rat** | Rewards conserving rerolls; pairs with Stubborn Mule, Rainy Day Fund, Trail Rations. |
| **Shortcut** | Rewards skip-heavy routes; Hunter Nathan starts the run biased toward skips. |
| **Bank Deposit** | Strong early; capped so it doesn't break late-leg economy. |
| **Bounty Payout** | Boss skip tax: skip Mile Marker/River Ford for tags, cash out on Showdown. |

---

## Implementation Checklist (not yet in code)

- [ ] Round-select UI: play vs. skip with tag reveal
- [ ] `PlayerState` tag queue (pending shop tags, stored aura tags, etc.)
- [ ] Tag pool weights per leg
- [ ] Hook shop generation (`ItemsSystem`, `ShopScene`) for free equipment + aura application
- [ ] Hook `BoosterPackSystem` for immediate pack tags
- [ ] Twin Wagon + Hunter profession + Bounty Contract sell effect
- [ ] Tests in `src/game/__tests/` (new `tags.test.ts` once logic exists)

---

## Open Questions

1. **Skip timing** — Can the player skip both Mile Marker and River Ford, or only one per leg (Balatro: up to two skips per ante)?
2. **Tag choice** — Random tag from pool vs. pick 1 of 3 (Balatro shows 2–3 options at higher stakes)?
3. **Showdown skip** — Always blocked, or allowed with no boss reward?
4. **Well-Traveled vs. Pack Rat** — Count at day end only, or include rerolls left at round win?
5. **Spirit Walk** — Normal Frontier Pack only, or allow Jumbo as a rarer tag variant?

---

## Name Alternatives (flavor reserves)

If any name collides with new equipment or events:

| Current | Alternatives |
|---------|--------------|
| On the House | Company Credit, Grub Stake, Open Tab |
| Change of Guard | New Marshal, Wanted Reposted |
| Twin Wagon | Double Down, Echo Tag |
| Bank Deposit | Gold Dust Dividend, Strongbox |
| Wide Saddle | Extra Hitch, Loose Load |
