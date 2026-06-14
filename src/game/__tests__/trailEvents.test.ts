import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import {
  resetDieIds,
  setupGame,
  diceWithValue,
  die,
  item,
  equipWithModifiers,
  setTestDifficulty,
  syncEquipmentInstances,
  pushEquipmentState,
} from './testHelpers';
import { resetPlayerState } from './testRunPlayer';
import { getRunState, runActions } from '../store/runStore';
import { resolveEquipmentList } from '../store/resolve';
import { getItemDisplayContext } from '../displayContext';
import {
  getAllTrailEvents,
  getTrailEventById,
  selectTrailEvent,
  eventHasEffect,
  isStandoffBossRound,
  filterEventsByLeg,
  filterUnseenEvents,
  getTrailEventMinimumLeg,
  getAvailableChoices,
  resolveChoice,
  buildTrailEventResultFromResolvedDisplay,
  filterEquipmentEligibleForTrailSacrifice,
  outcomeIncludesEquipmentTrade,
  checkCondition,
  isNegativeEffect,
  applyEffect,
  applySpyglassAvoid,
  applySpyglassInvestigate,
  getScoutsSpyglassInvestigateMiles,
  hasScoutsSpyglass,
  createEmptyModifiers,
  getTrailDebuffLines,
  getPlayerTrailDebuffLines,
  trailRoundEffectsFromModifiers,
} from '../TrailEventsSystem';
import { createConsumableInstance, getSupplyDefById } from '../ConsumablesSystem';
import { GAMEPLAY, TRAIL_EVENT } from '../Constants';
import { D } from '../scoreMath';
import { getEquipmentDefById, isEquipmentCursed } from '../ItemsSystem';
import { resolveEffectParam } from '../effectParams';
import { PhaseState } from '../types';

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

  test('gold_strike offers skip and mine costs 1 reroll', () => {
    const event = getTrailEventById('gold_strike')!;
    expect(event.category).toBe('positive');
    const mine = event.choices.find((c) => c.id === 'mine')!;
    const skip = event.choices.find((c) => c.id === 'skip')!;
    expect(mine.label).toContain('-1 reroll');
    expect(mine.outcomes[0].effects.find((e) => e.type === 'LOSE_REROLLS')?.amount).toBe(1);
    expect(skip.label).toBe('Skip it');
    expect(skip.outcomes[0].effects).toHaveLength(0);
  });
});

// ─── Event Selection ───

describe('Trail Event selection', () => {
  test('selectTrailEvent returns a valid event for non-demon-hunter', () => {
    resetPlayerState();
    const event = selectTrailEvent(() => 0.5);
    expect(event).toBeDefined();
    expect(event.demonHunterOnly).toBe(false);
  });

  test('selectTrailEvent never returns demon_hunter events for non-demon-hunter', () => {
    resetPlayerState();
    // Run many selections
    for (let i = 0; i < 100; i++) {
      const event = selectTrailEvent(Math.random);
      expect(event.demonHunterOnly).toBe(false);
    }
  });

  test('selectTrailEvent can return demon_hunter events for Isaac Granger', () => {
    const player = resetPlayerState();
    player.applyProfession('demon_hunter');

    // Force rng < 0.3 to draw from demon pool
    const event = selectTrailEvent(() => 0.1);
    expect(event.demonHunterOnly).toBe(true);
  });

  test('selectTrailEvent returns standard events for demon_hunter when rng >= 0.3', () => {
    const player = resetPlayerState();
    player.applyProfession('demon_hunter');

    // Force rng >= 0.3 for pool selection, then 0.5 for weighted pick
    let callCount = 0;
    const event = selectTrailEvent(() => {
      callCount++;
      return callCount === 1 ? 0.5 : 0.5; // first call is pool check, second is weight pick
    });
    expect(event.demonHunterOnly).toBe(false);
  });

  test('selectTrailEvent respects weights', () => {
    resetPlayerState();
    // With rng = 0 (first element after weight check), should pick first available
    const event = selectTrailEvent(() => 0.0001);
    expect(event).toBeDefined();
  });

  test('selectTrailEvent at leg 1 excludes events with minimumLeg > 1', () => {
    const player = resetPlayerState();
    player.leg = 1;
    for (let i = 0; i < 200; i++) {
      const event = selectTrailEvent(Math.random);
      expect(getTrailEventMinimumLeg(event)).toBeLessThanOrEqual(1);
    }
  });

  test('run-warping standard events are in the leg 5 pool but not leg 4', () => {
    const standardPool = getAllTrailEvents().filter((e) => !e.demonHunterOnly);
    const leg4Ids = new Set(filterEventsByLeg(standardPool, 4).map((e) => e.id));
    const leg5Ids = new Set(filterEventsByLeg(standardPool, 5).map((e) => e.id));

    expect(getTrailEventMinimumLeg(getTrailEventById('lost_severe')!)).toBe(5);
    expect(leg4Ids.has('lost_severe')).toBe(false);
    expect(leg4Ids.has('wagon_fell_through_ice')).toBe(false);
    expect(leg5Ids.has('lost_severe')).toBe(true);
    expect(leg5Ids.has('wagon_fell_through_ice')).toBe(true);
    expect(leg5Ids.has('wrong_trail')).toBe(true);
  });

  test('filterEventsByLeg falls back to full pool when nothing eligible', () => {
    const pool = getAllTrailEvents().filter((e) => e.id === 'lost_severe');
    const filtered = filterEventsByLeg(pool, 1);
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('lost_severe');
  });

  test('selectTrailEvent never repeats a seen event', () => {
    const player = resetPlayerState();
    player.seenTrailEventIds.add('tipped_wagon');
    for (let i = 0; i < 300; i++) {
      const event = selectTrailEvent(Math.random);
      expect(event.id).not.toBe('tipped_wagon');
    }
  });

  test('resolveChoice records event as seen', () => {
    const player = resetPlayerState();
    const event = getTrailEventById('bad_mosquitos')!;
    resolveChoice(event, 'endure');
    expect(player.seenTrailEventIds.has('bad_mosquitos')).toBe(true);
  });

  test('filterUnseenEvents excludes seen ids', () => {
    const player = resetPlayerState();
    const pool = getAllTrailEvents()
      .filter((e) => !e.demonHunterOnly)
      .slice(0, 5);
    player.seenTrailEventIds.add(pool[0].id);
    const filtered = filterUnseenEvents(pool, [...player.seenTrailEventIds]);
    expect(filtered.some((e) => e.id === pool[0].id)).toBe(false);
    expect(filtered.length).toBe(4);
  });

  test('before the_standoff boss, selectTrailEvent never returns heavy_fog', () => {
    const player = resetPlayerState();
    player.round = GAMEPLAY.ROUNDS_PER_LEG;
    player.restoreBossAssignments(Array(GAMEPLAY.LEGS).fill('the_standoff'));
    expect(isStandoffBossRound(getRunState())).toBe(true);
    expect(eventHasEffect(getTrailEventById('heavy_fog')!, 'DISABLE_REROLL_DAY1')).toBe(true);

    for (let i = 0; i < 500; i++) {
      const event = selectTrailEvent(Math.random);
      expect(event.id).not.toBe('heavy_fog');
    }
  });

  test('eventHasEffect detects LOSE_ALL_REROLLS on fallen_angel betray choice', () => {
    const event = getTrailEventById('fallen_angel')!;
    expect(eventHasEffect(event, 'LOSE_ALL_REROLLS')).toBe(true);
  });
});

