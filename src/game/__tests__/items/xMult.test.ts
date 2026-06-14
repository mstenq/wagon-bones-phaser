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
  seedTestRoll,
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
  processEndOfRound,
  processEquipmentOnDayEnd,
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

  test('lucky mult proc updates state through calculateScore (not manual lifecycle dispatch)', () => {
    const rabbits = item('rabbits_foot');
    const { result, player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'lucky' })],
      equipment: [rabbits],
      runSeed: 'lucky-score-0',
    });
    const live = player.equipment.find((e) => e.def.id === 'rabbits_foot')!;
    expect(live.state.xMult).toBeCloseTo(1.25, 5);
    // scoreHand mult 21 (lucky +20) * rabbits x1.25
    expect(result.mult).toBeMultCloseTo(26.25, 5);
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

  test('Mirror Lake doubles xMult on final day', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('high_noon')],
      currentDay: 4,
      maxDays: 4,
    });
    // PAIR baseMult=1, x3 from mirror copying high_noon, x3 from high_noon = x9
    expect(result.mult).toBeMult(9);
  });
});

describe('New xMult equipment', () => {
  test('silver reserve scales with money chunks', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('silver_reserve')],
      money: 50,
    });
    expect(result.mult).toBeMultCloseTo(1.8, 5);
  });

  test('Mirror Lake doubles xMult from money chunks', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('silver_reserve')],
      money: 50,
    });
    expect(result.mult).toBeMultCloseTo(3.24, 5);
  });

  test('split trail requires odd and even scored values', () => {
    const active = calculateTestScore({
      scoredDice: [die({ value: 1 }), die({ value: 2 }), die({ value: 3 }), die({ value: 4 })],
      equipment: [item('split_trail')],
    }).result;
    const inactive = calculateTestScore({
      scoredDice: [die({ value: 1 }), die({ value: 3 }), die({ value: 5 }), die({ value: 7 })],
      equipment: [item('split_trail')],
    }).result;
    // 1-2-3-4 is FOUR_STRAIGHT (base mult 2), then Split Trail applies x2.5 => 5
    expect(active.mult).toBeMultCloseTo(5, 5);
    expect(inactive.mult).toBeMult(1);
  });

  test('Mirror Lake doubles xMult when odd and even scored values', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 1 }), die({ value: 2 }), die({ value: 3 }), die({ value: 4 })],
      equipment: [item('mirror_lake'), item('split_trail')],
    });
    // FOUR_STRAIGHT baseMult=2, x2.5 from mirror copy + x2.5 from split trail = x6.25 → 12.5
    expect(result.mult).toBeMultCloseTo(12.5, 5);
  });

  test('split trail does not activate for [1,2] because only high value scores', () => {
    const result = calculateTestScore({
      scoredDice: [die({ value: 1 }), die({ value: 2 })],
      equipment: [item('split_trail')],
    }).result;
    expect(result.mult).toBeMult(1);
  });

  test('roulette wheel applies rolled xMult when scoring', () => {
    const inst = item('roulette_wheel');
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    const xm = inst.state.xMult ?? 1;
    if (xm > 1) {
      expect(result.mult).toBeMultCloseTo(xm, 5);
    } else {
      expect(result.mult).toBeMult(1);
    }
  });

  test('roulette wheel rolls xMult within range on round start', () => {
    const inst = item('roulette_wheel');
    processEquipmentOnRoundStart([inst]);
    const xm = inst.state.xMult ?? 1;
    expect(xm).toBeGreaterThanOrEqual(1.0);
    expect(xm).toBeLessThanOrEqual(4.0);
    expect(Number.isInteger(Math.round(xm * 10))).toBe(true);
  });

  test('Mirror Lake doubles rolled xMult when scoring', () => {
    const wheel = itemWithState('roulette_wheel', { xMult: 2 });
    const scoredDice = diceWithValue(5, 2);
    const { game } = setupGame({
      equipment: [item('mirror_lake'), wheel],
      dice: [...scoredDice, ...diceWithValue(1, 50)],
    });
    game.startRound();
    wheel.state.xMult = 2;
    pushEquipmentState(wheel);
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.selectForScore(scoredDice.map((d) => d.id));
    const result = game.calculateScore()!;
    expect(result.mult).toBeMult(4);
  });

  test('campfire embers grows xMult at non-boss leg round end', () => {
    const embers = item('campfire_embers');
    processEndOfRound([embers], { isLegRoundEnd: true });
    expect(embers.state.xMult).toBeCloseTo(1.2, 5);
  });

  test('campfire embers does not grow on boss leg round end', () => {
    const embers = item('campfire_embers');
    const { run } = setupGame({ equipment: [embers], bossId: 'the_marathon' });
    expect(run.round).toBe(3);
    processEndOfRound([embers], { isLegRoundEnd: true });
    expect(embers.state.xMult ?? 1).toBe(1);
  });

  test('campfire embers applies stored xMult when scoring', () => {
    const embers = itemWithState('campfire_embers', { xMult: 1.4 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [embers],
    });
    expect(result.mult).toBeMultCloseTo(1.4, 5);
  });
});

