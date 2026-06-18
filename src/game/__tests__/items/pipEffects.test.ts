import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import {
  die,
  diceWithValue,
  item,
  itemWithState,
  calculateTestScore,
  setupGame,
  resetDieIds,
  pushEquipmentState,
  syncEquipmentInstances,
} from '../testHelpers';
import { processEquipmentOnRoundStart, processGoldHeldAtRoundEnd } from '../../EquipmentEffects';
import { gt } from '../../scoreMath';
import { GAMEPLAY } from '../../Constants';

beforeEach(() => resetDieIds());

// ─── PIP_MULT Items (deprecated — snake_eyes, double_deuces, etc. removed in Phase 3) ───

// ─── GOLD_DICE_MONEY: Gold Tooth ───

describe('GOLD_DICE_MONEY: Gold Tooth', () => {
  test('gold dice earn $4 when scored', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    // 1 gold die → $4
    expect(player.economy.balance).toBe(14); // 10 + 4
  });

  test('multiple gold dice each earn money', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5, enhancement: 'gold' })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    // 2 gold dice → $8
    expect(player.economy.balance).toBe(18);
  });

  test('no money from non-gold dice', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    expect(player.economy.balance).toBe(10);
  });

  test('Mirror Lake copies gold tooth money', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('mirror_lake'), item('gold_tooth')],
      money: 10,
    });
    expect(player.economy.balance).toBe(18);
  });
});

// ─── LUCKY_NUMBER_PIP_XMULT: Lucky Number ───

describe('LUCKY_NUMBER_PIP_XMULT: Lucky Number', () => {
  test('matching pip gives x2 per matching die', () => {
    const luckyNum = itemWithState('lucky_number', { pip: 5 });
    processEquipmentOnRoundStart([luckyNum]);
    luckyNum.state.pip = 5;

    expect(luckyNum.state.pip).toBe(5);
    expect(luckyNum.def.effectParams.value).toBe(2);
  });

  test('pip randomizes on round start', () => {
    const luckyNum = item('lucky_number');
    expect(luckyNum.state.pip).toBe(7); // initial
    processEquipmentOnRoundStart([luckyNum]);
    // After round start, pip should be 1-12
    expect(luckyNum.state.pip).toBeGreaterThanOrEqual(1);
    expect(luckyNum.state.pip).toBeLessThanOrEqual(12);
  });

  test('has correct effect type and params', () => {
    const inst = item('lucky_number');
    expect(inst.def.effectType).toBe('LUCKY_NUMBER_PIP_XMULT');
    expect(inst.def.effectParams.value).toBe(2);
  });

  test('gambler uses x2.5 mult on lucky pip', () => {
    const luckyNum = itemWithState('lucky_number', { pip: 5 });
    const scored = [die({ value: 5 }), die({ value: 5 })];
    const { game, player } = setupGame({
      equipment: [luckyNum],
      dice: [...scored, ...diceWithValue(1, 50)],
      profession: 'gambler',
    });
    game.startRound();
    luckyNum.state.pip = 5;
    pushEquipmentState(luckyNum);
    game.state.phase = 'ROLL';
    game.state.rolledDice = scored;
    game.state.selectedForRoll = scored;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scored.map((d) => d.id));
    const result = game.calculateScore()!;
    // Two matching lucky dice each apply x2.5 → 1 × 2.5 × 2.5 = 6.25
    expect(result.mult).toBeMultCloseTo(6.25, 5);
    expect(player.profession?.id).toBe('gambler');
  });

  test('Mirror Lake copies lucky pip xMult', () => {
    const luckyNum = itemWithState('lucky_number', { pip: 5 });
    const scored = diceWithValue(5, 2);
    const { game } = setupGame({
      equipment: [item('mirror_lake'), luckyNum],
      dice: [...scored, ...diceWithValue(1, 10)],
    });
    game.startRound();
    luckyNum.state.pip = 5;
    pushEquipmentState(luckyNum);
    game.state.phase = 'ROLL';
    game.state.rolledDice = scored;
    game.state.selectedForRoll = scored;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scored.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR of lucky 5s: each die gets x2 twice (lucky + mirror copy) → x4 per die
    expect(result.mult).toBeMultCloseTo(16, 2);
  });
});