// ─── Condition Checking ───

describe('Condition checking', () => {
  test('HAS_MONEY: true when player has enough', () => {
    const player = resetPlayerState();
    player.economy.setBalance(10);
    expect(checkCondition({ type: 'HAS_MONEY', amount: 5 })).toBe(true);
  });

  test('HAS_MONEY: false when player is broke', () => {
    const player = resetPlayerState();
    player.economy.setBalance(2);
    expect(checkCondition({ type: 'HAS_MONEY', amount: 5 })).toBe(false);
  });

  test('HAS_EQUIPMENT: true when player has specific item', () => {
    const player = resetPlayerState();
    player.equipment = [item('trail_repair_kit')];
    expect(checkCondition({ type: 'HAS_EQUIPMENT', id: 'trail_repair_kit' })).toBe(true);
  });

  test('HAS_EQUIPMENT: false when player lacks item', () => {
    resetPlayerState();
    expect(checkCondition({ type: 'HAS_EQUIPMENT', id: 'trail_repair_kit' })).toBe(false);
  });

  test('HAS_EQUIPMENT_ANY: true when player has any equipment', () => {
    const player = resetPlayerState();
    player.equipment = [item('trail_repair_kit')];
    expect(checkCondition({ type: 'HAS_EQUIPMENT_ANY' })).toBe(true);
  });

  test('HAS_EQUIPMENT_ANY: false when player has no equipment', () => {
    const player = resetPlayerState();
    player.equipment = [];
    expect(checkCondition({ type: 'HAS_EQUIPMENT_ANY' })).toBe(false);
  });

  test('HAS_MEDICINE: true when player has supply card', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.addConsumable(def);
    expect(checkCondition({ type: 'HAS_MEDICINE' })).toBe(true);
  });

  test('HAS_MEDICINE: false when player has no consumables', () => {
    resetPlayerState();
    expect(checkCondition({ type: 'HAS_MEDICINE' })).toBe(false);
  });

  test('HAS_WEAPON: false when no weapon equipped', () => {
    const player = resetPlayerState();
    player.equipment = [item('trail_repair_kit')];
    expect(checkCondition({ type: 'HAS_WEAPON' })).toBe(false);
  });

  test('IS_PROFESSION: true when matching', () => {
    const player = resetPlayerState();
    player.applyProfession('demon_hunter');
    expect(checkCondition({ type: 'IS_PROFESSION', id: 'demon_hunter' })).toBe(true);
  });

  test('IS_PROFESSION: false when not matching', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    expect(checkCondition({ type: 'IS_PROFESSION', id: 'demon_hunter' })).toBe(false);
  });
});

// ─── Choice Availability ───

