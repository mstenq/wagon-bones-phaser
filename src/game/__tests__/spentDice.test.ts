import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { diceFromValues, setupGame, resetDieIds } from './testHelpers';
import { resetPlayerState } from '../PlayerState';

beforeEach(() => {
  resetDieIds();
});

describe('spent dice persistence', () => {
  test('spent dice remain until round end', () => {
    const player = resetPlayerState();
    player.dice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);

    // Spend some dice
    player.markDiceSpent([player.dice[0].id, player.dice[1].id]);
    expect(player.spentDiceIds.size).toBe(2);
    expect(player.availableDice.length).toBe(6);

    // Advance round alone does not clear spent dice.
    player.advanceRound();

    expect(player.spentDiceIds.size).toBe(2);
    expect(player.availableDice.length).toBe(6);
    expect(player.spentDice.length).toBe(2);
  });

  test('startRound keeps existing spent dice state', () => {
    const { game, player } = setupGame({ dice: diceFromValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) });

    player.markDiceSpent([player.dice[0].id, player.dice[1].id, player.dice[2].id, player.dice[3].id]);
    expect(player.spentDiceIds.size).toBe(4);
    game.startRound();
    expect(player.spentDiceIds.size).toBe(4);
    expect(player.availableDice.length).toBe(6);
  });

  test('startRound draws from available dice without clearing spent', () => {
    const testDice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);
    const { game, player } = setupGame({ dice: testDice });

    player.markDiceSpent([player.dice[0].id, player.dice[1].id, player.dice[2].id]);
    game.startRound();
    expect(player.spentDiceIds.size).toBe(3);
    expect(game.state.spent.length).toBe(3);
    expect(game.state.hand.length).toBe(5);
  });

  test('auto-refresh triggers when all dice are spent', () => {
    const player = resetPlayerState();
    player.dice = diceFromValues([1, 2, 3]);

    // Spending all dice triggers auto-refresh
    const refreshed = player.markDiceSpent([player.dice[0].id, player.dice[1].id, player.dice[2].id]);
    expect(refreshed).toBe(true);
    expect(player.spentDiceIds.size).toBe(0);
    expect(player.availableDice.length).toBe(3);
  });

  test('spent dice persist within days of a round', () => {
    const testDice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);
    const { game, player } = setupGame({ dice: testDice });

    game.startRound();

    // Simulate scoring: manually spend some dice
    player.markDiceSpent([player.dice[0].id, player.dice[1].id]);
    expect(player.spentDiceIds.size).toBe(2);

    // Verify available dice reflect spent state
    expect(player.availableDice.length).toBe(6);
    expect(player.spentDice.length).toBe(2);
  });

  test('round is lost when next day cannot draw a full hand', () => {
    const testDice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);
    const { game, player } = setupGame({ dice: testDice, handSize: 8 });

    game.startRound();
    const allIds = game.state.hand.map((d) => d.id);
    expect(game.selectForRoll(allIds)).toBe(true);
    expect(game.selectForScore([allIds[0]])).toBe(true);
    expect(game.calculateScore()).not.toBeNull();

    const result = game.endDay();
    expect(result.outcome).toBe('lost');
    expect(game.state.phase).toBe('ROUND_END');
    expect(player.spentDiceIds.size).toBe(0);
  });

  test('round end refreshes spent dice after a win', () => {
    const testDice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8]);
    const { game, player } = setupGame({ dice: testDice, handSize: 8 });

    game.startRound();
    game.config.targetMiles = 1;
    const allIds = game.state.hand.map((d) => d.id);
    expect(game.selectForRoll(allIds)).toBe(true);
    expect(game.selectForScore([allIds[0]])).toBe(true);
    expect(game.calculateScore()).not.toBeNull();

    expect(player.spentDiceIds.size).toBe(0);
    const result = game.endDay();
    expect(result.outcome).toBe('won');
    expect(player.spentDiceIds.size).toBe(0);
    expect(player.availableDice.length).toBe(player.dice.length);
  });

  test('next day keeps unscored rolled dice and only refills missing count', () => {
    const testDice = diceFromValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const { game } = setupGame({ dice: testDice, handSize: 8 });

    game.startRound();
    game.config.targetMiles = 999999;
    const rolledIds = game.state.hand.map((d) => d.id);
    expect(game.selectForRoll(rolledIds)).toBe(true);
    expect(game.selectForScore([rolledIds[0]])).toBe(true);
    expect(game.calculateScore()).not.toBeNull();

    const unscoredRolled = new Set(rolledIds.slice(1));
    const result = game.endDay();
    expect(result.outcome).toBe('next-day');
    expect(game.state.hand).toHaveLength(8);

    const newHandIds = new Set(game.state.hand.map((d) => d.id));
    let carried = 0;
    for (const id of unscoredRolled) {
      if (newHandIds.has(id)) carried++;
    }
    expect(carried).toBe(7);
  });
});
