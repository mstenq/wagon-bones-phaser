import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, diceFromValues, item, itemWithState, calculateTestScore, setupGame, resetDieIds } from '../testHelpers';
import { processEquipmentOnHandPlayed, processEquipmentOnRoundStart } from '../../EquipmentEffects';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── HAND_MULT Items ───

describe('HAND_MULT: Wedding Ring (pair, +8)', () => {
  test('activates on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('wedding_ring')],
    });
    // PAIR: baseMult=1, +8 = 9
    expect(result.mult).toBe(9);
  });

  test('activates on full house (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 3), ...diceWithValue(7, 2)],
      equipment: [item('wedding_ring')],
    });
    // FULL_HOUSE: baseMult=4, +8 = 12
    expect(result.mult).toBe(12);
  });

  test('activates on three of a kind (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('wedding_ring')],
    });
    // THREE_OF_A_KIND: baseMult=3, +8 = 11
    expect(result.mult).toBe(11);
  });

  test('does not activate on high value', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
      equipment: [item('wedding_ring')],
    });
    expect(result.mult).toBe(1);
  });

  test('does not activate on straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([4, 5, 6, 7]),
      equipment: [item('wedding_ring')],
    });
    // FOUR_STRAIGHT: baseMult=2, no pair → no bonus from wedding ring
    expect(result.mult).toBe(2);
  });
});

describe('HAND_MULT: Town Choir (three of a kind, +12)', () => {
  test('activates on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('town_choir')],
    });
    // THREE_OF_A_KIND: baseMult=3, +12 = 15
    expect(result.mult).toBe(15);
  });

  test('activates on full house (contains three of a kind)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(4, 3), ...diceWithValue(9, 2)],
      equipment: [item('town_choir')],
    });
    // FULL_HOUSE: baseMult=4, +12 = 16
    expect(result.mult).toBe(16);
  });

  test('activates on four of a kind (contains three of a kind)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 4),
      equipment: [item('town_choir')],
    });
    // FOUR_OF_A_KIND: baseMult=5, +12 = 17
    expect(result.mult).toBe(17);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('town_choir')],
    });
    // PAIR: baseMult=1, no three of a kind → no bonus
    expect(result.mult).toBe(1);
  });
});

describe('HAND_MULT: Deputy Brothers (two pair, +10)', () => {
  test('activates on two pair', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 2), ...diceWithValue(8, 2)],
      equipment: [item('deputy_brothers')],
    });
    // TWO_PAIR: baseMult=2, +10 = 12
    expect(result.mult).toBe(12);
  });

  test('activates on full house (contains two pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 3), ...diceWithValue(8, 2)],
      equipment: [item('deputy_brothers')],
    });
    // FULL_HOUSE: baseMult=4, +10 = 14
    expect(result.mult).toBe(14);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('deputy_brothers')],
    });
    expect(result.mult).toBe(1);
  });
});


// ─── HAND_MILES Items ───

describe('HAND_MILES: Work Boots (pair, +50 miles)', () => {
  test('adds miles on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('work_boots')],
    });
    // PAIR: baseMiles=10, baseMult=1, totalValue=10
    // Equipment: +50 bonusMiles
    // finalMiles = (10 + 10 + 50) * 1 = 70
    expect(result.miles).toBe(70);
  });

  test('activates on full house (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(5, 3), ...diceWithValue(8, 2)],
      equipment: [item('work_boots')],
    });
    // FULL_HOUSE: baseMiles=25, baseMult=4, totalValue=31
    // +50 bonusMiles
    // finalMiles = (25 + 31 + 50) * 4 = 424
    expect(result.miles).toBe(424);
  });

  test('does not activate on high value', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
      equipment: [item('work_boots')],
    });
    // HIGH_VALUE: baseMiles=5, totalValue=10, no bonus
    // miles = (5 + 10 + 0) * 1 = 15
    expect(result.miles).toBe(15);
  });
});

describe('HAND_MILES: Buffalo Stampede (three of a kind, +100 miles)', () => {
  test('adds miles on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
      equipment: [item('buffalo_stampede')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3, totalValue=12
    // +100 bonusMiles
    // finalMiles = (20 + 12 + 100) * 3 = 396
    expect(result.miles).toBe(396);
  });

  test('activates on four of a kind (contains three of a kind)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 4),
      equipment: [item('buffalo_stampede')],
    });
    // FOUR_OF_A_KIND: baseMiles=40, baseMult=5, totalValue=16
    // +100 bonusMiles
    // finalMiles = (40 + 16 + 100) * 5 = 780
    expect(result.miles).toBe(780);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('buffalo_stampede')],
    });
    // PAIR: baseMiles=10, totalValue=8, no bonus
    // miles = (10 + 8 + 0) * 1 = 18
    expect(result.miles).toBe(18);
  });
});