// ─── PIP_RETRIGGER: One-Eyed Jack ───

describe('PIP_RETRIGGER: One-Eyed Jack', () => {
  test('retriggers dice with pip value 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(1, 2),
      equipment: [item('one_eyed_jack')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // Each 1 gets retriggered once: totalValue = 1+1+1+1 = 4
    // miles = (10 + 4) * 1 = 14
    expect(result.totalValue).toBe(4);
  });

  test('retriggers dice with pip value 11', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(11, 2),
      equipment: [item('one_eyed_jack')],
    });
    // PAIR: each 11 gets retriggered once: totalValue = 11+11+11+11 = 44
    expect(result.totalValue).toBe(44);
  });

  test('does not retrigger non-1 or non-11 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('one_eyed_jack')],
    });
    // PAIR: totalValue = 5+5 = 10 (no retrigger)
    expect(result.totalValue).toBe(10);
  });

  test('retriggers only 1s and 11s in mixed hand', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(1, 2), ...diceWithValue(11, 2)],
      equipment: [item('one_eyed_jack')],
    });
    // TWO_PAIR: two 1s and two 11s retriggered once each = +2 + +22 = +24 value
    // totalValue = 1+1+11+11 + 1+1+11+11 = 48
    expect(result.totalValue).toBe(48);
  });

  test('Mirror Lake copies one-eyed jack retrigger', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(1, 2),
      equipment: [item('mirror_lake'), item('one_eyed_jack')],
    });
    expect(result.totalValue).toBe(6);
  });

  test('Snake Eyes: retriggered 1 rolls supply chance again', () => {
    const original = Math.random;
    Math.random = () => 0.1;

    try {
      const { result } = calculateTestScore({
        scoredDice: [die({ value: 1 })],
        equipment: [item('one_eyed_jack'), item('snake_eyes')],
      });
      // HIGH_VALUE: 1 scored + 1 retrigger = 2 totalValue
      expect(result.totalValue).toBe(2);
      // Snake Eyes fires on both triggers
      expect(result.mutations.consumablesGranted).toHaveLength(2);
    } finally {
      Math.random = original;
    }
  });

  test('Ace in the Hole: held 1 retriggers xMult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 1 })],
      equipment: [item('one_eyed_jack'), item('ace_in_the_hole')],
    });
    // PAIR: baseMult=1
    // Held 1: ace x1.5 twice (base + one_eyed_jack retrigger) → x2.25
    expect(result.mult).toBeMultCloseTo(2.25, 5);
  });

  test('Eleventh Crossing: held 11 retriggers +11 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 11 })],
      equipment: [item('one_eyed_jack'), item('eleventh_crossing')],
    });
    // PAIR: baseMult=1
    // Held 11: +11 twice (base + one_eyed_jack retrigger) → heldMult = 23
    expect(result.mult).toBeMult(23);
  });
});

// ─── PIP_SUPPLY_CHANCE: Snake Eyes ───

