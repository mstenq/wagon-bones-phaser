import { describe, expect, test, beforeEach } from 'bun:test';
import './setup';
import { getBaseTargetMilesForLeg } from '../../data/target_miles';
import { computeTargetMiles, resetPlayerState } from '../PlayerState';
import { GAMEPLAY } from '../Constants';

beforeEach(() => {
  resetPlayerState();
});

describe('target_miles', () => {
  test('legs -1 and 0 are 100 on all difficulties', () => {
    expect(getBaseTargetMilesForLeg(-1, 1)).toBe(100);
    expect(getBaseTargetMilesForLeg(0, 6)).toBe(100);
  });

  test('leg 8 and 9 normal bases match doc', () => {
    expect(getBaseTargetMilesForLeg(8, 1)).toBe(50_000);
    expect(getBaseTargetMilesForLeg(9, 1)).toBe(110_000);
  });

  test('leg 13 deadly uses scientific-scale base', () => {
    expect(getBaseTargetMilesForLeg(13, 6)).toBe(1.8e11);
  });

  test('permit shortcut uses leg -1 base on leg 1', () => {
    expect(computeTargetMiles(1, 1, 2, 1)).toBe(100);
  });

  test('advancing past leg 8 sets storyVictoryPending', () => {
    const player = resetPlayerState();
    player.leg = 8;
    player.round = 3;
    expect(player.advanceRound()).toBe(true);
    expect(player.leg).toBe(9);
    expect(player.storyVictoryPending).toBe(true);
    expect(player.storyVictoryOffered).toBe(true);
  });

  test('endless mode clears story victory gate', () => {
    const player = resetPlayerState();
    player.leg = 9;
    player.storyVictoryPending = true;
    player.endlessMode = true;
    expect(player.journeyComplete).toBe(false);
  });

  test('leg beyond MAX_LEGS completes journey', () => {
    const player = resetPlayerState();
    player.leg = GAMEPLAY.MAX_LEGS + 1;
    player.endlessMode = true;
    expect(player.journeyComplete).toBe(true);
  });
});
