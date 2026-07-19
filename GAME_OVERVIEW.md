# Wagon Bones
a balatro like game based on OregonTrail/Wild Wild West and using dice.

Pips on the dice are considered as base miles traveled. Mult is still just mult.


# Hand Types       Miles   Base Mult
high value          5       1
two of a kind       10      1
two pair            15      2
three of a kind     20      3
full house          25      4
four of a kind      40      5
five of a kind      50      6

3 straight          15      1
4 straight          20      3 
5 straight          40      6 

# Main differences from balatro
instead of having limited number of hands, you have a limited number of days you can travel. So you need to beat this round or reach your destination within a certain number of miles. Each round the number of miles increases just like balatro.

Since we are using 6 sided dice, we don't have face cards/suits/fixed card numbers etc, so deck fixing is gonna be a little different and probably not as important. This will need to be tweaked. Also since we are dealing with dice, there will be an additional phase during rounds for doing rerolls.
Instead of discards, you pick 5 dice from your hand to roll each day. Once dice are rolled and scored, they go to a "spent" pile. You must cycle through ALL your dice before any come back — even across days within a round. This means if you cherry-pick your best dice early, you'll be stuck with the worst ones later.
Also since this is a journey I want to start with a shop and a bit of money to start so you can pick up supplies before starting your journey which just fits better with our theme.

# Rounds / Landmarks
We have 8 bosses we will face in order to reach each landmark. Balatro calls these antes, but we might call them legs, or something.

0. Independence Missouri - This is where you start
1. Fort Kearny
2. Chimney Rock
3. Fort Laramie
4. Independence Rock
5. Fort Bridger
6. Fort Hall
7. The Dalles
8. Oregon City- This is the finish line

# Phases of a Round
days (4 days to get to destination by default) - each day has 2 phases
1. pick phase - pick 5 dice from your hand to roll. You can see all available dice in your hand (drawn from your collection). Dice you've already used are in the spent pile and won't come back until you've cycled through all of them.
2. roll phase - roll your 5 dice, by default you get 3 rerolls per day (resets each day)
3. score phase - lock in the 1 to 5 dice you want to play. If hand matches multiple possible score targets, the more difficult hand to get wins.

Dice cycling: When dice are scored, they move to a spent pile. Each day you draw fresh dice from the remaining pouch. If the pouch runs out, the spent pile is shuffled back in. This persists across days within a round.

# Trail Guides
Trail guides are what Balatro calls planet cards. These bump up your base miles and mult for a particular hand. The scaling of this will vary, but generally the harder the hand the faster it scales, while easier hands to score rise much slower. These trail guide cards can be gotten as stand alone cards in the shop or in trail guide booster packs. Certain items/equipment or supply cards can also generate them. 

# Supply Cards
Supply cards are what Balatro calls Tarot cards. They are used to enhance the scoring power of your dice, manipulate your dice collection, earn money, generate trail guides, etc.

# Frontier Encounters
Frontier encounter cards are what spectral cards are in Balatro. They can add enhanced pips to dice, add aura to dice or equipment, duplicate equipment, create ghost equipment, destroy 5 dice for money, etc. They are very powerful and show up in the shop much more rarely. Stand alone cards do not show in shop except for certain characters.

# Professions
Instead of decks, we instead choose a character, and the character affects how the journey will go. Here is the list of characters and there affects.

- Farmer Hank Caldwell = +1 reroll per day 
- Surveyor Elias Mercer = +1 day of travel 
- Banker Charles Whitlock = starts with $20
- Outlaw Jesse Rawlins = Earns no interest on money, instead gets 
   - $1 per remaining day
   - $1 per unused reroll 