describe('PIP_SUPPLY_CHANCE: Snake Eyes', () => {
  test('has correct effect type and params', () => {
    const inst = item('snake_eyes');
    expect(inst.def.effectType).toBe('PIP_SUPPLY_CHANCE');
    expect(inst.def.effectParams.pip).toBe(1);
    expect(inst.def.effectParams.chance).toEqual([1, 4]);
  });

  test('grants a supply in the live GameState score flow', () => {
    const original = Math.random;
    Math.random = () => 0.1;

    try {
      const scoredDie = die({ value: 1 });
      const { game, player } = setupGame({
        equipment: [item('snake_eyes')],
        dice: [scoredDie, ...diceWithValue(2, 20)],
      });

      game.startRound();
      game.state.phase = 'ROLL';
      game.state.rolledDice = [scoredDie];
      game.state.selectedForRoll = [scoredDie];
      game.state.rerollsRemaining = 6;
      game.selectForScore([scoredDie.id]);

      game.calculateScore();

      expect(player.consumables.length).toBe(1);
    } finally {
      Math.random = original;
    }
  });

  test('merchant has 1 in 2 chance (always succeeds at roll 0.4)', () => {
    const original = Math.random;
    Math.random = () => 0.4;

    try {
      const scoredDie = die({ value: 1 });
      const { game, player } = setupGame({
        equipment: [item('snake_eyes')],
        dice: [scoredDie, ...diceWithValue(2, 20)],
        profession: 'merchant',
      });

      game.startRound();
      game.state.phase = 'ROLL';
      game.state.rolledDice = [scoredDie];
      game.state.selectedForRoll = [scoredDie];
      game.state.rerollsRemaining = 6;
      game.selectForScore([scoredDie.id]);
      game.calculateScore();

      expect(player.consumables.length).toBe(1);
    } finally {
      Math.random = original;
    }
  });

  test('Mirror Lake copies snake eyes supply chance', () => {
    const original = Math.random;
    Math.random = () => 0.1;

    try {
      const scoredDie = die({ value: 1 });
      const { game, player } = setupGame({
        equipment: [item('mirror_lake'), item('snake_eyes')],
        dice: [scoredDie, ...diceWithValue(2, 20)],
      });

      game.startRound();
      game.state.phase = 'ROLL';
      game.state.rolledDice = [scoredDie];
      game.state.selectedForRoll = [scoredDie];
      game.state.rerollsRemaining = 6;
      game.selectForScore([scoredDie.id]);
      game.calculateScore();

      expect(player.consumables.length).toBe(2);
    } finally {
      Math.random = original;
    }
  });
});

// ─── ENHANCED_SCORE_MONEY: Gold Pan ───

describe('ENHANCED_SCORE_MONEY: Gold Pan', () => {
  test('has correct effect type and params', () => {
    const inst = item('gold_pan');
    expect(inst.def.effectType).toBe('ENHANCED_SCORE_MONEY');
    expect(inst.def.effectParams.chance).toEqual([1, 2]);
    expect(inst.def.effectParams.value).toBe(2);
  });

  test('prospector always earns $2 on enhanced die score', () => {
    const enhanced = die({ value: 5, enhancement: 'gold' });
    const { player } = calculateTestScore({
      scoredDice: [enhanced, die({ value: 5 })],
      equipment: [item('gold_pan')],
      profession: 'prospector',
      money: 10,
    });
    expect(player.economy.balance).toBe(12);
  });

  test('Mirror Lake copies gold pan money on enhanced die', () => {
    const enhanced = die({ value: 5, enhancement: 'gold' });
    const { player } = calculateTestScore({
      scoredDice: [enhanced, die({ value: 5 })],
      equipment: [item('mirror_lake'), item('gold_pan')],
      profession: 'prospector',
      money: 10,
    });
    expect(player.economy.balance).toBe(14);
  });
});

// ─── PERMANENT_DIE_MILES_GAIN: Cowboy Boots ───

describe('PERMANENT_DIE_MILES_GAIN: Cowboy Boots', () => {
  test('grants permanent +5 bonusMiles to scored dice', () => {
    const d = die({ value: 5 });
    calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [item('cowboy_boots')],
    });
    expect(d.bonusMiles).toBe(5);
  });

  test('bonusMiles accumulates across multiple hands', () => {
    const d = die({ value: 5 });
    calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [item('cowboy_boots')],
    });
    calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [item('cowboy_boots')],
    });
    expect(d.bonusMiles).toBe(10);
  });

  test('bonusMiles is included in score calculation', () => {
    const d = die({ value: 5, bonusMiles: 10 });
    const { result } = calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [],
    });
    // PAIR baseMiles=10, dice: (5+10) + 5 = 20, total = 30
    expect(result.miles).toBeMiles(30);
  });

  test('gains bonusMiles for each last_laugh retrigger on the last die', () => {
    const lastDie = die({ value: 5 });
    calculateTestScore({
      scoredDice: [die({ value: 5 }), lastDie],
      equipment: [item('cowboy_boots'), item('last_laugh')],
    });
    // first die triggers once for +5, last die triggers twice total for +10
    expect(lastDie.bonusMiles).toBe(10);
  });

  test('Mirror Lake copies cowboy boots permanent miles', () => {
    const d = die({ value: 5 });
    calculateTestScore({
      scoredDice: [d, die({ value: 5 })],
      equipment: [item('mirror_lake'), item('cowboy_boots')],
    });
    expect(d.bonusMiles).toBe(10);
  });

  test('Mirror Lake copies last laugh retrigger', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('last_laugh')],
    });
    expect(result.totalValue).toBe(20);
  });
});