describe('ROULETTE_WHEEL: day end', () => {
  test('rerolls xMult on day end', () => {
    const wheel = itemWithState('roulette_wheel', { xMult: 2.5 });
    processEquipmentOnDayEnd([wheel]);
    const xm = wheel.state.xMult ?? 1;
    expect(xm).toBeGreaterThanOrEqual(1.0);
    expect(xm).toBeLessThanOrEqual(4.0);
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

  test('Mirror Lake doubles xMult on 6th hand', () => {
    const sixShooter = itemWithState('six_shooter', { handsPlayed: 5 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), sixShooter],
    });
    expect(result.mult).toBeMult(16);
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

  test('Mirror Lake doubles xMult from steel dice count', () => {
    const scoredDice = diceWithValue(5, 2);
    const steelInCollection = [
      die({ value: 3, enhancement: 'steel' }),
      die({ value: 4, enhancement: 'steel' }),
      die({ value: 6, enhancement: 'steel' }),
    ];

    const { game } = setupGame({
      equipment: [item('mirror_lake'), item('iron_furnace')],
      dice: [...scoredDice, ...steelInCollection, ...diceWithValue(1, 50)],
    });

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    expect(result.mult).toBeMultCloseTo(2.56, 5);
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

  test('counts gold dice as steel in collection with alchemy kit', () => {
    const scoredDice = diceWithValue(5, 2);
    const goldInCollection = [die({ value: 3, enhancement: 'gold' }), die({ value: 4, enhancement: 'gold' })];

    const { game } = setupGame({
      equipment: [item('iron_furnace'), item('alchemy_kit')],
      dice: [...scoredDice, ...goldInCollection, ...diceWithValue(1, 50)],
    });

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    // 2 gold dice count as steel → x(1 + 2*0.2) = x1.4
    expect(result.mult).toBeMultCloseTo(1.4);
  });

  test('does not count gold dice without alchemy kit', () => {
    const scoredDice = diceWithValue(5, 2);
    const goldInCollection = [die({ value: 3, enhancement: 'gold' })];

    const { game } = setupGame({
      equipment: [item('iron_furnace')],
      dice: [...scoredDice, ...goldInCollection, ...diceWithValue(1, 50)],
    });

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    expect(result.mult).toBeMult(1);
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

  test('Mirror Lake doubles accumulated xMult when scoring', () => {
    const inst = item('guide_lantern');
    inst.state.xMult = 1.3;
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), inst],
    });
    expect(result.mult).toBeMultCloseTo(1.69, 5);
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
    // PAIR: baseMult=1, nitro x3 first (bar order), then horseshoe +4 → 7
    expect(result.mult).toBeMult(7);
  });

  test('Mirror Lake doubles xMult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('nitro')],
    });
    expect(result.mult).toBeMult(9);
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

  test('Mirror Lake doubles xMult on repeated hand', () => {
    const inst = item('repeat_offender');
    const { game } = setupGame({ equipment: [item('mirror_lake'), inst] });

    game.startRound();
    inst.state['round_PAIR'] = 1;
    pushEquipmentState(inst);

    game.state.phase = 'ROLL';
    const dice = diceWithValue(5, 2);
    game.state.rolledDice = dice;
    game.state.selectedForRoll = dice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(dice.map((d) => d.id));
    const result = game.calculateScore()!;
    expect(result.mult).toBeMult(9);
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

  test('Mirror Lake doubles xMult per empty slot', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('one_man_posse')],
    });
    // 3 empty slots with mirror+posse → x4 each = x16
    expect(result.mult).toBeMult(16);
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
  test('no bonus when no rounds skipped', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('shortcut_trail')],
    });
    expect(result.mult).toBeMult(1);
  });

  test('gains xMult when rounds are skipped via advanceRound', () => {
    const scored = diceWithValue(5, 2);
    const { game, player } = setupGame({
      equipment: [item('shortcut_trail')],
      dice: [...scored, ...diceWithValue(1, 50)],
    });

    player.advanceRound(true);
    player.advanceRound(true);
    expect(player.roundsSkipped).toBe(2);

    game.startRound();
    seedTestRoll(scored);
    game.selectForScore(scored.map((d) => d.id));
    const result = game.calculateScore();
    expect(result).not.toBeNull();
    // PAIR: baseMult=1, x(1+2*0.25)=x1.5
    expect(result!.mult).toBeMultCloseTo(1.5, 5);
  });

  test('Mirror Lake doubles xMult from rounds skipped via advanceRound', () => {
    const scored = diceWithValue(5, 2);
    const { game, player } = setupGame({
      equipment: [item('mirror_lake'), item('shortcut_trail')],
      dice: [...scored, ...diceWithValue(1, 50)],
    });

    player.advanceRound(true);
    player.advanceRound(true);
    expect(player.roundsSkipped).toBe(2);

    game.startRound();
    seedTestRoll(scored);
    game.selectForScore(scored.map((d) => d.id));
    const result = game.calculateScore();
    expect(result).not.toBeNull();
    expect(result!.mult).toBeMultCloseTo(2.25, 5);
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

  test('diamond crack during scoreHand updates coffin before equipment xMult pass', () => {
    const diamond = die({ value: 8, enhancement: 'diamond' });
    const coffin = item('diamond_coffin');
    const { result, player } = calculateTestScore({
      scoredDice: [diamond],
      equipment: [coffin, item('loaded_dice'), item('loaded_dice'), item('loaded_dice')],
      runSeed: 'diamond-score-0',
    });
    expect(player.dice.some((d) => d.id === diamond.id)).toBe(false);
    const live = player.equipment.find((e) => e.def.id === 'diamond_coffin')!;
    expect(live.state.xMult).toBeCloseTo(1.75, 5);
    // scoreHand mult 2 (diamond x2) * coffin x1.75
    expect(result.mult).toBeMultCloseTo(3.5, 5);
    expect(result.miles).toBeMilesCloseTo(45.5, 5);
    expect(result.animEvents.some((e) => e.popupType === 'crack')).toBe(true);
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

  test('Mirror Lake doubles xMult with two enhancement types', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5, enhancement: 'wooden' })],
      equipment: [item('mirror_lake'), item('rainbow_trail')],
    });
    expect(result.mult).toBeMult(20);
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

  test('Mirror Lake doubles xMult on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('mirror_lake'), item('hitched_pair')],
    });
    // PAIR: baseMult=1, x2 from mirror copy + x2 from hitched_pair = x4
    expect(result.mult).toBeMult(4);
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

  test('Mirror Lake doubles xMult on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('mirror_lake'), item('hat_trick')],
    });
    // THREE_OF_A_KIND: baseMult=3, x3 × x3 = x9 → 27
    expect(result.mult).toBeMult(27);
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

  test('Mirror Lake doubles xMult on four of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 4),
      equipment: [item('mirror_lake'), item('posse_wagon')],
    });
    // FOUR_OF_A_KIND: baseMult=5, x4 × x4 = x16 → 80
    expect(result.mult).toBeMult(80);
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

  test('Mirror Lake doubles xMult on five of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 5),
      equipment: [item('mirror_lake'), item('five_finger_fillet')],
    });
    // FIVE_OF_A_KIND: baseMult=6, x5 × x5 = x25 → 150
    expect(result.mult).toBeMult(150);
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

  test('Mirror Lake doubles xMult on 5 straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([3, 4, 5, 6, 7]),
      equipment: [item('mirror_lake'), item('snake_river')],
    });
    // FIVE_STRAIGHT: baseMult=4, x3 × x3 = x9 → 36
    expect(result.mult).toBeMult(36);
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

  test('Mirror Lake doubles xMult with 16+ enhanced dice', () => {
    const scoredDice = diceWithValue(5, 2);
    const enhancedDice = Array.from({ length: 16 }, (_, i) => die({ value: (i % 12) + 1, enhancement: 'wooden' }));

    const { game } = setupGame({
      equipment: [item('mirror_lake'), item('blessed_herd')],
      dice: [...scoredDice, ...enhancedDice, ...diceWithValue(1, 10)],
    });

    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = scoredDice;
    game.state.selectedForRoll = scoredDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scoredDice.map((d) => d.id));

    const result = game.calculateScore()!;
    expect(result.mult).toBeMult(9);
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

  test('golden_spike before graverobber: graverobber strips gold and gains extra xMult', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const spikeFirst = item('graverobber');
      const graveFirst = item('graverobber');

      calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [item('golden_spike'), spikeFirst],
      });
      calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [graveFirst, item('golden_spike')],
      });

      expect(spikeFirst.state.xMult).toBeCloseTo(1.2, 5);
      expect(graveFirst.state.xMult).toBe(1);
    } finally {
      Math.random = original;
    }
  });

  test('echo_chamber after graverobber can re-gold dice stripped in bar order', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const d0 = die({ value: 5 });
      const d1 = die({ value: 5 });
      const graverobber = item('graverobber');
      const { result } = calculateTestScore({
        scoredDice: [d0, d1],
        equipment: [item('golden_spike'), graverobber, item('echo_chamber')],
      });

      expect(graverobber.state.xMult).toBeCloseTo(1.2, 5);
      expect(d0.enhancement).toBe('gold');
      expect(d1.enhancement).toBe('gold');
      expect(result.mult).toBeMultCloseTo(1.2, 5);
    } finally {
      Math.random = original;
    }
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

  test('Mirror Lake doubles accumulated xMult when scoring', () => {
    const inst = item('book_of_the_dead');
    processEquipmentOnDiceDestroyed([inst], 1, 1);
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), inst],
    });
    expect(result.mult).toBeMultCloseTo(4, 5);
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

  test('Mirror Lake doubles xMult per scored 6', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 6 }), die({ value: 6 }), die({ value: 5 })],
      equipment: [item('mirror_lake'), item('devils_hand')],
    });
    expect(result.mult).toBeMultCloseTo(16, 5);
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

  test('Mirror Lake doubles accumulated xMult when scoring', () => {
    const inst = item('twenty_third_psalm');
    processEquipmentOnReroll([inst], 46);
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), inst],
    });
    expect(result.mult).toBeMultCloseTo(9, 5);
  });
});

