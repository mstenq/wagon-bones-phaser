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
  playScoredDayAndEnd,
} from '../testHelpers';
import { GameState } from '../testGameState';
import { HandType, type Die, type ScoreResult } from '../../types';
import { processEquipmentOnHandPlayed, processEquipmentOnRoundStart } from '../../EquipmentEffects';
import { D } from '../../scoreMath';
import { getRoundState } from '../../store/roundStore';
import { roundActions } from '../../store';

function freshTrailEquipMilesBonus(result: ScoreResult, equipIndex = 0): number {
  return result.animEvents
    .filter((e) => e.popupType === 'miles' && e.target.kind === 'equip' && e.target.equipIndex === equipIndex)
    .reduce((sum, e) => sum + (typeof e.value === 'number' ? e.value : 0), 0);
}

function playDayAndGetScore(game: GameState, rolledDice: Die[], options?: { avoidWin?: boolean }): ScoreResult {
  if (options?.avoidWin) {
    game.config.targetMiles = D(999_999);
  }
  playScoredDayAndEnd(game, { rolledDice, avoidWin: options?.avoidWin });
  const last = getRoundState()?.lastScoreResult;
  if (!last) throw new Error('missing lastScoreResult after playScoredDayAndEnd');
  return last;
}

beforeEach(() => resetDieIds());

// ─── CONDITIONAL_MULT Items ───

describe('CONDITIONAL_MULT: Deadeye (scored ≤3 dice, +20 mult)', () => {
  test('activates when scoring 1 die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
      equipment: [item('deadeye')],
    });
    // HIGH_VALUE: baseMult=1, +20 = 21
    expect(result.mult).toBeMult(21);
  });

  test('activates when scoring 2 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('deadeye')],
    });
    // PAIR: baseMult=1, +20 = 21
    expect(result.mult).toBeMult(21);
  });

  test('activates when scoring 3 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('deadeye')],
    });
    // THREE_OF_A_KIND: baseMult=3, +20 = 23
    expect(result.mult).toBeMult(23);
  });

  test('does NOT activate when scoring 4 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 4),
      equipment: [item('deadeye')],
    });
    // FOUR_OF_A_KIND: baseMult=5, no bonus
    expect(result.mult).toBeMult(5);
  });

  test('does NOT activate when scoring 5 dice', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 5),
      equipment: [item('deadeye')],
    });
    // FIVE_OF_A_KIND: baseMult=6, no bonus
    expect(result.mult).toBeMult(6);
  });
});

describe('CONDITIONAL_MULT: Stubborn Mule (no rerolls, +15 mult)', () => {
  test('activates when 0 rerolls remaining', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('stubborn_mule')],
      rerollsRemaining: 0,
    });
    // PAIR: baseMult=1, +15 = 16
    expect(result.mult).toBeMult(16);
  });

  test('does NOT activate when rerolls remain', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('stubborn_mule')],
      rerollsRemaining: 1,
    });
    // PAIR: baseMult=1, no bonus
    expect(result.mult).toBeMult(1);
  });

  test('does NOT activate with default rerolls (6)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('stubborn_mule')],
    });
    expect(result.mult).toBeMult(1);
  });
});

// ─── MILES_PER_UNUSED_REROLL Items ───

describe('MILES_PER_UNUSED_REROLL: Trail Rations (+30 miles per reroll)', () => {
  test('adds miles per unused reroll', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_rations')],
      rerollsRemaining: 2,
    });
    // PAIR: baseMiles=10, baseMult=1, totalValue=10
    // +30 * 2 = +60 bonusMiles
    // miles = (10 + 10 + 60) * 1 = 80
    expect(result.miles).toBeMiles(80);
  });

  test('0 rerolls = 0 bonus miles', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_rations')],
      rerollsRemaining: 0,
    });
    // PAIR: baseMiles=10, totalValue=10, +0
    // miles = (10 + 10 + 0) * 1 = 20
    expect(result.miles).toBeMiles(20);
  });

  test('scales with more rerolls', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_rations')],
      rerollsRemaining: 3,
    });
    // +30 * 3 = +90
    // miles = (10 + 10 + 90) * 1 = 110
    expect(result.miles).toBeMiles(110);
  });
});

// ─── MULT_PER_EQUIPMENT Items ───

