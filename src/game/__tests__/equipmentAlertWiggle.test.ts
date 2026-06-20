import { describe, expect, test } from 'bun:test';
import type { RoundHintContext } from '../displayContextTypes';
import { isEquipmentTimingAlertActive } from '../equipmentAlertWiggle';
import { item } from './testHelpers';

function roundContext(day: number, maxDays = 5): RoundHintContext {
  return {
    phase: 'ROLL',
    day,
    maxDays,
    rerollsRemaining: 3,
    currentHandType: null,
    handHistory: [],
    rolledDice: [],
    selectedForScore: [],
    gravityDice: [],
  };
}

describe('isEquipmentTimingAlertActive', () => {
  describe('firstDay alertType', () => {
    test('lucky_find active on day 1', () => {
      expect(isEquipmentTimingAlertActive(item('lucky_find'), roundContext(1))).toBe(true);
    });

    test('stew active on day 1', () => {
      expect(isEquipmentTimingAlertActive(item('stew'), roundContext(1))).toBe(true);
    });

    test('first-day items inactive after day 1', () => {
      expect(isEquipmentTimingAlertActive(item('bloodline'), roundContext(2))).toBe(false);
      expect(isEquipmentTimingAlertActive(item('hellfire_round'), roundContext(3))).toBe(false);
    });

    test('first-day items inactive without round context', () => {
      expect(isEquipmentTimingAlertActive(item('lucky_find'), null)).toBe(false);
    });
  });

  describe('lastDay alertType', () => {
    test('last_stand active on final day', () => {
      expect(isEquipmentTimingAlertActive(item('last_stand'), roundContext(5, 5))).toBe(true);
    });

    test('high_noon active when day exceeds maxDays', () => {
      expect(isEquipmentTimingAlertActive(item('high_noon'), roundContext(6, 5))).toBe(true);
    });

    test('last-day items inactive before final day', () => {
      expect(isEquipmentTimingAlertActive(item('last_stand'), roundContext(4, 5))).toBe(false);
    });

    test('last-day items inactive without round context', () => {
      expect(isEquipmentTimingAlertActive(item('high_noon'), null)).toBe(false);
    });
  });

  describe('readyToSell alertType', () => {
    test('phantom_wagon active when roundsHeld meets threshold', () => {
      const phantom = item('phantom_wagon');
      phantom.state.roundsHeld = 2;
      expect(isEquipmentTimingAlertActive(phantom, null)).toBe(true);
      expect(isEquipmentTimingAlertActive(phantom, roundContext(1))).toBe(true);
    });

    test('phantom_wagon inactive before threshold', () => {
      const phantom = item('phantom_wagon');
      phantom.state.roundsHeld = 1;
      expect(isEquipmentTimingAlertActive(phantom, null)).toBe(false);
    });
  });

  describe('everyNthHand alertType', () => {
    test('six_shooter active on every nth hand played', () => {
      const sixShooter = item('six_shooter');
      sixShooter.state.handsPlayed = 6;
      expect(isEquipmentTimingAlertActive(sixShooter, null)).toBe(true);
      expect(isEquipmentTimingAlertActive(sixShooter, roundContext(3))).toBe(true);
    });

    test('six_shooter inactive before first trigger and between cycles', () => {
      const sixShooter = item('six_shooter');
      sixShooter.state.handsPlayed = 0;
      expect(isEquipmentTimingAlertActive(sixShooter, null)).toBe(false);

      sixShooter.state.handsPlayed = 5;
      expect(isEquipmentTimingAlertActive(sixShooter, null)).toBe(false);

      sixShooter.state.handsPlayed = 7;
      expect(isEquipmentTimingAlertActive(sixShooter, null)).toBe(false);
    });
  });

  test('items without alertType never activate', () => {
    expect(isEquipmentTimingAlertActive(item('horseshoe'), roundContext(1))).toBe(false);
    expect(isEquipmentTimingAlertActive(item('horseshoe'), roundContext(5, 5))).toBe(false);
  });
});