// ─── CHANCE_HAND_XMULT_MONEY: One Armed Bandit ───

describe('CHANCE_HAND_XMULT_MONEY: One Armed Bandit', () => {
  test('has correct definition', () => {
    const inst = item('one_armed_bandit');
    expect(inst.def.effectType).toBe('CHANCE_HAND_XMULT_MONEY');
    expect(inst.def.cost).toBe(6);
    expect(inst.def.rarity).toBe('uncommon');
    expect(inst.def.effectParams).toEqual({ chance: [1, 4], xMult: 4, money: 10 });
  });

  test('applies x4 mult and $10 on successful roll', () => {
    const original = Math.random;
    Math.random = () => 0;

    try {
      const { result } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [item('one_armed_bandit')],
      });
      expect(result.mult).toBeMult(4);
      expect(result.mutations.moneyEarned).toBe(10);
    } finally {
      Math.random = original;
    }
  });

  test('Mirror Lake doubles xMult on successful roll', () => {
    const original = Math.random;
    Math.random = () => 0;

    try {
      const { result } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [item('mirror_lake'), item('one_armed_bandit')],
      });
      expect(result.mult).toBeMult(16);
      expect(result.mutations.moneyEarned).toBe(20);
    } finally {
      Math.random = original;
    }
  });

  test('does nothing on failed roll', () => {
    const original = Math.random;
    Math.random = () => 0.5;

    try {
      const { result } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [item('one_armed_bandit')],
      });
      expect(result.mult).toBeMult(1);
      expect(result.mutations.moneyEarned).toBe(0);
    } finally {
      Math.random = original;
    }
  });

  test('Loaded Dice item improves trigger to 1 in 2', () => {
    const original = Math.random;
    Math.random = () => 0.4;

    try {
      const { result } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        equipment: [item('one_armed_bandit'), item('loaded_dice')],
      });
      expect(result.mult).toBeMult(4);
      expect(result.mutations.moneyEarned).toBe(10);
    } finally {
      Math.random = original;
    }
  });
});

