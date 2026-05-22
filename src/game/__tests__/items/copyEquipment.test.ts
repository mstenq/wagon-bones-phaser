import { beforeEach, describe, expect, test } from 'bun:test';
import '../setup';
import { calculateTestScore, die, diceWithValue, item, itemWithState, setupGame, resetDieIds } from '../testHelpers';
import { processEndOfRound, processEquipmentOnHandPlayed, processEquipmentOnReroll, getScoredRetriggerCount, processEquipmentOnRoundStart, getConfigModifiers, processEquipmentAfterHandScored } from '../../EquipmentEffects';
import { HandType } from '../../types';
import { GAMEPLAY } from '../../Constants';

beforeEach(() => resetDieIds());

describe('COPY_RIGHT: Mirror Lake', () => {
  test('copies ADD_MULT from item to the right', () => {
    // Mirror Lake (left) copies Horseshoe (right) → +4 mult from Mirror Lake + +4 from Horseshoe = +8
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('horseshoe')],
    });
    // PAIR baseMult=1, +4 (mirror copies horseshoe) +4 (horseshoe) = 9
    expect(result.mult).toBe(9);
  });

  test('does nothing when it is the rightmost item', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('horseshoe'), item('mirror_lake')],
    });
    // PAIR baseMult=1, +4 (horseshoe) = 5, mirror lake has nothing to right
    expect(result.mult).toBe(5);
  });

  test('does not copy incompatible effect types', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('spare_holster')],
    });
    // PAIR baseMult=1, spare_holster is MODIFY_REROLLS (incompatible), mirror lake does nothing
    expect(result.mult).toBe(1);
  });

  test('copies HAND_MULT correctly', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2), // PAIR
      equipment: [item('mirror_lake'), item('wedding_ring')],
    });
    // PAIR baseMult=1, +8 (mirror copies wedding_ring) +8 (wedding_ring) = 17
    expect(result.mult).toBe(17);
  });

  test('copies xMult effects', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2), // PAIR
      equipment: [item('mirror_lake'), item('high_noon')],
      currentDay: 5,
      maxDays: 5,
    });
    // PAIR baseMult=1, final day: x3 from mirror lake copying high_noon, x3 from high_noon = x9
    expect(result.mult).toBe(9);
  });
});

describe('COPY_LEFTMOST: Echo Chamber', () => {
  test('copies the leftmost item ability', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('horseshoe'), item('dynamite'), item('echo_chamber')],
    });
    // PAIR baseMult=1, +4 (horseshoe) +15 (dynamite) +4 (echo copies horseshoe) = 24
    expect(result.mult).toBe(24);
  });

  test('does nothing when it is the leftmost item', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('echo_chamber'), item('horseshoe')],
    });
    // PAIR baseMult=1, +4 (horseshoe) = 5, echo chamber is at index 0, does nothing
    expect(result.mult).toBe(5);
  });

  test('does not copy incompatible effects', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('spare_holster'), item('horseshoe'), item('echo_chamber')],
    });
    // spare_holster is incompatible, echo chamber can't copy it
    // PAIR baseMult=1, +4 (horseshoe) = 5
    expect(result.mult).toBe(5);
  });

  test('copies xMult from leftmost', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2), // PAIR
      equipment: [item('high_noon'), item('horseshoe'), item('echo_chamber')],
      currentDay: 5,
      maxDays: 5,
    });
    // PAIR baseMult=1, +4 (horseshoe) = 5 mult
    // xMult: x3 (high_noon) x3 (echo copies high_noon) = x9
    // finalMult = 5 * 9 = 45
    expect(result.mult).toBe(45);
  });
});

