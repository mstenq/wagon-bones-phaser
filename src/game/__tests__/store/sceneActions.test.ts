import { describe, expect, test, beforeEach } from 'bun:test';
import { sceneActions, sceneStore, createInitialSceneState } from '../../store/sceneStore';
import { runActions, runStore } from '../../store/runStore';

describe('scene lifecycle actions', () => {
  beforeEach(() => {
    runActions.reset();
    sceneActions.reset();
  });

  test('enterShop and mark sold update scene slice', () => {
    sceneActions.enterShop({
      stock: [{ type: 'consumable', defId: 'doctor' }],
      packs: [],
      shopRerollCount: 0,
    });
    sceneActions.markShopStockSold(0);
    expect(sceneStore.getState().shop?.stock[0]?.sold).toBe(true);
  });

  test('markShopPackOpened marks only the targeted pack', () => {
    sceneActions.enterShop({
      stock: [],
      packs: [
        { defId: 'equipment_standard', instanceId: 'pack_0' },
        { defId: 'supply_standard', instanceId: 'pack_1' },
      ],
      shopRerollCount: 0,
    });
    sceneActions.markShopPackOpened(0);
    const packs = sceneStore.getState().shop?.packs;
    expect(packs?.[0]?.opened).toBe(true);
    expect(packs?.[1]?.opened).toBeUndefined();
  });

  test('enterTrailEvent patches spyglass state', () => {
    sceneActions.enterTrailEvent({
      eventId: 'wildflowers',
      resolved: false,
      spyglassRevealed: false,
    });
    sceneActions.patchTrailEvent({ spyglassRevealed: true });
    expect(sceneStore.getState().trailEvent).toEqual({
      eventId: 'wildflowers',
      resolved: false,
      spyglassRevealed: true,
    });
  });

  test('takeUiEffects removes only matching effects', () => {
    runActions.enqueueUiEffect({ kind: 'dice-added', dieIds: ['die_1'] });
    runActions.enqueueUiEffect({ kind: 'tag-earned', tagId: 'tag_uncommon' });
    const taken = runActions.takeUiEffects((e) => e.kind === 'dice-added');
    expect(taken).toEqual([{ kind: 'dice-added', dieIds: ['die_1'] }]);
    expect(runStore.getState().uiEffects).toEqual([{ kind: 'tag-earned', tagId: 'tag_uncommon' }]);
  });

  test('leaveScene clears slices', () => {
    sceneActions.enterShop({ stock: [], packs: [], shopRerollCount: 0 });
    sceneActions.leaveScene();
    expect(sceneStore.getState()).toEqual(createInitialSceneState());
  });

  test('enterPayout stores breakdown and presentation', () => {
    sceneActions.enterPayout({
      breakdown: {
        roundReward: 5,
        dayBonus: 2,
        interest: 1,
        savingsAccountInterest: 0,
        savingsAccountRate: 0,
        savingsAccountChunk: 5,
        equipmentMoney: 0,
        rerollBonus: 0,
        total: 8,
      },
      presentation: {
        totalMilesSave: '100',
        targetMilesSave: '200',
        daysRemaining: 1,
        rerollsRemaining: 2,
        leg: 1,
        round: 1,
        isVictory: false,
        investmentBonus: 0,
      },
    });
    expect(sceneStore.getState().payout?.breakdown.total).toBe(8);
    sceneActions.clearPayout();
    expect(sceneStore.getState().payout).toBeNull();
  });
});
