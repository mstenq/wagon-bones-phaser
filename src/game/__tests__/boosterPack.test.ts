import './setup';
import { describe, test, expect, afterEach, beforeEach } from 'bun:test';
import {
  generatePackContents,
  generateShopPacks,
  tryRollRarePackCard,
  playerAllowsDuplicateItems,
  getEquipmentPackExcludeIds,
  type PackDefinition,
} from '../BoosterPackSystem';
import { generateShopStock, getAllEquipment } from '../ItemsSystem';
import { CHANCES } from '../Constants';
import { resetPlayerState, getPlayerState } from '../PlayerState';
import { item } from './testHelpers';
import { HandType } from '../types';

const frontierPack: PackDefinition = {
  id: 'frontier_standard',
  category: 'frontier',
  tier: 'normal',
  name: 'Frontier Pack',
  cost: 4,
  totalCards: 2,
  pickCount: 1,
  weight: 0.6,
  color: 0x8b008b,
};

describe('generateShopPacks', () => {
  test('guarantees equipment_standard when requested', () => {
    for (let i = 0; i < 30; i++) {
      const packs = generateShopPacks(2, { guaranteePackId: 'equipment_standard' });
      expect(packs.some((p) => p.def.id === 'equipment_standard')).toBe(true);
    }
  });
});

describe('Rare pack card spawning', () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
  });

  test('frontier packs exclude rare cards from normal pool', () => {
    Math.random = () => 0.99;
    const items = generatePackContents(frontierPack);
    for (const item of items) {
      expect(item.frontierEncounterId).not.toBe('pandoras_box');
      expect(item.frontierEncounterId).not.toBe('spiritual_journey');
    }
  });

  test('pandoras_box rolls in supply and frontier packs at 3/1000', () => {
    Math.random = () => 0.001;
    expect(tryRollRarePackCard('supply')?.id).toBe('pandoras_box');
    Math.random = () => 0.001;
    expect(tryRollRarePackCard('frontier')?.id).toBe('pandoras_box');
    Math.random = () => 0.99;
    expect(tryRollRarePackCard('trail_guide')).toBeNull();
  });

  test('spiritual_journey rolls in trail guide packs at 3/1000', () => {
    Math.random = () => 0.001;
    expect(tryRollRarePackCard('trail_guide')?.id).toBe('spiritual_journey');
  });

  test('spiritual_journey is second roll in frontier packs when pandora misses', () => {
    let call = 0;
    Math.random = () => {
      call++;
      return call === 1 ? 0.99 : 0.001;
    };
    expect(tryRollRarePackCard('frontier')?.id).toBe('spiritual_journey');
  });

  test('RARE_PACK_CARD chance is 3/1000', () => {
    expect(CHANCES.RARE_PACK_CARD).toBeCloseTo(0.003, 6);
  });
});

const equipmentPack: PackDefinition = {
  id: 'equipment_standard',
  category: 'equipment',
  tier: 'normal',
  name: 'Equipment Pack',
  cost: 4,
  totalCards: 3,
  pickCount: 1,
  weight: 0.6,
  color: 0xb8860b,
};

const supplyPack: PackDefinition = {
  id: 'supply_standard',
  category: 'supply',
  tier: 'normal',
  name: 'Supply Pack',
  cost: 4,
  totalCards: 5,
  pickCount: 1,
  weight: 0.6,
  color: 0x2e8b57,
};

describe('equipment pack duplicate filtering', () => {
  beforeEach(() => resetPlayerState());

  test('excludes owned equipment ids from pack stock', () => {
    const player = getPlayerState();
    player.equipment = [item('horseshoe')];
    expect(playerAllowsDuplicateItems(player)).toBe(false);

    for (let i = 0; i < 30; i++) {
      const items = generatePackContents(equipmentPack);
      for (const packItem of items) {
        expect(packItem.equipmentDef?.id).not.toBe('horseshoe');
      }
    }
  });

  test('allows duplicates with counterfeit_goods', () => {
    const player = getPlayerState();
    player.equipment = [item('horseshoe'), item('counterfeit_goods')];
    expect(playerAllowsDuplicateItems(player)).toBe(true);
    expect(getEquipmentPackExcludeIds(player)).toBeUndefined();

    // Owned horseshoe is not excluded from stock when duplicates are allowed
    const excludeAllButHorseshoe = getAllEquipment()
      .filter((d) => d.id !== 'horseshoe' && d.rarity !== 'legendary')
      .map((d) => d.id);
    const [picked] = generateShopStock(1, excludeAllButHorseshoe);
    expect(picked?.id).toBe('horseshoe');
  });
});

const trailGuidePack: PackDefinition = {
  id: 'trail_guide_standard',
  category: 'trail_guide',
  tier: 'normal',
  name: 'Trail Guide Pack',
  cost: 4,
  totalCards: 3,
  pickCount: 1,
  weight: 4,
  color: 0x4682b4,
};

describe('Binoculars trail guide targeting', () => {
  beforeEach(() => resetPlayerState());

  test('includes most played hand trail guide when binoculars permit is owned', () => {
    const player = getPlayerState();
    player.purchasedPermits.push('binoculars');
    player.getHandStats(HandType.PAIR).timesPlayed = 10;
    player.getHandStats(HandType.HIGH_VALUE).timesPlayed = 3;

    for (let i = 0; i < 30; i++) {
      const items = generatePackContents(trailGuidePack);
      expect(items.some((packItem) => packItem.trailGuideId === 'tg_pair')).toBe(true);
    }
  });

  test('does not force a trail guide when no hands have been played', () => {
    const player = getPlayerState();
    player.purchasedPermits.push('binoculars');

    for (let i = 0; i < 20; i++) {
      const items = generatePackContents(trailGuidePack);
      expect(items.filter((packItem) => packItem.trailGuideId != null).length).toBeGreaterThan(0);
    }
  });
});

describe('supply pack medicine exclusion', () => {
  test('supply packs never contain medicine', () => {
    for (let i = 0; i < 50; i++) {
      const items = generatePackContents(supplyPack);
      for (const packItem of items) {
        expect(packItem.supplyCardId).not.toBe('medicine');
        expect(packItem.frontierEncounterId).not.toBe('medicine');
      }
    }
  });
});
