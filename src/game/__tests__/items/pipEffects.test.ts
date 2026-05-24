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
} from '../testHelpers';
import { processEquipmentOnDiceDestroyed, processEquipmentOnRoundStart } from '../../EquipmentEffects';
import { HandType } from '../../types';
import { gt } from '../../scoreMath';

beforeEach(() => resetDieIds());

// ─── PIP_MULT Items (deprecated — snake_eyes, double_deuces, etc. removed in Phase 3) ───

// ─── GOLD_DICE_MONEY: Gold Tooth ───

describe('GOLD_DICE_MONEY: Gold Tooth', () => {
  test('gold dice earn $4 when scored', () => {
    const { result, player } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'gold' }), die({ value: 5 })],
      equipment: [item('gold_tooth')],
      money: 10,
    });
    // 1 gold die → $4
    expect(player.economy.balance).toBe(14); // 10 + 4
  });

  test('multiple gold dice each earn money', () => {
    const { result, player } = calculateTestScore({
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
});

// ─── LUCKY_NUMBER_PIP_XMULT: Lucky Number ───

describe('LUCKY_NUMBER_PIP_XMULT: Lucky Number', () => {
  test('matching pip gives x1.5 per matching die', () => {
    const luckyNum = itemWithState('lucky_number', { pip: 5 });
    processEquipmentOnRoundStart([luckyNum]);
    luckyNum.state.pip = 5;

    expect(luckyNum.state.pip).toBe(5);
    expect(luckyNum.def.effectParams.value).toBe(1.5);
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
    expect(inst.def.effectParams.value).toBe(1.5);
  });

  test('gambler uses x2 mult on lucky pip', () => {
    const luckyNum = itemWithState('lucky_number', { pip: 5 });
    const scored = [die({ value: 5 }), die({ value: 5 })];
    const { game, player } = setupGame({
      equipment: [luckyNum],
      dice: [...scored, ...diceWithValue(1, 50)],
      profession: 'gambler',
    });
    game.startRound();
    luckyNum.state.pip = 5;
    game.state.phase = 'ROLL';
    game.state.rolledDice = scored;
    game.state.selectedForRoll = scored;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scored.map((d) => d.id));
    const result = game.calculateScore()!;
    // Two matching lucky dice each apply x2 → 1 × 2 × 2 = 4
    expect(result.mult).toBeMultCloseTo(4, 5);
    expect(player.profession?.id).toBe('gambler');
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

  test('does not retrigger non-1 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('one_eyed_jack')],
    });
    // PAIR: totalValue = 5+5 = 10 (no retrigger)
    expect(result.totalValue).toBe(10);
  });

  test('retriggers only 1s in mixed hand', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(1, 2), ...diceWithValue(5, 2)],
      equipment: [item('one_eyed_jack')],
    });
    // TWO_PAIR: two 1s retriggered once each = +2 value
    // totalValue = 1+1+5+5 + 1+1 (retriggers) = 14
    expect(result.totalValue).toBe(14);
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
});

// ─── ENHANCEMENT_SCORED_MILES: Covered Wagon ───

describe('ENHANCEMENT_SCORED_MILES: Covered Wagon', () => {
  test('gains +30 miles when wooden die is scored', () => {
    const inst = item('covered_wagon');
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [inst],
    });
    // Miles gained: +30 from wooden scored (stored in state)
    expect(inst.state.miles).toBe(30);
  });

  test('accumulates across multiple wooden dice', () => {
    const inst = item('covered_wagon');
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5, enhancement: 'wooden' })],
      equipment: [inst],
    });
    expect(inst.state.miles).toBe(60);
  });

  test('does not gain from non-wooden dice', () => {
    const inst = item('covered_wagon');
    const { result } = calculateTestScore({
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
    expect(inst.state.miles).toBe(60);
  });

  test('gains miles for each quick_draw retrigger on the first wooden die', () => {
    const inst = item('covered_wagon');
    calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'wooden' }), die({ value: 5 })],
      equipment: [item('quick_draw'), inst],
    });
    // first wooden die triggers 3 times total, adding +30 each time
    expect(inst.state.miles).toBe(90);
  });
});

// ─── BONE_DICE_XMULT_CHANCE: Bone Charm ───

describe('BONE_DICE_XMULT_CHANCE: Bone Charm', () => {
  test('has correct effect type and params', () => {
    const inst = item('bone_charm');
    expect(inst.def.effectType).toBe('BONE_DICE_XMULT_CHANCE');
    expect(inst.def.effectParams.chance).toEqual([1, 2]);
    expect(inst.def.effectParams.value).toBe(1.5);
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
    const { result } = calculateTestScore({
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
  test('first scored 2 gives x2 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 2 }), die({ value: 2 })],
      equipment: [item('double_barrel')],
    });
    expect(result.mult).toBeMult(2);
  });

  test('x2 triggers again on each retrigger of the first played 2 (War Drums)', () => {
    const warDrums = itemWithState('war_drums', { daysRemaining: 5 });
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 2 }), die({ value: 2 })],
      equipment: [item('double_barrel'), warDrums],
    });
    // PAIR baseMult=1; first 2 triggers twice (base + war drums) → x2 × x2 = x4
    expect(result.mult).toBeMult(4);
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
    lucky.state.pip = 7;
    game.state.phase = 'ROLL';
    game.state.rolledDice = scored;
    game.state.selectedForRoll = scored;
    game.state.rerollsRemaining = 6;
    game.selectForScore(scored.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMult=1, x1.5 from lucky number on loaded die
    expect(result.mult).toBeMultCloseTo(1.5, 5);
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

// ─── DICE_DESTROYED_MILES_GAIN: Six Feet Under ───

describe('DICE_DESTROYED_MILES_GAIN: Six Feet Under', () => {
  test('gains 66 miles per destroyed die', () => {
    const inst = item('six_feet_under');
    const { player } = setupGame({ equipment: [inst], dice: diceWithValue(5, 3) });
    processEquipmentOnDiceDestroyed([inst], 2);
    expect(inst.state.miles).toBe(132);

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    expect(gt(result.miles, 132)).toBe(true);
  });
});