// ─── HAND_MULT_GAIN: Card Counter ───

describe('HAND_MULT_GAIN: Card Counter', () => {
  test('starts at +0 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('card_counter')],
    });
    expect(result.mult).toBe(1);
  });

  test('gains +2 mult when two pair is played', () => {
    const inst = item('card_counter');
    processEquipmentOnHandPlayed([inst], HandType.TWO_PAIR);
    expect(inst.state.mult).toBe(2);
  });

  test('gains mult from full house (contains two pair)', () => {
    const inst = item('card_counter');
    processEquipmentOnHandPlayed([inst], HandType.FULL_HOUSE);
    expect(inst.state.mult).toBe(2);
  });

  test('does NOT gain from pair (does not contain two pair)', () => {
    const inst = item('card_counter');
    processEquipmentOnHandPlayed([inst], HandType.PAIR);
    expect(inst.state.mult).toBe(0);
  });

  test('accumulates over multiple hands', () => {
    const inst = item('card_counter');
    processEquipmentOnHandPlayed([inst], HandType.TWO_PAIR);
    processEquipmentOnHandPlayed([inst], HandType.TWO_PAIR);
    processEquipmentOnHandPlayed([inst], HandType.TWO_PAIR);
    expect(inst.state.mult).toBe(6);

    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1 + 6 = 7
    expect(result.mult).toBe(7);
  });
});

// ─── HAND_MILES Items ───

describe('HAND_MILES: Twin Colts (TWO_PAIR, +80 miles)', () => {
  test('adds miles when hand is TWO_PAIR', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 2), ...diceWithValue(7, 2)],
      equipment: [item('twin_colts')],
    });
    // TWO_PAIR: baseMiles=15, +80 = 95, baseMult=2
    // totalValue = 3+3+7+7 = 20
    // miles = (95 + 20) * 2 = 230
    expect(result.miles).toBe(230);
  });

  test('does not trigger on non-TWO_PAIR hand', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 3),
      equipment: [item('twin_colts')],
    });
    // THREE_OF_A_KIND: baseMiles=20, no bonus from twin_colts
    // totalValue = 15, miles = (20 + 15) * 3 = 105
    expect(result.miles).toBe(105);
  });
});

describe('HAND_MILES: Rail Line (FOUR_STRAIGHT, +80 miles)', () => {
  test('adds miles when hand is FOUR_STRAIGHT', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([3, 4, 5, 6]),
      equipment: [item('rail_line')],
    });
    // FOUR_STRAIGHT: baseMiles=15, +80 = 95, baseMult=2
    // totalValue = 18, miles = (95 + 18) * 2 = 226
    expect(result.miles).toBe(226);
  });

  test('does not trigger on non-FOUR_STRAIGHT hand', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('rail_line')],
    });
    // PAIR: baseMiles=10, no bonus
    expect(result.miles).toBe((10 + 10) * 1);
  });
});

describe('HAND_MILES: Long Haul (FIVE_STRAIGHT, +100 miles)', () => {
  test('adds miles when hand is FIVE_STRAIGHT', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([2, 3, 4, 5, 6]),
      equipment: [item('long_haul')],
    });
    // FIVE_STRAIGHT: baseMiles=40, +100 = 140, baseMult=6
    // totalValue = 20, miles = (140 + 20) * 6 = 960
    expect(result.miles).toBe(960);
  });
});

// ─── HAND_TIMES_PLAYED_MULT: Trail Journal ───