describe('Mirror Lake + Echo Chamber interaction', () => {
  test('mirror lake copies echo chamber which copies leftmost - stops at loop limit', () => {
    // [mirror_lake, echo_chamber] — mirror looks right → echo_chamber
    // echo_chamber copies leftmost → mirror_lake (index 0)
    // mirror_lake is a copy item again → would look right → echo_chamber (already visited)
    // Resolves to null (loop detected)
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('echo_chamber')],
    });
    // Neither can resolve, PAIR baseMult=1
    expect(result.mult).toBe(1);
  });

  test('both resolve correctly with a real item present', () => {
    // [mirror_lake, horseshoe, echo_chamber]
    // mirror_lake copies right → horseshoe (+4)
    // echo_chamber copies leftmost → mirror_lake → resolves to horseshoe (+4)
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('horseshoe'), item('echo_chamber')],
    });
    // PAIR baseMult=1, +4 (mirror copies horseshoe) +4 (horseshoe) +4 (echo copies mirror→horseshoe) = 13
    expect(result.mult).toBe(13);
  });

  test('echo chamber at position 1 copies mirror lake at position 0', () => {
    // [mirror_lake, echo_chamber, horseshoe]
    // mirror_lake copies right → echo_chamber → copies leftmost → mirror_lake (visited!) → null
    // echo_chamber copies leftmost → mirror_lake → copies right → echo_chamber (visited!) → null
    // horseshoe: +4
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('echo_chamber'), item('horseshoe')],
    });
    // PAIR baseMult=1, +4 (horseshoe) = 5
    expect(result.mult).toBe(5);
  });

  test('mirror lake between two real items copies right', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('horseshoe'), item('mirror_lake'), item('dynamite')],
    });
    // PAIR baseMult=1, +4 (horseshoe) +15 (mirror copies dynamite) +15 (dynamite) = 35
    expect(result.mult).toBe(35);
  });
});

describe('Copy item edge cases — side effects', () => {
  test('mirror lake copying dynamite never self-destructs at end of round', () => {
    const equipment = [item('mirror_lake'), item('dynamite')];
    // Run processEndOfRound many times — mirror_lake should never be in destroyedIndices
    for (let i = 0; i < 100; i++) {
      const { destroyedIndices } = processEndOfRound(equipment);
      // Index 0 is mirror_lake — it should never be destroyed
      expect(destroyedIndices).not.toContain(0);
    }
  });

  test('echo chamber copying nitro never self-destructs at end of round', () => {
    const equipment = [item('nitro'), item('horseshoe'), item('echo_chamber')];
    for (let i = 0; i < 100; i++) {
      const { destroyedIndices } = processEndOfRound(equipment);
      // Index 2 is echo_chamber — it should never be destroyed
      expect(destroyedIndices).not.toContain(2);
    }
  });

  test('mirror lake copying stateful item does not mutate copy item state', () => {
    const mirrorLake = item('mirror_lake');
    const cardCounter = itemWithState('card_counter', { mult: 10 });
    const equipment = [mirrorLake, cardCounter];

    // processEquipmentOnHandPlayed should only update card_counter's state, not mirror_lake
    processEquipmentOnHandPlayed(equipment, HandType.TWO_PAIR);
    expect(mirrorLake.state.mult).toBeUndefined();
    expect(cardCounter.state.mult).toBe(12); // gained +2
  });

  test('mirror lake copying worn deck does not decay copy item on reroll', () => {
    const mirrorLake = item('mirror_lake');
    const wornDeck = itemWithState('worn_deck', { xMult: 2 });
    const equipment = [mirrorLake, wornDeck];

    processEquipmentOnReroll(equipment, 3);
    // Mirror lake should have no xMult state change
    expect(mirrorLake.state.xMult).toBeUndefined();
    // Worn Deck should have decayed: 2 - 0.01*3 = 1.97
    expect(wornDeck.state.xMult).toBeCloseTo(1.97);
  });

  test('mirror lake copying dynamite still provides the mult bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('dynamite')],
    });
    // PAIR baseMult=1, +15 (mirror copies dynamite) +15 (dynamite) = 31
    expect(result.mult).toBe(31);
  });

  test('echo chamber copying nitro still provides the xMult bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('nitro'), item('horseshoe'), item('echo_chamber')],
    });
    // PAIR baseMult=1, +4 (horseshoe) = 5
    // xMult: x3 (nitro) x3 (echo copies nitro) = x9
    // finalMult = 5 * 9 = 45
    expect(result.mult).toBe(45);
  });
});

