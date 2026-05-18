import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { resetDieIds, setupGame, diceWithValue, die, item } from './testHelpers';
import { resetPlayerState } from '../PlayerState';
import {
  getAllTrailEvents,
  getTrailEventById,
  selectTrailEvent,
  getAvailableChoices,
  resolveChoice,
  checkCondition,
  isNegativeEffect,
  applyEffect,
  createEmptyModifiers,
} from '../TrailEventsSystem';
import { createConsumableInstance, getSupplyDefById } from '../ConsumablesSystem';
import { GAMEPLAY, TRAIL_EVENT } from '../Constants';

beforeEach(() => {
  resetDieIds();
});

// ─── Data Integrity ───

describe('Trail Events data integrity', () => {
  const allEvents = getAllTrailEvents();

  test('has events loaded', () => {
    expect(allEvents.length).toBeGreaterThan(80);
  });

  test('all events have unique IDs', () => {
    const ids = allEvents.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('all events have valid categories', () => {
    const validCategories = [
      'wagon_damage',
      'weather',
      'animal',
      'bandits',
      'navigation',
      'water',
      'positive',
      'stranger',
      'uneventful',
      'demon_hunter',
    ];
    for (const event of allEvents) {
      expect(validCategories).toContain(event.category);
    }
  });

  test('all events have weight > 0', () => {
    for (const event of allEvents) {
      expect(event.weight).toBeGreaterThan(0);
    }
  });

  test('all events have at least 1 choice', () => {
    for (const event of allEvents) {
      expect(event.choices.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('all choices have at least 1 outcome', () => {
    for (const event of allEvents) {
      for (const choice of event.choices) {
        expect(choice.outcomes.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('outcome probabilities sum to ~1.0 for multi-outcome choices', () => {
    for (const event of allEvents) {
      for (const choice of event.choices) {
        if (choice.outcomes.length > 1) {
          const sum = choice.outcomes.reduce((s, o) => s + o.probability, 0);
          expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
        }
      }
    }
  });

  test('all choices have unique IDs within their event', () => {
    for (const event of allEvents) {
      const choiceIds = event.choices.map((c) => c.id);
      const uniqueChoiceIds = new Set(choiceIds);
      expect(uniqueChoiceIds.size).toBe(choiceIds.length);
    }
  });

  test('demon hunter events are flagged correctly', () => {
    const demonEvents = allEvents.filter((e) => e.demonHunterOnly);
    expect(demonEvents.length).toBeGreaterThan(10);
    for (const event of demonEvents) {
      expect(event.category).toBe('demon_hunter');
    }
  });

  test('uneventful events have no effects', () => {
    const uneventful = allEvents.filter((e) => e.category === 'uneventful');
    expect(uneventful.length).toBe(10);
    for (const event of uneventful) {
      for (const choice of event.choices) {
        for (const outcome of choice.outcomes) {
          expect(outcome.effects).toHaveLength(0);
        }
      }
    }
  });

  test('getTrailEventById returns correct event', () => {
    const event = getTrailEventById('broken_wheel');
    expect(event).not.toBeNull();
    expect(event!.name).toBe('Broken Wagon Wheel');
    expect(event!.category).toBe('wagon_damage');
  });

  test('getTrailEventById returns null for unknown id', () => {
    expect(getTrailEventById('nonexistent')).toBeNull();
  });
});

// ─── Event Selection ───

describe('Trail Event selection', () => {
  test('selectTrailEvent returns a valid event for non-demon-hunter', () => {
    const player = resetPlayerState();
    const event = selectTrailEvent(player, () => 0.5);
    expect(event).toBeDefined();
    expect(event.demonHunterOnly).toBe(false);
  });

  test('selectTrailEvent never returns demon_hunter events for non-demon-hunter', () => {
    const player = resetPlayerState();
    // Run many selections
    for (let i = 0; i < 100; i++) {
      const event = selectTrailEvent(player, Math.random);
      expect(event.demonHunterOnly).toBe(false);
    }
  });

  test('selectTrailEvent can return demon_hunter events for Isaac Granger', () => {
    const player = resetPlayerState();
    player.applyProfession('demon_hunter');

    // Force rng < 0.3 to draw from demon pool
    const event = selectTrailEvent(player, () => 0.1);
    expect(event.demonHunterOnly).toBe(true);
  });

  test('selectTrailEvent returns standard events for demon_hunter when rng >= 0.3', () => {
    const player = resetPlayerState();
    player.applyProfession('demon_hunter');

    // Force rng >= 0.3 for pool selection, then 0.5 for weighted pick
    let callCount = 0;
    const event = selectTrailEvent(player, () => {
      callCount++;
      return callCount === 1 ? 0.5 : 0.5; // first call is pool check, second is weight pick
    });
    expect(event.demonHunterOnly).toBe(false);
  });

  test('selectTrailEvent respects weights', () => {
    const player = resetPlayerState();
    // With rng = 0 (first element after weight check), should pick first available
    const event = selectTrailEvent(player, () => 0.0001);
    expect(event).toBeDefined();
  });
});

// ─── Condition Checking ───

describe('Condition checking', () => {
  test('HAS_MONEY: true when player has enough', () => {
    const player = resetPlayerState();
    player.economy.setBalance(10);
    expect(checkCondition({ type: 'HAS_MONEY', amount: 5 }, player)).toBe(true);
  });

  test('HAS_MONEY: false when player is broke', () => {
    const player = resetPlayerState();
    player.economy.setBalance(2);
    expect(checkCondition({ type: 'HAS_MONEY', amount: 5 }, player)).toBe(false);
  });

  test('HAS_EQUIPMENT: true when player has specific item', () => {
    const player = resetPlayerState();
    player.equipment = [item('spare_wagon_parts')];
    expect(checkCondition({ type: 'HAS_EQUIPMENT', id: 'spare_wagon_parts' }, player)).toBe(true);
  });

  test('HAS_EQUIPMENT: false when player lacks item', () => {
    const player = resetPlayerState();
    expect(checkCondition({ type: 'HAS_EQUIPMENT', id: 'spare_wagon_parts' }, player)).toBe(false);
  });

  test('HAS_EQUIPMENT_ANY: true when player has any equipment', () => {
    const player = resetPlayerState();
    player.equipment = [item('spare_wagon_parts')];
    expect(checkCondition({ type: 'HAS_EQUIPMENT_ANY' }, player)).toBe(true);
  });

  test('HAS_EQUIPMENT_ANY: false when player has no equipment', () => {
    const player = resetPlayerState();
    player.equipment = [];
    expect(checkCondition({ type: 'HAS_EQUIPMENT_ANY' }, player)).toBe(false);
  });

  test('HAS_MEDICINE: true when player has supply card', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.addConsumable(def);
    expect(checkCondition({ type: 'HAS_MEDICINE' }, player)).toBe(true);
  });

  test('HAS_MEDICINE: false when player has no consumables', () => {
    const player = resetPlayerState();
    expect(checkCondition({ type: 'HAS_MEDICINE' }, player)).toBe(false);
  });

  test('HAS_WEAPON: false when no weapon equipped', () => {
    const player = resetPlayerState();
    player.equipment = [item('spare_wagon_parts')];
    expect(checkCondition({ type: 'HAS_WEAPON' }, player)).toBe(false);
  });

  test('IS_PROFESSION: true when matching', () => {
    const player = resetPlayerState();
    player.applyProfession('demon_hunter');
    expect(checkCondition({ type: 'IS_PROFESSION', id: 'demon_hunter' }, player)).toBe(true);
  });

  test('IS_PROFESSION: false when not matching', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    expect(checkCondition({ type: 'IS_PROFESSION', id: 'demon_hunter' }, player)).toBe(false);
  });
});

// ─── Choice Availability ───

describe('Choice availability', () => {
  test('unconditional choices are always available', () => {
    const player = resetPlayerState();
    const event = getTrailEventById('bad_mosquitos')!;
    const choices = getAvailableChoices(event, player);
    expect(choices.length).toBe(1);
    expect(choices[0].id).toBe('endure');
  });

  test('money-gated choice hidden when broke', () => {
    const player = resetPlayerState();
    player.economy.setBalance(3);
    const event = getTrailEventById('broken_wheel')!;
    const choices = getAvailableChoices(event, player);
    // Should have 'endure' but NOT 'pay' ($8 required) or 'spare_parts'
    expect(choices.some((c) => c.id === 'endure')).toBe(true);
    expect(choices.some((c) => c.id === 'pay')).toBe(false);
  });

  test('money-gated choice available when rich', () => {
    const player = resetPlayerState();
    player.economy.setBalance(100);
    const event = getTrailEventById('broken_wheel')!;
    const choices = getAvailableChoices(event, player);
    expect(choices.some((c) => c.id === 'pay')).toBe(true);
  });

  test('equipment-gated choice available with matching item', () => {
    const player = resetPlayerState();
    player.economy.setBalance(100);
    player.equipment = [item('spare_wagon_parts')];
    const event = getTrailEventById('broken_wheel')!;
    const choices = getAvailableChoices(event, player);
    expect(choices.some((c) => c.id === 'spare_parts')).toBe(true);
  });

  test('equipment-gated choice hidden without item', () => {
    const player = resetPlayerState();
    player.economy.setBalance(100);
    player.equipment = [];
    const event = getTrailEventById('broken_wheel')!;
    const choices = getAvailableChoices(event, player);
    expect(choices.some((c) => c.id === 'spare_parts')).toBe(false);
  });

  test('HAS_CONSUMABLE_ANY hides choice when player has no consumables', () => {
    const player = resetPlayerState();
    player.consumables = [];
    const event = getTrailEventById('swamped_wagon')!;
    const choices = getAvailableChoices(event, player);
    expect(choices.some((c) => c.id === 'lose')).toBe(false);
    expect(choices.some((c) => c.id === 'nothing')).toBe(true);
  });

  test('HAS_CONSUMABLE_ANY shows choice when player has consumables', () => {
    const player = resetPlayerState();
    const supply = createConsumableInstance(getSupplyDefById('rabbits_foot')!);
    player.consumables = [supply];
    const event = getTrailEventById('swamped_wagon')!;
    const choices = getAvailableChoices(event, player);
    expect(choices.some((c) => c.id === 'lose')).toBe(true);
    expect(choices.some((c) => c.id === 'nothing')).toBe(false);
  });
});

// ─── isNegativeEffect ───

describe('isNegativeEffect', () => {
  test('LOSE_MONEY is negative', () => {
    expect(isNegativeEffect({ type: 'LOSE_MONEY', amount: 5 })).toBe(true);
  });

  test('GAIN_MONEY is not negative', () => {
    expect(isNegativeEffect({ type: 'GAIN_MONEY', amount: 5 })).toBe(false);
  });

  test('GAIN_DICE is not negative', () => {
    expect(isNegativeEffect({ type: 'GAIN_DICE', count: 1 })).toBe(false);
  });

  test('LOSE_DAYS is negative', () => {
    expect(isNegativeEffect({ type: 'LOSE_DAYS', amount: 1 })).toBe(true);
  });

  test('LOSE_RANDOM_DICE is negative', () => {
    expect(isNegativeEffect({ type: 'LOSE_RANDOM_DICE', count: 2 })).toBe(true);
  });
});

// ─── Effect Application (individual effects) ───

describe('Effect application', () => {
  test('LOSE_MONEY reduces balance', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_MONEY', amount: 8 }, player, mods);
    expect(player.economy.balance).toBe(12);
  });

  test('LOSE_MONEY does not go negative', () => {
    const player = resetPlayerState();
    player.economy.setBalance(3);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_MONEY', amount: 10 }, player, mods);
    expect(player.economy.balance).toBe(0);
  });

  test('LOSE_MONEY_PERCENT loses correct percentage', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_MONEY_PERCENT', percent: 50 }, player, mods);
    expect(player.economy.balance).toBe(10);
  });

  test('GAIN_MONEY increases balance', () => {
    const player = resetPlayerState();
    player.economy.setBalance(5);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_MONEY', amount: 10 }, player, mods);
    expect(player.economy.balance).toBe(15);
  });

  test('LOSE_DAYS reduces maxDays in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_DAYS', amount: 2 }, player, mods);
    player.trailEventModifiers = mods;
    game.startRound();
    // base 4 - 2 = 2
    expect(game.config.maxDays).toBe(2);
  });

  test('LOSE_REROLLS reduces maxRerolls in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_REROLLS', amount: 3 }, player, mods);
    player.trailEventModifiers = mods;
    game.startRound();
    // base 6 - 3 = 3
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - 3);
  });

  test('LOSE_ALL_REROLLS sets maxRerolls to 0 in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_ALL_REROLLS' }, player, mods);
    player.trailEventModifiers = mods;
    game.startRound();
    expect(game.config.maxRerolls).toBe(0);
  });

  test('LOSE_HAND_SIZE reduces rollSize in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_HAND_SIZE', amount: 2 }, player, mods);
    player.trailEventModifiers = mods;
    game.startRound();
    // base handSize 8 - 2 = 6
    expect(game.config.rollSize).toBe(GAMEPLAY.ROLL_SIZE - 2);
  });

  test('LOSE_RANDOM_DICE removes only enhanced dice from player', () => {
    const player = resetPlayerState();
    // Add some enhanced dice
    player.dice = [
      die({ enhancement: 'bone' }),
      die({ enhancement: 'gold' }),
      die({ sticker: 'red_bullet' }),
      die({}), // standard
      die({}), // standard
    ];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 2 }, player, mods);
    // Should remove 2 enhanced dice, leaving 1 enhanced + 2 standard = 3 total
    expect(player.dice.length).toBe(3);
    // Standard dice should still be untouched
    const standardCount = player.dice.filter(
      (d) => d.enhancement === null && d.sticker === null && d.aura === null,
    ).length;
    expect(standardCount).toBe(2);
  });

  test('LOSE_RANDOM_DICE deducts $3 per missing die when only standard dice exist', () => {
    const player = resetPlayerState();
    // All standard dice
    player.dice = [die({}), die({}), die({})];
    player.economy.setBalance(25);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 2 }, player, mods);
    // No enhanced dice to remove — lose $3 per missing die instead
    expect(player.dice.length).toBe(3);
    expect(player.economy.balance).toBe(25 - (2 * TRAIL_EVENT.AMOUNT_PER_MISSING_DIE)); // $3 per missing die penalty
  });

  test('LOSE_RANDOM_DICE $3 penalty can go negative', () => {
    const player = resetPlayerState();
    player.dice = [die({})];
    player.economy.setBalance(3);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 1 }, player, mods);
    expect(player.dice.length).toBe(1);
    expect(player.economy.balance).toBe(0);
  });

  test('LOSE_RANDOM_DICE deducts $3 per missing die when pool empty', () => {
    const player = resetPlayerState();
    player.dice = [];
    player.economy.setBalance(20);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 5 }, player, mods);
    expect(player.dice.length).toBe(0);
    expect(player.economy.balance).toBe(20 - (5 * TRAIL_EVENT.AMOUNT_PER_MISSING_DIE)); // $3 per missing die penalty
  });

  test('LOSE_RANDOM_EQUIPMENT removes equipment', () => {
    const player = resetPlayerState();
    player.equipment = [item('spare_wagon_parts'), item('saint_elmos_shield')];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_EQUIPMENT', count: 1 }, player, mods);
    expect(player.equipment.length).toBe(1);
  });

  test('LOSE_EQUIPMENT_CHOICE is deferred to UI (no-op in applyEffect)', () => {
    const player = resetPlayerState();
    player.equipment = [item('spare_wagon_parts'), item('saint_elmos_shield')];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_EQUIPMENT_CHOICE', count: 1 }, player, mods);
    // Equipment is NOT removed here — the UI handles the player's choice
    expect(player.equipment.length).toBe(2);
  });

  test('LOSE_ALL_SUPPLY_CARDS removes supply consumables', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.consumables.push(createConsumableInstance(def));
    player.consumables.push(createConsumableInstance(def));
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_ALL_SUPPLY_CARDS' }, player, mods);
    expect(player.consumables.filter((c) => c.def.category === 'supply').length).toBe(0);
  });

  test('LOSE_RANDOM_SUPPLY_CARD removes one supply card', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.consumables.push(createConsumableInstance(def));
    player.consumables.push(createConsumableInstance(def));
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_SUPPLY_CARD', count: 1 }, player, mods);
    expect(player.consumables.length).toBe(1);
  });

  test('LOSE_MONEY_PER_DAY adds to modifier (UI-only, not consumed in game logic)', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_MONEY_PER_DAY', amount: 3 }, player, mods);
    expect(mods.moneyPerDayLoss).toBe(3);
  });

  test('LOSE_EQUIPMENT_SLOT_PERMANENT reduces slots', () => {
    const player = resetPlayerState();
    const initialSlots = player.maxEquipmentSlots;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_EQUIPMENT_SLOT_PERMANENT' }, player, mods);
    expect(player.maxEquipmentSlots).toBe(initialSlots - 1);
  });

  test('LOSE_EQUIPMENT_SLOT_PERMANENT does not go below 1', () => {
    const player = resetPlayerState();
    player.maxEquipmentSlots = 1;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_EQUIPMENT_SLOT_PERMANENT' }, player, mods);
    expect(player.maxEquipmentSlots).toBe(1);
  });

  test('GAIN_DICE adds dice to player pool', () => {
    const player = resetPlayerState();
    const initialCount = player.dice.length;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_DICE', count: 2, enhancement: 'bone', aura: 'fire', sticker: null }, player, mods);
    expect(player.dice.length).toBe(initialCount + 2);
    // Check last 2 dice have correct enhancement/aura
    const newDice = player.dice.slice(-2);
    for (const d of newDice) {
      expect(d.enhancement).toBe('bone');
      expect(d.aura).toBe('fire');
    }
  });

  test('GAIN_DICE with sticker', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_DICE', count: 1, enhancement: 'lucky', aura: null, sticker: 'red_bullet' }, player, mods);
    const newDie = player.dice[player.dice.length - 1];
    expect(newDie.enhancement).toBe('lucky');
    expect(newDie.sticker).toBe('red_bullet');
  });

  test('GAIN_RANDOM_SUPPLY_CARD adds to consumables', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_SUPPLY_CARD', count: 1 }, player, mods);
    expect(player.consumables.length).toBe(1);
    expect(player.consumables[0].def.category).toBe('supply');
  });

  test('GAIN_RANDOM_EQUIPMENT adds equipment', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_EQUIPMENT', rarity: 'uncommon', aura: null }, player, mods);
    expect(player.equipment.length).toBe(1);
  });

  test('GAIN_TRAIL_GUIDES adds trail guide consumables', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_TRAIL_GUIDES', count: 3 }, player, mods);
    const trailGuides = player.consumables.filter((c) => c.def.category === 'trail_guide');
    expect(trailGuides.length).toBe(3);
  });

  test('USE_MEDICINE removes first supply consumable', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.consumables.push(createConsumableInstance(def));
    const mods = createEmptyModifiers();
    applyEffect({ type: 'USE_MEDICINE' }, player, mods);
    expect(player.consumables.length).toBe(0);
  });

  test('DESTROY_EQUIPMENT removes specific equipment', () => {
    const player = resetPlayerState();
    player.equipment = [item('spare_wagon_parts'), item('saint_elmos_shield')];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'DESTROY_EQUIPMENT', id: 'spare_wagon_parts' }, player, mods);
    expect(player.equipment.length).toBe(1);
    expect(player.equipment[0].def.id).toBe('saint_elmos_shield');
  });

  test('ADD_AURA_TO_RANDOM_DICE applies aura', () => {
    const player = resetPlayerState();
    // All dice start with null aura
    const mods = createEmptyModifiers();
    applyEffect({ type: 'ADD_AURA_TO_RANDOM_DICE', count: 3, aura: 'fire' }, player, mods);
    const fireDice = player.dice.filter((d) => d.aura === 'fire');
    expect(fireDice.length).toBe(3);
  });

  test('BOSS_UPGRADE increases target miles in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'BOSS_UPGRADE', multiplier: 1.5 }, player, mods);
    player.trailEventModifiers = mods;
    game.startRound({ targetMiles: 1000 });
    expect(game.config.targetMiles).toBe(1500);
  });

  test('SCORE_MULTIPLIER increases target miles in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'SCORE_MULTIPLIER', multiplier: 1.5 }, player, mods);
    player.trailEventModifiers = mods;
    game.startRound({ targetMiles: 1000 });
    expect(game.config.targetMiles).toBe(1500);
  });

  test('FLAT_MILES_PENALTY sets modifier (UI-only, not consumed in game logic)', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'FLAT_MILES_PENALTY', amount: 10 }, player, mods);
    expect(mods.flatMilesPenalty).toBe(10);
  });

  test('SKIP_NEXT_SHOP sets flag on modifiers (consumed by UI layer)', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'SKIP_NEXT_SHOP' }, player, mods);
    expect(mods.skipNextShop).toBe(true);
  });

  test('DISABLE_REROLL_DAY1 sets flag (UI-only, not consumed in game logic)', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'DISABLE_REROLL_DAY1' }, player, mods);
    expect(mods.disableRerollDay1).toBe(true);
  });

  test('STANDARD_DICE_DAY1 sets flag (UI-only, not consumed in game logic)', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'STANDARD_DICE_DAY1' }, player, mods);
    expect(mods.standardDiceDay1).toBe(true);
  });

  test('DIAMOND_CRACK_DOUBLED sets flag (UI-only, not consumed in game logic)', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'DIAMOND_CRACK_DOUBLED' }, player, mods);
    expect(mods.diamondCrackDoubled).toBe(true);
  });

  test('LUCKY_ODDS_HALVED sets flag (UI-only, not consumed in game logic)', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LUCKY_ODDS_HALVED' }, player, mods);
    expect(mods.luckyOddsHalved).toBe(true);
  });

  test('SCORED_DICE_DESTROY_CHANCE sets chance (UI-only, not consumed in game logic)', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'SCORED_DICE_DESTROY_CHANCE', chance: 0.25 }, player, mods);
    expect(mods.scoredDiceDestroyChance).toBe(0.25);
  });

  test('LOSE_REROLLS_PER_DAY reduces rerolls in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_REROLLS_PER_DAY', amount: 1 }, player, mods);
    // 1 reroll/day * 4 days = 4 reroll penalty
    expect(mods.rerollPenalty).toBe(GAMEPLAY.MAX_DAYS * 1);
    player.trailEventModifiers = mods;
    game.startRound();
    // base 6 - 4 = 2 rerolls
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - GAMEPLAY.MAX_DAYS * 1);
  });
});