describe('Choice availability', () => {
  test('unconditional choices are always available', () => {
    resetPlayerState();
    const event = getTrailEventById('bad_mosquitos')!;
    const choices = getAvailableChoices(event);
    expect(choices.length).toBe(1);
    expect(choices[0].id).toBe('endure');
  });

  test('money-gated choice hidden when broke', () => {
    const player = resetPlayerState();
    player.economy.setBalance(3);
    const event = getTrailEventById('broken_wheel')!;
    const choices = getAvailableChoices(event);
    // Should have 'endure' but NOT 'pay' ($8 required) or 'spare_parts'
    expect(choices.some((c) => c.id === 'endure')).toBe(true);
    expect(choices.some((c) => c.id === 'pay')).toBe(false);
  });

  test('money-gated choice available when rich', () => {
    const player = resetPlayerState();
    player.economy.setBalance(100);
    const event = getTrailEventById('broken_wheel')!;
    const choices = getAvailableChoices(event);
    expect(choices.some((c) => c.id === 'pay')).toBe(true);
  });

  test('HAS_CONSUMABLE_ANY hides choice when player has no consumables', () => {
    const player = resetPlayerState();
    player.consumables = [];
    const event = getTrailEventById('swamped_wagon')!;
    const choices = getAvailableChoices(event);
    expect(choices.some((c) => c.id === 'lose')).toBe(false);
    expect(choices.some((c) => c.id === 'nothing')).toBe(true);
  });

  test('HAS_CONSUMABLE_ANY shows choice when player has consumables', () => {
    const player = resetPlayerState();
    const supply = createConsumableInstance(getSupplyDefById('rabbits_foot')!);
    player.consumables = [supply];
    const event = getTrailEventById('swamped_wagon')!;
    const choices = getAvailableChoices(event);
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
    applyEffect({ type: 'LOSE_MONEY', amount: 8 }, mods);
    expect(player.economy.balance).toBe(12);
  });

  test('LOSE_MONEY does not go negative', () => {
    const player = resetPlayerState();
    player.economy.setBalance(3);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_MONEY', amount: 10 }, mods);
    expect(player.economy.balance).toBe(0);
  });

  test('LOSE_MONEY_PERCENT loses correct percentage', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_MONEY_PERCENT', percent: 50 }, mods);
    expect(player.economy.balance).toBe(10);
  });

  test('GAIN_MONEY increases balance', () => {
    const player = resetPlayerState();
    player.economy.setBalance(5);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_MONEY', amount: 10 }, mods);
    expect(player.economy.balance).toBe(15);
  });

  test('LOSE_DAYS reduces maxDays in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const loseDays = 2;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_DAYS', amount: loseDays }, mods);
    player.trailEventModifiers = mods;
    game.startRound();
    expect(game.config.maxDays).toBe(GAMEPLAY.MAX_DAYS - loseDays);
  });

  test('LOSE_REROLLS reduces maxRerolls in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_REROLLS', amount: 3 }, mods);
    player.trailEventModifiers = mods;
    game.startRound();
    // base 6 - 3 = 3
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - 3);
  });

  test('LOSE_ALL_REROLLS sets maxRerolls to 0 in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_ALL_REROLLS' }, mods);
    player.trailEventModifiers = mods;
    game.startRound();
    expect(game.config.maxRerolls).toBe(0);
  });

  test('LOSE_HAND_SIZE reduces rollSize in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_HAND_SIZE', amount: 2 }, mods);
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
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 2 }, mods);
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
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 2 }, mods);
    // No enhanced dice to remove — lose $3 per missing die instead
    expect(player.dice.length).toBe(3);
    expect(player.economy.balance).toBe(25 - 2 * TRAIL_EVENT.AMOUNT_PER_MISSING_DIE); // $3 per missing die penalty
  });

  test('LOSE_RANDOM_DICE $3 penalty can go negative', () => {
    const player = resetPlayerState();
    player.dice = [die({})];
    player.economy.setBalance(3);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 1 }, mods);
    expect(player.dice.length).toBe(1);
    expect(player.economy.balance).toBe(0);
  });

  test('LOSE_RANDOM_DICE deducts $3 per missing die when pool empty', () => {
    const player = resetPlayerState();
    player.dice = [];
    player.economy.setBalance(20);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 5 }, mods);
    expect(player.dice.length).toBe(0);
    expect(player.economy.balance).toBe(20 - 5 * TRAIL_EVENT.AMOUNT_PER_MISSING_DIE); // $3 per missing die penalty
  });

  test('LOSE_RANDOM_EQUIPMENT removes equipment', () => {
    const player = resetPlayerState();
    player.equipment = [item('trail_repair_kit'), item('saint_elmos_shield')];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_EQUIPMENT', count: 1 }, mods);
    expect(player.equipment.length).toBe(1);
  });

  test('LOSE_RANDOM_EQUIPMENT does not remove cursed equipment', () => {
    const player = resetPlayerState();
    const cursed = equipWithModifiers('horseshoe', ['cursed']);
    const normal = item('dynamite');
    player.equipment = [cursed, normal];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_EQUIPMENT', count: 1 }, mods);
    expect(player.equipment.some((e) => isEquipmentCursed(e))).toBe(true);
    expect(player.equipment.length).toBe(1);
    expect(player.equipment[0].def.id).toBe('horseshoe');
  });

  test('DESTROY_EQUIPMENT no-op when target is cursed', () => {
    const player = resetPlayerState();
    const cursed = equipWithModifiers('horseshoe', ['cursed']);
    player.equipment = [cursed];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'DESTROY_EQUIPMENT', id: 'horseshoe' }, mods);
    expect(player.equipment.length).toBe(1);
  });

  test('LOSE_EQUIPMENT_CHOICE is deferred to UI (no-op in applyEffect)', () => {
    const player = resetPlayerState();
    player.equipment = [item('trail_repair_kit'), item('saint_elmos_shield')];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_EQUIPMENT_CHOICE', count: 1 }, mods);
    // Equipment is NOT removed here — the UI handles the player's choice
    expect(player.equipment.length).toBe(2);
  });

  test('LOSE_ALL_SUPPLY_CARDS removes supply consumables', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.consumables.push(createConsumableInstance(def));
    player.consumables.push(createConsumableInstance(def));
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_ALL_SUPPLY_CARDS' }, mods);
    expect(player.consumables.filter((c) => c.def.category === 'supply').length).toBe(0);
  });

  test('LOSE_RANDOM_SUPPLY_CARD removes one supply card', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.consumables.push(createConsumableInstance(def));
    player.consumables.push(createConsumableInstance(def));
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_SUPPLY_CARD', count: 1 }, mods);
    expect(player.consumables.length).toBe(1);
  });

  test('LOSE_MONEY_PER_DAY adds to modifier', () => {
    resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_MONEY_PER_DAY', amount: 3 }, mods);
    expect(mods.moneyPerDayLoss).toBe(3);
  });

  test('LOSE_EQUIPMENT_SLOT_PERMANENT reduces slots', () => {
    const player = resetPlayerState();
    const initialSlots = player.maxEquipmentSlots;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_EQUIPMENT_SLOT_PERMANENT' }, mods);
    expect(player.maxEquipmentSlots).toBe(initialSlots - 1);
  });

  test('LOSE_EQUIPMENT_SLOT_PERMANENT does not go below 1', () => {
    const player = resetPlayerState();
    player.maxEquipmentSlots = 1;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_EQUIPMENT_SLOT_PERMANENT' }, mods);
    expect(player.maxEquipmentSlots).toBe(1);
  });

  test('GAIN_DICE adds dice to player pool', () => {
    const player = resetPlayerState();
    const initialCount = player.dice.length;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_DICE', count: 2, enhancement: 'bone', aura: 'fire', sticker: null }, mods);
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
    applyEffect({ type: 'GAIN_DICE', count: 1, enhancement: 'lucky', aura: null, sticker: 'red_bullet' }, mods);
    const newDie = player.dice[player.dice.length - 1];
    expect(newDie.enhancement).toBe('lucky');
    expect(newDie.sticker).toBe('red_bullet');
  });

  test('GAIN_RANDOM_SUPPLY_CARD adds to consumables', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_SUPPLY_CARD', count: 1 }, mods);
    expect(player.consumables.length).toBe(1);
    expect(player.consumables[0].def.category).toBe('supply');
  });

  test('GAIN_RANDOM_EQUIPMENT adds equipment', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_EQUIPMENT', rarity: 'uncommon', aura: null }, mods);
    expect(player.equipment.length).toBe(1);
  });

  test('GAIN_RANDOM_EQUIPMENT respects legendary rarity', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_EQUIPMENT', rarity: 'legendary', aura: 'ghost' }, mods);
    expect(player.equipment.length).toBe(1);
    expect(player.equipment[0].def.rarity).toBe('legendary');
    expect(player.equipment[0].def.aura?.id).toBe('ghost');
  });

  test('GAIN_RANDOM_EQUIPMENT does not apply difficulty modifiers', () => {
    setTestDifficulty(8);
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_EQUIPMENT', rarity: 'uncommon', aura: null }, mods);
    expect(player.equipment.length).toBe(1);
    expect(player.equipment[0].modifiers).toEqual([]);
  });

  test('GAIN_RANDOM_EQUIPMENT grants enhanced die when inventory is full', () => {
    const player = resetPlayerState();
    player.maxEquipmentSlots = 2;
    player.equipment = [item('horseshoe'), item('war_drums')];
    const diceBefore = player.dice.length;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_EQUIPMENT', rarity: 'uncommon', aura: null }, mods, () => 0);
    expect(player.equipment.length).toBe(2);
    expect(player.dice.length).toBe(diceBefore + 1);
    expect(player.dice[player.dice.length - 1]?.enhancement).not.toBeNull();
  });

  test('GAIN_RANDOM_EQUIPMENT grants equipment over slot limit when paired with equipment sacrifice', () => {
    const player = resetPlayerState();
    player.maxEquipmentSlots = 2;
    player.equipment = [item('horseshoe'), item('war_drums')];
    const diceBefore = player.dice.length;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_EQUIPMENT', rarity: 'uncommon', aura: null }, mods, () => 0, {
      allowEquipmentOverSlotLimit: true,
    });
    expect(player.equipment.length).toBe(3);
    expect(player.dice.length).toBe(diceBefore);
  });

  test('GAIN_RANDOM_EQUIPMENT still grants ghost equipment when inventory is full', () => {
    const player = resetPlayerState();
    player.maxEquipmentSlots = 2;
    player.equipment = [item('horseshoe'), item('war_drums')];
    const diceBefore = player.dice.length;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_RANDOM_EQUIPMENT', rarity: 'uncommon', aura: 'ghost' }, mods);
    expect(player.equipment.length).toBe(3);
    expect(player.dice.length).toBe(diceBefore);
  });

  test('GAIN_TRAIL_GUIDES adds trail guide consumables', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'GAIN_TRAIL_GUIDES', count: 3 }, mods);
    const trailGuides = player.consumables.filter((c) => c.def.category === 'trail_guide');
    expect(trailGuides.length).toBe(3);
  });

  test('USE_MEDICINE removes first supply consumable', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.consumables.push(createConsumableInstance(def));
    const mods = createEmptyModifiers();
    applyEffect({ type: 'USE_MEDICINE' }, mods);
    expect(player.consumables.length).toBe(0);
  });

  test('DESTROY_EQUIPMENT removes specific equipment', () => {
    const player = resetPlayerState();
    player.equipment = [item('trail_repair_kit'), item('saint_elmos_shield')];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'DESTROY_EQUIPMENT', id: 'trail_repair_kit' }, mods);
    expect(player.equipment.length).toBe(1);
    expect(player.equipment[0].def.id).toBe('saint_elmos_shield');
  });

  test('ADD_AURA_TO_RANDOM_DICE applies aura', () => {
    const player = resetPlayerState();
    player.dice = diceWithValue(6, 5);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'ADD_AURA_TO_RANDOM_DICE', count: 3, aura: 'fire' }, mods);
    const fireDice = player.dice.filter((d) => d.aura === 'fire');
    expect(fireDice.length).toBe(3);
  });

  test('BOSS_UPGRADE increases target miles in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'BOSS_UPGRADE', multiplier: 1.5 }, mods);
    player.trailEventModifiers = mods;
    game.startRound({ targetMiles: D(1000) });
    expect(game.config.targetMiles).toBeMiles(1500);
  });

  test('SCORE_MULTIPLIER increases target miles in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const mods = createEmptyModifiers();
    applyEffect({ type: 'SCORE_MULTIPLIER', multiplier: 1.5 }, mods);
    player.trailEventModifiers = mods;
    game.startRound({ targetMiles: D(1000) });
    expect(game.config.targetMiles).toBeMiles(1500);
  });

  test('FLAT_MILES_PENALTY still accumulates on modifiers (not wired to gameplay)', () => {
    resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'FLAT_MILES_PENALTY', amount: 10 }, mods);
    expect(mods.flatMilesPenalty).toBe(10);
  });

  test('SKIP_NEXT_SHOP sets flag on modifiers (consumed by UI layer)', () => {
    resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'SKIP_NEXT_SHOP' }, mods);
    expect(mods.skipNextShop).toBe(true);
  });

  test('LOSE_REROLLS_PER_DAY reduces rerolls in next round', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const perDay = 1;
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_REROLLS_PER_DAY', amount: perDay }, mods);
    expect(mods.rerollPenalty).toBe(GAMEPLAY.MAX_DAYS * perDay);
    player.trailEventModifiers = mods;
    game.startRound();
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - GAMEPLAY.MAX_DAYS * perDay);
  });
});

