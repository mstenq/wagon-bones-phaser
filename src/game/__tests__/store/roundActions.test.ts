import '../setup';
import { afterEach, describe, expect, test } from 'bun:test';
import { resetPlayerState } from '../../__tests__/testRunPlayer';
import { setupGame, diceWithValue, item } from '../testHelpers';
import { D } from '../../scoreMath';
import { getRunRoundBackgroundIndex } from '../../roundBackgrounds';
import {
  roundActions,
  roundStore,
  getRunState,
  runStore,
  runActions,
  selectHandDice,
  selectRolledDice,
  selectRoundPhase,
} from '../../store';
import { die, seedTestRoll } from '../testHelpers';
import { deserializeRunState, serializeRunState } from '../../store/serialization';
import { setupActions } from '../../store/actions';
import { GAMEPLAY } from '../../Constants';

describe('round store actions', () => {
  afterEach(() => {
    resetPlayerState();
  });

  test('startRound computes config and enters SELECT', () => {
    const { player } = setupGame({ dice: diceWithValue(6, 8) });
    setupActions.finalizeRunSetup();
    player.handSize = 5;
    roundActions.startRound({ targetMiles: D(400) });

    const round = roundStore.getState();
    expect(round).not.toBeNull();
    expect(round!.config.targetMiles).toBeMiles(400);
    expect(round!.config.rollSize).toBe(5);
    expect(selectRoundPhase()).toBe('SELECT');
    expect(selectHandDice().length).toBeGreaterThan(0);
  });

  test('selectForRoll transitions to ROLL with rolled values', () => {
    setupGame({ dice: diceWithValue(6, 8) });
    roundActions.startRound();
    const handIds = selectHandDice()
      .slice(0, 5)
      .map((d) => d.id);
    expect(roundActions.selectForRoll(handIds)).toBe(true);
    expect(selectRoundPhase()).toBe('ROLL');
    expect(selectRolledDice().length).toBe(5);
  });

  test('reroll decrements rerolls remaining', () => {
    setupGame({ dice: diceWithValue(6, 8) });
    roundActions.startRound();
    const handIds = selectHandDice()
      .slice(0, 5)
      .map((d) => d.id);
    roundActions.selectForRoll(handIds);
    const before = roundStore.getState()!.rerollsRemaining;
    const rolledId = selectRolledDice()[0]!.id;
    expect(roundActions.reroll([rolledId])).toBe(true);
    expect(roundStore.getState()!.rerollsRemaining).toBe(before - 1);
  });

  test('calculateScore updates total miles and DAY_END', () => {
    const { game } = setupGame({ dice: diceWithValue(7, 8) });
    game.startRound();
    const handIds = game.state.hand.slice(0, 2).map((d) => d.id);
    game.selectForRoll(handIds);
    game.selectForScore(handIds);
    const score = game.calculateScore();
    expect(score).not.toBeNull();
    expect(roundStore.getState()!.phase).toBe('DAY_END');
    expect(roundStore.getState()!.totalMiles.gt(0)).toBe(true);
  });

  test('calculateScore enqueues score playback command', () => {
    const { game } = setupGame({ dice: diceWithValue(7, 8) });
    game.startRound();
    const handIds = game.state.hand.slice(0, 2).map((d) => d.id);
    game.selectForRoll(handIds);
    game.selectForScore(handIds);
    const score = game.calculateScore();
    expect(score).not.toBeNull();
    expect(runStore.getState().playbackQueue).toEqual([{ kind: 'score', result: score! }]);
  });

  test('calculateScore does not enqueue when validation fails', () => {
    setupGame({ dice: diceWithValue(7, 8) });
    roundActions.startRound();
    expect(roundActions.calculateScore()).toBeNull();
    expect(runStore.getState().playbackQueue).toEqual([]);
  });

  test('endDay on win enqueues round-end-held for gold dice held', () => {
    const goldHeld = die({ value: 4, enhancement: 'gold' });
    const scored = die({ value: 7 });
    const filler = die({ value: 6 });
    setupGame({ dice: [goldHeld, scored, filler] });
    roundActions.startRound({ targetMiles: D(1) });
    seedTestRoll([goldHeld, scored, filler]);
    roundActions.selectForScore([scored.id]);
    roundActions.calculateScore();
    runActions.clearPlayback();
    const result = roundActions.endDay();
    expect(result.outcome).toBe('won');
    const heldCmd = runStore.getState().playbackQueue.find((c) => c.kind === 'score-events');
    expect(heldCmd).toMatchObject({ kind: 'score-events', label: 'round-end-held' });
    expect(heldCmd && heldCmd.kind === 'score-events' && heldCmd.events.length).toBeGreaterThan(0);
  });

  test('endDay on win pays held gold and steel as gold with alchemy kit', () => {
    const goldHeld = die({ value: 4, enhancement: 'gold' });
    const steelHeld = die({ value: 5, enhancement: 'steel' });
    const scored = die({ value: 7 });
    const filler = die({ value: 6 });
    setupGame({
      dice: [goldHeld, steelHeld, scored, filler],
      equipment: [item('alchemy_kit')],
      money: 10,
    });
    roundActions.startRound({ targetMiles: D(1) });
    seedTestRoll([goldHeld, steelHeld, scored, filler]);
    roundActions.selectForScore([scored.id]);
    roundActions.calculateScore();
    const result = roundActions.endDay();
    expect(result.outcome).toBe('won');
    expect(getRunState().balance).toBe(10 + GAMEPLAY.GOLD_DICE_HELD_MONEY * 2);
    const heldCmd = runStore.getState().playbackQueue.find((c) => c.kind === 'score-events');
    const moneyEvents =
      heldCmd && heldCmd.kind === 'score-events' ? heldCmd.events.filter((e) => e.popupType === 'money') : [];
    expect(moneyEvents).toHaveLength(2);
    expect(moneyEvents).toContainEqual(
      expect.objectContaining({ value: GAMEPLAY.GOLD_DICE_HELD_MONEY, dieId: goldHeld.id }),
    );
    expect(moneyEvents).toContainEqual(
      expect.objectContaining({ value: GAMEPLAY.GOLD_DICE_HELD_MONEY, dieId: steelHeld.id }),
    );
  });

  test('endDay advances day on next-day outcome', () => {
    setupGame({ dice: diceWithValue(6, 12) });
    roundActions.startRound();
    const handIds = selectHandDice()
      .slice(0, 5)
      .map((d) => d.id);
    roundActions.selectForRoll(handIds);
    roundActions.selectForScore(handIds.slice(0, 2));
    roundActions.calculateScore();
    const result = roundActions.endDay();
    expect(result.outcome).toBe('next-day');
    expect(roundStore.getState()!.day).toBe(2);
    expect(selectRoundPhase()).toBe('SELECT');
  });

  test('restoreRound reproduces legacy snapshot', () => {
    const { game } = setupGame({ dice: diceWithValue(6, 8) });
    game.startRound();
    game.state.day = 2;
    game.state.phase = 'ROLL';
    game.state.totalMiles = D(50);
    const snapshot = { ...game.state };
    const config = { ...game.config };
    roundActions.clearRound();
    roundActions.restoreRound(config, snapshot);
    expect(roundStore.getState()!.day).toBe(2);
    expect(roundStore.getState()!.phase).toBe('ROLL');
    expect(roundStore.getState()!.totalMiles).toBeMiles(50);
  });

  test('winning round sets ROUND_END', () => {
    setupGame({ dice: diceWithValue(12, 8) });
    roundActions.startRound({ targetMiles: D(1) });
    const handIds = selectHandDice()
      .slice(0, 5)
      .map((d) => d.id);
    roundActions.selectForRoll(handIds);
    roundActions.selectForScore(handIds);
    roundActions.calculateScore();
    const result = roundActions.endDay();
    expect(result.outcome).toBe('won');
    expect(selectRoundPhase()).toBe('ROUND_END');
  });

  test('startRound assigns round background index persisted across save round-trip', () => {
    setupGame({ dice: diceWithValue(6, 8) });
    roundActions.startRound();

    const index = getRunState().roundBackgroundIndex!;
    expect(index).toBeGreaterThanOrEqual(1);
    expect(index).toBeLessThanOrEqual(GAMEPLAY.ROUND_BACKGROUND_COUNT);
    expect(getRunRoundBackgroundIndex(getRunState())).toBe(index);

    const restored = deserializeRunState(serializeRunState(getRunState()));
    expect(getRunRoundBackgroundIndex(restored)).toBe(index);
  });
});