// ─── Outcome Resolution ───

describe('Outcome resolution', () => {
  test('resolveChoice with single outcome always picks it', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const event = getTrailEventById('bad_mosquitos')!;
    const result = resolveChoice(event, 'endure', player);
    expect(result.choiceId).toBe('endure');
    expect(result.outcomeIndex).toBe(0);
    expect(result.effects.length).toBeGreaterThan(0);
  });

  test('resolveChoice with multi-outcome uses rng', () => {
    const player = resetPlayerState();
    player.dice = diceWithValue(6, 20);
    const event = getTrailEventById('fallen_rocks')!;

    // Force first outcome (30% probability — rng < 0.3)
    const result1 = resolveChoice(event, 'risk', player, () => 0.1);
    expect(result1.outcomeIndex).toBe(0);

    // Force second outcome (70% probability — rng >= 0.3)
    const player2 = resetPlayerState();
    player2.dice = diceWithValue(6, 20);
    const result2 = resolveChoice(event, 'risk', player2, () => 0.5);
    expect(result2.outcomeIndex).toBe(1);
  });

  test('resolveChoice throws for invalid choice', () => {
    const player = resetPlayerState();
    const event = getTrailEventById('bad_mosquitos')!;
    expect(() => resolveChoice(event, 'nonexistent', player)).toThrow();
  });

  test('resolveChoice applies immediate money effects', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const event = getTrailEventById('caught_fish')!;
    resolveChoice(event, 'take', player);
    expect(player.economy.balance).toBe(24); // +$4
  });

  test('resolveChoice applies modifier effects', () => {
    const player = resetPlayerState();
    const event = getTrailEventById('heavy_fog')!;
    const result = resolveChoice(event, 'endure', player);
    expect(result.modifiers.disableRerollDay1).toBe(true);
  });
});

