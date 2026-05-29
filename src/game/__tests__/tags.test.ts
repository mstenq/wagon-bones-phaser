import { describe, it, expect, beforeEach } from 'bun:test';
import trailTags, { getTrailTagById, resolveTagDescription } from '../../data/trail_tags';
import type { TrailTagDef } from '../../data/trail_tags';
import {
  getTagPool,
  processImmediateTags,
  processShopTags,
  applyInjectTagsToShopStock,
  applyAuraTagsToShopStock,
  processJunkPileTag,
  processBossPayoutTags,
  processChangeOfGuardTags,
  expandImmediatePackTagsToPackDefIds,
} from '../TagSystem';
import {
  createEquipmentInstance,
  getEquipmentListPrice,
  getEquipmentSellValue,
  getItemAuraById,
  type EquipmentDef,
} from '../ItemsSystem';
import { getEquipmentPurchasePrice } from '../EquipmentModifiers';
import { EQUIPMENT_MODIFIER } from '../Constants';
import { HandType } from '../types';
import { getPlayerState, resetPlayerState } from '../__tests__/testRunPlayer';

const ALL_TAGS = trailTags;

const stubEquipmentDisplay: EquipmentDef['display'] = () => ({ hint: [], tooltip: [] });

describe('Trail Tags Data', () => {
  it('exports all 24 tags', () => {
    expect(trailTags.length).toBe(24);
  });

  it('every tag has required fields', () => {
    for (const tag of trailTags) {
      expect(tag.id).toBeTruthy();
      expect(tag.name).toBeTruthy();
      expect(resolveTagDescription(tag)).toBeTruthy();
      expect(tag.category).toBeTruthy();
      expect(typeof tag.minLeg).toBe('number');
      expect(typeof tag.weight).toBe('number');
    }
  });

  it('has unique tag IDs', () => {
    const ids = trailTags.map((t: TrailTagDef) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getTrailTagById finds a tag', () => {
    const tag = getTrailTagById('tag_twin_wagon');
    expect(tag).toBeDefined();
    expect(tag!.name).toBe('Twin Wagon');
    expect(tag!.category).toBe('meta');
  });

  it('getTrailTagById returns undefined for unknown ID', () => {
    expect(getTrailTagById('tag_nonexistent')).toBeUndefined();
  });
});

describe('TagSystem', () => {
  beforeEach(() => {
    resetPlayerState();
  });

  describe('Tag Pool', () => {
    it('filters tags by minLeg', () => {
      const pool1 = getTagPool(1);
      const pool2 = getTagPool(2);
      expect(pool2.length).toBeGreaterThan(pool1.length);
      expect(pool1.every((t) => t.minLeg <= 1)).toBe(true);
    });
  });

  describe('Twin Wagon', () => {
    it('doubles the next tag', () => {
      const player = getPlayerState();
      player.addTag(ALL_TAGS.find((t) => t.id === 'tag_twin_wagon')!);
      expect(player.twinWagonCount).toBe(1);

      player.addTag(ALL_TAGS.find((t) => t.id === 'tag_shortcut')!);
      expect(player.twinWagonCount).toBe(0);
      expect(player.pendingTags[0].copies).toBe(2);
    });

    it('stacks multiple Twin Wagons', () => {
      const player = getPlayerState();
      const tw = ALL_TAGS.find((t) => t.id === 'tag_twin_wagon')!;
      player.addTag(tw);
      player.addTag(tw);
      expect(player.twinWagonCount).toBe(3);

      player.addTag(ALL_TAGS.find((t) => t.id === 'tag_shortcut')!);
      expect(player.pendingTags[0].copies).toBe(4);
    });
  });

  describe('expandImmediatePackTagsToPackDefIds', () => {
    it('expands Twin Wagon copies into multiple pack opens', () => {
      const mega = getTrailTagById('tag_dice_mega')!;
      const expanded = expandImmediatePackTagsToPackDefIds([{ def: mega, copies: 2 }]);
      expect(expanded).toEqual(['dice_mega', 'dice_mega']);
    });

    it('flattens multiple pending immediate pack tags in order', () => {
      const dice = getTrailTagById('tag_dice_mega')!;
      const supply = getTrailTagById('tag_supply_mega')!;
      const expanded = expandImmediatePackTagsToPackDefIds([
        { def: dice, copies: 1 },
        { def: supply, copies: 2 },
      ]);
      expect(expanded).toEqual(['dice_mega', 'supply_mega', 'supply_mega']);
    });
  });

  describe('Immediate Money Tags', () => {
    it('Well-Traveled pays $1 per day scored', () => {
      const player = getPlayerState();
      player.daysScored = 10;
      const tag = ALL_TAGS.find((t) => t.id === 'tag_well_traveled')!;
      player.addTag(tag);
      const balanceBefore = player.economy.balance;
      processImmediateTags(player);
      expect(player.economy.balance).toBe(balanceBefore + 10);
    });

    it('Bank Deposit doubles money capped at +$40', () => {
      const player = getPlayerState();
      player.economy.setBalance(50);
      const tag = ALL_TAGS.find((t) => t.id === 'tag_bank_deposit')!;
      player.addTag(tag);
      processImmediateTags(player);
      expect(player.economy.balance).toBe(90);
    });

    it('Shortcut pays $5 per skipped round', () => {
      const player = getPlayerState();
      player.roundsSkipped = 3;
      const tag = ALL_TAGS.find((t) => t.id === 'tag_shortcut')!;
      player.addTag(tag);
      const before = player.economy.balance;
      processImmediateTags(player);
      expect(player.economy.balance).toBe(before + 15);
    });
  });

  describe("Surveyor's Mark", () => {
    it('upgrades a random hand by 3 levels', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_surveyor')!;
      player.addTag(tag);
      const results = processImmediateTags(player);
      expect(results.length).toBe(1);
      expect(results[0].levelsGained).toBe(3);
      const stats = player.getHandStats(results[0].handType!);
      expect(stats.level).toBe(4);
    });

    it('uses pre-rolled hand from pending tag meta', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_surveyor')!;
      player.pendingTags = [{ def: tag, copies: 1, surveyorHand: HandType.FULL_HOUSE }];
      const results = processImmediateTags(player);
      expect(results[0].handType).toBe(HandType.FULL_HOUSE);
      expect(player.getHandStats(HandType.FULL_HOUSE).level).toBe(4);
    });

    it('returns handUpgrade info for the upgrade animation', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_surveyor')!;
      player.addTag(tag);
      const results = processImmediateTags(player);
      const upgrade = results[0].handUpgrade;
      expect(upgrade).toBeDefined();
      expect(upgrade!.oldLevel).toBe(1);
      expect(upgrade!.newLevel).toBe(4);
      expect(upgrade!.handName).toBeTruthy();
      expect(upgrade!.newBaseMiles).toBeGreaterThan(upgrade!.oldBaseMiles);
    });

    it('description names the pre-rolled hand on skip preview', () => {
      const tag = ALL_TAGS.find((t) => t.id === 'tag_surveyor')!;
      const desc = resolveTagDescription(tag, { surveyorHand: HandType.PAIR });
      expect(desc).toContain('Pair');
      expect(desc).not.toContain('random');
    });
  });

  describe('Shop Tags', () => {
    it('On the House marks shop as free', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_company_store')!;
      player.addTag(tag);
      const mods = processShopTags(player);
      expect(mods.freeShop).toBe(true);
      expect(player.pendingTags.length).toBe(0);
    });

    it("Outfitter's Pick replaces a shop slot with free uncommon equipment", () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_uncommon')!;
      player.addTag(tag);
      processShopTags(player);
      expect(player.pendingTags.length).toBe(1);

      const stock = [
        { type: 'consumable', def: { id: 'a', cost: 3 } as EquipmentDef },
        { type: 'equipment', def: { id: 'b', cost: 5 } as EquipmentDef },
      ];
      applyInjectTagsToShopStock(stock, player);
      expect(stock[0].type).toBe('equipment');
      expect(stock[0].def.cost).toBe(0);
      expect(stock[0].def.rarity).toBe('uncommon');
      expect(player.pendingTags.length).toBe(0);
    });

    it('Inject tags only fill up to shopSlots per visit', () => {
      const player = getPlayerState();
      player.shopSlots = 2;
      const uncommon = ALL_TAGS.find((t) => t.id === 'tag_uncommon')!;
      const rare = ALL_TAGS.find((t) => t.id === 'tag_rare')!;
      player.pendingTags.push({ def: uncommon, copies: 3 });
      player.pendingTags.push({ def: rare, copies: 2 });

      const stock = [
        { type: 'equipment', def: { id: 'a', cost: 5 } as EquipmentDef },
        { type: 'equipment', def: { id: 'b', cost: 5 } as EquipmentDef },
      ];
      applyInjectTagsToShopStock(stock, player);
      expect(stock.every((s) => s.def.cost === 0)).toBe(true);
      expect(player.pendingTags.reduce((sum, t) => sum + t.copies, 0)).toBe(3);
    });

    it('Aura tags stay pending until applied to shop stock', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_fire')!;
      player.addTag(tag);
      processShopTags(player);
      expect(player.pendingTags.length).toBe(1);
      expect(player.pendingTags[0].copies).toBe(1);

      const stock = [
        { type: 'equipment', def: { id: 'a', cost: 5 } as EquipmentDef },
        { type: 'equipment', def: { id: 'b', cost: 5 } as EquipmentDef },
      ];
      applyAuraTagsToShopStock(stock, player);
      expect(stock[0].def.aura?.id).toBe('fire');
      expect(stock[0].def.cost).toBe(0);
      expect(player.pendingTags.length).toBe(0);
    });

    it('Aura tags only consume copies matching base equipment slots', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_fire')!;
      player.pendingTags.push({ def: tag, copies: 4 });
      const stock = [
        { type: 'equipment', def: { id: 'a', cost: 5 } as EquipmentDef },
        { type: 'equipment', def: { id: 'b', cost: 5 } as EquipmentDef },
      ];
      applyAuraTagsToShopStock(stock, player);
      expect(stock.filter((s) => s.def.aura?.id === 'fire').length).toBe(2);
      expect(player.pendingTags[0]?.copies).toBe(2);
    });

    it('Coupon Book enables free first reroll', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_free_reroll')!;
      player.addTag(tag);
      const mods = processShopTags(player);
      expect(mods.freeFirstReroll).toBe(true);
    });

    it('free inject equipment stays $0 with leased modifier', () => {
      const def = {
        id: 'bargain_bin',
        name: 'Bargain Bin',
        cost: 0,
        rarity: 'rare',
        description: '',
        effectType: 'SHOP_REROLL_MULT_GAIN',
        effectParams: {},
        display: stubEquipmentDisplay,
      };
      const listPrice = getEquipmentListPrice(def);
      expect(listPrice).toBeGreaterThan(0);
      expect(getEquipmentPurchasePrice(def, ['leased'], listPrice, [])).toBe(0);
      expect(getEquipmentPurchasePrice(def, ['leased'], listPrice, [])).not.toBe(EQUIPMENT_MODIFIER.LEASED_BUY_PRICE);
    });

    it('free icy aura equipment stays $0 at purchase', () => {
      const icy = getItemAuraById('icy')!;
      const def = {
        id: 'bargain_bin',
        name: 'Bargain Bin',
        cost: 0,
        rarity: 'uncommon',
        description: '',
        effectType: 'SHOP_REROLL_MULT_GAIN',
        effectParams: {},
        aura: icy,
        display: stubEquipmentDisplay,
      };
      const listPrice = getEquipmentListPrice(def);
      expect(listPrice).toBeGreaterThan(0);
      expect(getEquipmentPurchasePrice(def, [], listPrice, [])).toBe(0);
    });

    it('On the House free stock stays $0 with leased modifier', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_company_store')!;
      player.addTag(tag);
      const mods = processShopTags(player);
      expect(mods.freeShop).toBe(true);

      const stock = [
        {
          type: 'equipment',
          def: {
            id: 'horseshoe',
            name: 'Horseshoe',
            cost: 5,
            rarity: 'common',
            description: '',
            effectType: 'ADD_MULT',
            effectParams: {},
            display: stubEquipmentDisplay,
          } as EquipmentDef,
        },
      ];
      for (const item of stock) {
        if (item.type === 'equipment') {
          item.def = { ...item.def, cost: 0 };
        }
      }
      const listPrice = getEquipmentListPrice(stock[0].def);
      expect(getEquipmentPurchasePrice(stock[0].def, ['leased'], listPrice, [])).toBe(0);
    });
  });

  describe('Boss Tags', () => {
    it('Bounty Payout grants $25 per copy after boss', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_investment')!;
      player.addTag(tag);
      const bonus = processBossPayoutTags(player);
      expect(bonus).toBe(25);
      expect(player.pendingTags.length).toBe(0);
    });

    it('Change of Guard tag is not consumed by payout processing', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_boss')!;
      player.addTag(tag);
      const bonus = processBossPayoutTags(player);
      expect(bonus).toBe(0);
      expect(player.pendingTags.length).toBe(1);
      expect(player.pendingTags[0].def.id).toBe('tag_boss');
    });

    it('Change of Guard immediately rerolls boss and is consumed', () => {
      const player = getPlayerState();
      const before = player.getBossForLeg(player.leg)!.id;
      const tag = ALL_TAGS.find((t) => t.id === 'tag_boss')!;
      player.addTag(tag);
      const rerolls = processChangeOfGuardTags(player);
      expect(rerolls).toBe(1);
      expect(player.pendingTags.length).toBe(0);
      expect(player.getBossForLeg(player.leg)!.id).not.toBe(before);
    });
  });

  describe('Equipment sell value', () => {
    it('free shop equipment sells for half list price, not $1', () => {
      const def = {
        id: 'bargain_bin',
        name: 'Bargain Bin',
        cost: 0,
        rarity: 'uncommon',
        description: '',
        effectType: 'SHOP_REROLL_MULT_GAIN',
        effectParams: {},
        display: stubEquipmentDisplay,
      };
      expect(getEquipmentListPrice(def)).toBe(6);
      expect(getEquipmentSellValue(def)).toBe(3);
    });

    it('free equipment with aura includes aura cost in sell value', () => {
      const fire = getItemAuraById('fire')!;
      const def = {
        id: 'bargain_bin',
        name: 'Bargain Bin',
        cost: 0,
        rarity: 'uncommon',
        description: '',
        effectType: 'SHOP_REROLL_MULT_GAIN',
        effectParams: {},
        aura: fire,
        display: stubEquipmentDisplay,
      };
      expect(getEquipmentListPrice(def)).toBe(10);
      expect(getEquipmentSellValue(def)).toBe(5);
    });

    it('bargain_bin permit lowers sell value like discounted shop price', () => {
      const def = {
        id: 'bargain_bin',
        name: 'Bargain Bin',
        cost: 0,
        rarity: 'uncommon',
        description: '',
        effectType: 'SHOP_REROLL_MULT_GAIN',
        effectParams: {},
        display: stubEquipmentDisplay,
      };
      const inst = createEquipmentInstance(def, ['bargain_bin']);
      expect(inst.sellValue).toBe(2);
    });
  });

  describe('Junk Pile', () => {
    it('creates up to 2 common equipment', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_top_up')!;
      const instance = { def: tag, copies: 1 };
      const before = player.equipment.length;
      const created = processJunkPileTag(instance, player);
      expect(player.equipment.length).toBeLessThanOrEqual(before + 2);
      expect(created.length).toBeGreaterThan(0);
      expect(created.every((c) => c.rarity === 'common')).toBe(true);
    });
  });
});
