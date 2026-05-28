import { describe, expect, test, beforeEach } from 'bun:test';
import { runActions, runStore } from '../../store/runStore';
import { enqueueDayEndDestructions, enqueueHandUpgrades, enqueueModifierFeedback } from '../../store/playbackEnqueue';
import { HandType } from '../../types';

const sampleUpgrade = {
  handType: HandType.PAIR,
  handName: 'Pair',
  oldLevel: 1,
  newLevel: 2,
  oldBaseMiles: 10,
  newBaseMiles: 15,
  oldBaseMult: 1,
  newBaseMult: 2,
};

describe('playbackEnqueue', () => {
  beforeEach(() => {
    runActions.reset();
  });

  test('preserves FIFO order for hand-upgrades before score command', () => {
    enqueueHandUpgrades([sampleUpgrade]);
    runActions.enqueuePlayback({ kind: 'toast', message: 'score-done', tone: 'success' });

    const kinds = runStore.getState().playbackQueue.map((cmd) => cmd.kind);
    expect(kinds).toEqual(['hand-upgrades', 'toast']);
  });

  test('enqueueDayEndDestructions and modifier-feedback preserve order', () => {
    enqueueDayEndDestructions([0], ['Dynamite'], 500);
    enqueueModifierFeedback({
      leasePaid: [{ index: 0, equipmentName: 'Leased Revolver', cost: 2 }],
      perished: [],
      leaseDefaulted: [],
    });

    const kinds = runStore.getState().playbackQueue.map((cmd) => cmd.kind);
    expect(kinds).toEqual(['day-end-destructions', 'modifier-feedback']);
  });
});