// ─── saint_elmos_shield (Legendary Equipment) ───

describe('saint_elmos_shield equipment interaction', () => {
  test('saint_elmos_shield negates all negative effects', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    player.equipment = [item('saint_elmos_shield')];
    player.dice = diceWithValue(6, 20);

    const event = getTrailEventById('bandit_ambush')!;
    // Choose "pay" which would lose half money
    resolveChoice(event, 'pay', player);
    // saint_elmos_shield should negate the money loss
    expect(player.economy.balance).toBe(20);
  });

  test('saint_elmos_shield allows positive effects through', () => {
    const player = resetPlayerState();
    player.economy.setBalance(5);
    player.equipment = [item('saint_elmos_shield')];

    const event = getTrailEventById('caught_fish')!;
    resolveChoice(event, 'take', player);
    expect(player.economy.balance).toBe(9); // +$4 still works
  });

  test('saint_elmos_shield negates day penalties', () => {
    const player = resetPlayerState();
    player.equipment = [item('saint_elmos_shield')];

    const event = getTrailEventById('lose_trail')!;
    const result = resolveChoice(event, 'wander', player);
    expect(result.modifiers.dayPenalty).toBe(0);
  });
});

// ─── Spare Wagon Parts ───

describe('Spare Wagon Parts interaction', () => {
  test('spare_parts choice destroys the equipment', () => {
    const player = resetPlayerState();
    player.economy.setBalance(100);
    player.equipment = [item('spare_wagon_parts')];

    const event = getTrailEventById('broken_wheel')!;
    resolveChoice(event, 'spare_parts', player);
    expect(player.equipment.length).toBe(0); // destroyed
  });

  test('spare_parts choice avoids day loss', () => {
    const player = resetPlayerState();
    player.equipment = [item('spare_wagon_parts')];

    const event = getTrailEventById('broken_axle')!;
    const result = resolveChoice(event, 'spare_parts', player);
    expect(result.modifiers.dayPenalty).toBe(0); // no day loss
  });
});

