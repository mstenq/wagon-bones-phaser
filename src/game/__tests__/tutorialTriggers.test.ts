import { describe, test, expect } from 'bun:test';
import { canShowTutorial } from '../tutorialTriggers';
import type { RunState } from '../store/types';

function baseRun(overrides: Partial<RunState> = {}): RunState {
  return {
    leg: 1,
    round: 1,
    difficulty: 1,
    money: 0,
    equipment: [],
    consumables: [],
    purchasedPermits: [],
    permitScoreReduction: 0,
    skippedRoundsThisLeg: [],
    roundSkipPreviewTags: {},
    tags: [],
    handStats: {},
    professionId: null,
    roundsSkipped: 0,
    playbackQueue: [],
    ...overrides,
  } as RunState;
}

describe('tutorialTriggers', () => {
  test('round_select_intro only on leg 1 round 1', () => {
    expect(canShowTutorial('round_select_intro', baseRun())).toBe(true);
    expect(canShowTutorial('round_select_intro', baseRun({ round: 2 }))).toBe(false);
  });

  test('first_round_play on SELECT during mile round', () => {
    expect(canShowTutorial('first_round_play', baseRun(), { phase: 'SELECT' })).toBe(true);
    expect(canShowTutorial('first_round_play', baseRun(), { phase: 'ROLL' })).toBe(false);
  });

  test('shop_welcome on first shop visit', () => {
    expect(canShowTutorial('shop_welcome', baseRun({ round: 2 }))).toBe(true);
    expect(canShowTutorial('shop_welcome', baseRun({ round: 3 }))).toBe(false);
  });

  test('shop_extras on second shop visit', () => {
    expect(canShowTutorial('shop_extras', baseRun({ round: 3 }))).toBe(true);
    expect(canShowTutorial('shop_extras', baseRun({ round: 2 }))).toBe(false);
  });

  test('equipment_order needs two or more items', () => {
    expect(canShowTutorial('equipment_order', baseRun(), { equipmentCount: 1 })).toBe(false);
    expect(canShowTutorial('equipment_order', baseRun(), { equipmentCount: 2 })).toBe(true);
  });

  test('loaded_dice_intro when a loaded die is in the lineup', () => {
    expect(canShowTutorial('loaded_dice_intro', baseRun(), { hasLoadedDieInLineup: false })).toBe(false);
    expect(canShowTutorial('loaded_dice_intro', baseRun(), { hasLoadedDieInLineup: true })).toBe(true);
  });
});
