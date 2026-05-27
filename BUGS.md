# Bugs noticed while playing
- I hate the "theft from a wagon" card. It is brutal to lose a random equipment. Need to think if we add a way to recover the item, or negate some way.
- Blue moon sticker gives a trail guide for every hand its not scored in. Should only work if the round ends.
- Second helping gave me firewood even though within one mega pack i first purchased and used loaded. I used firewood the turn before 
-Golden Spike shouldn't work on disabled dice (the_undertaker and other bosses)
-follow_traveler trail event, you shouldn't be able to trade back the same item you got from the trade, thats weird.
-binoculars permit - while it now guarantees my most played hand it also is allowing for duplicates. Dupes should only be allowed if you have counterfeit_goods.
- buy and use - the new cards should all be able to be bought and used without having a free consumable slot open (like ingenuity, trade, treasure_map, doctor, etc). the ones that need this functionality are: omen_stone, shop_pass, fools_gold, trading_post.
- fools_gold - give you no feedback. Need an animation of "Success! Gained $30" or "Too bad. Lost $x amount"

## New Feature Ideas
- our tooltips need access to game/player state so things like second helpings can tell us the card we'll get, trade tells us how much money we'll get, etc. Needs to work like displayHints I think.
- the tool tip for trail guides should show the current hand level (level 3 or whatever)
- tool tip on second helpings should show the card that you'll get if you use it now.
- new permits for luck:
    - Good Omens - Stage 1 — Positive trail events are 2x more likely
    - Manifest Destiny - Stage 2 — Positive trail events are 4x more likely
- new supply card ideas:
    - Omen Stone - Prevent the next negative trail events effects - notes: we already have negative event prevention stuff with items like trail_repair_kit and saint_elmos_shield. If you have used this card then it takes priority (Meaning you won't get bonus if you happen to already have trail_repair_kit so make sure to test that xmult doesn't increase). We also have a negative trail_event indicator in the side bar, I'd like for this to be indicated as a postive indicator in the same spot.
    - Shop Pass- Reroll shop for free - notes: if you have this and coupon_book, you would consume this shop pass first (Add tests). This should be a positive indicator that stays till used in the sidebar like Omen Stone.
    - Fool’s Gold - 50% chance to gain $30. Otherwise lose half your money
    - Trading Post - Increase sell value of all equipment/consumables by $1 - notes: works same as raffle_ticket essentially. Though I think raffle_ticket only increases equipment sale prices when it should also increase held consumable cards sell value too (Add a test). The equipment price increase is especially useful for equipment like desperado and works well with the trade supply card.

- new frontier encounter card ideas:
    - All In - Double money. Lose all rerolls this ante (No max limit) - Notes: you can use this card multiple times in one shop and only suffer the consequences once (Though doing so would be extremely unlikely). This should show as a negative trait in the sidebar like negative trail_events do. May have to make that a bit more generic to work with these additional cards.
    - Echo of the Damned - Your next played hand retriggers all played dice (Can stack) - Notes: should show as a positive trait in sidebar till the next hand is played. Make sure it plays well with other retrigger cards and with red_bullet sticker. Make sure it also works if you buy and use multiple echo_of_the_damned cards  in one go. If i bought and used 3 then each dice should get 3 retriggers on top of any other red_bullets, equipment, etc.

## Balance Notes
bone_collector: Should increase miles amount
gold_tooth: should only unlock when you have at least 1 gold dice
spare_wagon_parts: don't like effect. Instead it should prevent negative trail events completely. For every negative event gains x0.75 mult.
scouts_spyglass: don't like the effect. Instead should let you upcoming trail event type (positive/negative/animal/weather) and let you decide to avoid event or do the event. Avoiding the event adds +50 miles to the item.
rail_splitter: should probably be 10 mult
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