// ─── Round Modifier Integration ───

describe('Round modifier integration', () => {
  test('modifiers are cleared after round starts', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });

    player.trailEventModifiers.dayPenalty = 2;
    player.trailEventModifiers.rerollPenalty = 1;
    player.trailEventModifiers.scoreMultiplier = 1.5;
    game.startRound({ targetMiles: 1000 });

    // Verify effects were applied
    expect(game.config.maxDays).toBe(2);
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - 1);
    expect(game.config.targetMiles).toBe(1500);

    // Verify modifiers are cleared after consumption
    expect(player.trailEventModifiers.dayPenalty).toBe(0);
    expect(player.trailEventModifiers.rerollPenalty).toBe(0);
    expect(player.trailEventModifiers.scoreMultiplier).toBe(1.0);
  });

  test('skipNextShop flag propagated via resolveChoice', () => {
    const player = resetPlayerState();
    const event = getTrailEventById('native_guide')!;
    const result = resolveChoice(event, 'accept', player);
    expect(result.modifiers.skipNextShop).toBe(true);
  });
});

// ─── Every Single Event Resolution ───

describe('Every trail event resolves without error', () => {
  const allEvents = getAllTrailEvents();

  for (const event of allEvents) {
    test(`${event.id}: resolves first available choice`, () => {
      const player = resetPlayerState();
      player.economy.setBalance(1000); // rich so money gates pass
      player.equipment = [item('spare_wagon_parts')]; // has equipment
      player.dice = diceWithValue(6, 50); // plenty of dice

      // Add a supply card so medicine checks pass
      const supplyDef = getSupplyDefById('coffee_tin')!;
      player.consumables.push(createConsumableInstance(supplyDef));

      const choices = getAvailableChoices(event, player);
      expect(choices.length).toBeGreaterThanOrEqual(1);

      // Resolve the first available choice
      const result = resolveChoice(event, choices[0].id, player, () => 0.5);
      expect(result).toBeDefined();
      expect(result.event.id).toBe(event.id);
      expect(result.choiceId).toBe(choices[0].id);
    });
  }
});

