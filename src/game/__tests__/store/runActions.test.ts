import '../setup';
import { afterEach, describe, expect, test, spyOn } from 'bun:test';
import { GAMEPLAY } from '../../Constants';
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
import { getRoundState } from '../../store/roundStore';
import { initRunRng } from '../../RunRng';
import * as ItemsSystem from '../../ItemsSystem';

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

  test('prospector starting supply_wagon permit applies +1 shop slot', () => {
    setupActions.applyProfession('prospector');
    const state = runStore.getState();
    expect(state.purchasedPermits).toContain('supply_wagon');
    expect(state.shopSlots).toBe(GAMEPLAY.SHOP_SLOTS + 1);
  });

  test('witch grantProfessionStartingEquipment grants one cursed familiar after RNG seed', () => {
    initRunRng('witch-familiar-seed');
    setupActions.applyProfession('witch');
    setupActions.finalizeRunSetup();
    setupActions.grantProfessionStartingEquipment();

    const state = runStore.getState();
    expect(state.professionId).toBe('witch');
    expect(state.equipment.length).toBe(1);
    expect(state.equipment[0]!.modifiers).toContain('cursed');
    expect(['ashfang', 'moonquil', 'nightshard', 'shadowpaw', 'skullwing', 'dustshell']).toContain(
      state.equipment[0]!.defId,
    );
    expect(state.equipmentObtainedIds).toContain(state.equipment[0]!.defId);
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

  test('junk dealer avoids duplicate equipment without counterfeit_goods', () => {
    initRunRng('junk-dealer-no-dupes');
    setupActions.finalizeRunSetup();
    runActions.patch({ maxEquipmentSlots: 99 });

    for (let i = 0; i < 50; i++) {
      equipmentActions.setEquipment([item('junk_dealer'), item('deadeye')]);
      roundActions.startRound();

      const created = runStore.getState().equipment.slice(2);
      expect(created.length).toBe(2);
      for (const eq of created) {
        expect(eq.defId).not.toBe('deadeye');
      }
      expect(new Set(created.map((eq) => eq.defId)).size).toBe(2);
    }
  });

  test('junk dealer round-start spare holster applies reroll bonus immediately', () => {
    const spareHolsterDef = ItemsSystem.getAllEquipment().find((i) => i.id === 'spare_holster');
    if (!spareHolsterDef) throw new Error('missing spare_holster def');
    const spy = spyOn(ItemsSystem, 'generateRandomEquipment');
    spy.mockImplementation(() => ({ ...spareHolsterDef }));

    try {
      setupActions.finalizeRunSetup();
      runActions.patch({ maxEquipmentSlots: 99 });
      equipmentActions.setEquipment([item('junk_dealer')]);
      roundActions.startRound();

      const round = getRoundState();
      if (!round) throw new Error('expected active round after startRound');
      const spareHolsters = runStore.getState().equipment.filter((eq) => eq.defId === 'spare_holster');
      expect(spareHolsters.length).toBe(2);
      expect(round.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS + 2);
      expect(round.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS + 2);
    } finally {
      spy.mockRestore();
    }
  });

  test('junk dealer allows duplicates with counterfeit_goods', () => {
    setupActions.finalizeRunSetup();
    runActions.patch({ maxEquipmentSlots: 99 });

    let sawDeadeyeDupe = false;
    for (let i = 0; i < 100; i++) {
      initRunRng(`junk-dealer-dupes-${i}`);
      equipmentActions.setEquipment([item('junk_dealer'), item('deadeye'), item('counterfeit_goods')]);
      roundActions.startRound();

      const created = runStore.getState().equipment.slice(3);
      expect(created.length).toBe(2);
      if (created.some((eq) => eq.defId === 'deadeye')) {
        sawDeadeyeDupe = true;
        break;
      }
    }
    expect(sawDeadeyeDupe).toBe(true);
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

  test('diceActions insertDiceAfter places dice beside the anchor', () => {
    const anchor = diceActions.addDie({
      id: 'temp-a',
      value: 2,
      enhancement: null,
      sticker: null,
      aura: null,
      bonusMiles: 0,
    });
    const tail = diceActions.addDie({
      id: 'temp-b',
      value: 8,
      enhancement: null,
      sticker: null,
      aura: null,
      bonusMiles: 0,
    });

    const [copy] = diceActions.insertDiceAfter(anchor.id, [
      {
        id: 'temp-copy',
        value: 2,
        enhancement: null,
        sticker: null,
        aura: null,
        bonusMiles: 0,
      },
    ]);

    expect(runStore.getState().dice.map((d) => d.id)).toEqual([anchor.id, copy!.id, tail.id]);
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
