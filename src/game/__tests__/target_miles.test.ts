import { describe, expect, test, beforeEach } from 'bun:test';
import './setup';
import { getBaseTargetMilesForLeg } from '../../data/target_miles';
import { computeTargetMiles } from '../runProgression';
import { GAMEPLAY } from '../Constants';
import { resetTestRun } from './testHelpers';
import { getRunState, runActions, progressionActions } from '../store';
import { selectJourneyComplete, selectStoryVictoryOffered } from '../store/selectors/runSelectors';

beforeEach(() => {
  resetTestRun();
});

describe('target_miles', () => {
  test('legs -1 and 0 are 100 on all difficulties', () => {
    expect(getBaseTargetMilesForLeg(-1, 1)).toBeMiles(100);
    expect(getBaseTargetMilesForLeg(0, 6)).toBeMiles(100);
  });

  test('leg 8 and 9 normal bases match doc', () => {
    expect(getBaseTargetMilesForLeg(8, 1)).toBeMiles(50_000);
    expect(getBaseTargetMilesForLeg(9, 1)).toBeMiles(110_000);
  });

  test('leg 13 deadly uses scientific-scale base', () => {
    expect(getBaseTargetMilesForLeg(13, 6)).toBeMiles(1.8e11);
  });

  test('permit shortcut uses leg -1 base on leg 1', () => {
    expect(computeTargetMiles(1, 1, 2, 1)).toBeMiles(100);
  });

  test('advancing past leg 8 sets storyVictoryPending', () => {
    runActions.patch({ leg: 8, round: 3 });
    expect(progressionActions.advanceRound()).toBe(true);
    const run = getRunState();
    expect(run.leg).toBe(9);
    expect(run.storyVictoryPending).toBe(true);
    expect(selectStoryVictoryOffered(run)).toBe(true);
  });

  test('endless mode clears story victory gate', () => {
    runActions.patch({ leg: 9, storyVictoryPending: true, endlessMode: true });
    expect(selectJourneyComplete(getRunState())).toBe(false);
  });

  test('leg beyond MAX_LEGS completes journey', () => {
    runActions.patch({ leg: GAMEPLAY.MAX_LEGS + 1, endlessMode: true });
    expect(selectJourneyComplete(getRunState())).toBe(true);
  });
});