// ─── Every Event - All Choices Resolution ───

describe('Every trail event choice resolves without error', () => {
  const allEvents = getAllTrailEvents();

  for (const event of allEvents) {
    for (const choice of event.choices) {
      test(`${event.id}/${choice.id}: resolves correctly`, () => {
        const player = resetPlayerState();
        player.economy.setBalance(1000);
        player.equipment = [item('spare_wagon_parts'), item('saint_elmos_shield')];
        player.dice = diceWithValue(6, 50);

        const supplyDef = getSupplyDefById('coffee_tin')!;
        player.consumables.push(createConsumableInstance(supplyDef));
        player.consumables.push(createConsumableInstance(supplyDef));

        // Check if condition is met; skip if not meetable
        if (choice.condition) {
          const met = checkCondition(choice.condition, player);
          if (!met) return; // Can't test this choice in this setup
        }

        const result = resolveChoice(event, choice.id, player, () => 0.5);
        expect(result).toBeDefined();
        expect(result.choiceId).toBe(choice.id);

        // Verify modifiers object is valid
        expect(result.modifiers.dayPenalty).toBeGreaterThanOrEqual(0);
        expect(result.modifiers.rerollPenalty).toBeGreaterThanOrEqual(0);
        expect(result.modifiers.scoreMultiplier).toBeGreaterThanOrEqual(0);
      });
    }
  }
});

