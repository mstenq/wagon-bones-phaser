import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import {
  die,
  diceWithValue,
  diceFromValues,
  item,
  itemWithState,
  calculateTestScore,
  setupGame,
  resetDieIds,
  pushEquipmentState,
  syncEquipmentInstances,
} from '../testHelpers';
import {
  processEquipmentOnLuckyTrigger,
  processEquipmentOnSell,
  processEquipmentOnBossDefeat,
  processEquipmentOnReroll,
  processEquipmentOnHandPlayed,
  processEquipmentAfterHandScored,
  processEquipmentOnRoundStart,
  processEquipmentOnDiceAdded,
  processEquipmentOnDiamondDestroyed,
  processEquipmentOnDiceDestroyed,
} from '../../EquipmentEffects';
import {
  executeConsumableEffect,
  createConsumableInstance,
  createTrailGuideConsumableDef,
} from '../../ConsumablesSystem';
import { Die, HandType } from '../../types';
import trailGuidesData from '../../../data/trail_guides';

beforeEach(() => resetDieIds());

// ─── LUCKY_TRIGGER_XMULT: Rabbit's Foot ───

describe("LUCKY_TRIGGER_XMULT: Rabbit's Foot", () => {
  test('starts at x1 (no bonus)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('rabbits_foot')],
    });
    // x1 means no change
    expect(result.mult).toBeMult(1);
  });

  test('gains x0.25 per lucky trigger', () => {
    const inst = item('rabbits_foot');
    // Simulate 2 lucky triggers
    processEquipmentOnLuckyTrigger([inst]);
    processEquipmentOnLuckyTrigger([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.5, 5);

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, x1.5 from rabbit's foot
    expect(result.mult).toBeMultCloseTo(1.5, 5);
  });

  test('accumulates over many triggers', () => {
    const inst = item('rabbits_foot');
    for (let i = 0; i < 4; i++) processEquipmentOnLuckyTrigger([inst]);
    // 1 + 4*0.25 = 2.0
    expect(inst.state.xMult).toBeCloseTo(2.0, 5);
  });
});

// ─── UNCOMMON_EQUIP_XMULT: Collector's Case ───

describe("UNCOMMON_EQUIP_XMULT: Collector's Case", () => {
  test('x1.5 per uncommon equipment', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('horseshoe'), item('collectors_case')],
    });
    // collectors_case: UNCOMMON_EQUIP_XMULT, horseshoe is common (0 uncommon)
    // 0 uncommon → no xMult bonus, horseshoe ADD_MULT +4
    // result.mult = (1 + 4) * 1 = 5
    expect(result.mult).toBeMultCloseTo(5, 5);
  });

  test('multiplies for each uncommon item', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('horseshoe'), item('horseshoe'), item('collectors_case')],
    });
    // 2 horseshoes (common) → 0 uncommon → no bonus from collectors_case
    // 2x ADD_MULT +4 = +8, result.mult = (1 + 8) * 1 = 9
    expect(result.mult).toBeMultCloseTo(9, 5);
  });

  test('no bonus with zero uncommon', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('collectors_case'), item('horseshoe')], // horseshoe is common
    });
    // baseMult=1, horseshoe: +4 = 5
    // 0 uncommon → no xMult
    expect(result.mult).toBeMult(5);
  });
});

// ─── DECAYING_XMULT: Worn Deck ───

describe('DECAYING_XMULT: Worn Deck', () => {
  test('starts at x2', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('worn_deck')],
    });
    // PAIR: baseMult=1, x2 = 2
    expect(result.mult).toBeMult(2);
  });

  test('loses x0.01 per die rerolled', () => {
    const inst = item('worn_deck');
    processEquipmentOnReroll([inst], 3); // reroll 3 dice
    expect(inst.state.xMult).toBeCloseTo(1.97, 5);
  });

  test('decays over many rerolls', () => {
    const inst = item('worn_deck');
    processEquipmentOnReroll([inst], 5);
    processEquipmentOnReroll([inst], 5);
    // 10 total dice rerolled: 2 - 10*0.01 = 1.90
    expect(inst.state.xMult).toBeCloseTo(1.9, 5);

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    expect(result.mult).toBeMultCloseTo(1.9, 5);
  });

  test('does not go below 0', () => {
    const inst = item('worn_deck');
    processEquipmentOnReroll([inst], 300); // way too many
    expect(inst.state.xMult).toBe(0);
  });
});

