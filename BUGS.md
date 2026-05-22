# Bugs noticed while playing
- fading_memory - once you buy it, the very first round should have 20mult. So need to adjust so it deducts 4 mult at end of round instead of start.
-you can use a dice enhacement supply card, and then use another before you've resolved the first which leaves the UI in a broken state
-DISABLE_REROLL_DAY1 does not work as expected. I had 0-rerolls for all 4 days.

## New Features
- our tooltips need access to game/player state so things like second helpings can tell us the card we'll get, trade tells us how much money we'll get, etc. Needs to work like displayHints I think.
- Gambling Themed Item - One Armed Bandit? - 1 in 4 chance to get x4 mult and $10.


## Code Feedback
- ~~JSON → typed TS for trail guides, supply cards, packs, permits, professions~~ — done in `src/data/*.ts`; orphan `.json` copies removed.
- Trail round modifiers wired (May 2026): `moneyPerDayLoss`, `disableRerollDay1`, `standardDiceDay1`, `diamondCrackDoubled`, `luckyOddsHalved`, `scoredDiceDestroyChance` + base diamond crack on score. `flatMilesPenalty` deferred (blizzard no longer promises flat miles); needs leg-scaled design before implementing.

## Balance Notes
bone_collector: Should increase miles amount
gold_tooth: should only unlock when you have at least 1 gold dice
spare_wagon_parts: don't like effect. Instead it should prevent negative trail events completely. For every negative event gains x0.75 mult.
scouts_spyglass: don't like the effect. Instead should let you upcoming trail event type (positive/negative/animal/weather) and let you decide to avoid event or do the event. Avoiding the event adds +50 miles to the item.
rail_splitter: should probably be 10 mult
4 straight: adjust stats to be equal to 2-pair
covered_wagon: already have wood_axe, I think we just deprecate covered_wagon.


# Bad Art
wild_card
trail_tax
town_choir
toolbelt
trail_rations
wedding_ring
last_stand
snake_oil_ledger

