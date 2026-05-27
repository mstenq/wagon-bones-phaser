import { describe, expect, test, beforeEach } from 'bun:test';
import { runActions, runStore } from '../../store/runStore';
import { enqueueToastFeedback } from '../../playback/feedback';
import { enqueueConsumablePlayback } from '../../store/uiEffectHelpers';

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

  test('enqueueToastFeedback queues toast playback', () => {
    enqueueToastFeedback('Success! Gained $30', 'success');
    expect(runStore.getState().playbackQueue).toEqual([
      { kind: 'toast', message: 'Success! Gained $30', tone: 'success' },
    ]);
  });
});