// ─── DAY_XMULT: Dust Trail ───

describe('DAY_XMULT: Dust Trail', () => {
  test('has correct definition', () => {
    const inst = item('dust_trail');
    expect(inst.def.effectType).toBe('DAY_XMULT');
    expect(inst.def.cost).toBe(8);
    expect(inst.def.rarity).toBe('rare');
  });

  test('no bonus on day 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('dust_trail')],
      currentDay: 1,
      maxDays: 4,
    });
    expect(result.mult).toBeMult(1);
  });

  test('xMult equals current day on later days', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('dust_trail')],
      currentDay: 3,
      maxDays: 4,
    });
    expect(result.mult).toBeMult(3);
  });

  test('Mirror Lake doubles day xMult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('dust_trail')],
      currentDay: 3,
      maxDays: 4,
    });
    expect(result.mult).toBeMult(9);
  });
});

// ─── DICE_SUM_XMULT: Blackjack ───

describe('DICE_SUM_XMULT: Blackjack', () => {
  test('has correct definition', () => {
    const inst = item('blackjack');
    expect(inst.def.effectType).toBe('DICE_SUM_XMULT');
    expect(inst.def.cost).toBe(7);
    expect(inst.def.rarity).toBe('rare');
  });

  test('x3 mult when dice sum to 21', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([1, 2, 3, 7, 8]),
      equipment: [item('blackjack')],
    });
    expect(result.mult).toBeMult(3);
  });

  test('Mirror Lake doubles xMult when dice sum to 21', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([1, 2, 3, 7, 8]),
      equipment: [item('mirror_lake'), item('blackjack')],
    });
    expect(result.mult).toBeMult(9);
  });

  test('x2.5 mult when dice sum to 20', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([1, 2, 3, 6, 8]),
      equipment: [item('blackjack')],
    });
    expect(result.mult).toBeMultCloseTo(2.5, 5);
  });

  test('x2 mult when dice sum to 19', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([1, 2, 3, 5, 8]),
      equipment: [item('blackjack')],
    });
    expect(result.mult).toBeMult(2);
  });

  test('x1.5 mult when dice sum to 18', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([1, 2, 3, 5, 7]),
      equipment: [item('blackjack')],
    });
    expect(result.mult).toBeMultCloseTo(1.5, 5);
  });

  test('no bonus when dice sum exceeds 21', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([2, 3, 4, 6, 7]),
      equipment: [item('blackjack')],
    });
    expect(result.mult).toBeMult(1);
  });
});

