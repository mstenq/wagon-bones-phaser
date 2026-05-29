import '../setup';
import { afterEach, describe, expect, test } from 'bun:test';
import { getPlayerState, resetPlayerState } from '../../__tests__/testRunPlayer';
import { getPermitAuraMultiplier } from '../../PermitsSystem';
import { roundActions } from '../../store/actions/roundActions';
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
import { initRunRng } from '../../RunRng';

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

  test('occult trader + junk dealer creates common/uncommon/rare at expected rates across round starts', () => {
    initRunRng('occult-junk-dealer-rates');
    setupActions.applyProfession('occult_trader');
    setupActions.finalizeRunSetup();
    runActions.patch({ maxEquipmentSlots: 99 });

    const rounds = 400;
    const counts = { common: 0, uncommon: 0, rare: 0 };

    for (let i = 0; i < rounds; i++) {
      equipmentActions.setEquipment([item('junk_dealer')]);
      roundActions.startRound();

      const player = getPlayerState();
      player.syncFromStore();
      const created = player.equipment.slice(1);

      expect(created.length).toBe(2);
      for (const eq of created) {
        expect(['common', 'uncommon', 'rare']).toContain(eq.def.rarity);
        counts[eq.def.rarity as keyof typeof counts]++;
      }
    }

    const total = counts.common + counts.uncommon + counts.rare;
    expect(total).toBe(rounds * 2);

    // Rarity is chosen uniformly from [common, uncommon, rare] for Vivian's Junk Dealer.
    const commonPct = counts.common / total;
    const uncommonPct = counts.uncommon / total;
    const rarePct = counts.rare / total;
    expect(commonPct).toBeCloseTo(1 / 3, 1);
    expect(uncommonPct).toBeCloseTo(1 / 3, 1);
    expect(rarePct).toBeCloseTo(1 / 3, 1);

    const state = runStore.getState();
    expect(state.purchasedPermits).toEqual(['spirit_ritual', 'sacred_ceremony', 'bargain_bin']);
    expect(getPermitAuraMultiplier(state.purchasedPermits)).toBe(4);
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