describe('Copy item retrigger effects', () => {
  test('mirror lake copying war_drums adds retrigger count', () => {
    const warDrums = itemWithState('war_drums', { daysRemaining: 5 });
    const equipment = [item('mirror_lake'), warDrums];
    // mirror_lake copies war_drums → 2 retriggers total
    expect(getScoredRetriggerCount(equipment)).toBe(2);
  });

  test('echo chamber copying war_drums adds retrigger count', () => {
    const warDrums = itemWithState('war_drums', { daysRemaining: 5 });
    const equipment = [warDrums, item('horseshoe'), item('echo_chamber')];
    // echo_chamber copies war_drums → 2 retriggers total
    expect(getScoredRetriggerCount(equipment)).toBe(2);
  });

  test('copy item does not retrigger if target war_drums is expired', () => {
    const warDrums = itemWithState('war_drums', { daysRemaining: 0 });
    const equipment = [item('mirror_lake'), warDrums];
    // war_drums expired, mirror_lake resolves to it but daysRemaining=0 → no retriggers
    expect(getScoredRetriggerCount(equipment)).toBe(0);
  });

  test('mirror lake copying last_stand retriggers on final day', () => {
    const equipment = [item('mirror_lake'), item('last_stand')];
    // Both should trigger on final day
    expect(getScoredRetriggerCount(equipment, { currentDay: 5, maxDays: 5 })).toBe(2);
    // Neither on non-final day
    expect(getScoredRetriggerCount(equipment, { currentDay: 3, maxDays: 5 })).toBe(0);
  });

  test('mirror lake copying quick_draw retriggers first die', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('quick_draw')],
    });
    // PAIR: first die triggers 1 + 2 (quick_draw) + 2 (mirror copies quick_draw) = 5x
    // second die triggers 1x
    // totalValue = 5*5 + 5*1 = 30
    expect(result.totalValue).toBe(30);
  });

  test('echo chamber copying one_eyed_jack retriggers matching pip', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(1, 2),
      equipment: [item('one_eyed_jack'), item('horseshoe'), item('echo_chamber')],
    });
    // PAIR of 1s: each die triggers 1 + 1 (one_eyed_jack) + 1 (echo copies one_eyed_jack) = 3x
    // totalValue = 1*3 + 1*3 = 6
    expect(result.totalValue).toBe(6);
  });

  test('mirror lake copying war_drums actually retriggers dice in scoring', () => {
    const warDrums = itemWithState('war_drums', { daysRemaining: 5 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), warDrums],
    });
    // PAIR: each die triggers 1 + 1 (war_drums) + 1 (mirror copies war_drums) = 3x
    // totalValue = 5*3 + 5*3 = 30
    expect(result.totalValue).toBe(30);
  });
});

describe('Copy item round-start effects', () => {
  test('mirror lake copying hardtack gives +6 days total', () => {
    const equipment = [item('mirror_lake'), item('hardtack')];
    const result = processEquipmentOnRoundStart(equipment);
    // hardtack gives +3, mirror lake copies hardtack for another +3 = 6
    expect(result.daysBonus).toBe(6);
    expect(result.loseAllRerolls).toBe(true);
  });

  test('echo chamber copying hardtack gives +6 days total', () => {
    const equipment = [item('hardtack'), item('horseshoe'), item('echo_chamber')];
    const result = processEquipmentOnRoundStart(equipment);
    // hardtack gives +3, echo_chamber copies hardtack for another +3 = 6
    expect(result.daysBonus).toBe(6);
    expect(result.loseAllRerolls).toBe(true);
  });

  test('both mirror lake and echo chamber copying hardtack gives +9 days', () => {
    const equipment = [item('mirror_lake'), item('hardtack'), item('echo_chamber')];
    const result = processEquipmentOnRoundStart(equipment);
    // mirror_lake copies hardtack (+3), hardtack (+3), echo_chamber copies leftmost=mirror_lake→hardtack (+3) = 9
    expect(result.daysBonus).toBe(9);
    expect(result.loseAllRerolls).toBe(true);
  });

  test('mirror lake copying quarry_stone adds extra stone die', () => {
    const equipment = [item('mirror_lake'), item('quarry_stone')];
    const result = processEquipmentOnRoundStart(equipment);
    // quarry_stone adds 1, mirror copies it for another 1 = 2
    expect(result.stoneDiceToAdd).toBe(2);
  });

  test('mirror lake copying mystery_crate adds extra sticker die', () => {
    const equipment = [item('mirror_lake'), item('mystery_crate')];
    const result = processEquipmentOnRoundStart(equipment);
    expect(result.stickerDiceToAdd).toBe(2);
  });

  test('mirror lake copying haunted_totem does not trigger destruction', () => {
    const equipment = [item('mirror_lake'), itemWithState('haunted_totem', { xMult: 2 }), item('horseshoe')];
    const result = processEquipmentOnRoundStart(equipment);
    // haunted_totem should destroy one item, but mirror lake copying it should NOT destroy another
    expect(result.animatedDestructions.length).toBe(1);
  });

  test('mirror lake copying haunted_totem still gets xMult during scoring', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), itemWithState('haunted_totem', { xMult: 2 })],
    });
    // startRound bumps xMult from 2 to 2.5, then scoring: 1 * x2.5 (mirror) * x2.5 (totem) = 6.25
    expect(result.mult).toBe(6.25);
  });

  test('mirror lake copying funeral_pyre does not trigger destruction', () => {
    const equipment = [item('mirror_lake'), itemWithState('funeral_pyre', { mult: 6 }), item('horseshoe')];
    const result = processEquipmentOnRoundStart(equipment);
    // funeral_pyre destroys item to the right, but mirror lake copying it should NOT also destroy
    expect(result.animatedDestructions.length).toBe(1);
  });

  test('mirror lake copying funeral_pyre still gets +mult during scoring', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), itemWithState('funeral_pyre', { mult: 6 })],
    });
    // PAIR baseMult=1, mirror copies funeral_pyre (+6), funeral_pyre (+6) = 13
    // But startRound will trigger funeral_pyre destroying the item to its right (none here), so mult stays 6
    expect(result.mult).toBe(13);
  });

  test('mirror lake copying marked applies bank without incrementing marked streak on copy slot', () => {
    const marked = itemWithState('marked', { mult: 1 });
    const mirrorLake = item('mirror_lake');
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [mirrorLake, marked],
    });
    expect(mirrorLake.state.mult).toBeUndefined();
    expect(marked.state.mult).toBe(2);
    // PAIR base 1 + mirror(+2) + marked(+2)
    expect(result.mult).toBe(5);
  });

  test('mirror lake copies trail repair kit stateful xMult when stacked', () => {
    const kit = item('trail_repair_kit');
    kit.state.xMult = 1.75;
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), kit],
    });
    // PAIR baseMult 1; mirror copies kit x1.75, kit applies x1.75 (rounded per multiply)
    expect(result.mult).toBe(3.06);
  });
});

