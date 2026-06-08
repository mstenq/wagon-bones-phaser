# Consumables
Consumables can be trail_guides, frontier_encounters, and supply_cards. Anything you can purchase in the shop that can live in your consumables bar is considered a consumable. There are 3 main types of consumable, they are: use any time, use on visible dice, use on scored dice. 

# Use Any Time
These cards can be used any time, they can also be purchased and used from the shop at the same time via the "Buy & Use" action tab even if there is not enough space to purchase them to store in your consumables bar. Here are all the use any time cards:

- trail_guides
    - all of them
- frontier_encounters
    - blood_moon
    - skin_walker
    - priests_blessing
    - magic_beans
    - pandoras_box
    - spiritual_journey
    - all_in
    - echo_of_the_damned
- supply_cards
    - treasure_map
    - trade
    - doctor
    - compass
    - supply_cache
    - ingenuity
    - bless
    - second_helpings
    - omen_stone
    - shop_pass
    - fools_gold
    - trading_post

# Use on Visible Dice
This class of card type must have a dice lineup visible on the screen in order to use them. This is the biggest problem currently with our game as it is not consistent and does not work in all cases. This means that you can only use this type of card while you are in the GameScene and there are dice visible. This can be before rolling or after rolling/rerolling, it doesn't matter. The other time you can use these cards is inside of booster packs. This means you can use the cards in the booster pack OR cards in the consumable bar (its this part that is currently not working) on dice visible in the booster pack. 

This means you cannot use these cards while in the shop  outside, since there are no dice visible on screen. Currently shallow_grave and migrage allow you to use them while no dice are visible on the screen by bringing up a a new scene that shows you dice and lets you use them. This entire DiceSelectionScene needs to be removed and should not be used.

Here is the list of all cards that fall in this category:

- supply_cards
    - coffee_tin
    - buzzards
    - rabbits_foot
    - firewood
    - loaded
    - pick_axe
    - pan_for_gold
    - chisel
    - shallow_grave - Currently lets you use in shop and brings up DiceSelectionScene. Also description is wrong, should just be 'Choose 2 dice to destroy'
    - mirage - Currently lets you use in shop and brings up DiceSelectionScene. Description should just be 'Pick 2 dice - left becomes a copy of right'
- frontier_encounters
    - gold_rush
    - snake_oil_salesman
    - spirit_guide
    - deputize
    - spirit_shaman
    - raid
    - seeing_double

# Use on Scored Dice
There is currently only one card that is of this type, medicine. Medicine changes the value of the dice so it makes no sense to change a dices value when your not adjusting scored dice since they'll just get rolled and would be of no value. So the only time you should be able to use them is from your consumable bar while in the GameScene after you have rolled for the first time of the day (The "Score N Dice" button will be visible). This is why the medicine cards are not found directly in booster packs since booster pack card force you to use them instantly. Instead you can find doctor cards which places 2 medicine cards in your consumable bar.

# Refactor Main Goals
- Remove DiceSelectionScene
- Ensure you can't use migrage/shallow_grave in shop (or any other "Use on Visible Dice" or "Use on Scored Dice" card, but these 2 I know are a problem)
- Ensure you can use all "Use On Visible Dice" cards work in the following ways:
    - Can use them from consumable bar while in the GameScene(Dice are visible), and in BoosterPacks where dice are visible (supply packs and frontier_encounter packs)
    - Can use them from the booster packs themselves (this is already working fine)
- Currently you can use medicine in your consumable 
- Consolidate "Use on Visible Dice" card usage in booster packs and in the GameScene from the consumable bar. Currently when you select "use" from the consumable bar it immediately uses the card then takes you through an apply/cancel flow. Instead I want it to work the same way as cards within the booster pack. You select the card so its in the selected state, select the dice you want to apply it to, and then hit "Use" on the card itself. The card will need to validate that you haven't selected too many dice, etc.
- Currently in booster packs all dice are disabled until you select a card that can be applied to dice. I don't want to disable them ever. Its totally fine to select 3 dice first and then use a "buzzards" card from the booster pack or from the consumable bar.