// ─── SELL_XMULT_GAIN: Snake Oil Ledger ───

describe('SELL_XMULT_GAIN: Snake Oil Ledger', () => {
  test('starts at x1 (no bonus)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('snake_oil_ledger')],
    });
    expect(result.mult).toBeMult(1);
  });

  test('gains x0.25 per sell', () => {
    const inst = item('snake_oil_ledger');
    processEquipmentOnSell([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.25, 5);

    processEquipmentOnSell([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.5, 5);
  });

  test('accumulated xMult applied during scoring', () => {
    const inst = item('snake_oil_ledger');
    inst.state.xMult = 2.0; // simulate 4 sells

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, x2.0 → 2.0
    expect(result.mult).toBeMultCloseTo(2.0, 5);
  });

  test('resets on boss defeat', () => {
    const inst = item('snake_oil_ledger');
    processEquipmentOnSell([inst]);
    processEquipmentOnSell([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.5, 5);

    processEquipmentOnBossDefeat([inst]);
    expect(inst.state.xMult).toBe(1);
  });

  test('resets via advanceRound after winning boss round', () => {
    const player = setupGame({
      equipment: [item('snake_oil_ledger')],
    }).player;
    player.round = 3;
    processEquipmentOnSell(player.equipment);
    expect(player.equipment[0].state.xMult).toBeCloseTo(1.25, 5);

    player.advanceRound();
    expect(player.round).toBe(1);
    expect(player.leg).toBe(2);
    expect(player.equipment[0].state.xMult).toBe(1);
  });

  test('gains x0.25 when selling consumables', () => {
    const inst = item('snake_oil_ledger');
    // Selling consumables also triggers the sell hook
    processEquipmentOnSell([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.25, 5);

    processEquipmentOnSell([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.5, 5);
  });
});

// ─── FINAL_DAY_XMULT: High Noon ───

describe('FINAL_DAY_XMULT: High Noon', () => {
  test('x3 mult on final day', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('high_noon')],
      currentDay: 4,
      maxDays: 4,
    });
    // PAIR: baseMult=1, x3 on final day
    expect(result.mult).toBeMult(3);
  });

  test('no bonus on non-final day', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('high_noon')],
      currentDay: 2,
      maxDays: 4,
    });
    expect(result.mult).toBeMult(1);
  });

  test('works when maxDays is 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('high_noon')],
      currentDay: 1,
      maxDays: 1,
    });
    expect(result.mult).toBeMult(3);
  });
});

// ─── EVERY_NTH_HAND_XMULT: Six Shooter ───

describe('EVERY_NTH_HAND_XMULT: Six Shooter', () => {
  test('does not trigger before 6th hand', () => {
    const sixShooter = itemWithState('six_shooter', { handsPlayed: 4 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [sixShooter],
    });
    // PAIR: baseMult=1, no x4 since handsPlayed=4 (not multiple of 6)
    expect(result.mult).toBeMult(1);
  });

  test('triggers x4 when handsPlayed is multiple of 6', () => {
    const sixShooter = itemWithState('six_shooter', { handsPlayed: 5 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [sixShooter],
    });
    // PAIR: baseMult=1, x4 because handsPlayed increments to 6 before scoring, 6%6===0
    expect(result.mult).toBeMult(4);
  });

  test('triggers x4 at 12 hands played', () => {
    const sixShooter = itemWithState('six_shooter', { handsPlayed: 11 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [sixShooter],
    });
    // increments to 12, 12%6===0 → x4
    expect(result.mult).toBeMult(4);
  });

  test('increments handsPlayed on processEquipmentOnHandPlayed', () => {
    const sixShooter = itemWithState('six_shooter', { handsPlayed: 0 });
    processEquipmentOnHandPlayed([sixShooter], HandType.PAIR);
    expect(sixShooter.state.handsPlayed).toBe(1);
    processEquipmentOnHandPlayed([sixShooter], HandType.PAIR);
    expect(sixShooter.state.handsPlayed).toBe(2);
  });
});