describe('Copy item first-day effects', () => {
  test('mirror lake copying bloodline creates 2 copies of scored die', () => {
    const { player } = calculateTestScore({
      scoredDice: diceWithValue(7, 1),
      equipment: [item('mirror_lake'), item('bloodline')],
      currentDay: 1,
    });
    // bloodline creates 1 copy, mirror_lake copying bloodline creates another = 2 new dice
    // player.dice includes original die (1) + 2 copies = 3 total with value 7
    const copies = player.dice.filter((d) => d.value === 7);
    expect(copies.length).toBe(3);
  });

  test('echo chamber copying bloodline creates 2 copies', () => {
    const { player } = calculateTestScore({
      scoredDice: diceWithValue(7, 1),
      equipment: [item('bloodline'), item('horseshoe'), item('echo_chamber')],
      currentDay: 1,
    });
    // original (1) + bloodline copy (1) + echo_chamber copy (1) = 3
    const copies = player.dice.filter((d) => d.value === 7);
    expect(copies.length).toBe(3);
  });

  test('copy item does not trigger bloodline on non-first day', () => {
    const { player } = calculateTestScore({
      scoredDice: diceWithValue(7, 1),
      equipment: [item('mirror_lake'), item('bloodline')],
      currentDay: 2,
    });
    // Only original die, no copies made (not first day)
    const copies = player.dice.filter((d) => d.value === 7);
    expect(copies.length).toBe(1);
  });

  test('copy item does not trigger bloodline with multiple scored dice', () => {
    const { player } = calculateTestScore({
      scoredDice: diceWithValue(7, 2),
      equipment: [item('mirror_lake'), item('bloodline')],
      currentDay: 1,
    });
    // Only original 2 dice, no copies made (not solo)
    const copies = player.dice.filter((d) => d.value === 7);
    expect(copies.length).toBe(2);
  });
});

// ─── EXPRESS_TRAIN copy behavior ───

describe('Mirror Lake copies EXPRESS_TRAIN', () => {
  test('copies +250 miles scoring bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('express_train')],
    });
    // PAIR base miles + 250 (mirror copies express) + 250 (express itself) = base + 500
    const { result: baseResult } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [],
    });
    expect(result.miles).toBe(baseResult.miles + 500);
  });

  test('does not apply -2 reroll penalty from copy', () => {
    const equipment = [item('mirror_lake'), item('express_train')];
    const mods = getConfigModifiers(equipment);
    // Only the real EXPRESS_TRAIN applies -2 rerolls, not the copy
    expect(mods.rerollsBonus).toBe(-2);
  });

  test('reflected in game config: only one -2 reroll penalty', () => {
    const { game } = setupGame({
      equipment: [item('mirror_lake'), item('express_train')],
    });
    game.startRound();
    // Only the original express train applies -2 rerolls
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS - 2);
  });
});