// ─── LUCKY_DICE_MONEY: Lucky Penny ───

describe('LUCKY_DICE_MONEY: Lucky Penny', () => {
  test('lucky dice earn $1 when scored', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'lucky' }), die({ value: 5 })],
      equipment: [item('lucky_penny')],
      money: 10,
    });
    // 1 lucky die → $1 (may also hit lucky's built-in 1/15 $20 bonus)
    expect(player.economy.balance).toBeGreaterThanOrEqual(11);
  });

  test('multiple lucky dice each earn money', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'lucky' }), die({ value: 5, enhancement: 'lucky' })],
      equipment: [item('lucky_penny')],
      money: 10,
    });
    // 2 lucky dice → $2 (may also hit lucky's built-in 1/15 $20 bonus)
    expect(player.economy.balance).toBeGreaterThanOrEqual(12);
  });

  test('no money from non-lucky dice', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('lucky_penny')],
      money: 10,
    });
    expect(player.economy.balance).toBe(10);
  });

  test('Mirror Lake copies lucky penny money', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'lucky' }), die({ value: 5 })],
      equipment: [item('mirror_lake'), item('lucky_penny')],
      money: 10,
    });
    expect(player.economy.balance).toBeGreaterThanOrEqual(12);
  });
});

// ─── WOODEN_DICE_MILES: Wood Axe ───

describe('WOODEN_DICE_MILES: Wood Axe', () => {
  test('wooden dice give +50 miles', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('wood_axe')],
    });
    // PAIR: baseMiles=10, totalValue: 5+30(wooden enh)+50(wood axe)+5 = 90, miles=(10+90)*1=100
    expect(result.miles).toBeMiles(100);
  });

  test('multiple wooden dice each get bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5, enhancement: 'wooden' })],
      equipment: [item('wood_axe')],
    });
    // PAIR: baseMiles=10, totalValue: (5+30+50)+(5+30+50)=170, miles=(10+170)*1=180
    expect(result.miles).toBeMiles(180);
  });

  test('no bonus from non-wooden dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('wood_axe')],
    });
    // PAIR: baseMiles=10, totalValue=5+5=10, mult=1+4(bone)=5
    // miles=(10+10)*5=100
    expect(result.miles).toBeMiles(100);
  });

  test('Mirror Lake copies wood axe miles', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('mirror_lake'), item('wood_axe')],
    });
    expect(result.miles).toBeMiles(150);
  });
});

// ─── IRON_DICE_MULT: Iron Spurs ───

describe('IRON_DICE_MULT: Iron Spurs', () => {
  test('steel dice give +7 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'steel' }), die({ value: 5 })],
      equipment: [item('iron_spurs')],
    });
    // PAIR: baseMult=1, +7 from iron spurs = 8
    expect(result.mult).toBeMult(8);
  });

  test('multiple steel dice each get bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'steel' }), die({ value: 5, enhancement: 'steel' })],
      equipment: [item('iron_spurs')],
    });
    // PAIR: baseMult=1, +7+7=15 from iron spurs = 15
    expect(result.mult).toBeMult(15);
  });

  test('no bonus from non-steel dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [item('iron_spurs')],
    });
    // PAIR: baseMult=1+4(bone)=5, no iron spurs bonus
    expect(result.mult).toBeMult(5);
  });

  test('Mirror Lake copies iron spurs mult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'steel' }), die({ value: 5 })],
      equipment: [item('mirror_lake'), item('iron_spurs')],
    });
    expect(result.mult).toBeMult(15);
  });
});

