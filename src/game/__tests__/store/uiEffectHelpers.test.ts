import { describe, expect, test, beforeEach } from 'bun:test';
import { runActions, runStore } from '../../store/runStore';
import { enqueueToastFeedback } from '../../playback/feedback';
import { enqueueConsumablePlayback, enqueueHandUpgrades } from '../../store/uiEffectHelpers';
import { HandType } from '../../types';

describe('uiEffectHelpers', () => {
  beforeEach(() => {
    runActions.reset();
  });

  test('enqueueConsumablePlayback queues consumable-playback', () => {
    enqueueConsumablePlayback({
      consumableAnimEvents: [{ type: 'destroy_dice', diceIds: ['die_1'] }],
      equipmentCreatedCount: 2,
    });
    expect(runStore.getState().playbackQueue).toEqual([
      {
        kind: 'consumable-playback',
        events: [{ type: 'destroy_dice', diceIds: ['die_1'] }],
        equipmentCreatedCount: 2,
      },
    ]);
  });

  test('enqueueConsumablePlayback skips empty playback', () => {
    enqueueConsumablePlayback({});
    expect(runStore.getState().playbackQueue).toEqual([]);
  });

  test('enqueueConsumablePlayback queues hand-upgrades after consumable-playback', () => {
    enqueueConsumablePlayback({
      consumableAnimEvents: [{ type: 'destroy_dice', diceIds: ['die_1'] }],
      handUpgrades: [
        {
          handType: HandType.PAIR,
          handName: 'Pair',
          oldLevel: 1,
          newLevel: 2,
          oldBaseMiles: 10,
          newBaseMiles: 15,
          oldBaseMult: 1,
          newBaseMult: 2,
        },
      ],
    });
    expect(runStore.getState().playbackQueue).toHaveLength(2);
    expect(runStore.getState().playbackQueue[0]?.kind).toBe('consumable-playback');
    expect(runStore.getState().playbackQueue[1]?.kind).toBe('hand-upgrades');
  });

  test('enqueueHandUpgrades queues hand-upgrades command', () => {
    enqueueHandUpgrades([
      {
        handType: HandType.PAIR,
        handName: 'Pair',
        oldLevel: 1,
        newLevel: 2,
        oldBaseMiles: 10,
        newBaseMiles: 15,
        oldBaseMult: 1,
        newBaseMult: 2,
      },
    ]);
    expect(runStore.getState().playbackQueue[0]?.kind).toBe('hand-upgrades');
  });

  test('enqueueToastFeedback queues toast playback', () => {
    enqueueToastFeedback('Success! Gained $30', 'success');
    expect(runStore.getState().playbackQueue).toEqual([
      { kind: 'toast', message: 'Success! Gained $30', tone: 'success' },
    ]);
  });
});
