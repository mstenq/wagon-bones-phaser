# Bugs noticed while playing
- Selling Consumable cards needs to update Equipment bar cards (Snake Oil Ledger xmult doesn't update until after you drag and drop the cards to force a refresh currently)
- Gold dice held in hand don't show animation at end of round showing you got money. I had one with a red_bullet sticker and it was hard to tell if it was working cause there was not indication
-Snake Oil Ledger never reset after defeating boss
- Second Helping only copies the last supply or trail_guide card (It should NOT copy frontier_encounter cards)
- Marked - not sure if bug is specific to demon_hunter, but the mult was growing WAY too quickly. I think it was adding 7 for some reason.
- Blue moon - should really show an animation event of the trail_guide being added to ConsumableBar before going to payout screen.

## New Features
- our tooltips need access to game/player state so things like second helpings can tell us the card we'll get, trade tells us how much money we'll get, etc. Needs to work like displayHints I think.



## Code Feedback
- lets convert the JSON data into JS arrays that are typed. It would make a lot of things much easier in our code base if we were sure about the shape of the data without doing checks.
- Dead code: these TrailEventModifiers are defined and set but never consumed by game logic or UI: `flatMilesPenalty`, `moneyPerDayLoss`, `disableRerollDay1`, `standardDiceDay1`, `diamondCrackDoubled`, `luckyOddsHalved`, `scoredDiceDestroyChance`. Need to implement their effects in GameState/GameScene or remove them.

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