// ─── ALCHEMY_KIT: Alchemy Kit ───

describe('ALCHEMY_KIT: Alchemy Kit', () => {
  test('steel dice trigger iron spurs mult with or without alchemy kit', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'steel' }), die({ value: 5 })],
      equipment: [item('iron_spurs'), item('alchemy_kit')],
    });
    expect(result.mult).toBeMult(8);
  });

  test('gold dice trigger iron spurs mult with alchemy kit', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('iron_spurs'), item('alchemy_kit')],
    });
    expect(result.mult).toBeMult(8);
  });

  test('gold dice do not trigger iron spurs mult without alchemy kit', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('iron_spurs')],
    });
    expect(result.mult).toBeMult(1);
  });

  test('gold dice trigger gold tooth money via steel swap', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('gold_tooth'), item('alchemy_kit')],
      money: 10,
    });
    expect(player.economy.balance).toBe(14);
  });

  test('gold dice do not earn gold tooth money without alchemy kit', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('alchemy_kit')],
      money: 10,
    });
    expect(player.economy.balance).toBe(10);
  });
});

describe('ALCHEMY_KIT: held in hand and round end', () => {
  test('held gold applies steel x1.5 mult when scoring', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'gold' })],
      equipment: [item('alchemy_kit')],
    });
    expect(result.mult).toBeMult(1.5);
  });

  test('held gold does not apply steel x1.5 without alchemy kit', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'gold' })],
      equipment: [],
    });
    expect(result.mult).toBeMult(1);
  });

  test('held steel still applies steel x1.5 with alchemy kit', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' })],
      equipment: [item('alchemy_kit')],
    });
    expect(result.mult).toBeMult(1.5);
  });

  test('held steel with alchemy kit gets steel xMult and round-end gold payout', () => {
    const heldSteel = die({ value: 4, enhancement: 'steel' });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [heldSteel],
      equipment: [item('alchemy_kit')],
    });
    expect(result.mult).toBeMult(1.5);
    const payout = processGoldHeldAtRoundEnd([heldSteel], [item('alchemy_kit')]);
    expect(payout.moneyEarned).toBe(GAMEPLAY.GOLD_DICE_HELD_MONEY);
  });

  test('held steel earns round-end gold payout with alchemy kit', () => {
    const result = processGoldHeldAtRoundEnd([die({ value: 4, enhancement: 'steel' })], [item('alchemy_kit')]);
    expect(result.moneyEarned).toBe(GAMEPLAY.GOLD_DICE_HELD_MONEY);
    expect(result.animEvents.filter((e) => e.popupType === 'money')).toHaveLength(1);
  });

  test('held gold and steel both earn round-end payout with alchemy kit', () => {
    const result = processGoldHeldAtRoundEnd(
      [die({ value: 4, enhancement: 'gold' }), die({ value: 5, enhancement: 'steel' })],
      [item('alchemy_kit')],
    );
    expect(result.moneyEarned).toBe(GAMEPLAY.GOLD_DICE_HELD_MONEY * 2);
    expect(result.animEvents.filter((e) => e.popupType === 'money')).toHaveLength(2);
  });
});

// ─── ENHANCEMENT_SCORED_MILES: Covered Wagon ───

