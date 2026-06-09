import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { resetPlayerState, getPlayerState } from '../__tests__/testRunPlayer';
import { syncEquipmentInstances } from './testHelpers';
import {
  rollEquipmentModifiers,
  applyModifiersToEquipment,
  processEquipmentModifiersEndOfRound,
  applyEquipmentModifierDestructions,
  getEquipmentPurchasePrice,
  acquireRewardEquipmentInstance,
} from '../EquipmentModifiers';
import { getSupplyDefById, getFrontierDefById, useConsumableDirectly } from '../ConsumablesSystem';
import {
  createEquipmentInstance,
  getAllEquipment,
  getEquipmentDefById,
  isEquipmentModifierImmune,
} from '../ItemsSystem';
import { EQUIPMENT_MODIFIER } from '../Constants';
import { equipWithModifiers, setTestDifficulty } from './testHelpers';
import { getModifierTooltipLines, getModifierHintRows } from '../EquipmentModifierDisplay';

function equipDef(id: string) {
  const def = getEquipmentDefById(id);
  if (!def) throw new Error(`Unknown equipment: ${id}`);
  return def;
}

function nonImmuneEquipmentDef() {
  const def = getAllEquipment().find(
    (d) => !isEquipmentModifierImmune(d, 'cursed') && !isEquipmentModifierImmune(d, 'perishable'),
  );
  if (!def) throw new Error('No non-immune equipment in pool');
  return def;
}

beforeEach(() => {
  resetPlayerState();
});