// ─── ENHANCEMENT_COUNT_XMULT: Iron Furnace ───

describe('ENHANCEMENT_COUNT_XMULT: Iron Furnace', () => {
  test('gives xMult based on steel dice in collection, not scored dice', () => {
    // Steel dice in collection but NOT rolled — only scored dice are plain
    const scoredDice = diceWithValue(5, 2);
    const steelInCollection = [
      die({ value: 3, enhancement: 'steel' }),
      die({ value: 4, enhancement: 'steel' }),
      die({ value: 6, enhancement: 'steel' }),
    ];

    const { game } = setupGame({
      equipment: [item('iron_furnace')],
      dice: [...scoredDice, ...steelInCollection, ...diceWithValue(1, 50)],
    });

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice; // only plain dice rolled
    game.state.selectedForRoll = scoredDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    // PAIR: baseMult=1
    // 3 steel dice in collection → x(1 + 3*0.2) = x1.6
    expect(result.mult).toBeMultCloseTo(1.6);
  });

  test('no xMult when no steel dice in collection', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('iron_furnace')],
    });
    // No steel dice anywhere → x1 (no bonus)
    expect(result.mult).toBeMult(1);
  });

  test('scales with more steel dice in collection', () => {
    const scoredDice = diceWithValue(5, 2);
    const steelInCollection = Array.from({ length: 5 }, (_, i) => die({ value: i + 1, enhancement: 'steel' }));

    const { game } = setupGame({
      equipment: [item('iron_furnace')],
      dice: [...scoredDice, ...steelInCollection, ...diceWithValue(1, 50)],
    });

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    // PAIR: baseMult=1
    // 5 steel dice in collection → x(1 + 5*0.2) = x2.0
    expect(result.mult).toBeMultCloseTo(2.0);
  });
});

// ─── TRAIL_GUIDE_XMULT: Guide Lantern ───

describe('TRAIL_GUIDE_XMULT: Guide Lantern', () => {
  test('starts at x1 (no bonus)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('guide_lantern')],
    });
    expect(result.mult).toBeMult(1);
  });

  test('gains x0.1 when a trail guide is used', () => {
    const { player } = setupGame({ equipment: [item('guide_lantern')] });
    const tgDef = createTrailGuideConsumableDef(trailGuidesData[0]);
    const consumed = createConsumableInstance(tgDef);
    executeConsumableEffect(consumed);

    const lantern = player.equipment.find((e) => e.def.id === 'guide_lantern')!;
    expect(lantern.state.xMult).toBeCloseTo(1.1, 5);
  });

  test('accumulated xMult applies during scoring', () => {
    const inst = item('guide_lantern');
    inst.state.xMult = 1.3;
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    expect(result.mult).toBeMultCloseTo(1.3, 5);
  });

  test('scout gains x0.2 per trail guide used', () => {
    const { player } = setupGame({ equipment: [item('guide_lantern')], profession: 'scout' });
    const tgDef = createTrailGuideConsumableDef(trailGuidesData[0]);
    const consumed = createConsumableInstance(tgDef);
    executeConsumableEffect(consumed);

    const lantern = player.equipment.find((e) => e.def.id === 'guide_lantern')!;
    expect(lantern.state.xMult).toBeCloseTo(1.2, 5);
  });
});

// ─── XMULT_RISKY: Nitro ───

