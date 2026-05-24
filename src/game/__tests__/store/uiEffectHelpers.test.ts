import { describe, expect, test, beforeEach } from 'bun:test';
import { runActions, runStore } from '../../store/runStore';
import { enqueueConsumablePlayback } from '../../store/uiEffectHelpers';

describe('uiEffectHelpers', () => {
  beforeEach(() => {
    runActions.reset();
  });

  test('enqueueConsumablePlayback queues consumable-anim effect', () => {
    enqueueConsumablePlayback({
      consumableAnimEvents: [{ type: 'destroy_dice', diceIds: ['die_1'] }],
      equipmentCreatedCount: 2,
    });
    expect(runStore.getState().uiEffects).toEqual([
      {
        kind: 'consumable-anim',
        events: [{ type: 'destroy_dice', diceIds: ['die_1'] }],
        equipmentCreatedCount: 2,
      },
    ]);
  });

  test('enqueueConsumablePlayback skips empty playback', () => {
    enqueueConsumablePlayback({});
    expect(runStore.getState().uiEffects).toEqual([]);
  });
});
