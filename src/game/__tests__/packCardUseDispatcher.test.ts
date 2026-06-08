import './setup';
import { describe, test, expect } from 'bun:test';
import {
  canAcquirePackCardItem,
  packCardNeedsEquipSlot,
  resolvePackCardUse,
} from '../../phaser/scenes/boosterPack/packCardUseDispatcher';
import type { PackItem } from '../BoosterPackSystem';
import { item, itemWithAura, setupGame } from './testHelpers';

const emptyCtx = {
  selectedDiceIds: new Set<string>(),
  equipmentCountBefore: 0,
  cardNeedsDiceSelection: () => false,
};

function equipmentPackItem(defId: string): PackItem {
  const instance = item(defId);
  return {
    id: defId,
    name: instance.def.name,
    description: instance.def.description,
    category: 'equipment',
    equipmentDef: instance.def,
  };
}

describe('packCardUseDispatcher inventory checks', () => {
  test('packCardNeedsEquipSlot is true for equipment and CREATE_EQUIPMENT cards', () => {
    expect(packCardNeedsEquipSlot(equipmentPackItem('horseshoe'))).toBe(true);
    expect(
      packCardNeedsEquipSlot({
        id: 'magic_beans',
        name: 'Magic Beans',
        description: '',
        category: 'supply',
        instantEffect: { type: 'CREATE_EQUIPMENT' },
      }),
    ).toBe(true);
    expect(
      packCardNeedsEquipSlot({
        id: 'doctor',
        name: 'Doctor',
        description: '',
        category: 'supply',
        supplyCardId: 'doctor',
      }),
    ).toBe(false);
  });

  test('canAcquirePackCardItem blocks normal equipment when inventory is full', () => {
    const { player } = setupGame({ maxEquipmentSlots: 2 });
    player.equipment = [item('horseshoe'), item('dynamite')];
    expect(player.equipmentSlotsFree).toBe(0);

    expect(canAcquirePackCardItem(equipmentPackItem('horseshoe'))).toBe(false);
  });

  test('canAcquirePackCardItem allows ghost equipment when inventory is full', () => {
    const { player } = setupGame({ maxEquipmentSlots: 2 });
    player.equipment = [item('horseshoe'), item('dynamite')];

    const ghostItem = equipmentPackItem('dynamite');
    ghostItem.equipmentDef = itemWithAura('dynamite', 'ghost').def;
    expect(canAcquirePackCardItem(ghostItem)).toBe(true);
  });

  test('resolvePackCardUse blocks equipment when inventory is full', () => {
    const { player } = setupGame({ maxEquipmentSlots: 2 });
    player.equipment = [item('horseshoe'), item('dynamite')];

    const result = resolvePackCardUse(equipmentPackItem('horseshoe'), emptyCtx);
    expect(result.status).toBe('blocked');
  });

  test('resolvePackCardUse blocks CREATE_EQUIPMENT when inventory is full', () => {
    const { player } = setupGame({ maxEquipmentSlots: 2 });
    player.equipment = [item('horseshoe'), item('dynamite')];

    const result = resolvePackCardUse(
      {
        id: 'magic_beans',
        name: 'Magic Beans',
        description: '',
        category: 'supply',
        instantEffect: { type: 'CREATE_EQUIPMENT' },
      },
      emptyCtx,
    );
    expect(result.status).toBe('blocked');
  });
});
