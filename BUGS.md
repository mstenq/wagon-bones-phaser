# Bugs noticed while playing
- fading_memory - once you buy it, the very first round should have 20mult. So need to adjust so it deducts 4 mult at end of round instead of start.
-you can use a dice enhacement supply card, and then use another before you've resolved the first which leaves the UI in a broken state
-when using quick_draw, i retrigged a purple_flower sticker and it generated 3 supply cards, even though my limit should have been 2. Don't allow for generating over your limit.
-theft from a wagon trail event deleted a cursed equipment item. Cursed equipment can never be removed.
- scouts_spyglass and trail_repair_kit should not have perishable modifier since they both require scaling the equipment item.
- I opened a equipment pack and saw a duplicate equipment item that I already had in my equipment bar. This should only be possible if i also had counterfeit_goods (which I don't)
- I used a supply card (Loaded) while I was in a supply pack and all the supply cards in the pack changed.
-medicine shouldn't show up in supply packs. They are worthless when used in a pack, instead we have a doctor card that gives 2 medicine which are useful while in the round.
- pity tweak: i was going into the "the_standoff" boss which only allows you to play 1 hand, hard but not impossible. BUT i had a trail_event for 'heavy_fog` which does DISABLE_REROLL_DAY1, and since i only had 1 day to play and couldn't reroll I lost badly. This feels way to punishing and we should prevent events that will do DISABLE_REROLL_DAY1 or LOSE_ALL_REROLLS right before "the_standoff" boss.

## New Features
- our tooltips need access to game/player state so things like second helpings can tell us the card we'll get, trade tells us how much money we'll get, etc. Needs to work like displayHints I think.
- Gambling Themed Item - One Armed Bandit? - 1 in 4 chance to get x4 mult and $10.
- the tool tip for trail guides should show the current hand level (level 3 or whatever)
- tool tip on second helpings should show the card that you'll get if you use it now.

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

