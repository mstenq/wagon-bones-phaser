# Bugs noticed while playing
- Selling Consumable cards needs to update Equipment bar cards (Snake Oil Ledger xmult doesn't update until after you drag and drop the cards to force a refresh currently)
- Gold dice held in hand don't show animation at end of round showing you got money. I had one with a red_bullet sticker and it was hard to tell if it was working cause there was not indication
- Was able to buy nitro equipment despite not every purchasing dynamite and having it blow up
-Snake Oil Ledger never reset after defeating boss
-I'm getting Rares way more often then I feel I should be. 


## New Features
- our tooltips need access to game/player state so things like second helpings can tell us the card we'll get, trade tells us how much money we'll get, etc. Needs to work like displayHints I think.
- Doctor - lets buff doctor by having her start with 2 ghost aura medicine cards, and have her recieve a ghost medicine card after every boss win.



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