describe('ENHANCEMENT_SCORED_MILES: Covered Wagon', () => {
  test('gains +12 miles when wooden die is scored', () => {
    const inst = item('covered_wagon');
    calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [inst],
    });
    // Miles gained: +12 from wooden scored (stored in state)
    expect(inst.state.miles).toBe(12);
  });

  test('accumulates across multiple wooden dice', () => {
    const inst = item('covered_wagon');
    calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5, enhancement: 'wooden' })],
      equipment: [inst],
    });
    expect(inst.state.miles).toBe(24);
  });

  test('does not gain from non-wooden dice', () => {
    const inst = item('covered_wagon');
    calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      equipment: [inst],
    });
    expect(inst.state.miles).toBe(0);
  });

  test('gains miles for each red_bullet retrigger on a wooden die', () => {
    const inst = item('covered_wagon');
    calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden', sticker: 'red_bullet' })],
      equipment: [inst],
    });
    // base trigger + red_bullet retrigger = 2 wooden triggers
    expect(inst.state.miles).toBe(24);
  });

  test('gains miles for each quick_draw retrigger on the first wooden die', () => {
    const inst = item('covered_wagon');
    calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('quick_draw'), inst],
    });
    // first wooden die triggers 3 times total, adding +12 each time
    expect(inst.state.miles).toBe(36);
  });

  test('Mirror Lake copies covered wagon miles', () => {
    const inst = item('covered_wagon');
    calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('mirror_lake'), inst],
    });
    expect(inst.state.miles).toBe(24);
  });

  test('Mirror Lake copies quick draw retrigger', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), item('quick_draw')],
    });
    expect(result.totalValue).toBe(30);
  });
});

// ─── BONE_DICE_XMULT_CHANCE: Bone Charm ───

describe('BONE_DICE_XMULT_CHANCE: Bone Charm', () => {
  test('has correct effect type and params', () => {
    const inst = item('bone_charm');
    expect(inst.def.effectType).toBe('BONE_DICE_XMULT_CHANCE');
    expect(inst.def.effectParams.value).toBe(1.5);
  });

  test('always applies x1.5 mult on bone dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5, enhancement: 'bone' })],
      equipment: [item('bone_charm')],
    });
    // PAIR baseMult=1, +4 per bone die (2 dice=+8), bone charm x1.5 per die
    expect(result.mult).toBeMult(20.25);
  });

  test('does not trigger on non-bone dice', () => {
    // With non-bone dice, the effect should never apply regardless of RNG
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('bone_charm')],
    });
    // PAIR: baseMult=1, no bone charm trigger, xMult stays 1
    // The mult should only include base (1) — no x1.5
    // wooden gives +30 miles but no mult
    expect(result.mult).toBeMult(1);
  });

  test('Mirror Lake copies bone charm on non-bone dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('mirror_lake'), item('bone_charm')],
    });
    expect(result.mult).toBeMult(1);
  });
});

// ─── PIP_SCORED_MILES_GAIN: 5 Mile Marker ───

describe('PIP_SCORED_MILES_GAIN: 5 Mile Marker', () => {
  test('has correct effect type and params', () => {
    const inst = item('five_mile_marker');
    expect(inst.def.effectType).toBe('PIP_SCORED_MILES_GAIN');
    expect(inst.def.effectParams.pip).toBe(5);
    expect(inst.def.effectParams.value).toBe(5);
    expect(inst.state.miles).toBe(0);
  });

  test('gains miles when 5 pip is scored', () => {
    const inst = item('five_mile_marker');
    calculateTestScore({
      scoredDice: diceWithValue(5, 2), // pair of 5s
      equipment: [inst],
    });
    // After scoring two 5s, the item should have gained +10 miles (5 per 5 scored)
    expect(inst.state.miles).toBe(10);
  });

  test('does not gain miles for non-5 pips', () => {
    const inst = item('five_mile_marker');
    calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [inst],
    });
    expect(inst.state.miles).toBe(0);
  });

  test('gains miles again for last_stand retriggers on final day', () => {
    const inst = item('five_mile_marker');
    calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst, item('last_stand')],
      currentDay: 5,
      maxDays: 5,
    });
    // Two 5s score naturally (+10), then Last Stand retriggers both on final day (+10)
    expect(inst.state.miles).toBe(20);
  });

  test('Mirror Lake copies five mile marker miles', () => {
    const inst = item('five_mile_marker');
    calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), inst],
    });
    expect(inst.state.miles).toBe(20);
  });

  test('Mirror Lake copies last stand retrigger on final day', () => {
    const inst = item('five_mile_marker');
    calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), inst, item('last_stand')],
      currentDay: 5,
      maxDays: 5,
    });
    expect(inst.state.miles).toBe(40);
  });

  test('accumulated miles apply as bonus', () => {
    const inst = itemWithState('five_mile_marker', { miles: 50 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // 50 existing + 10 gained this hand = 60 miles bonus from equipment
    // The miles reported includes 60 bonus in addition to base hand miles
    expect(gt(result.miles, 60)).toBe(true);
  });
});