describe('MULT_PER_EQUIPMENT: Toolbelt (+3 mult per equipment)', () => {
  test('counts itself (1 equipment)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('toolbelt')],
    });
    // PAIR: baseMult=1, +3 * 1 = +3 → mult=4
    expect(result.mult).toBeMult(4);
  });

  test('counts all equipment', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('toolbelt'), item('horseshoe'), item('horseshoe')],
    });
    // PAIR: baseMult=1
    // toolbelt: +3 * 3 = +9
    // horseshoe×2: +4+4 = +8
    // mult = 1 + 9 + 8 = 18
    expect(result.mult).toBeMult(18);
  });

  test('multiple toolbelts stack', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('toolbelt'), item('toolbelt')],
    });
    // PAIR: baseMult=1
    // Each toolbelt: +3 * 2 = +6
    // Total: 1 + 6 + 6 = 13
    expect(result.mult).toBeMult(13);
  });
});

// ─── MILES_PER_DOLLAR: Money Wagon ───

describe('MILES_PER_DOLLAR: Money Wagon', () => {
  test('adds +2 miles per dollar', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('money_wagon')],
      money: 10,
    });
    // PAIR: baseMiles=10, baseMult=1, totalValue=10
    // +2 * 10 = +20 bonusMiles
    // finalMiles = (10 + 10 + 20) * 1 = 40
    expect(result.miles).toBeMiles(40);
  });

  test('scales with higher balance', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('money_wagon')],
      money: 50,
    });
    // +2 * 50 = +100 bonusMiles
    // finalMiles = (10 + 10 + 100) * 1 = 120
    expect(result.miles).toBeMiles(120);
  });

  test('zero money = zero bonus', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('money_wagon')],
      money: 0,
    });
    // finalMiles = (10 + 10 + 0) * 1 = 20
    expect(result.miles).toBeMiles(20);
  });
});

// ─── ALL_DICE_SCORE: Open Palm ───

describe('ALL_DICE_SCORE: Open Palm', () => {
  test('all played dice count as scoring', () => {
    const dice = [die({ value: 5 }), die({ value: 5 }), die({ value: 3 }), die({ value: 7 }), die({ value: 9 })];
    const { result } = calculateTestScore({
      scoredDice: dice,
      equipment: [item('open_palm')],
    });
    // PAIR detected from two 5s, but all 5 dice contribute miles: 5+5+3+7+9 = 29
    expect(result.totalValue).toBe(29);
  });

  test('without open palm only scoring dice contribute', () => {
    const dice = [die({ value: 5 }), die({ value: 5 }), die({ value: 3 }), die({ value: 7 }), die({ value: 9 })];
    const { result } = calculateTestScore({
      scoredDice: dice,
      equipment: [],
    });
    // PAIR from the 5s — only two 5s contribute: 5+5 = 10
    expect(result.totalValue).toBe(10);
  });
});

describe('New conditional/additive mileage items', () => {
  test('supply caravan adds miles per equipment owned', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('supply_caravan'), item('horseshoe')],
    });
    expect(result.miles).toBeMiles(260);
  });

  test('pioneer spirit adds miles from all hand types above level 1', () => {
    const handLevels = { [HandType.PAIR]: 5, [HandType.FULL_HOUSE]: 2 };
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('pioneer_spirit')],
      handLevels,
    });
    const pioneerMiles = result.animEvents.filter(
      (e) => e.popupType === 'miles' && e.target.kind === 'equip' && e.target.equipIndex === 0,
    );
    // Pair L5 → 4×12, Full House L2 → 1×12, rest L1 → 0
    expect(pioneerMiles.map((e) => e.value)).toEqual([60]);
  });

  test('pioneer spirit bonus does not depend on played hand', () => {
    const handLevels = { [HandType.PAIR]: 5, [HandType.FULL_HOUSE]: 2 };
    const pioneerBonus = (result: ScoreResult) =>
      result.animEvents
        .filter((e) => e.popupType === 'miles' && e.target.kind === 'equip' && e.target.equipIndex === 0)
        .map((e) => e.value);

    const pairHand = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('pioneer_spirit')],
      handLevels,
    });
    const highHand = calculateTestScore({
      scoredDice: [die({ value: 12 }), die({ value: 11 }), die({ value: 9 }), die({ value: 8 }), die({ value: 7 })],
      equipment: [item('pioneer_spirit')],
      handLevels,
    });

    expect(pairHand.result.handResult.type).toBe(HandType.PAIR);
    expect(highHand.result.handResult.type).toBe(HandType.HIGH_VALUE);
    expect(pioneerBonus(pairHand.result)).toEqual([60]);
    expect(pioneerBonus(highHand.result)).toEqual([60]);
  });

  test('pioneer spirit adds nothing when every hand is level 1', () => {
    const withSpirit = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('pioneer_spirit')],
      handLevels: { [HandType.PAIR]: 1 },
    }).result.miles;
    const baseline = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [],
      handLevels: { [HandType.PAIR]: 1 },
    }).result.miles;
    expect(withSpirit).toEqual(baseline);
  });
});