- Merchant Abigail Turner = 1 extra slot for equipment, -1 day of travel
- Cook Martha Delaney = Starts with extra supplies voucher and 2 copies of second helpings supply card
- Scout Caleb Winters = Starts with binoculars voucher (Can always find most used trail knowledge card), -1 supply slot
- Demon Hunter Isaac Granger = Frontier Encounter cards appear in shop, start with a Priests Blessings card   
- Prospector Davis Holler - Start with vouchers for extra supplies/extra trail guides/extra stock in shops
- Gambler Thomas “Tommy” Reeve - Start with +2 hand size and -1 equipment slot
- Hunter / Trapper Nathan Cole - After each boss gain a double tag (Doubles rewards from skipping a blind)
- Accountant Henry Pritchard - Balance miles and mult before calculating total miles when scoring (x2 base blind size)
- Doctor Dr. Eleanor Sykes - Start the game with 2 medicine cards in hand
- Con Artist Victor Hale - +2 rerolls per day, -1 hand size
- Witch - Eliza Blackwood - Starts with a random Cursed Familiar (Cannot be sold/destroyed).
Card Synergy: funeral_pyre - Gains 4x the the sell value as mult of the destroyed equipment (normally 2x)
- Cult Leader - Josiah Slate - 10% of money in the bank is tithed each round (not including that round’s earnings). Gain 1 random supply card at round end. Starts with Swamp Fever.
Card Synergy: offering_bowl - Gains +8 mult per consumable destroyed (normally +4)

## Hand Sequence / Scoring

0. The base miles and mult are calculated by played hand type
1. Boss round effects: Certain boss effects trigger before scoring like the The Trickster and The Bottle.
2. "On Played" items activate when hand is played before scoring like "Trail Tax", "Card Counter", "Square Dance", and "Wanted Poster" 
3. Played dice scoring: Dice played and scored activate from left to right. For each dice, its effects activate in the following order:
   - Base effect (Miles): The dice activates its base effect, giving the accorded amount of miles. Bonus miles are included in this value (Items like Cowboy Boots can add these bonus miles).
   - Dice Modifiers: Dice modifiers activate in the following order: enhancements, then gold/purple/blue pip enhancements (red are for retrigger phase), then aura.
   - 'On scored' Items: Items that activate on a played and scored dice will activate their effects. When multiple Items are triggered by the same card, they activate from left to right. Examples include Mile Marker's scaling, Lucky Number, and The Devil’s Hand.
   - Retriggers: Each retrigger repeats the previous activation sequence (from base effects to scored card dependent Jokers) one more time. Multiple retriggers stack additively. Red bullet pips would go first, followed by retriggering Jokers like "Last Stand" from left to right.
4. Held in hand abilities: Dice in hand are checked from left to right if they can activate in-hand abilities. The sequence for each card is similar to scored cards.
   - 'On held' Equipment: Equipment that activate on dice still held in hand will activate their effects. When multiple Items are triggered by a single dice, they activate from left to right. Examples include "Bottom Dollar", "The Eleventh Crossing", and "Ace in the Hole".
   - Enhancement (Steel dice): Currently Steel is the only dice modifier to activate in-hand for each hand.
   -  Retriggers: Same as those of scored dice, retriggers of dice in hand stack additively. Red bullet stickers will activate first, then "Double Down" and any other item copying its effect from left to right. 
5. Item Editions and 'Independent' Items: Items are checked from left to right to score any Aura (foil, holographic and polychrome) and activate Independent abilities:
   - Fire or Ice aura bonus.
   - 'Independent' Items: Items that trigger after all the playing cards are scored will activate their base ability. These do not get affected by retriggers. Examples include "Campfire Stories", "Matchmaker", and "Blessed Herd".
   - Items dependent on other Items (currently, only "Collector’s Case").
   - Holy aura bonus (This goes last for greater xMult affect).
6. Then the miles are multipled against the xmult and the score is determined. Professions like "Accountant Henry Pritchard" will balance the miles and mult the two numbers before multiplying.

snake_eyes: Make it 1 in 3
double_barrel: x2 mult on the first 2 scored dice that show a 2. Same total points as the old retrigger version in the common case, but fits the "double barrel" theme (two barrels, two 2s) better.
five_mile_marker: leave as is. This one works pretty well actually
devils_hand: x2 is good, but honestly eight_second_ride is better and its not a legendary. Lets make devils_hand x2 for held or played 6s. That feels more worthy of legendary.
lucky_number: make it x2 (and x2.5 for gambler)
eight_second_ride: works ok already
ace_in_the_hole: already gets buffed by silver bullets and one_eyed_jack
eleventh_crossing: already gets buffed by silver bullets and one_eyed_jack