describe('Equipment Modifiers', () => {
  describe('modifierImmunity on item defs', () => {
    test('fading_memory is cursed-immune; stateful items are perishable-immune', () => {
      expect(equipDef('fading_memory').modifierImmunity).toContain('cursed');
      for (const id of ['scouts_spyglass', 'trail_repair_kit', 'graverobber', 'five_mile_marker'] as const) {
        expect(equipDef(id).modifierImmunity).toContain('perishable');
      }
    });
  });

  describe('rollEquipmentModifiers', () => {
    test('returns empty array below difficulty 4', () => {
      expect(rollEquipmentModifiers(1, equipDef('horseshoe'))).toEqual([]);
      expect(rollEquipmentModifiers(3, equipDef('horseshoe'))).toEqual([]);
    });

    test('can return cursed at difficulty 4+', () => {
      const def = nonImmuneEquipmentDef();
      let found = false;
      for (let i = 0; i < 3000; i++) {
        if (rollEquipmentModifiers(4, def).includes('cursed')) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    test('can return perishable at difficulty 7+', () => {
      const def = nonImmuneEquipmentDef();
      let found = false;
      for (let i = 0; i < 3000; i++) {
        if (rollEquipmentModifiers(7, def).includes('perishable')) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    test('can return leased at difficulty 8+', () => {
      const def = nonImmuneEquipmentDef();
      let found = false;
      for (let i = 0; i < 3000; i++) {
        if (rollEquipmentModifiers(8, def).includes('leased')) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    test('never returns cursed + perishable together', () => {
      const def = equipDef('horseshoe');
      const trials = 5000;
      for (let i = 0; i < trials; i++) {
        const mods = rollEquipmentModifiers(8, def);
        if (mods.includes('cursed')) {
          expect(mods.includes('perishable')).toBe(false);
        }
      }
    });

    test('can return cursed + leased together', () => {
      const def = nonImmuneEquipmentDef();
      let found = false;
      for (let i = 0; i < 8000; i++) {
        const mods = rollEquipmentModifiers(8, def);
        if (mods.includes('cursed') && mods.includes('leased')) {
          expect(mods.includes('perishable')).toBe(false);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    test('can return perishable + leased together', () => {
      const def = nonImmuneEquipmentDef();
      let found = false;
      for (let i = 0; i < 8000; i++) {
        const mods = rollEquipmentModifiers(8, def);
        if (mods.includes('perishable') && mods.includes('leased')) {
          expect(mods.includes('cursed')).toBe(false);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    test('cursed is skipped for immune items', () => {
      const def = equipDef('dynamite');
      for (let i = 0; i < 2000; i++) {
        expect(rollEquipmentModifiers(8, def).includes('cursed')).toBe(false);
      }
    });

    test('perishable is skipped for immune items', () => {
      const def = equipDef('scouts_spyglass');
      for (let i = 0; i < 2000; i++) {
        expect(rollEquipmentModifiers(8, def).includes('perishable')).toBe(false);
      }
    });

    test('perishable is skipped for scouts_spyglass and trail_repair_kit', () => {
      for (const id of ['scouts_spyglass', 'trail_repair_kit'] as const) {
        const def = equipDef(id);
        for (let i = 0; i < 2000; i++) {
          expect(rollEquipmentModifiers(8, def).includes('perishable')).toBe(false);
        }
      }
    });

    test('cursed spawns at approximately 30% at difficulty 4', () => {
      const def = nonImmuneEquipmentDef();
      let cursedCount = 0;
      const trials = 10_000;
      for (let i = 0; i < trials; i++) {
        if (rollEquipmentModifiers(4, def).includes('cursed')) cursedCount++;
      }
      const rate = cursedCount / trials;
      expect(rate).toBeGreaterThan(0.25);
      expect(rate).toBeLessThan(0.35);
    });

    test('perishable spawns at approximately 30% at difficulty 7', () => {
      // Cursed-immune item so perishable rate is not reduced by cursed rolls first
      const def = getAllEquipment().find(
        (d) => isEquipmentModifierImmune(d, 'cursed') && !isEquipmentModifierImmune(d, 'perishable'),
      )!;
      let perishableCount = 0;
      const trials = 10_000;
      for (let i = 0; i < trials; i++) {
        const mods = rollEquipmentModifiers(7, def);
        if (mods.includes('perishable')) perishableCount++;
      }
      const rate = perishableCount / trials;
      expect(rate).toBeGreaterThan(0.25);
      expect(rate).toBeLessThan(0.35);
    });

    test('leased spawns at approximately 30% at difficulty 8', () => {
      const def = nonImmuneEquipmentDef();
      let leasedCount = 0;
      const trials = 10_000;
      for (let i = 0; i < trials; i++) {
        if (rollEquipmentModifiers(8, def).includes('leased')) leasedCount++;
      }
      const rate = leasedCount / trials;
      expect(rate).toBeGreaterThan(0.25);
      expect(rate).toBeLessThan(0.35);
    });
  });

  describe('applyModifiersToEquipment', () => {
    test('perishable sets rounds left; leased sets $1 sell value', () => {
      const def = getAllEquipment()[0];
      const instance = createEquipmentInstance(def);
      applyModifiersToEquipment(instance, ['perishable', 'leased']);
      expect(instance.perishableRoundsLeft).toBe(EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS);
      expect(instance.sellValue).toBe(EQUIPMENT_MODIFIER.LEASED_BUY_PRICE);
      expect(instance.modifiers).toEqual(['perishable', 'leased']);
    });

    test('cursed keeps normal sell value', () => {
      const def = getAllEquipment()[0];
      const instance = createEquipmentInstance(def);
      const baseSellValue = instance.sellValue;
      applyModifiersToEquipment(instance, ['cursed']);
      expect(instance.sellValue).toBe(baseSellValue);
      expect(instance.perishableRoundsLeft).toBeUndefined();
    });

    test('leased shop price is $1', () => {
      const def = getAllEquipment().find((d) => d.cost > 5)!;
      expect(getEquipmentPurchasePrice(def, ['leased'], def.cost)).toBe(EQUIPMENT_MODIFIER.LEASED_BUY_PRICE);
    });

    test('leased shop price is $0 when def.cost is overridden to free', () => {
      const def = getAllEquipment().find((d) => d.cost > 5)!;
      const freeDef = { ...def, cost: 0 };
      const listPrice = 12;
      expect(getEquipmentPurchasePrice(freeDef, ['leased'], listPrice)).toBe(0);
    });

    test('leased sell value is $1', () => {
      const def = getAllEquipment()[0];
      const instance = createEquipmentInstance(def);
      applyModifiersToEquipment(instance, ['leased']);
      expect(instance.sellValue).toBe(EQUIPMENT_MODIFIER.LEASED_BUY_PRICE);
    });
  });

  describe('Cursed', () => {
    test('prevents selling equipment', () => {
      const player = getPlayerState();
      player.equipment.push(equipWithModifiers('horseshoe', ['cursed']));
      const balanceBefore = player.economy.balance;
      expect(player.sellEquipment(0)).toBe(false);
      expect(player.equipment).toHaveLength(1);
      expect(player.economy.balance).toBe(balanceBefore);
    });

    test('keeps sell value for trade and scoring effects', () => {
      const inst = equipWithModifiers('horseshoe', ['cursed']);
      const base = createEquipmentInstance(inst.def);
      expect(inst.sellValue).toBe(base.sellValue);
      expect(inst.sellValue).toBeGreaterThan(0);
    });

    test('cannot be destroyed (trail events / bosses / effects)', () => {
      const player = getPlayerState();
      player.equipment.push(equipWithModifiers('horseshoe', ['cursed']));
      expect(player.destroyEquipment(0)).toBe(false);
      expect(player.equipment).toHaveLength(1);
    });
  });

  describe('Perishable', () => {
    test('starts with configured rounds remaining', () => {
      const inst = equipWithModifiers('horseshoe', ['perishable']);
      expect(inst.perishableRoundsLeft).toBe(EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS);
    });

    test('decrements each completed round', () => {
      const player = getPlayerState();
      const inst = equipWithModifiers('horseshoe', ['perishable']);
      player.equipment.push(inst);

      processEquipmentModifiersEndOfRound();
      syncEquipmentInstances(inst);
      expect(inst.perishableRoundsLeft).toBe(EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS - 1);

      processEquipmentModifiersEndOfRound();
      syncEquipmentInstances(inst);
      expect(inst.perishableRoundsLeft).toBe(EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS - 2);
      expect(player.equipment).toHaveLength(1);
    });

    test('destroys equipment when reaching 0', () => {
      const player = getPlayerState();
      const inst = equipWithModifiers('horseshoe', ['perishable']);
      inst.perishableRoundsLeft = 1;
      player.equipment.push(inst);

      const result = processEquipmentModifiersEndOfRound();
      expect(player.equipment).toHaveLength(0);
      expect(result.perished).toHaveLength(1);
      expect(result.perished[0].equipmentName).toBe(inst.def.name);
    });

    test('does not decrement when round is skipped without end-of-round processing', () => {
      const player = getPlayerState();
      const inst = equipWithModifiers('horseshoe', ['perishable']);
      player.equipment.push(inst);
      const before = inst.perishableRoundsLeft;

      player.advanceRound(true);
      expect(inst.perishableRoundsLeft).toBe(before);
      expect(player.equipment).toHaveLength(1);
    });
  });

  describe('Leased', () => {
    test('deducts upkeep at end of round', () => {
      const player = getPlayerState();
      player.economy.setBalance(10);
      player.equipment.push(equipWithModifiers('horseshoe', ['leased']));

      const result = processEquipmentModifiersEndOfRound();

      expect(player.economy.balance).toBe(10 - EQUIPMENT_MODIFIER.LEASED_UPKEEP);
      expect(result.leasePaid).toHaveLength(1);
      expect(player.equipment).toHaveLength(1);
    });

    test('destroys equipment when player cannot afford upkeep', () => {
      const player = getPlayerState();
      player.economy.setBalance(2);
      player.equipment.push(equipWithModifiers('horseshoe', ['leased']));

      const result = processEquipmentModifiersEndOfRound();

      expect(player.equipment).toHaveLength(0);
      expect(result.leaseDefaulted).toHaveLength(1);
      expect(player.economy.balance).toBe(2);
    });

    test('processes left-to-right (slot order)', () => {
      const player = getPlayerState();
      player.economy.setBalance(5);
      const secondId = getAllEquipment().find((d) => d.id !== 'horseshoe')!.id;
      player.equipment.push(equipWithModifiers('horseshoe', ['leased']));
      player.equipment.push(equipWithModifiers(secondId, ['leased']));

      processEquipmentModifiersEndOfRound();

      expect(player.economy.balance).toBe(2);
      expect(player.equipment).toHaveLength(1);
      expect(player.equipment[0].def.id).toBe('horseshoe');
    });

    test('partial payment keeps earlier slots, repossesses later ones', () => {
      const player = getPlayerState();
      player.economy.setBalance(EQUIPMENT_MODIFIER.LEASED_UPKEEP);
      const secondId = getAllEquipment().find((d) => d.id !== 'horseshoe')!.id;
      player.equipment.push(equipWithModifiers('horseshoe', ['leased']));
      player.equipment.push(equipWithModifiers(secondId, ['leased']));

      const result = processEquipmentModifiersEndOfRound();

      expect(player.economy.balance).toBe(0);
      expect(player.equipment).toHaveLength(1);
      expect(player.equipment[0].def.id).toBe('horseshoe');
      expect(result.leasePaid).toHaveLength(1);
      expect(result.leaseDefaulted).toHaveLength(1);
    });
  });

  describe('Modifier Combinations', () => {
    test('cursed + leased: cannot sell but must pay upkeep', () => {
      const player = getPlayerState();
      player.economy.setBalance(10);
      player.equipment.push(equipWithModifiers('horseshoe', ['cursed', 'leased']));

      expect(player.sellEquipment(0)).toBe(false);
      processEquipmentModifiersEndOfRound();

      expect(player.economy.balance).toBe(10 - EQUIPMENT_MODIFIER.LEASED_UPKEEP);
      expect(player.equipment).toHaveLength(1);
    });

    test('perishable + leased: counts down AND pays upkeep', () => {
      const player = getPlayerState();
      player.economy.setBalance(20);
      const inst = equipWithModifiers('horseshoe', ['perishable', 'leased']);
      player.equipment.push(inst);

      processEquipmentModifiersEndOfRound();
      syncEquipmentInstances(inst);

      expect(inst.perishableRoundsLeft).toBe(EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS - 1);
      expect(player.economy.balance).toBe(20 - EQUIPMENT_MODIFIER.LEASED_UPKEEP);
      expect(player.equipment).toHaveLength(1);
    });

    test('perishable + leased: expiry destroys item after final upkeep', () => {
      const player = getPlayerState();
      player.economy.setBalance(100);
      const inst = equipWithModifiers('horseshoe', ['perishable', 'leased']);
      inst.perishableRoundsLeft = 1;
      player.equipment.push(inst);

      const result = processEquipmentModifiersEndOfRound();

      expect(player.equipment).toHaveLength(0);
      expect(result.perished).toHaveLength(1);
      expect(player.economy.balance).toBe(100 - EQUIPMENT_MODIFIER.LEASED_UPKEEP);
    });
  });

  describe('display helpers', () => {
    test('modifier tooltip lines describe active modifiers', () => {
      const inst = equipWithModifiers('horseshoe', ['cursed', 'perishable', 'leased']);
      inst.perishableRoundsLeft = 3;
      const lines = getModifierTooltipLines(inst);
      expect(lines.some((l) => l.text.includes('Cursed'))).toBe(true);
      expect(lines.some((l) => l.text.includes('3 round'))).toBe(true);
      expect(lines.some((l) => l.text.includes('$3/round'))).toBe(true);
    });

    test('modifier hint rows list each active modifier', () => {
      const inst = equipWithModifiers('horseshoe', ['perishable', 'leased']);
      inst.perishableRoundsLeft = 2;
      const rows = getModifierHintRows(inst);
      expect(rows.length).toBe(2);
    });
  });

  describe('deferred destruction', () => {
    test('applyEquipmentModifierDestructions removes without sell payout', () => {
      const player = getPlayerState();
      const inst = equipWithModifiers('horseshoe', ['perishable']);
      inst.perishableRoundsLeft = 1;
      player.equipment.push(inst);
      const balanceBefore = player.economy.balance;

      const result = processEquipmentModifiersEndOfRound({ applyDestruction: false });
      expect(player.equipment).toHaveLength(1);

      applyEquipmentModifierDestructions(result);
      expect(player.equipment).toHaveLength(0);
      expect(player.economy.balance).toBe(balanceBefore);
    });

    test('destroyEquipment removes without sell payout', () => {
      const player = getPlayerState();
      player.equipment.push(equipWithModifiers('horseshoe', []));
      const balanceBefore = player.economy.balance;

      expect(player.destroyEquipment(0)).toBe(true);
      expect(player.equipment).toHaveLength(0);
      expect(player.economy.balance).toBe(balanceBefore);
    });

    test('destroyEquipment refuses cursed equipment', () => {
      const player = getPlayerState();
      player.equipment.push(equipWithModifiers('horseshoe', ['cursed']));

      expect(player.destroyEquipment(0)).toBe(false);
      expect(player.equipment).toHaveLength(1);
    });
  });

  describe('acquire with difficulty', () => {
    test('setTestDifficulty affects rolled modifiers via player state', () => {
      setTestDifficulty(8);
      const player = getPlayerState();
      expect(player.difficulty).toBe(8);
    });
  });

  describe('reward equipment (no modifiers)', () => {
    test('acquireRewardEquipmentInstance never rolls modifiers at difficulty 8', () => {
      setTestDifficulty(8);
      const def = getAllEquipment()[0];
      for (let i = 0; i < 30; i++) {
        const inst = acquireRewardEquipmentInstance(def);
        expect(inst.modifiers).toEqual([]);
      }
    });

    test('reward CREATE_EQUIPMENT cards flag noModifiers in data', () => {
      expect(getSupplyDefById('ingenuity')?.instantEffect?.noModifiers).toBe(true);
      expect(getFrontierDefById('magic_beans')?.instantEffect?.noModifiers).toBe(true);
      expect(getFrontierDefById('pandoras_box')?.instantEffect?.noModifiers).toBe(true);
    });

    test('ingenuity grants equipment without modifiers at difficulty 8', () => {
      setTestDifficulty(8);
      const player = getPlayerState();
      const ingenuity = getSupplyDefById('ingenuity')!;
      useConsumableDirectly(ingenuity);
      expect(player.equipment.length).toBeGreaterThan(0);
      expect(player.equipment.every((e) => e.modifiers.length === 0)).toBe(true);
    });
  });
});