describe('FRESH_TRAIL: Fresh Trail', () => {
  test('marks first hand of the round as fresh and accumulates miles', () => {
    const fresh = item('fresh_trail');
    processEquipmentOnHandPlayed([fresh], HandType.PAIR);
    expect(fresh.state.freshActive).toBe(1);
    expect(fresh.state.miles).toBe(5);
    processEquipmentOnHandPlayed([fresh], HandType.PAIR);
    expect(fresh.state.freshActive).toBe(0);
    expect(fresh.state.miles).toBe(5);
    processEquipmentOnHandPlayed([fresh], HandType.TWO_PAIR);
    expect(fresh.state.freshActive).toBe(1);
    expect(fresh.state.miles).toBe(10);
  });

  test('tracks new hand types across days in the same leg round', () => {
    const pairDice = diceWithValue(5, 2);
    const twoPairDice = [...diceWithValue(3, 2), ...diceWithValue(8, 2)];
    const { game, player } = setupGame({
      equipment: [item('fresh_trail')],
      dice: [...pairDice, ...twoPairDice, ...diceWithValue(1, 30)],
    });

    game.startRound();

    const day1 = playDayAndGetScore(game, pairDice, { avoidWin: true });
    expect(freshTrailEquipMilesBonus(day1)).toBe(5);
    player.syncFromStore();
    expect(player.equipment[0]?.state.miles).toBe(5);

    const day2 = playDayAndGetScore(game, pairDice, { avoidWin: true });
    expect(freshTrailEquipMilesBonus(day2)).toBe(0);
    player.syncFromStore();
    expect(player.equipment[0]?.state.miles).toBe(5);

    const day3 = playDayAndGetScore(game, twoPairDice, { avoidWin: true });
    expect(freshTrailEquipMilesBonus(day3)).toBe(10);
    player.syncFromStore();
    expect(player.equipment[0]?.state.miles).toBe(10);
  });

  test('accumulates miles across leg rounds', () => {
    const pairDice = diceWithValue(5, 2);
    const twoPairDice = [...diceWithValue(3, 2), ...diceWithValue(8, 2)];
    const fullHouseDice = [...diceWithValue(4, 3), die({ value: 9 })];
    const { game, player } = setupGame({
      equipment: [item('fresh_trail')],
      dice: [...pairDice, ...twoPairDice, ...fullHouseDice, ...diceWithValue(1, 40)],
    });

    game.startRound();

    playDayAndGetScore(game, pairDice, { avoidWin: true });
    playDayAndGetScore(game, twoPairDice, { avoidWin: true });
    player.syncFromStore();
    expect(player.equipment[0]?.state.miles).toBe(10);

    const maxDays = getRoundState()!.config.maxDays;
    while (getRoundState()!.day < maxDays) {
      playScoredDayAndEnd(game, { avoidWin: true });
    }

    roundActions.clearRound();
    game.startRound();

    const nextRoundScore = playDayAndGetScore(game, fullHouseDice, { avoidWin: true });
    expect(freshTrailEquipMilesBonus(nextRoundScore)).toBe(15);
    player.syncFromStore();
    expect(player.equipment[0]?.state.miles).toBe(15);
    expect(player.equipment[0]?.state.round_hand_PAIR ?? 0).toBe(0);
  });

  test('clears per-round hand tracking on round start but keeps miles', () => {
    const fresh = itemWithState('fresh_trail', { miles: 10, freshActive: 0, round_hand_PAIR: 1 });
    processEquipmentOnRoundStart([fresh]);
    expect(fresh.state.miles).toBe(10);
    expect(fresh.state.round_hand_PAIR ?? 0).toBe(0);
    processEquipmentOnHandPlayed([fresh], HandType.PAIR);
    expect(fresh.state.freshActive).toBe(1);
    expect(fresh.state.miles).toBe(15);
  });
});