// ─── ROUND_START_SUPPLY copy behavior ───

describe('Mirror Lake copies ROUND_START_SUPPLY', () => {
  test('copy triggers supply card creation at round start', () => {
    const { game, player } = setupGame({
      equipment: [item('mirror_lake'), item('supply_drop')],
    });
    const consumablesBefore = player.consumables.length;
    game.startRound();
    // Both mirror lake (copying supply_drop) and supply_drop itself should add a card
    expect(player.consumables.length).toBe(consumablesBefore + 2);
  });

  test('does not exceed consumable slot limit', () => {
    const { game, player } = setupGame({
      equipment: [item('mirror_lake'), item('supply_drop')],
    });
    // Fill consumable slots
    player.maxConsumableSlots = 2;
    const { getRandomSupplyDef } = require('../../ConsumablesSystem');
    player.addConsumable(getRandomSupplyDef());
    player.addConsumable(getRandomSupplyDef());
    const consumablesBefore = player.consumables.length;
    game.startRound();
    // Already full, can't add more
    expect(player.consumables.length).toBe(consumablesBefore);
  });

  test('processEquipmentOnRoundStart returns correct supplyCardsToAdd count', () => {
    const equipment = [item('mirror_lake'), item('supply_drop')];
    const result = processEquipmentOnRoundStart(equipment);
    expect(result.supplyCardsToAdd).toBe(2);
  });
});

describe('Copy item HAND_UPGRADE_CHANCE (Surveyor\'s Transit)', () => {
  test('mirror lake copying surveyors_transit rolls upgrade chance', () => {
    const original = Math.random;
    Math.random = () => 0.1; // succeeds at 1 in 4
    try {
      const { player } = setupGame({
        equipment: [item('mirror_lake'), item('surveyors_transit')],
      });
      const levelBefore = player.getHandStats(HandType.PAIR).level;
      const upgrades = processEquipmentAfterHandScored(
        [item('mirror_lake'), item('surveyors_transit')],
        HandType.PAIR,
      );
      // Mirror Lake copy + Surveyor's Transit each roll independently
      expect(upgrades.length).toBe(2);
      expect(player.getHandStats(HandType.PAIR).level).toBe(levelBefore + 2);
    } finally {
      Math.random = original;
    }
  });

  test('echo chamber copying surveyors_transit rolls upgrade chance', () => {
    const original = Math.random;
    Math.random = () => 0.1;
    try {
      const { player } = setupGame({
        equipment: [item('surveyors_transit'), item('echo_chamber')],
      });
      const levelBefore = player.getHandStats(HandType.PAIR).level;
      const upgrades = processEquipmentAfterHandScored(
        [item('surveyors_transit'), item('echo_chamber')],
        HandType.PAIR,
      );
      // Echo Chamber copy + Surveyor's Transit each roll independently
      expect(upgrades.length).toBe(2);
      expect(player.getHandStats(HandType.PAIR).level).toBe(levelBefore + 2);
    } finally {
      Math.random = original;
    }
  });

  test('mirror lake and echo chamber both copying transit give multiple rolls', () => {
    let upgraded = 0;
    const runs = 2000;
    const equipment = [item('mirror_lake'), item('surveyors_transit'), item('echo_chamber')];

    for (let i = 0; i < runs; i++) {
      const { player } = setupGame({ equipment });
      const levelBefore = player.getHandStats(HandType.PAIR).level;
      const upgrades = processEquipmentAfterHandScored(equipment, HandType.PAIR);
      if (upgrades.length > 0) upgraded++;
      expect(player.getHandStats(HandType.PAIR).level).toBeGreaterThanOrEqual(levelBefore);
    }

    // 3 independent 1-in-4 rolls ≈ 58% per hand; 2000 runs should be well above 50%
    const rate = upgraded / runs;
    expect(rate).toBeGreaterThan(0.5);
  });
});

describe('Copy item per-die scoring effects', () => {
  test('mirror lake copies gold tooth money on scored gold dice', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('mirror_lake'), item('gold_tooth')],
      money: 10,
    });

    expect(player.economy.balance).toBe(18);
  });
});