describe('XMULT_RISKY: Nitro', () => {
  test('applies x3 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('nitro')],
    });
    // PAIR: baseMult=1, x3 from nitro = 3
    expect(result.mult).toBeMult(3);
  });

  test('stacks multiplicatively with other xMult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('nitro'), item('horseshoe')],
    });
    // PAIR: baseMult=1, +4 from horseshoe = 5, x3 from nitro = 15
    expect(result.mult).toBeMult(15);
  });
});

// ─── REPEAT_HAND_XMULT: Repeat Offender ───

describe('REPEAT_HAND_XMULT: Repeat Offender', () => {
  test('does NOT activate on first play of a hand type', () => {
    const inst = item('repeat_offender');
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR first time: no x3
    expect(result.mult).toBeMult(1);
  });

  test('activates x3 on second play of same hand type this round', () => {
    const inst = item('repeat_offender');
    const { game } = setupGame({ equipment: [inst] });

    game.startRound();
    // Simulate a prior PAIR play this round (after round start reset)
    inst.state['round_PAIR'] = 1;
    pushEquipmentState(inst);

    game.state.phase = 'ROLL';
    const dice = diceWithValue(5, 2);
    game.state.rolledDice = dice;
    game.state.selectedForRoll = dice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(dice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMult=1, x3 from repeat offender = 3
    expect(result.mult).toBeMult(3);
  });

  test('does NOT activate for different hand types', () => {
    const inst = item('repeat_offender');
    const { game } = setupGame({ equipment: [inst] });

    game.startRound();
    // Simulate a prior PAIR play this round
    inst.state['round_PAIR'] = 1;

    // Play a THREE_OF_A_KIND — should not activate
    game.state.phase = 'ROLL';
    const dice = diceWithValue(5, 3);
    game.state.rolledDice = dice;
    game.state.selectedForRoll = dice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(dice.map((d) => d.id));
    const result = game.calculateScore()!;
    expect(result.mult).toBeMult(3); // THREE_OF_A_KIND baseMult=3, no x3
  });

  test('resets on new round', () => {
    const inst = item('repeat_offender');
    setupGame({ equipment: [inst] });

    // Play a PAIR
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(inst.state['round_PAIR']).toBe(1);

    // New round resets
    processEquipmentOnRoundStart([inst]);
    expect(inst.state['round_PAIR']).toBeUndefined();
  });
});

// ─── STATEFUL_XMULT (gainOnDiceAdded): New Blood ───

describe('STATEFUL_XMULT: New Blood', () => {
  test('starts at x1 (no bonus)', () => {
    const inst = item('new_blood');
    expect(inst.state.xMult).toBe(1);
  });

  test('gains x0.25 when a die is added', () => {
    const inst = item('new_blood');
    processEquipmentOnDiceAdded([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.25, 5);
  });

  test('accumulates across multiple dice additions', () => {
    const inst = item('new_blood');
    processEquipmentOnDiceAdded([inst]);
    processEquipmentOnDiceAdded([inst]);
    processEquipmentOnDiceAdded([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.75, 5);
  });

  test('accumulated xMult applies during scoring', () => {
    const inst = itemWithState('new_blood', { xMult: 2 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, x2 from new blood = 2
    expect(result.mult).toBeMult(2);
  });

  test('integrates with player addDie', () => {
    const inst = item('new_blood');
    const { player } = setupGame({ equipment: [inst] });
    player.addDie({ id: '', value: 5, enhancement: null, sticker: null, aura: null, bonusMiles: 0 });
    syncEquipmentInstances(inst);
    expect(inst.state.xMult).toBeCloseTo(1.25, 5);
  });
});

// ─── EMPTY_SLOT_XMULT: One-Man Posse ───

describe('EMPTY_SLOT_XMULT: One-Man Posse', () => {
  test('x1 per empty slot (with 3 empty)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('one_man_posse')],
    });
    // Default maxEquipmentSlots=5, usedSlots=1 (one_man_posse), empty=4
    // PAIR: baseMult=1, x(1+4)=x5
    expect(result.mult).toBeMult(5);
  });

  test('no bonus when all slots full', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('one_man_posse'), item('horseshoe'), item('horseshoe'), item('horseshoe'), item('horseshoe')],
    });
    // maxEquipmentSlots=5, usedSlots=5, empty=0
    // PAIR: baseMult=1, +4+4+4+4=17 from horseshoes, x1 from posse (no empty)
    expect(result.mult).toBeMult(17);
  });
});