// ─── Outcome Resolution ───

describe('Outcome resolution', () => {
  test('resolveChoice with single outcome always picks it', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const event = getTrailEventById('bad_mosquitos')!;
    const result = resolveChoice(event, 'endure');
    expect(result.choiceId).toBe('endure');
    expect(result.outcomeIndex).toBe(0);
    expect(result.effects.length).toBeGreaterThan(0);
  });

  test('resolveChoice with multi-outcome uses rng', () => {
    const player = resetPlayerState();
    player.dice = diceWithValue(6, 20);
    const event = getTrailEventById('fallen_rocks')!;

    // Force first outcome (30% probability — rng < 0.3)
    const result1 = resolveChoice(event, 'risk', () => 0.1);
    expect(result1.outcomeIndex).toBe(0);

    // Force second outcome (70% probability — rng >= 0.3)
    const player2 = resetPlayerState();
    player2.dice = diceWithValue(6, 20);
    const result2 = resolveChoice(event, 'risk', () => 0.5);
    expect(result2.outcomeIndex).toBe(1);
  });

  test('resolveChoice throws for invalid choice', () => {
    resetPlayerState();
    const event = getTrailEventById('bad_mosquitos')!;
    expect(() => resolveChoice(event, 'nonexistent')).toThrow();
  });

  test('buildTrailEventResultFromResolvedDisplay rebuilds outcome without mutating state', () => {
    resetPlayerState();
    const event = getTrailEventById('bad_mosquitos')!;
    const live = resolveChoice(event, 'endure');
    const balanceAfter = getRunState().balance;

    const rebuilt = buildTrailEventResultFromResolvedDisplay(event, {
      choiceId: live.choiceId,
      outcomeIndex: live.outcomeIndex,
      gainedDiceIds: [],
      enhancedDiceBeforeCount: 0,
      equipmentCountBeforeResolve: 0,
      negatedNegativeEffects: live.negatedNegativeEffects,
      negationSource: live.negationSource,
      message: live.message,
    });

    expect(rebuilt.effects).toEqual(live.effects);
    expect(rebuilt.choiceId).toBe(live.choiceId);
    expect(rebuilt.outcomeIndex).toBe(live.outcomeIndex);
    expect(getRunState().balance).toBe(balanceAfter);
  });

  test('resolveChoice applies immediate money effects', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const event = getTrailEventById('caught_fish')!;
    resolveChoice(event, 'take');
    expect(player.economy.balance).toBe(24); // +$4
  });

  test('resolveChoice applies modifier effects', () => {
    resetPlayerState();
    const event = getTrailEventById('heavy_fog')!;
    const result = resolveChoice(event, 'endure');
    expect(result.modifiers.disableRerollDay1).toBe(true);
  });

  test('fellow_traveler trade sacrifice excludes equipment gained from the same choice', () => {
    const player = resetPlayerState();
    player.equipment = [item('horseshoe')];
    player.persistEquipment();
    const before = [...resolveEquipmentList()];
    const event = getTrailEventById('fellow_traveler')!;
    resolveChoice(event, 'trade', () => 0);
    const after = [...resolveEquipmentList()];
    expect(after.length).toBeGreaterThan(before.length);

    expect(after.length).toBe(before.length + 1);

    const eligible = filterEquipmentEligibleForTrailSacrifice(before, after);
    expect(eligible).toHaveLength(before.length);
    expect(eligible[0]?.def.id).toBe('horseshoe');
    expect(eligible.some((inst) => inst.def.id === after[after.length - 1]?.def.id)).toBe(false);
  });

  test('fellow_traveler trade grants equipment when inventory is full', () => {
    const player = resetPlayerState();
    player.maxEquipmentSlots = 2;
    player.equipment = [item('horseshoe'), item('war_drums')];
    player.persistEquipment();
    const diceBefore = player.dice.length;
    const event = getTrailEventById('fellow_traveler')!;
    resolveChoice(event, 'trade', () => 0.6);
    expect(player.equipment.length).toBe(3);
    expect(player.dice.length).toBe(diceBefore);
    expect(outcomeIncludesEquipmentTrade(event.choices[0]!.outcomes[1]!.effects)).toBe(true);
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
    resolveChoice(event, 'pay');
    // saint_elmos_shield should negate the money loss
    expect(player.economy.balance).toBe(20);
  });

  test('saint_elmos_shield allows positive effects through', () => {
    const player = resetPlayerState();
    player.economy.setBalance(5);
    player.equipment = [item('saint_elmos_shield')];

    const event = getTrailEventById('caught_fish')!;
    resolveChoice(event, 'take');
    expect(player.economy.balance).toBe(9); // +$4 still works
  });

  test('saint_elmos_shield negates day penalties', () => {
    const player = resetPlayerState();
    player.equipment = [item('saint_elmos_shield')];

    const event = getTrailEventById('lose_trail')!;
    const result = resolveChoice(event, 'wander');
    expect(result.modifiers.dayPenalty).toBe(0);
  });
});

