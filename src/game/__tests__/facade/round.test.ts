import '../setup';
import { afterEach, describe, expect, test } from 'bun:test';
import { gameFacade } from '../../facade';
import { setupGame, diceWithValue, seedTestRoll, resetTestRun, die } from '../testHelpers';
import { setupActions } from '../../store/actions';
import { getRunState, runStore } from '../../store/runStore';
import { getRoundState, roundStore } from '../../store/roundStore';
import { sceneActions } from '../../store/sceneStore';
import { selectHandDice, selectRoundPhase, selectRolledDice } from '../../store/selectors/roundSelectors';
import { D } from '../../scoreMath';
import { roundActions } from '../../store';

describe('gameFacade.round', () => {
  afterEach(() => {
    resetTestRun();
  });

  test('beginRoundSession starts fresh round with SELECT phase', () => {
    setupGame({ dice: diceWithValue(6, 8) });
    setupActions.finalizeRunSetup();

    gameFacade.round.beginRoundSession();

    expect(getRoundState()).not.toBeNull();
    expect(selectRoundPhase()).toBe('SELECT');
    expect(selectHandDice().length).toBeGreaterThan(0);
  });

  test('beginRoundSession restored path keeps existing round', () => {
    setupGame({ dice: diceWithValue(6, 8) });
    roundActions.startRound({ targetMiles: D(500) });
    const dayBefore = getRoundState()!.day;
    sceneActions.enterScene('Game');

    gameFacade.round.beginRoundSession({ restored: true });

    expect(getRoundState()!.day).toBe(dayBefore);
    expect(selectRoundPhase()).toBe('SELECT');
  });

  test('submitScore scores hand and enqueues playback', () => {
    setupGame({ dice: diceWithValue(7, 8) });
    gameFacade.round.beginRoundSession();

    const handIds = selectHandDice()
      .slice(0, 2)
      .map((d) => d.id);
    gameFacade.round.selectDiceForRoll(handIds);

    const result = gameFacade.round.submitScore(handIds);
    expect(result).not.toBeNull();
    expect(getRoundState()!.phase).toBe('DAY_END');
    expect(getRoundState()!.totalMiles.gt(0)).toBe(true);
    expect(runStore.getState().playbackQueue).toEqual([{ kind: 'score', result: result! }]);
  });

  test('submitScore returns null when selection invalid', () => {
    setupGame({ dice: diceWithValue(7, 8) });
    gameFacade.round.beginRoundSession();
    expect(gameFacade.round.submitScore([])).toBeNull();
    expect(runStore.getState().playbackQueue).toEqual([]);
  });

  test('endDay advances day on next-day outcome', () => {
    setupGame({ dice: diceWithValue(6, 12) });
    gameFacade.round.beginRoundSession();

    const handIds = selectHandDice()
      .slice(0, 5)
      .map((d) => d.id);
    gameFacade.round.selectDiceForRoll(handIds);
    const scoredIds = selectRolledDice()
      .slice(0, 2)
      .map((d) => d.id);
    gameFacade.round.submitScore(scoredIds);

    const result = gameFacade.round.endDay();
    expect(result.outcome).toBe('next-day');
    expect(getRoundState()!.day).toBe(2);
    expect(selectRoundPhase()).toBe('SELECT');
  });

  test('endDay on win enqueues round-end-held playback', () => {
    const goldHeld = die({ value: 4, enhancement: 'gold' });
    const scored = die({ value: 7 });
    const filler = die({ value: 6 });
    setupGame({ dice: [goldHeld, scored, filler] });
    gameFacade.round.beginRoundSession({ restored: false });
    roundStore.setState((r) => (r ? { ...r, config: { ...r.config, targetMiles: D(1) } } : r));
    seedTestRoll([goldHeld, scored, filler]);
    gameFacade.round.submitScore([scored.id]);
    runStore.setState((s) => ({ ...s, playbackQueue: [] }));

    const result = gameFacade.round.endDay();
    expect(result.outcome).toBe('won');
    const heldCmd = getRunState().playbackQueue.find((c) => c.kind === 'score-events');
    expect(heldCmd).toMatchObject({ kind: 'score-events', label: 'round-end-held' });
  });
});