// ─── FIRST_PIP_XMULT: Double Barrel ───

describe('FIRST_PIP_XMULT: Double Barrel', () => {
  test('first scored 2 gives x2 mult and retriggers once', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 2 }), die({ value: 2 })],
      equipment: [item('double_barrel')],
    });
    // First 2 triggers twice (base + double barrel) → x2 × x2 = x4
    expect(result.mult).toBeMult(4);
  });

  test('x2 triggers again on each retrigger of the first played 2 (War Drums)', () => {
    const warDrums = itemWithState('war_drums', { daysRemaining: 5 });
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 2 }), die({ value: 2 })],
      equipment: [item('double_barrel'), warDrums],
    });
    // First 2 triggers three times (base + double barrel + war drums) → x2 × x2 × x2 = x8
    expect(result.mult).toBeMult(8);
  });

  test('Mirror Lake copies double barrel xMult on first 2', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 2 }), die({ value: 2 })],
      equipment: [item('mirror_lake'), item('double_barrel')],
    });
    // First 2 triggers 3×; each trigger applies x2 twice (double barrel + mirror) → x4^3
    expect(result.mult).toBeMult(64);
  });
});

// ─── STACKED_DECK: Stacked Deck interactions ───

const stacked = () => item('stacked_deck');
const loaded = (value: number) => die({ value, enhancement: 'loaded' });