// ─── DICE_SCORED_COUNT_XMULT: Sharpening Stone ───

describe('DICE_SCORED_COUNT_XMULT: Sharpening Stone', () => {
  test('gains x0.1 mult every 10 dice scored', () => {
    const inst = item('sharpening_stone');
    const hand = diceWithValue(5, 2);
    for (let i = 0; i < 5; i++) {
      processEquipmentOnHandPlayed([inst], HandType.PAIR, hand);
    }
    expect(inst.state.diceScoredTotal).toBe(10);
    expect(inst.state.xMult).toBeCloseTo(1.1, 5);

    for (let i = 0; i < 5; i++) {
      processEquipmentOnHandPlayed([inst], HandType.PAIR, hand);
    }
    expect(inst.state.diceScoredTotal).toBe(20);
    expect(inst.state.xMult).toBeCloseTo(1.2, 5);
  });

  test('applies accumulated xMult when scoring', () => {
    const inst = item('sharpening_stone');
    const hand = diceWithValue(5, 2);
    for (let i = 0; i < 10; i++) {
      processEquipmentOnHandPlayed([inst], HandType.PAIR, hand);
    }
    const { result } = calculateTestScore({
      scoredDice: hand,
      equipment: [inst],
    });
    expect(result.mult).toBeMultCloseTo(1.2, 5);
  });

  test('Mirror Lake doubles accumulated xMult when scoring', () => {
    const inst = item('sharpening_stone');
    const hand = diceWithValue(5, 2);
    for (let i = 0; i < 10; i++) {
      processEquipmentOnHandPlayed([inst], HandType.PAIR, hand);
    }
    const { result } = calculateTestScore({
      scoredDice: hand,
      equipment: [item('mirror_lake'), inst],
    });
    expect(result.mult).toBeMultCloseTo(1.44, 5);
  });
});