// ─── Trail Repair Kit ───

describe('Trail Repair Kit interaction', () => {
  test('negates negative effects and gains x0.25 mult per event', () => {
    const player = resetPlayerState();
    const kit = item('trail_repair_kit');
    player.equipment = [kit];
    const gain = resolveEffectParam<number>(
      getEquipmentDefById('trail_repair_kit')!.effectParams,
      'xMultGainPerNegation',
    );
    expect(gain).toBe(0.25);

    const event = getTrailEventById('bad_mosquitos')!;
    const result = resolveChoice(event, 'endure');
    expect(result.modifiers.rerollPenalty).toBe(0);
    syncEquipmentInstances(kit);
    expect(kit.state.xMult).toBeCloseTo(1.25, 5);
  });

  test('does not gain xMult on positive-only events', () => {
    const player = resetPlayerState();
    const kit = item('trail_repair_kit');
    player.equipment = [kit];

    const event = getTrailEventById('caught_fish')!;
    resolveChoice(event, 'take');
    expect(kit.state.xMult ?? 1).toBe(1);
  });

  test('shield and repair kit still only add x0.25 mult gain once per event', () => {
    const player = resetPlayerState();
    const kit = item('trail_repair_kit');
    player.equipment = [item('saint_elmos_shield'), kit];
    const gain = resolveEffectParam<number>(
      getEquipmentDefById('trail_repair_kit')!.effectParams,
      'xMultGainPerNegation',
    );
    expect(gain).toBe(0.25);

    const event = getTrailEventById('lose_trail')!;
    resolveChoice(event, 'wander');
    syncEquipmentInstances(kit);
    expect(kit.state.xMult).toBeCloseTo(1.25, 5);
  });
});