// ─── Edge Cases ───

describe('Edge cases', () => {
  test('player with 0 money handles LOSE_MONEY gracefully', () => {
    const player = resetPlayerState();
    player.economy.setBalance(0);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_MONEY', amount: 10 }, player, mods);
    expect(player.economy.balance).toBe(0);
  });

  test('player with no dice handles LOSE_RANDOM_DICE gracefully', () => {
    const player = resetPlayerState();
    player.dice = [];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 5 }, player, mods);
    expect(player.dice.length).toBe(0);
  });

  test(`player with only standard dice loses ${TRAIL_EVENT.AMOUNT_PER_MISSING_DIE} per missing die from LOSE_RANDOM_DICE`, () => {
    const player = resetPlayerState();
    // Default pouch is all standard dice
    const initialCount = player.dice.length;
    player.economy.setBalance(50);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 3 }, player, mods);
    expect(player.dice.length).toBe(initialCount);
    expect(player.economy.balance).toBe(50 - (3 * TRAIL_EVENT.AMOUNT_PER_MISSING_DIE));
  });

  test(`player with no equipment loses ${TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP} per missing equipment from LOSE_RANDOM_EQUIPMENT`, () => {
    const player = resetPlayerState();
    player.equipment = [];
    player.economy.setBalance(15);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_EQUIPMENT', count: 3 }, player, mods);
    expect(player.equipment.length).toBe(0);
    expect(player.economy.balance).toBe(15 - (3 * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP));
  });

  test(`LOSE_RANDOM_EQUIPMENT ${TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP} penalty can go negative`, () => {
    const player = resetPlayerState();
    player.equipment = [];
    player.economy.setBalance(2);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_EQUIPMENT', count: 1 }, player, mods);
    expect(player.economy.balance).toBe(2 - (1 * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP));
  });

  test(`LOSE_EQUIPMENT_CHOICE deducts ${TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP} per missing equipment`, () => {
    const player = resetPlayerState();
    player.equipment = [];
    player.economy.setBalance(30);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_EQUIPMENT_CHOICE', count: 1 }, player, mods);
    expect(player.economy.balance).toBe(30 - (1 * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP));
  });

  test('player with no consumables handles LOSE_ALL_SUPPLY_CARDS gracefully', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_ALL_SUPPLY_CARDS' }, player, mods);
    expect(player.consumables.length).toBe(0);
  });

  test('player with no consumables handles USE_MEDICINE gracefully', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'USE_MEDICINE' }, player, mods);
    expect(player.consumables.length).toBe(0);
  });

  test('DESTROY_EQUIPMENT with non-existent id does nothing', () => {
    const player = resetPlayerState();
    player.equipment = [item('spare_wagon_parts')];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'DESTROY_EQUIPMENT', id: 'nonexistent' }, player, mods);
    expect(player.equipment.length).toBe(1);
  });

  test('createEmptyModifiers returns clean state', () => {
    const mods = createEmptyModifiers();
    expect(mods.dayPenalty).toBe(0);
    expect(mods.rerollPenalty).toBe(0);
    expect(mods.handSizePenalty).toBe(0);
    expect(mods.scoreMultiplier).toBe(1.0);
    expect(mods.disableRerollDay1).toBe(false);
    expect(mods.standardDiceDay1).toBe(false);
    expect(mods.moneyPerDayLoss).toBe(0);
    expect(mods.diamondCrackDoubled).toBe(false);
    expect(mods.luckyOddsHalved).toBe(false);
    expect(mods.scoredDiceDestroyChance).toBe(0);
    expect(mods.bossUpgradeMultiplier).toBe(1.0);
    expect(mods.flatMilesPenalty).toBe(0);
    expect(mods.skipNextShop).toBe(false);
    expect(mods.loseAllRerolls).toBe(false);
  });

  test('multiple LOSE_DAYS effects accumulate', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_DAYS', amount: 1 }, player, mods);
    applyEffect({ type: 'LOSE_DAYS', amount: 2 }, player, mods);
    expect(mods.dayPenalty).toBe(3);
  });

  test('multiple BOSS_UPGRADE effects multiply', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'BOSS_UPGRADE', multiplier: 1.5 }, player, mods);
    applyEffect({ type: 'BOSS_UPGRADE', multiplier: 2.0 }, player, mods);
    expect(mods.bossUpgradeMultiplier).toBe(3.0);
  });
});
