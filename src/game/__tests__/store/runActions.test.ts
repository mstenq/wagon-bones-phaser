import '../setup';
import { afterEach, describe, expect, test } from 'bun:test';
import { getPlayerState, resetPlayerState } from '../../__tests__/testRunPlayer';
import { item } from '../testHelpers';
import {
  createInitialRunState,
  runActions,
  runStore,
  economyActions,
  diceActions,
  equipmentActions,
  tagActions,
  bossActions,
  setupActions,
  selectBalance,
  selectAvailableDice,
  selectPendingTags,
} from '../../store';

describe('run store actions', () => {
  const initialBalance = createInitialRunState().balance;

  afterEach(() => {
    resetPlayerState();
  });

  test('resetPlayerState clears run store', () => {
    runActions.setBalance(99);
    resetPlayerState();
    expect(runStore.getState().balance).toBe(initialBalance);
  });

  test('economyActions earn and spend', () => {
    economyActions.earn(5);
    expect(selectBalance()).toBe(initialBalance + 5);
    expect(economyActions.spend(3)).toBe(true);
    expect(selectBalance()).toBe(initialBalance + 2);
  });

  test('setupActions applyProfession seeds dice and money', () => {
    setupActions.applyProfession('banker');
    const state = runStore.getState();
    expect(state.professionId).toBe('banker');
    expect(state.dice.length).toBeGreaterThan(0);
    expect(state.balance).toBeGreaterThanOrEqual(initialBalance);
  });

  test('diceActions addDie assigns monotonic ids', () => {
    const added = diceActions.addDie({
      id: 'temp',
      value: 6,
      enhancement: null,
      sticker: null,
      aura: null,
      bonusMiles: 0,
    });
    expect(added.id).toBe('die_player_0');
    expect(runStore.getState().nextDieId).toBe(1);
  });

  test('equipmentActions buy and sell update store', () => {
    economyActions.setBalance(100);
    const def = item('horseshoe').def;
    expect(equipmentActions.buyEquipment(def)).toBe(true);
    expect(runStore.getState().equipment.length).toBe(1);
    expect(equipmentActions.sellEquipment(0)).toBe(true);
    expect(runStore.getState().equipment.length).toBe(0);
  });

  test('tagActions queues tags with twin wagon copies', () => {
    tagActions.addTag({ id: 'tag_twin_wagon', name: 'Twin', category: 'shop', description: '' } as never);
    expect(runStore.getState().twinWagonCount).toBe(1);
    tagActions.addTag({ id: 'tag_uncommon', name: 'Uncommon', category: 'shop', description: '' } as never);
    const pending = selectPendingTags(runStore.getState());
    expect(pending.length).toBe(1);
    expect(pending[0]!.copies).toBe(2);
  });

  test('PlayerState facade reads same store data', () => {
    economyActions.setBalance(42);
    expect(getPlayerState().economy.balance).toBe(42);
    expect(getPlayerState().economy.balance).toBe(selectBalance());
  });

  test('markDiceSpent auto-refreshes when all dice spent', () => {
    setupActions.applyProfession('banker');
    const dice = selectAvailableDice(runStore.getState());
    const allSpent = diceActions.markDiceSpent(dice.map((d) => d.id));
    expect(allSpent).toBe(true);
    expect(runStore.getState().spentDiceIds).toEqual([]);
  });

  test('bossActions assignBosses fills schedule', () => {
    bossActions.assignBosses();
    expect(runStore.getState().bossAssignmentIds.length).toBeGreaterThan(0);
  });
});