// ─── Mirror Lake copies xMult equipment ───

describe('Mirror Lake copies xMult equipment', () => {
  test('Mirror Lake copies Worn Deck stored xMult', () => {
    const wornDeck = itemWithState('worn_deck', { xMult: 2 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), wornDeck],
    });
    // PAIR baseMult=1, x2 mirror + x2 worn deck = x4
    expect(result.mult).toBeMult(4);
  });

  test('Mirror Lake copying Worn Deck does not decay mirror state on reroll', () => {
    const mirrorLake = item('mirror_lake');
    const wornDeck = itemWithState('worn_deck', { xMult: 2 });
    const equipment = [mirrorLake, wornDeck];

    processEquipmentOnReroll(equipment, 3);
    expect(mirrorLake.state.xMult).toBeUndefined();
    expect(wornDeck.state.xMult).toBeCloseTo(1.97, 5);
  });

  test('Mirror Lake copies Snake Oil Ledger stored xMult', () => {
    const ledger = itemWithState('snake_oil_ledger', { xMult: 2 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), ledger],
    });
    expect(result.mult).toBeMult(4);
  });

  test('Mirror Lake copying Snake Oil Ledger does not gain xMult on sell', () => {
    const mirrorLake = item('mirror_lake');
    const ledger = item('snake_oil_ledger');
    const equipment = [mirrorLake, ledger];

    processEquipmentOnSell(equipment);
    expect(mirrorLake.state.xMult).toBeUndefined();
    expect(ledger.state.xMult).toBeCloseTo(1.25, 5);
  });

  test('Mirror Lake copies Trail Repair Kit stored xMult', () => {
    const kit = itemWithState('trail_repair_kit', { xMult: 1.75 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), kit],
    });
    // PAIR baseMult=1; mirror x1.75 × kit x1.75
    expect(result.mult).toBeMult(3.06);
  });

  test('Mirror Lake copies New Blood stored xMult', () => {
    const newBlood = itemWithState('new_blood', { xMult: 2 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), newBlood],
    });
    expect(result.mult).toBeMult(4);
  });

  test('Mirror Lake copying New Blood does not gain xMult when dice are added', () => {
    const mirrorLake = item('mirror_lake');
    const newBlood = item('new_blood');
    const equipment = [mirrorLake, newBlood];

    processEquipmentOnDiceAdded(equipment);
    expect(mirrorLake.state.xMult).toBeUndefined();
    expect(newBlood.state.xMult).toBeCloseTo(1.25, 5);
  });

  test('Mirror Lake copies Diamond Coffin stored xMult', () => {
    const coffin = itemWithState('diamond_coffin', { xMult: 2.5 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), coffin],
    });
    expect(result.mult).toBeMultCloseTo(6.25, 5);
  });

  test('Mirror Lake copying Diamond Coffin does not gain xMult on diamond destroyed', () => {
    const mirrorLake = item('mirror_lake');
    const coffin = item('diamond_coffin');
    const equipment = [mirrorLake, coffin];

    processEquipmentOnDiamondDestroyed(equipment);
    expect(mirrorLake.state.xMult).toBeUndefined();
    expect(coffin.state.xMult).toBeCloseTo(1.75, 5);
  });

  test('Mirror Lake copies Graverobber stored xMult', () => {
    const graverobber = itemWithState('graverobber', { xMult: 2 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), graverobber],
    });
    expect(result.mult).toBeMult(4);
  });

  test('Mirror Lake copies Trailblazer streak xMult', () => {
    const trailblazer = itemWithState('trailblazer', { streak: 0 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), trailblazer],
    });
    // Hand played bumps streak to 1 before scoring → x1.2 mirror + x1.2 trailblazer
    expect(result.mult).toBeMultCloseTo(1.44, 5);
  });

  test('Mirror Lake copying Trailblazer does not increment mirror streak on hand played', () => {
    const mirrorLake = item('mirror_lake');
    const trailblazer = item('trailblazer');
    const equipment = [mirrorLake, trailblazer];

    processEquipmentOnHandPlayed(equipment, HandType.THREE_OF_A_KIND);
    expect(mirrorLake.state.streak).toBeUndefined();
    expect(trailblazer.state.streak).toBe(1);
  });

  test('Mirror Lake copies Campfire Embers stored xMult', () => {
    const embers = itemWithState('campfire_embers', { xMult: 1.4 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), embers],
    });
    expect(result.mult).toBeMultCloseTo(1.96, 5);
  });

  test("Mirror Lake copies Collector's Case uncommon scaling", () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('collectors_case'), item('war_drums')],
    });
    // 1 uncommon (war_drums) → x1.5 per collectors case copy
    expect(result.mult).toBeMultCloseTo(2.25, 5);
  });

  test("Mirror Lake copies Rabbit's Foot stored xMult", () => {
    const foot = itemWithState('rabbits_foot', { xMult: 1.5 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), foot],
    });
    expect(result.mult).toBeMultCloseTo(2.25, 5);
  });

  test("Mirror Lake copying Rabbit's Foot does not gain xMult on lucky trigger", () => {
    const mirrorLake = item('mirror_lake');
    const foot = item('rabbits_foot');
    const equipment = [mirrorLake, foot];

    processEquipmentOnLuckyTrigger(equipment);
    expect(mirrorLake.state.xMult).toBeUndefined();
    expect(foot.state.xMult).toBeCloseTo(1.25, 5);
  });
});