// ─── Omen Stone (supply card) ───

describe('Omen Stone supply card', () => {
  test('blocks negative trail effects and consumes omen', () => {
    const player = resetPlayerState();
    runActions.patch({ statusTraitTokens: [{ id: 'omen_stone', copies: 1 }] });
    const event = getTrailEventById('bad_mosquitos')!;
    const result = resolveChoice(event, 'endure');
    expect(result.modifiers.rerollPenalty).toBe(0);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'omen_stone')).toBeUndefined();
    void player;
  });

  test('omen takes priority over trail repair kit — kit xMult unchanged', () => {
    const player = resetPlayerState();
    const kit = item('trail_repair_kit');
    player.equipment = [kit];
    pushEquipmentState(kit);
    runActions.patch({ statusTraitTokens: [{ id: 'omen_stone', copies: 1 }] });

    const event = getTrailEventById('bad_mosquitos')!;
    resolveChoice(event, 'endure');
    syncEquipmentInstances(kit);
    expect(kit.state.xMult ?? 1).toBe(1);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'omen_stone')).toBeUndefined();
  });
});

// ─── Scout's Spyglass ───

describe("Scout's Spyglass", () => {
  test('applySpyglassAvoid clears pending event without adding miles', () => {
    const player = resetPlayerState();
    const spyglass = item('scouts_spyglass');
    spyglass.state.miles = 5;
    player.equipment = [spyglass];
    player.pendingTrailEvent = getTrailEventById('bad_mosquitos')!;

    applySpyglassAvoid();
    expect(spyglass.state.miles).toBe(5);
    expect(player.pendingTrailEvent).toBeNull();
  });

  test('applySpyglassInvestigate adds investigate miles from item effectParams', () => {
    const player = resetPlayerState();
    const spyglass = item('scouts_spyglass');
    player.equipment = [spyglass];
    const expected = resolveEffectParam<number>(
      getEquipmentDefById('scouts_spyglass')!.effectParams,
      'investigateMiles',
    );

    applySpyglassInvestigate();
    expect(getScoutsSpyglassInvestigateMiles(getItemDisplayContext())).toBe(expected);
    syncEquipmentInstances(spyglass);
    expect(spyglass.state.miles).toBe(expected);
  });

  test('hasScoutsSpyglass detects equipped item', () => {
    const player = resetPlayerState();
    expect(hasScoutsSpyglass()).toBe(false);
    player.equipment = [item('scouts_spyglass')];
    expect(hasScoutsSpyglass()).toBe(true);
  });
});

// ─── Round Modifier Integration ───

