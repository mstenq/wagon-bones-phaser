# Bugs noticed while playing

? Stone dice are showing numbers. They should never have a die value, they should sort as the highest value (above 12s)
? Stone dice should also not count towards hands, but should always be scored (Not sure that is happening cause they have numbers)
- you can currently use supply cards like rabbits foot directly from the shop. But really that should only be able to be used in the game scene or booster scenes. Basically things that effect dice need to have dice present on the screen to work. Only cards like treasure map, trade, second helpings, trail guide cards, can be used at anytime because you don't need to select dice first. I think some of this logic might exist cause the "Buy and Use" button doesn't show in the shop stock, but once its in your consumable area the use button shows up.
- in a dice mega grab bag, after the first dice purchase, i can see 8 dice at the top of the screen half way off the screen.
- Coupon Book only gives a free reroll when entering the shop. You should be able to purchase the Coupon Book and immediately be able to reroll the shop for free 1 time (Even if your currently at $100 per reroll). Players often buy Coupon Book to reroll one more time then sell it.
- Gold Pan doesn't animate the +2 gold while scoring is happening so the users won't know if they got any money. It needs to work like mult/miles do with a little popup that displays $2 when it hits.
-Funeral Pyre - Didn't work. I bought it and the item to the right of it didn't get destroyed and Funeral Pyre didn't gain any mult.
- Wild Card did add its +mult randomly, but the card didn't show an animation of +x when the scoring took place, so it looked like it failed.
- One Eyed Jack correctly added its values to the score, but the additional trigger didn't animate anything again making it seem like it failed.
- Helfire Bullet doesn't show frontier experience card immediately, it only shows up in equipment bar after round.
- priests_blessing didn't give holy aura to my 1 piece of equipment that I had.
- dynamite needs to add a custom animation saying either "safe!" or an explosion animate as its removed. Otherwise it just leaves without you noticing.
- quarry stone - started round and didn't see any added stone dice until the game after. Maybe we could just hook into the animation system and show an animation for getting the stone dice like mystery crate does.
- magic_beans created "Nitro" and i had never gotten dynamite and had it explode first. The random generation needs to filter out nitro unless dynamite was destroyed naturally.

## New Features
- our tooltips need access to game/player state so things like second helpings can tell us the card we'll get, trade tells us how much money we'll get, etc. Needs to work like displayHints I think.
- Doctor - lets buff doctor by having her start with 2 ghost aura medicine cards, and have her recieve a ghost medicine card after every boss win.
- Boss fights needs to be added
- Need an overview screen that shows the 3 legs and what the boss fight will be when you click "Hit the trail". Similar view available from Journey Info modal (New tab)
- dice have a new state, "lock + held" and "lock + to score". This can maybe be indicated by a lock and red cross(🔒❌) for held not played and a lock an lighting bolt (🔒⚡) for held to score. By default left clicking goes to locked to score and you can right click to get context menu to lock and hold.
- when you have 5 or less dice locked and in the "to score" state, we should show the  hand type, hand level, and base miles, base mult in the sidebar. Its really nice to be able to get a baseline for what you are about to score and make sure you've made the correct selection before hitting "Score Dice".
- each profession has a card that works better for them:
    farmer: 
    surveyor: Surveyor’s Transit - better odds [1 in 2]
    banker: Bank Note - wipes debt out when sold
    outlaw: Payday - earns x3 more money
    merchant: Snake Eyes - better odds [1 in 2]
    cook: Leftovers - guaranteed supply card when opening packs
    scout: Guide Lantern - gains an additional x0.1 mult per trail guide
    demon hunter: Marked - gets additional +1 per hand played without a 6
    prospector: Gold Pan - guaranteed $2 when enhanced die score
    gambler: Lucky Number - gains an additonal x0.5 mult per lucky number scored
    hunter: Wanted Poster - gains and additional $4 when targeted hand is played.
    accountant: Savings Account - gains and additional $1 per $5.
    doctor: Emergency Supplies - limit is lifted to $8 and under to activate free supply card.
    con artist: Card Counter - gains an additional +2 mult per played pair.



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