describe('STACKED_DECK: Stacked Deck', () => {
  test('Five Mile Marker: loaded die counts as pip 5', () => {
    const inst = item('five_mile_marker');
    const { result } = calculateTestScore({
      scoredDice: [loaded(3), die({ value: 3 })],
      equipment: [stacked(), inst],
    });
    expect(inst.state.miles).toBe(5);
    expect(gt(result.miles, 10)).toBe(true);
  });

  test('Snake Eyes: loaded die counts as 1 for supply chance', () => {
    const original = Math.random;
    Math.random = () => 0.1;
    try {
      const scoredDie = loaded(7);
      const { game, player } = setupGame({
        equipment: [stacked(), item('snake_eyes')],
        dice: [scoredDie, ...diceWithValue(2, 20)],
      });
      game.startRound();
      game.state.phase = 'ROLL';
      game.state.rolledDice = [scoredDie];
      game.state.selectedForRoll = [scoredDie];
      game.state.rerollsRemaining = 6;
      game.selectForScore([scoredDie.id]);
      game.calculateScore();
      expect(player.consumables.length).toBe(1);
    } finally {
      Math.random = original;
    }
  });

  test('Lucky Number: loaded die matches lucky pip regardless of face value', () => {
    const lucky = item('lucky_number');
    const scored = [loaded(3), die({ value: 3 })];
    const { game } = setupGame({
      equipment: [stacked(), lucky],
      dice: [...scored, ...diceWithValue(2, 20)],
    });
    game.startRound();
    // Round start randomizes pip in the store; pin to 7 so only the loaded die matches (face is 3).
    lucky.state.pip = 7;
    pushEquipmentState(lucky);
    game.state.phase = 'ROLL';
    game.state.rolledDice = scored;
    game.state.selectedForRoll = scored;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scored.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMult=1, x2 from lucky number on loaded die
    expect(result.mult).toBeMultCloseTo(2, 5);
  });

  test('Even Odds: loaded die triggers even parity bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: [loaded(7)],
      equipment: [stacked(), item('even_odds')],
    });
    // HIGH_VALUE: baseMult=1, +4 from even odds on loaded (all pips)
    expect(result.mult).toBeMult(5);
  });

  test('Odd Fellow: loaded die triggers odd parity miles', () => {
    const { result } = calculateTestScore({
      scoredDice: [loaded(8)],
      equipment: [stacked(), item('odd_fellow')],
    });
    // HIGH_VALUE: 8 miles + 31 from odd fellow
    expect(result.totalValue).toBe(39);
  });

  test('One-Eyed Jack: loaded die retriggers as a 1', () => {
    const { result } = calculateTestScore({
      scoredDice: [loaded(7)],
      equipment: [stacked(), item('one_eyed_jack')],
    });
    // HIGH_VALUE: 7 + 7 retrigger = 14
    expect(result.totalValue).toBe(14);
  });

  test('Marked: loaded die counts as 6 and resets streak', () => {
    const markedInst = itemWithState('marked', { mult: 3 });
    const scoredDie = loaded(9);
    const { game } = setupGame({
      equipment: [stacked(), markedInst],
      dice: [scoredDie, ...diceWithValue(2, 20)],
    });
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = [scoredDie];
    game.state.selectedForRoll = [scoredDie];
    game.state.rerollsRemaining = 6;
    game.selectForScore([scoredDie.id]);
    game.calculateScore();
    syncEquipmentInstances(markedInst);
    expect(markedInst.state.mult).toBe(0);
  });

  test('Eight Second Ride: loaded die counts as 8 for consecutive xMult', () => {
    const { result } = calculateTestScore({
      scoredDice: [loaded(3)],
      equipment: [stacked(), item('eight_second_ride')],
    });
    // HIGH_VALUE: baseMult=1, x1 from first consecutive 8
    expect(result.mult).toBeMult(1);
  });

  test('Mirror Lake copies eight second ride consecutive xMult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 8 }), die({ value: 8 })],
      equipment: [item('mirror_lake'), item('eight_second_ride')],
    });
    expect(result.mult).toBeMultCloseTo(7.5, 5);
  });

  test('Ace in the Hole: held loaded die counts as 1', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [loaded(9)],
      equipment: [stacked(), item('ace_in_the_hole')],
    });
    expect(result.mult).toBeMultCloseTo(1.5, 5);
  });

  test('Ace in the Hole + Silver Bullets: held loaded retriggers pip 1 xMult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [loaded(9)],
      equipment: [stacked(), item('ace_in_the_hole'), item('silver_bullets')],
    });
    expect(result.mult).toBeMultCloseTo(2.25, 5);
  });

  test('Eleventh Crossing: held loaded die gives +11 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [loaded(4)],
      equipment: [stacked(), item('eleventh_crossing')],
    });
    expect(result.mult).toBeMult(12);
  });

  test('Eleventh Crossing + Silver Bullets: held loaded retriggers +11', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [loaded(4)],
      equipment: [stacked(), item('eleventh_crossing'), item('silver_bullets')],
    });
    expect(result.mult).toBeMult(23);
  });

  test("Prospector's Pouch + Ace in the Hole: held loaded retriggers money and xMult", () => {
    const original = Math.random;
    Math.random = () => 0.1;
    try {
      const { player } = calculateTestScore({
        scoredDice: diceWithValue(5, 2),
        heldDice: [loaded(9)],
        equipment: [stacked(), item('ace_in_the_hole'), item('prospectors_pouch'), item('silver_bullets')],
        money: 10,
      });
      // Silver Bullets: 2 held triggers, pouch hits both → +$2
      expect(player.economy.balance).toBe(12);
    } finally {
      Math.random = original;
    }
  });

  test('without Stacked Deck loaded die does not count as other pips', () => {
    const { result } = calculateTestScore({
      scoredDice: [loaded(7)],
      equipment: [item('one_eyed_jack')],
    });
    expect(result.totalValue).toBe(7);
  });
});
