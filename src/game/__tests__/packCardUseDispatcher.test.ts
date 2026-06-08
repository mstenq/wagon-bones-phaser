import './setup';
import { describe, test, expect } from 'bun:test';
import {
  canAcquirePackCardItem,
  packCardNeedsEquipSlot,
  resolvePackCardUse,
} from '../consumables/packCardUseDispatcher';
import type { PackItem } from '../BoosterPackSystem';
import { die, item, itemWithAura, setupGame } from './testHelpers';
import { getPlayerState, resetPlayerState } from './testRunPlayer';
import { getTrailGuideDefById } from '../ConsumablesSystem';
import { initPackLineup } from '../visibleDiceRow';
import { sceneActions } from '../store/sceneStore';
import { applyConsumableTargetingCommit } from '../consumables/applyConsumableTargeting';
import {
  beginConsumableTargeting,
  commitConsumableTargeting,
  toggleTargetDie,
} from '../consumables/consumableTargetingSession';
import supplyCardsData from '../../data/supply_cards';

const emptyCtx = {
  equipmentCountBefore: 0,
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

  test('resolvePackCardUse blocks dice-selection cards (use targeting commit instead)', () => {
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

    expect(resolvePackCardUse(panCard, emptyCtx).status).toBe('blocked');
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

  test('pack-card targeting commit updates lastUsedConsumable for second_helpings', () => {
    resetPlayerState();
    const player = getPlayerState();
    player.maxConsumableSlots = 4;
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    player.dice = [d1, d2];

    const tgDef = getTrailGuideDefById('tg_high_value')!;
    player.lastUsedConsumable = tgDef;

    enterTestPack();
    const lineup = initPackLineup();

    const panCardData = supplyCardsData.find((c) => c.id === 'pan_for_gold')!;
    const diceSelection = {
      ...panCardData.diceSelection!,
      cardName: panCardData.name,
      description: panCardData.description,
      skippable: true,
    };

    const packContext = {
      scene: 'booster_pack' as const,
      source: 'pack_card' as const,
      visibleDieIds: lineup.map((d) => d.id),
    };

    beginConsumableTargeting({ kind: 'pack_card', cardIndex: 0, defId: 'pan_for_gold' }, packContext, diceSelection);
    toggleTargetDie(lineup[0]!.id);
    toggleTargetDie(lineup[1]!.id);
    const committed = commitConsumableTargeting();
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    applyConsumableTargetingCommit(committed.commit, { surface: 'pack_lineup' });
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
