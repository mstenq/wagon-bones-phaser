import './setup';
import { describe, test, expect } from 'bun:test';
import {
  canAcquirePackCardItem,
  packCardNeedsEquipSlot,
  resolvePackCardUse,
} from '../../phaser/scenes/boosterPack/packCardUseDispatcher';
import type { PackItem } from '../BoosterPackSystem';
import { die, item, itemWithAura, setupGame } from './testHelpers';
import { getPlayerState, resetPlayerState } from './testRunPlayer';
import { getTrailGuideDefById } from '../ConsumablesSystem';
import { initPackLineup } from '../visibleDiceRow';
import { sceneActions } from '../store/sceneStore';
import supplyCardsData from '../../data/supply_cards';

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
    description: '',
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

describe('packCardUseDispatcher consumable history', () => {
  function enterTestPack(): void {
    sceneActions.enterBoosterPack({
      packDefId: 'supply_standard',
      returnScene: 'Shop',
      queuedPackDefIds: [],
      contents: [],
      picksRemaining: 2,
      effectivePickCount: 2,
      usedCardIndices: [],
      lineupDieIds: [],
    });
  }

  test('dice-selection supply cards update lastUsedConsumable for second_helpings', () => {
    resetPlayerState();
    const player = getPlayerState();
    player.maxConsumableSlots = 4;
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    player.dice = [d1, d2];

    const tgDef = getTrailGuideDefById('tg_high_value')!;
    player.lastUsedConsumable = tgDef;

    enterTestPack();
    initPackLineup();

    const panCardData = supplyCardsData.find((c) => c.id === 'pan_for_gold')!;
    const panCard: PackItem = {
      id: 'pan_for_gold',
      name: panCardData.name,
      description: panCardData.description,
      category: 'supply',
      supplyCardId: 'pan_for_gold',
      diceSelection: panCardData.diceSelection
        ? {
            ...panCardData.diceSelection,
            cardName: panCardData.name,
            description: panCardData.description,
            skippable: true,
          }
        : undefined,
    };

    const diceCtx = {
      selectedDiceIds: new Set([d1.id, d2.id]),
      equipmentCountBefore: 0,
      cardNeedsDiceSelection: () => true,
    };

    const panResult = resolvePackCardUse(panCard, diceCtx);
    expect(panResult.status).toBe('ready');
    expect(player.lastUsedConsumable?.id).toBe('pan_for_gold');

    const secondHelpingsData = supplyCardsData.find((c) => c.id === 'second_helpings')!;
    const secondHelpingsCard: PackItem = {
      id: 'second_helpings',
      name: secondHelpingsData.name,
      description: secondHelpingsData.description,
      category: 'supply',
      supplyCardId: 'second_helpings',
    };

    const shResult = resolvePackCardUse(secondHelpingsCard, emptyCtx);
    expect(shResult.status).toBe('ready');
    expect(player.consumables).toHaveLength(1);
    expect(player.consumables[0]!.def.id).toBe('pan_for_gold');
    expect(player.consumables[0]!.def.category).toBe('supply');
  });
});