describe('HAND_TIMES_PLAYED_MULT: Trail Journal', () => {
  test('adds 0 mult if hand has never been played', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('trail_journal')],
    });
    // PAIR: baseMult=1, +0 from trail journal = 1
    expect(result.mult).toBe(1);
  });

  test('adds timesPlayed as mult after hand has been played', () => {
    const { game, player } = setupGame({ equipment: [item('trail_journal')] });
    player.recordHandPlayed(HandType.PAIR);
    player.recordHandPlayed(HandType.PAIR);
    player.recordHandPlayed(HandType.PAIR);

    const dice = diceWithValue(5, 2);
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = dice;
    game.state.selectedForRoll = dice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(dice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMult=1, +3 from trail journal = 4
    expect(result.mult).toBe(4);
  });

  test('uses correct hand type count', () => {
    const { game, player } = setupGame({ equipment: [item('trail_journal')] });
    player.recordHandPlayed(HandType.PAIR);
    player.recordHandPlayed(HandType.THREE_OF_A_KIND);
    player.recordHandPlayed(HandType.PAIR);

    const dice = diceWithValue(5, 2);
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = dice;
    game.state.selectedForRoll = dice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(dice.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR played 2 times → +2 mult
    expect(result.mult).toBe(3);
  });
});

// ─── WANTED_HAND_MONEY: Wanted Poster ───

describe('WANTED_HAND_MONEY: Wanted Poster', () => {
  test('earns $4 when hand matches target', () => {
    const inst = item('wanted_poster');
    const handTypes = Object.values(HandType);
    const pairIdx = handTypes.indexOf(HandType.PAIR);

    const { game, player } = setupGame({
      equipment: [inst],
      dice: [...diceWithValue(5, 2), ...diceWithValue(1, 50)],
      money: 10,
    });

    game.startRound();
    // Set target AFTER startRound (which randomizes it)
    inst.state.targetHand = pairIdx;

    game.state.phase = 'ROLL';
    game.state.rolledDice = diceWithValue(5, 2);
    game.state.selectedForRoll = game.state.rolledDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(game.state.rolledDice.map((d) => d.id));
    game.calculateScore();
    expect(player.economy.balance).toBe(14);
  });

  test('does not earn when hand does not match', () => {
    const inst = item('wanted_poster');
    const handTypes = Object.values(HandType);
    const threeIdx = handTypes.indexOf(HandType.THREE_OF_A_KIND);

    const { game, player } = setupGame({
      equipment: [inst],
      dice: [...diceWithValue(5, 2), ...diceWithValue(1, 50)],
      money: 10,
    });

    game.startRound();
    // Set target AFTER startRound (which randomizes it)
    inst.state.targetHand = threeIdx;

    game.state.phase = 'ROLL';
    game.state.rolledDice = diceWithValue(5, 2);
    game.state.selectedForRoll = game.state.rolledDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(game.state.rolledDice.map((d) => d.id));
    game.calculateScore();
    expect(player.economy.balance).toBe(10);
  });

  test('randomizes target hand on round start', () => {
    const inst = item('wanted_poster');
    inst.state.targetHand = 0;
    processEquipmentOnRoundStart([inst]);
    const handTypes = Object.values(HandType);
    expect(inst.state.targetHand).toBeGreaterThanOrEqual(0);
    expect(inst.state.targetHand).toBeLessThan(handTypes.length);
  });
});

// ─── HAND_MULT: Rail Splitter (4 straight, +8) ───

describe('HAND_MULT: Rail Splitter (4 straight, +8)', () => {
  test('activates on 4 straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([3, 4, 5, 6]),
      equipment: [item('rail_splitter')],
    });
    // FOUR_STRAIGHT: baseMult=2, +8 = 10
    expect(result.mult).toBe(10);
  });

  test('activates on 5 straight (contains 4 straight)', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([3, 4, 5, 6, 7]),
      equipment: [item('rail_splitter')],
    });
    // FIVE_STRAIGHT: baseMult=6, +8 = 14
    expect(result.mult).toBe(14);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('rail_splitter')],
    });
    expect(result.mult).toBe(1);
  });
});

// ─── HAND_MULT: Open Range (5 straight, +12) ───

describe('HAND_MULT: Open Range (5 straight, +12)', () => {
  test('activates on 5 straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([3, 4, 5, 6, 7]),
      equipment: [item('open_range')],
    });
    // FIVE_STRAIGHT: baseMult=6, +12 = 18
    expect(result.mult).toBe(18);
  });

  test('does not activate on 4 straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([3, 4, 5, 6]),
      equipment: [item('open_range')],
    });
    // FOUR_STRAIGHT: baseMult=2, no bonus
    expect(result.mult).toBe(2);
  });

  test('does not activate on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('open_range')],
    });
    expect(result.mult).toBe(1);
  });
});