// ─── FIRST_DAY_SOLO_COPY: Bloodline ───

describe('FIRST_DAY_SOLO_COPY: Bloodline', () => {
  test('copies die when scoring solo on first day', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 7, enhancement: 'gold' })],
      equipment: [item('bloodline')],
      currentDay: 1,
    });
    const goldDice = player.dice.filter((d) => d.enhancement === 'gold' && d.value === 7);
    expect(goldDice.length).toBeGreaterThanOrEqual(2);
  });

  test('does not copy if not first day', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 7, enhancement: 'gold' })],
      equipment: [item('bloodline')],
      currentDay: 2,
    });
    const goldDice = player.dice.filter((d) => d.enhancement === 'gold' && d.value === 7);
    expect(goldDice.length).toBeLessThanOrEqual(1);
  });

  test('does not copy if more than one die scored', () => {
    const { player } = calculateTestScore({
      scoredDice: diceWithValue(7, 2),
      equipment: [item('bloodline')],
      currentDay: 1,
    });
    const sevens = player.dice.filter((d) => d.value === 7);
    expect(sevens.length).toBeLessThanOrEqual(2);
  });
});

// ─── FIRST_HAND_ENHANCED_SIX: Hellfire Round ───

describe('FIRST_HAND_ENHANCED_SIX: Hellfire Round', () => {
  test('destroys solo enhanced 6 on first day and grants frontier card', () => {
    const enhanced6 = die({ value: 6, enhancement: 'bone' });
    const { player } = calculateTestScore({
      scoredDice: [enhanced6],
      equipment: [item('hellfire_round')],
      currentDay: 1,
    });
    const remaining = player.dice.filter((d) => d.id === enhanced6.id);
    expect(remaining.length).toBe(0);
    const frontier = player.consumables.filter((c) => c.def.category === 'frontier');
    expect(frontier.length).toBeGreaterThanOrEqual(1);
  });

  test('does not trigger when enhanced 6 is part of a multi-die hand', () => {
    const enhanced6 = die({ value: 6, enhancement: 'bone' });
    const { player } = calculateTestScore({
      scoredDice: [enhanced6, die({ value: 6 })],
      equipment: [item('hellfire_round')],
      currentDay: 1,
    });
    const remaining = player.dice.filter((d) => d.id === enhanced6.id);
    expect(remaining.length).toBe(1);
    const frontier = player.consumables.filter((c) => c.def.category === 'frontier');
    expect(frontier.length).toBe(0);
  });

  test('does not trigger if no enhanced 6', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 6 }), die({ value: 6 })],
      equipment: [item('hellfire_round')],
      currentDay: 1,
    });
    const frontier = player.consumables.filter((c) => c.def.category === 'frontier');
    expect(frontier.length).toBe(0);
  });

  test('does not trigger if not first day', () => {
    const { player } = calculateTestScore({
      scoredDice: [die({ value: 6, enhancement: 'bone' }), die({ value: 6 })],
      equipment: [item('hellfire_round')],
      currentDay: 2,
    });
    const frontier = player.consumables.filter((c) => c.def.category === 'frontier');
    expect(frontier.length).toBe(0);
  });
});

// ─── MULT_PER_MONEY_CHUNK: Oil Baron ───

describe('MULT_PER_MONEY_CHUNK: Oil Baron', () => {
  test('adds +2 mult per $5 held', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('oil_baron')],
      money: 25,
    });
    // PAIR: baseMult=1, +10 from oil baron (25/5*2)
    expect(result.mult).toBeMult(11);
  });
});

// ─── MULT_PER_MISSING_DICE: Ghost Town ───

describe('MULT_PER_MISSING_DICE: Ghost Town', () => {
  test('adds +10 mult per die below starting collection size', () => {
    const scoredDice = diceWithValue(5, 2);
    const { game, player } = setupGame({
      equipment: [item('ghost_town')],
      dice: [...scoredDice, ...diceWithValue(1, 18)],
    });
    player.startingDiceCount = 25;
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = player.dice.slice(0, 2);
    game.state.selectedForRoll = game.state.rolledDice;
    game.selectForScore(game.state.rolledDice.map((d) => d.id));
    const result = game.calculateScore()!;
    // 5 missing dice → +50 mult → 51 total
    expect(result.mult).toBeMult(51);
  });
});