describe('Round modifier integration', () => {
  test('modifiers are cleared after round starts', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });

    const dayPenalty = 2;
    const rerollPenalty = 1;
    player.trailEventModifiers.dayPenalty = dayPenalty;
    player.trailEventModifiers.rerollPenalty = rerollPenalty;
    player.trailEventModifiers.scoreMultiplier = 1.5;
    game.startRound({ targetMiles: D(1000) });

    // Verify effects were applied
    expect(game.config.maxDays).toBe(GAMEPLAY.MAX_DAYS - dayPenalty);
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - rerollPenalty);
    expect(game.config.targetMiles).toBeMiles(1500);

    // Verify modifiers are cleared after consumption
    expect(player.trailEventModifiers.dayPenalty).toBe(0);
    expect(player.trailEventModifiers.rerollPenalty).toBe(0);
    expect(player.trailEventModifiers.scoreMultiplier).toBe(1.0);
  });

  test('skipNextShop flag propagated via resolveChoice', () => {
    resetPlayerState();
    const event = getTrailEventById('native_guide')!;
    const result = resolveChoice(event, 'accept');
    expect(result.modifiers.skipNextShop).toBe(true);
  });

  test('startRound copies round-duration modifiers into trailRoundEffects', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    player.trailEventModifiers.moneyPerDayLoss = 3;
    player.trailEventModifiers.disableRerollDay1 = true;
    player.trailEventModifiers.scoredDiceDestroyChance = 0.25;
    game.startRound();

    expect(player.trailRoundEffects.moneyPerDayLoss).toBe(3);
    expect(player.trailRoundEffects.disableRerollDay1).toBe(true);
    expect(player.trailRoundEffects.scoredDiceDestroyChance).toBe(0.25);
    expect(player.trailEventModifiers.moneyPerDayLoss).toBe(0);
  });

  test('moneyPerDayLoss charges when advancing to next day', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    player.economy.setBalance(20);
    player.trailEventModifiers.moneyPerDayLoss = 3;
    game.startRound({ targetMiles: D(999_999) });

    const d1 = die({ id: 'pay_d1', value: 5 });
    const d2 = die({ id: 'pay_d2', value: 5 });
    game.state.phase = 'ROLL' as PhaseState;
    game.state.rolledDice = [d1, d2];
    game.selectForScore([d1.id, d2.id]);
    game.calculateScore();
    expect(game.state.phase).toBe('DAY_END');

    game.endDay();
    expect(player.economy.balance).toBe(17);
    expect(game.state.day).toBe(2);
  });

  test('disableRerollDay1 blocks rerolls on day 1 only', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    player.trailEventModifiers.disableRerollDay1 = true;
    game.startRound({ targetMiles: D(999_999) });

    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS);
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS);

    const d1 = die({ id: 'reroll_d1', value: 3 });
    const d2 = die({ id: 'reroll_d2', value: 4 });
    game.state.phase = 'ROLL' as PhaseState;
    game.state.rolledDice = [d1, d2];

    expect(game.canUseReroll()).toBe(false);
    expect(game.reroll([d1.id])).toBe(false);
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS);

    game.selectForScore([d1.id, d2.id]);
    game.calculateScore();
    game.endDay();
    expect(game.state.day).toBe(2);

    game.state.phase = 'ROLL' as PhaseState;
    game.state.rolledDice = [d1, d2];
    expect(game.canUseReroll()).toBe(true);
    expect(game.reroll([d1.id])).toBe(true);
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS - 1);
    expect(player.trailRoundEffects.disableRerollDay1).toBe(true);
  });

  test('heavy_fog endure does not remove round rerolls, only blocks day 1', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    const event = getTrailEventById('heavy_fog')!;
    const result = resolveChoice(event, 'endure');
    player.trailEventModifiers = result.modifiers;
    game.startRound({ targetMiles: D(999_999) });

    expect(player.trailRoundEffects.disableRerollDay1).toBe(true);
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS);
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS);
    expect(game.canUseReroll()).toBe(false);
  });

  test('standardDiceDay1 strips enhancement bonuses on day 1 only', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    player.trailEventModifiers.standardDiceDay1 = true;
    game.startRound({ targetMiles: D(999_999) });

    const wooden = die({ id: 'std_d1', value: 5, enhancement: 'wooden' });
    const plain = die({ id: 'std_d2', value: 5 });
    game.state.phase = 'ROLL' as PhaseState;
    game.state.rolledDice = [wooden, plain];
    game.state.day = 1;
    game.selectForScore([wooden.id, plain.id]);
    const day1 = game.calculateScore()!;
    expect(day1.totalValue).toBe(10);

    game.state.phase = 'ROLL' as PhaseState;
    game.state.rolledDice = [wooden, plain];
    game.state.day = 2;
    game.selectForScore([wooden.id, plain.id]);
    const day2 = game.calculateScore()!;
    expect(day2.totalValue).toBe(40);
  });

  test('diamond crack destroys scored diamond dice', () => {
    const diamond = die({ id: 'crack_d1', value: 6, enhancement: 'diamond' });
    const plain = die({ id: 'crack_d2', value: 6 });
    const { game, player } = setupGame({
      dice: [diamond, plain, ...diceWithValue(1, 48)],
    });
    game.startRound({ targetMiles: D(999_999) });

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      game.state.phase = 'ROLL';
      game.state.rolledDice = [diamond, plain];
      game.selectForScore([diamond.id, plain.id]);
      game.calculateScore();
    } finally {
      Math.random = originalRandom;
    }

    expect(player.dice.some((d) => d.id === 'crack_d1')).toBe(false);
  });

  test('scoredDiceDestroyChance destroys scored dice', () => {
    const { game, player } = setupGame({ dice: diceWithValue(6, 50) });
    player.trailEventModifiers.scoredDiceDestroyChance = 1;
    game.startRound({ targetMiles: D(999_999) });

    const d1 = die({ id: 'curse_d1', value: 5 });
    const d2 = die({ id: 'curse_d2', value: 5 });
    game.state.phase = 'ROLL';
    game.state.rolledDice = [d1, d2];
    game.selectForScore([d1.id, d2.id]);
    game.calculateScore();

    expect(player.dice.some((d) => d.id === 'curse_d1')).toBe(false);
    expect(player.dice.some((d) => d.id === 'curse_d2')).toBe(false);
  });

  test('getTrailDebuffLines formats active round penalties', () => {
    const lines = getTrailDebuffLines(
      trailRoundEffectsFromModifiers({
        ...createEmptyModifiers(),
        moneyPerDayLoss: 3,
        disableRerollDay1: true,
        scoredDiceDestroyChance: 0.25,
      }),
    );
    expect(lines).toContain('−$3/day');
    expect(lines).toContain('No rerolls on Day 1');
    expect(lines).toContain('25% scored dice destroyed');
  });

  test('getPlayerTrailDebuffLines shows pending modifiers before startRound', () => {
    const player = resetPlayerState();
    player.trailEventModifiers.diamondCrackDoubled = true;
    expect(player.trailRoundEffects.diamondCrackDoubled).toBe(false);
    const lines = getPlayerTrailDebuffLines();
    expect(lines).toContain('Diamond crack chance doubled');
  });

  test('getPlayerTrailDebuffLines prefers active round effects over pending', () => {
    const player = resetPlayerState();
    player.trailEventModifiers.luckyOddsHalved = true;
    player.trailRoundEffects.diamondCrackDoubled = true;
    const lines = getPlayerTrailDebuffLines();
    expect(lines).toContain('Diamond crack chance doubled');
    expect(lines).not.toContain('Lucky odds halved');
  });
});

