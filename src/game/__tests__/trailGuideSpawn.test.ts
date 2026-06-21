import { describe, test, expect } from 'bun:test';
import './setup';
import { setupGame } from './testHelpers';
import { getRunState } from '../store/runStore';
import { progressionActions } from '../store/actions/progressionActions';
import { HandType } from '../types';
import trailGuidesData from '../../data/trail_guides';
import { getHandByType } from '../../data/hands';
import { filterSpawnableTrailGuides, isSecretGuideSpawnable } from '../trailGuideSpawn';

describe('isSecretGuideSpawnable', () => {
  test('non-secret hand guides are always spawnable', () => {
    setupGame();
    const pairGuide = trailGuidesData.find((tg) => tg.id === 'tg_pair')!;
    expect(getHandByType(pairGuide.handType)?.secret).toBeFalsy();
    expect(isSecretGuideSpawnable(pairGuide, getRunState())).toBe(true);
  });

  test('secret hand guides require timesPlayed > 0', () => {
    setupGame();
    const flushGuide = trailGuidesData.find((tg) => tg.id === 'tg_flush')!;
    expect(getHandByType(flushGuide.handType)?.secret).toBe(true);
    expect(isSecretGuideSpawnable(flushGuide, getRunState())).toBe(false);

    progressionActions.recordHandPlayed(HandType.FLUSH);
    expect(isSecretGuideSpawnable(flushGuide, getRunState())).toBe(true);
  });
});

describe('filterSpawnableTrailGuides', () => {
  test('excludes undiscovered secret guides and keeps public guides', () => {
    setupGame();
    const spawnable = filterSpawnableTrailGuides(trailGuidesData, getRunState());
    expect(spawnable.some((tg) => tg.id === 'tg_flush')).toBe(false);
    expect(spawnable.some((tg) => tg.id === 'tg_pair')).toBe(true);
  });
});