// ─── ROUNDS_SKIPPED_XMULT: Shortcut Trail ───

describe('ROUNDS_SKIPPED_XMULT: Shortcut Trail', () => {
  test('no bonus when no rounds skipped (initial state)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('shortcut_trail')],
    });
    // No rounds skipped → no bonus
    expect(result.mult).toBeMult(1);
  });

  test('activates based on roundsSkipped state', () => {
    const inst = itemWithState('shortcut_trail', { roundsSkipped: 2 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, x(1+2*0.25)=x1.5
    expect(result.mult).toBeMultCloseTo(1.5, 5);
  });
});

// ─── DIAMOND_DESTROYED_XMULT: Diamond Coffin ───

describe('DIAMOND_DESTROYED_XMULT: Diamond Coffin', () => {
  test('starts at x1', () => {
    const inst = item('diamond_coffin');
    expect(inst.state.xMult).toBe(1);
  });

  test('gains x0.75 per diamond destroyed', () => {
    const inst = item('diamond_coffin');
    processEquipmentOnDiamondDestroyed([inst]);
    expect(inst.state.xMult).toBeCloseTo(1.75, 5);
    processEquipmentOnDiamondDestroyed([inst]);
    expect(inst.state.xMult).toBeCloseTo(2.5, 5);
  });

  test('accumulated xMult applies during scoring', () => {
    const inst = itemWithState('diamond_coffin', { xMult: 2.5 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, x2.5
    expect(result.mult).toBeMultCloseTo(2.5, 5);
  });
});

// ─── RAINBOW_TRAIL_XMULT: Rainbow Trail ───

describe('RAINBOW_TRAIL_XMULT: Rainbow Trail', () => {
  test('x2 with 2 different enhancement types scored', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5, enhancement: 'wooden' })],
      equipment: [item('rainbow_trail')],
    });
    // PAIR: baseMult=1+4(bone) = 5, x2 from rainbow trail
    expect(result.mult).toBeMult(10);
  });

  test('x3 with 3 different enhancement types scored', () => {
    const { result } = calculateTestScore({
      scoredDice: [
        die({ value: 5, enhancement: 'bone' }),
        die({ value: 5, enhancement: 'wooden' }),
        die({ value: 5, enhancement: 'steel' }),
      ],
      equipment: [item('rainbow_trail')],
    });
    // THREE_OF_A_KIND: baseMult=3+4(bone) = 7, x3 from rainbow trail
    expect(result.mult).toBeMult(21);
  });

  test('no bonus with only 1 enhancement type', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5, enhancement: 'bone' })],
      equipment: [item('rainbow_trail')],
    });
    // PAIR: baseMult=1+4+4(bone)=9, no rainbow bonus (only 1 type)
    expect(result.mult).toBeMult(9);
  });

  test('no bonus with no enhanced dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('rainbow_trail')],
    });
    // PAIR: baseMult=1, no bonus
    expect(result.mult).toBeMult(1);
  });
});

// ─── HAND_CONTAINS_XMULT: Hitched Pair ───

describe('HAND_CONTAINS_XMULT: Hitched Pair (pair, x2)', () => {
  test('activates on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('hitched_pair')],
    });
    // PAIR: baseMult=1, x2 = 2
    expect(result.mult).toBeMult(2);
  });

  test('activates on full house (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 3), ...diceWithValue(7, 2)],
      equipment: [item('hitched_pair')],
    });
    // FULL_HOUSE: baseMult=4, x2 = 8
    expect(result.mult).toBeMult(8);
  });

  test('does not activate on straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([4, 5, 6, 7]),
      equipment: [item('hitched_pair')],
    });
    // FOUR_STRAIGHT: baseMult=2, no pair → no xMult
    expect(result.mult).toBeMult(2);
  });
});