// ─── Every Single Event Resolution ───

describe('Every trail event resolves without error', () => {
  const allEvents = getAllTrailEvents();

  for (const event of allEvents) {
    test(`${event.id}: resolves first available choice`, () => {
      const player = resetPlayerState();
      player.economy.setBalance(1000); // rich so money gates pass
      player.equipment = [item('trail_repair_kit')]; // has equipment
      player.dice = diceWithValue(6, 50); // plenty of dice

      // Add a supply card so medicine checks pass
      const supplyDef = getSupplyDefById('coffee_tin')!;
      player.consumables.push(createConsumableInstance(supplyDef));

      const choices = getAvailableChoices(event);
      expect(choices.length).toBeGreaterThanOrEqual(1);

      // Resolve the first available choice
      const result = resolveChoice(event, choices[0].id, () => 0.5);
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
        player.equipment = [item('trail_repair_kit'), item('saint_elmos_shield')];
        player.dice = diceWithValue(6, 50);

        const supplyDef = getSupplyDefById('coffee_tin')!;
        player.consumables.push(createConsumableInstance(supplyDef));
        player.consumables.push(createConsumableInstance(supplyDef));

        // Check if condition is met; skip if not meetable
        if (choice.condition) {
          const met = checkCondition(choice.condition);
          if (!met) return; // Can't test this choice in this setup
        }

        const result = resolveChoice(event, choice.id, () => 0.5);
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
    applyEffect({ type: 'LOSE_MONEY', amount: 10 }, mods);
    expect(player.economy.balance).toBe(0);
  });

  test('player with no dice handles LOSE_RANDOM_DICE gracefully', () => {
    const player = resetPlayerState();
    player.dice = [];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 5 }, mods);
    expect(player.dice.length).toBe(0);
  });

  test(`player with only standard dice loses ${TRAIL_EVENT.AMOUNT_PER_MISSING_DIE} per missing die from LOSE_RANDOM_DICE`, () => {
    const player = resetPlayerState();
    // Default pouch is all standard dice
    const initialCount = player.dice.length;
    player.economy.setBalance(50);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_DICE', count: 3 }, mods);
    expect(player.dice.length).toBe(initialCount);
    expect(player.economy.balance).toBe(50 - 3 * TRAIL_EVENT.AMOUNT_PER_MISSING_DIE);
  });

  test(`player with no equipment loses ${TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP} per missing equipment from LOSE_RANDOM_EQUIPMENT`, () => {
    const player = resetPlayerState();
    player.equipment = [];
    player.economy.setBalance(15);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_EQUIPMENT', count: 3 }, mods);
    expect(player.equipment.length).toBe(0);
    expect(player.economy.balance).toBe(15 - 3 * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP);
  });

  test(`LOSE_RANDOM_EQUIPMENT ${TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP} penalty can go negative`, () => {
    const player = resetPlayerState();
    player.equipment = [];
    player.economy.setBalance(2);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_RANDOM_EQUIPMENT', count: 1 }, mods);
    expect(player.economy.balance).toBe(2 - 1 * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP);
  });

  test(`LOSE_EQUIPMENT_CHOICE deducts ${TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP} per missing equipment`, () => {
    const player = resetPlayerState();
    player.equipment = [];
    player.economy.setBalance(30);
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_EQUIPMENT_CHOICE', count: 1 }, mods);
    expect(player.economy.balance).toBe(30 - 1 * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP);
  });

  test('player with no consumables handles LOSE_ALL_SUPPLY_CARDS gracefully', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_ALL_SUPPLY_CARDS' }, mods);
    expect(player.consumables.length).toBe(0);
  });

  test('player with no consumables handles USE_MEDICINE gracefully', () => {
    const player = resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'USE_MEDICINE' }, mods);
    expect(player.consumables.length).toBe(0);
  });

  test('DESTROY_EQUIPMENT with non-existent id does nothing', () => {
    const player = resetPlayerState();
    player.equipment = [item('trail_repair_kit')];
    const mods = createEmptyModifiers();
    applyEffect({ type: 'DESTROY_EQUIPMENT', id: 'nonexistent' }, mods);
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
    resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'LOSE_DAYS', amount: 1 }, mods);
    applyEffect({ type: 'LOSE_DAYS', amount: 2 }, mods);
    expect(mods.dayPenalty).toBe(3);
  });

  test('multiple BOSS_UPGRADE effects multiply', () => {
    resetPlayerState();
    const mods = createEmptyModifiers();
    applyEffect({ type: 'BOSS_UPGRADE', multiplier: 1.5 }, mods);
    applyEffect({ type: 'BOSS_UPGRADE', multiplier: 2.0 }, mods);
    expect(mods.bossUpgradeMultiplier).toBe(3.0);
  });
});