// ─── HAND_CONTAINS_XMULT: Hat Trick ───

describe('HAND_CONTAINS_XMULT: Hat Trick (3oak, x3)', () => {
  test('activates on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('hat_trick')],
    });
    // THREE_OF_A_KIND: baseMult=3, x3 = 9
    expect(result.mult).toBeMult(9);
  });

  test('activates on four of a kind (contains 3oak)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 4),
      equipment: [item('hat_trick')],
    });
    // FOUR_OF_A_KIND: baseMult=5, x3 = 15
    expect(result.mult).toBeMult(15);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('hat_trick')],
    });
    // PAIR: baseMult=1, no 3oak → no xMult
    expect(result.mult).toBeMult(1);
  });
});

// ─── HAND_CONTAINS_XMULT: Posse Wagon ───

describe('HAND_CONTAINS_XMULT: Posse Wagon (4oak, x4)', () => {
  test('activates on four of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 4),
      equipment: [item('posse_wagon')],
    });
    // FOUR_OF_A_KIND: baseMult=5, x4 = 20
    expect(result.mult).toBeMult(20);
  });

  test('does not activate on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('posse_wagon')],
    });
    // THREE_OF_A_KIND: baseMult=3, no 4oak → no xMult
    expect(result.mult).toBeMult(3);
  });
});

// ─── HAND_CONTAINS_XMULT: Five Finger Fillet ───

describe('HAND_CONTAINS_XMULT: Five Finger Fillet (5oak, x5)', () => {
  test('activates on five of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 5),
      equipment: [item('five_finger_fillet')],
    });
    // FIVE_OF_A_KIND: baseMult=6, x5 = 30
    expect(result.mult).toBeMult(30);
  });

  test('does not activate on four of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 4),
      equipment: [item('five_finger_fillet')],
    });
    // FOUR_OF_A_KIND: baseMult=5, no 5oak → no xMult
    expect(result.mult).toBeMult(5);
  });
});

// ─── HAND_CONTAINS_XMULT: Snake River ───

describe('HAND_CONTAINS_XMULT: Snake River (5 straight, x3)', () => {
  test('activates on 5 straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([3, 4, 5, 6, 7]),
      equipment: [item('snake_river')],
    });
    // FIVE_STRAIGHT: baseMult=4, x3 = 12
    expect(result.mult).toBeMult(12);
  });

  test('does not activate on 4 straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([4, 5, 6, 7]),
      equipment: [item('snake_river')],
    });
    // FOUR_STRAIGHT: baseMult=2, no 5 straight → no xMult
    expect(result.mult).toBeMult(2);
  });
});

// ─── ENHANCED_DICE_COUNT_XMULT: Blessed Herd ───

describe('ENHANCED_DICE_COUNT_XMULT: Blessed Herd', () => {
  test('activates x3 when 16+ enhanced dice in collection', () => {
    const scoredDice = diceWithValue(5, 2);
    const enhancedDice = Array.from({ length: 16 }, (_, i) => die({ value: (i % 12) + 1, enhancement: 'wooden' }));

    const { game } = setupGame({
      equipment: [item('blessed_herd')],
      dice: [...scoredDice, ...enhancedDice, ...diceWithValue(1, 10)],
    });

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    // PAIR: baseMult=1, x3 from blessed herd
    expect(result.mult).toBeMult(3);
  });

  test('does not activate when fewer than 16 enhanced dice', () => {
    const scoredDice = diceWithValue(5, 2);
    const enhancedDice = Array.from({ length: 10 }, (_, i) => die({ value: (i % 12) + 1, enhancement: 'wooden' }));

    const { game } = setupGame({
      equipment: [item('blessed_herd')],
      dice: [...scoredDice, ...enhancedDice, ...diceWithValue(1, 20)],
    });

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    // PAIR: baseMult=1, no x3 (only 10 enhanced)
    expect(result.mult).toBeMult(1);
  });
});

// ─── GRAVEROBBER_XMULT: Graverobber ───

describe('GRAVEROBBER_XMULT: Graverobber', () => {
  test('gains xMult per enhanced dice scored and removes enhancement', () => {
    const woodenDie = die({ value: 5, enhancement: 'wooden' });
    const steelDie = die({ value: 5, enhancement: 'steel' });
    const inst = item('graverobber');

    const { player } = calculateTestScore({
      scoredDice: [woodenDie, steelDie],
      equipment: [inst],
    });

    // Should have gained x0.1 per enhanced die = 1 + 0.2 = 1.2
    expect(inst.state.xMult).toBeCloseTo(1.2, 5);
    // Enhancements should be removed from scored dice
    expect(woodenDie.enhancement).toBeNull();
    expect(steelDie.enhancement).toBeNull();
    // Enhancements should also be removed from pouch dice
    const pouchWooden = player.dice.find((d: Die) => d.id === woodenDie.id)!;
    const pouchSteel = player.dice.find((d: Die) => d.id === steelDie.id)!;
    expect(pouchWooden.enhancement).toBeNull();
    expect(pouchSteel.enhancement).toBeNull();
  });

  test('strips enhancement BEFORE scoring so bone mult is not applied', () => {
    const boneDie = die({ value: 5, enhancement: 'bone' });
    const inst = item('graverobber');

    const { result } = calculateTestScore({
      scoredDice: [boneDie, die({ value: 5 })],
      equipment: [inst],
    });

    // PAIR: baseMult=1, bone would add +4 mult but graverobber strips it first
    // Graverobber gains x0.1 for the bone die → xMult = 1.1
    // Final mult: baseMult(1) * xMult(1.1) = 1.1 (no +4 from bone)
    expect(result.mult).toBeMultCloseTo(1.1, 5);
    expect(inst.state.xMult).toBeCloseTo(1.1, 5);
  });

  test('strips enhancement BEFORE scoring so wooden miles are not applied', () => {
    const woodenDie = die({ value: 5, enhancement: 'wooden' });
    const plainDie = die({ value: 5 });
    const inst = item('graverobber');

    const { result } = calculateTestScore({
      scoredDice: [woodenDie, plainDie],
      equipment: [inst],
    });

    // PAIR base miles = 10, die values = 5 + 5 = 10, total value = 20
    // Wooden would add +30 miles but graverobber strips it first
    // Graverobber gains x0.1 → xMult = 1.1
    // Final miles = 20 * (1 * 1.1) = 22 (no +30 from wooden, but xMult applies)
    // Without graverobber, wooden would give: (10 + 10 + 30) * 1 = 50
    expect(result.miles).toBeMilesCloseTo(22, 5);
  });

  test('stripping stone to standard rolls a face value', () => {
    const stoneDie = die({ value: 0, enhancement: 'stone' });
    const inst = item('graverobber');

    calculateTestScore({
      scoredDice: [stoneDie, die({ value: 5 })],
      equipment: [inst],
    });

    expect(stoneDie.enhancement).toBeNull();
    expect(stoneDie.value).toBeGreaterThanOrEqual(1);
    expect(stoneDie.value).toBeLessThanOrEqual(12);
  });

  test('does not gain xMult from non-enhanced dice', () => {
    const inst = item('graverobber');
    calculateTestScore({
      scoredDice: diceWithValue(5, 2), // plain dice
      equipment: [inst],
    });
    expect(inst.state.xMult).toBe(1);
  });

  test('accumulated xMult applies to scoring', () => {
    const inst = itemWithState('graverobber', { xMult: 2.0 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, x2.0 from graverobber
    expect(result.mult).toBeMultCloseTo(2.0, 5);
  });
});

// ─── TRAILBLAZER_XMULT: Trailblazer ───

describe('TRAILBLAZER_XMULT: Trailblazer', () => {
  test('gains x0.2 per consecutive off-meta hand', () => {
    const inst = item('trailblazer');
    const scoredDice = diceWithValue(7, 3);
    const { game, player } = setupGame({
      equipment: [inst],
      dice: [...scoredDice, ...diceWithValue(1, 10)],
    });
    player.recordHandPlayed(HandType.PAIR);
    player.recordHandPlayed(HandType.PAIR);
    player.recordHandPlayed(HandType.PAIR);

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    // THREE_OF_A_KIND baseMult=3, streak 1 → x1.2 → 3.6
    expect(result.mult).toBeMultCloseTo(3.6, 5);
  });

  test('resets streak when playing most-played hand', () => {
    const inst = item('trailblazer');
    const { player } = setupGame({ equipment: [inst] });
    player.recordHandPlayed(HandType.PAIR);
    processEquipmentOnHandPlayed([inst], HandType.THREE_OF_A_KIND);
    processEquipmentOnHandPlayed([inst], HandType.PAIR);

    expect(inst.state.streak).toBe(0);
  });
});

// ─── CONSECUTIVE_PIP_XMULT: Eight Second Ride ───

describe('CONSECUTIVE_PIP_XMULT: Eight Second Ride', () => {
  test('escalates xMult for consecutive scored 8s', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 8 }), die({ value: 8 }), die({ value: 8 })],
      equipment: [item('eight_second_ride')],
    });
    // THREE_OF_A_KIND: baseMult=3, x1 * x1.5 * x2 = x3 → 9
    expect(result.mult).toBeMultCloseTo(9, 5);
  });
});

// ─── ENHANCED_DESTROYED_XMULT: Book of the Dead ───

describe('ENHANCED_DESTROYED_XMULT: Book of the Dead', () => {
  test('gains x1 per destroyed enhanced die', () => {
    const inst = item('book_of_the_dead');
    const { player } = setupGame({ equipment: [inst] });
    const enhanced = die({ value: 4, enhancement: 'wooden' });
    player.dice = [enhanced, die({ value: 5 })];

    processEquipmentOnDiceDestroyed([inst], 1, 1);

    expect(inst.state.xMult).toBe(2);
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    expect(result.mult).toBeMultCloseTo(2, 5);
  });

  test('does not gain xMult from standard die destruction', () => {
    const inst = item('book_of_the_dead');
    processEquipmentOnDiceDestroyed([inst], 1, 0);
    expect(inst.state.xMult).toBe(1);
  });
});

// ─── PIP_XMULT: The Devil's Hand ───

describe("PIP_XMULT: The Devil's Hand", () => {
  test('x2 mult per scored 6', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 6 }), die({ value: 6 }), die({ value: 5 })],
      equipment: [item('devils_hand')],
    });
    // PAIR: baseMult=1, two scored 6s → x2 * x2 = x4
    expect(result.mult).toBeMultCloseTo(4, 5);
  });
});

// ─── REROLL_COUNT_XMULT: The 23rd Psalm ───

describe('REROLL_COUNT_XMULT: The 23rd Psalm', () => {
  test('gains x1 mult every 23 dice rerolled', () => {
    const inst = item('twenty_third_psalm');
    processEquipmentOnReroll([inst], 23);
    expect(inst.state.xMult).toBe(2);
    expect(inst.state.rerollsTotal).toBe(23);

    processEquipmentOnReroll([inst], 23);
    expect(inst.state.xMult).toBe(3);
    expect(inst.state.rerollsTotal).toBe(46);
  });

  test('applies accumulated xMult when scoring', () => {
    const inst = item('twenty_third_psalm');
    processEquipmentOnReroll([inst], 46);
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    expect(result.mult).toBeMultCloseTo(3, 5);
  });
});
