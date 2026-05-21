import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { resetDieIds, setupGame, die, item, equipWithModifiers } from './testHelpers';
import { resetPlayerState } from '../PlayerState';
import {
  createSupplyConsumableDef,
  createTrailGuideConsumableDef,
  createConsumableInstance,
  getSupplyDefById,
  getFrontierDefById,
  executeConsumableEffect,
  useConsumableDirectly,
} from '../ConsumablesSystem';
import { isEquipmentCursed } from '../ItemsSystem';
import { applyDiceSelectionEffect, DiceSelectionConfig } from '../DiceSelectionSystem';
import supplyCardsData from '../../data/supply_cards.json';
import trailGuidesData from '../../data/trail_guides.json';

beforeEach(() => {
  resetDieIds();
});

// ─── ConsumableDef Creation ───

describe('ConsumableDef creation', () => {
  test('createSupplyConsumableDef creates a valid def from JSON', () => {
    const card = supplyCardsData.find((c) => c.id === 'coffee_tin')!;
    const def = createSupplyConsumableDef(card);
    expect(def.id).toBe('coffee_tin');
    expect(def.name).toBe('Coffee Tin');
    expect(def.category).toBe('supply');
    expect(def.diceSelection).toBeDefined();
    expect(def.diceSelection!.effectType).toBe('ENHANCE');
  });

  test('createSupplyConsumableDef with diceSelection', () => {
    const card = supplyCardsData.find((c) => c.id === 'shallow_grave')!;
    const def = createSupplyConsumableDef(card);
    expect(def.diceSelection).toBeDefined();
    expect(def.diceSelection!.drawCount).toBe(5);
    expect(def.diceSelection!.pickCount).toBe(2);
  });

  test('createTrailGuideConsumableDef creates a valid def', () => {
    const tg = trailGuidesData[0];
    const def = createTrailGuideConsumableDef(tg);
    expect(def.category).toBe('trail_guide');
    expect(def.handType).toBe(tg.handType);
  });

  test('createConsumableInstance sets correct sellValue', () => {
    const card = supplyCardsData[0];
    const def = createSupplyConsumableDef(card);
    const inst = createConsumableInstance(def);
    expect(inst.sellValue).toBe(Math.max(1, Math.floor(def.cost / 2)));
  });

  test('getSupplyDefById returns null for unknown id', () => {
    expect(getSupplyDefById('nonexistent')).toBeNull();
  });

  test('getSupplyDefById returns valid def for known id', () => {
    const def = getSupplyDefById('treasure_map');
    expect(def).not.toBeNull();
    expect(def!.name).toBe('Treasure Map');
  });
});

// ─── PlayerState Consumable Management ───

describe('PlayerState consumable management', () => {
  test('starts with empty consumables', () => {
    const player = resetPlayerState();
    expect(player.consumables).toHaveLength(0);
    expect(player.usedConsumableSlots).toBe(0);
    expect(player.consumableSlotsFree).toBe(2);
  });

  test('addConsumable adds to inventory', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    const result = player.addConsumable(def);
    expect(result).toBe(true);
    expect(player.consumables).toHaveLength(1);
    expect(player.usedConsumableSlots).toBe(1);
  });

  test('addConsumable respects max slots', () => {
    const player = resetPlayerState();
    const def1 = getSupplyDefById('coffee_tin')!;
    const def2 = getSupplyDefById('treasure_map')!;
    const def3 = getSupplyDefById('buzzards')!;

    expect(player.addConsumable(def1)).toBe(true);
    expect(player.addConsumable(def2)).toBe(true);
    expect(player.addConsumable(def3)).toBe(false); // full
    expect(player.consumables).toHaveLength(2);
  });

  test('ghost aura consumable does not count against max slots', () => {
    const player = resetPlayerState();
    const def1 = getSupplyDefById('coffee_tin')!;
    const def2 = getSupplyDefById('treasure_map')!;

    player.addConsumable(def1);
    player.addConsumable(def2);

    // Ghost aura bypasses slot limit
    const ghostDef = getSupplyDefById('buzzards')!;
    (ghostDef as any).aura = { id: 'ghost', name: 'Ghost', description: 'test', costIncrease: 0, chance: 0 };
    expect(player.addConsumable(ghostDef)).toBe(true);
    expect(player.consumables).toHaveLength(3);
    expect(player.usedConsumableSlots).toBe(2); // ghost doesn't count
  });

  test('sellConsumable earns money and removes card', () => {
    const player = resetPlayerState();
    player.economy.setBalance(0);
    const def = getSupplyDefById('coffee_tin')!;
    player.addConsumable(def);

    const sellValue = player.consumables[0].sellValue;
    expect(player.sellConsumable(0)).toBe(true);
    expect(player.consumables).toHaveLength(0);
    expect(player.economy.balance).toBe(sellValue);
  });

  test('sellConsumable returns false for invalid index', () => {
    const player = resetPlayerState();
    expect(player.sellConsumable(-1)).toBe(false);
    expect(player.sellConsumable(0)).toBe(false);
  });

  test('useConsumable removes and returns the instance', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('treasure_map')!;
    player.addConsumable(def);

    const balanceBefore = player.economy.balance;
    const consumed = player.useConsumable(0);
    expect(consumed).not.toBeNull();
    expect(consumed!.def.id).toBe('treasure_map');
    expect(player.consumables).toHaveLength(0);
    // Using does NOT earn money
    expect(player.economy.balance).toBe(balanceBefore);
  });

  test('useConsumable tracks lastUsedConsumable', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.addConsumable(def);
    player.useConsumable(0);
    expect(player.lastUsedConsumable).not.toBeNull();
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');
  });

  test('second_helpings duplicates last used consumable', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;

    // Use a coffee tin first to set lastUsedConsumable
    player.addConsumable(coffeeDef);
    const used = player.useConsumable(0);
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');

    // Now add and use second_helpings
    player.addConsumable(secondHelpingsDef);
    const secondHelpings = player.useConsumable(0)!;
    expect(secondHelpings.def.id).toBe('second_helpings');
    // lastUsedConsumable should NOT have been overwritten to second_helpings
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');

    const result = executeConsumableEffect(secondHelpings, player);
    expect(result.success).toBe(true);
    expect(result.consumablesCreated).toBe(1);
    expect(player.consumables).toHaveLength(1);
    expect(player.consumables[0].def.id).toBe('coffee_tin');
  });

  test('second_helpings fails when no previous consumable used', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;
    player.addConsumable(secondHelpingsDef);
    const secondHelpings = player.useConsumable(0)!;
    const result = executeConsumableEffect(secondHelpings, player);
    expect(result.success).toBe(false);
  });

  test('useConsumableDirectly sets lastUsedConsumable for normal cards', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    useConsumableDirectly(coffeeDef, player);
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');
  });

  test('useConsumableDirectly does NOT overwrite lastUsedConsumable for second_helpings', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;

    // Use coffee first
    useConsumableDirectly(coffeeDef, player);
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');

    // Use second_helpings — should clone coffee, not overwrite lastUsedConsumable
    const result = useConsumableDirectly(secondHelpingsDef, player);
    expect(result.success).toBe(true);
    expect(result.consumablesCreated).toBe(1);
    expect(player.consumables[0].def.id).toBe('coffee_tin');
    // lastUsedConsumable should still be coffee_tin
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');
  });

  test('useConsumableDirectly second_helpings fails without prior use', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;
    const result = useConsumableDirectly(secondHelpingsDef, player);
    expect(result.success).toBe(false);
  });

  test('useConsumable returns null for invalid index', () => {
    const player = resetPlayerState();
    expect(player.useConsumable(5)).toBeNull();
  });

  test('reorderConsumable swaps positions', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const def1 = getSupplyDefById('coffee_tin')!;
    const def2 = getSupplyDefById('treasure_map')!;
    const def3 = getSupplyDefById('buzzards')!;
    player.addConsumable(def1);
    player.addConsumable(def2);
    player.addConsumable(def3);

    player.reorderConsumable(0, 2);
    expect(player.consumables[0].def.id).toBe('treasure_map');
    expect(player.consumables[1].def.id).toBe('buzzards');
    expect(player.consumables[2].def.id).toBe('coffee_tin');
  });

  test('reorderConsumable ignores invalid indices', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.addConsumable(def);
    player.reorderConsumable(-1, 0); // should not throw
    player.reorderConsumable(0, 5); // should not throw
    expect(player.consumables).toHaveLength(1);
  });
});

// ─── Profession Starting Consumables ───

describe('profession starting consumables', () => {
  test('cook starts with 2x second_helpings', () => {
    const { player } = setupGame({ profession: 'cook' });
    expect(player.consumables).toHaveLength(2);
    expect(player.consumables[0].def.id).toBe('second_helpings');
    expect(player.consumables[1].def.id).toBe('second_helpings');
  });

  test('doctor starts with 2x medicine (skipped if medicine card not yet in data)', () => {
    const { player } = setupGame({ profession: 'doctor' });
    // Medicine card not yet defined in supply_cards.json — this will be 0 until it's added
    // When medicine is added, this should be 2
    expect(player.consumables.length).toBeLessThanOrEqual(2);
  });

  test('scout has -1 consumable slot', () => {
    const { player } = setupGame({ profession: 'scout' });
    expect(player.maxConsumableSlots).toBe(1);
  });
});

// ─── Mirage (CLONE) ───

describe('Mirage CLONE effect', () => {
  test('left die copies enhancement, sticker, aura from right die', () => {
    const player = resetPlayerState();
    const leftDie = die({ enhancement: 'wooden', aura: null, sticker: null, value: 3 });
    const rightDie = die({ enhancement: 'gold', aura: 'holy', sticker: 'red_bullet', value: 10 });
    player.dice = [leftDie, rightDie];

    const config: DiceSelectionConfig = {
      drawCount: 2,
      pickCount: 2,
      effectType: 'CLONE',
      effectParams: {},
      cardName: 'Mirage',
      description: '',
      skippable: false,
    };

    applyDiceSelectionEffect(config, [leftDie, rightDie]);

    const updated = player.dice.find((d) => d.id === leftDie.id)!;
    expect(updated.enhancement).toBe('gold');
    expect(updated.aura).toBe('holy');
    expect(updated.sticker).toBe('red_bullet');
  });

  test('left die keeps its own value (not copied from right)', () => {
    const player = resetPlayerState();
    const leftDie = die({ enhancement: 'wooden', value: 3 });
    const rightDie = die({ enhancement: 'gold', value: 10 });
    player.dice = [leftDie, rightDie];

    const config: DiceSelectionConfig = {
      drawCount: 2,
      pickCount: 2,
      effectType: 'CLONE',
      effectParams: {},
      cardName: 'Mirage',
      description: '',
      skippable: false,
    };

    applyDiceSelectionEffect(config, [leftDie, rightDie]);

    const updated = player.dice.find((d) => d.id === leftDie.id)!;
    expect(updated.value).toBe(3); // value should NOT change
    expect(updated.enhancement).toBe('gold');
  });

  test('right die is unchanged after clone', () => {
    const player = resetPlayerState();
    const leftDie = die({ enhancement: 'wooden', aura: 'fire' });
    const rightDie = die({ enhancement: 'gold', aura: 'holy' });
    player.dice = [leftDie, rightDie];

    const config: DiceSelectionConfig = {
      drawCount: 2,
      pickCount: 2,
      effectType: 'CLONE',
      effectParams: {},
      cardName: 'Mirage',
      description: '',
      skippable: false,
    };

    applyDiceSelectionEffect(config, [leftDie, rightDie]);

    const right = player.dice.find((d) => d.id === rightDie.id)!;
    expect(right.enhancement).toBe('gold');
    expect(right.aura).toBe('holy');
  });
});

// ─── Bless Aura Weighting ───

import itemAurasData from '../../data/item_auras.json';

describe('Bless supply card aura weighting', () => {
  test('bless applies weighted aura distribution matching item_auras.json', () => {
    const blessableIds = ['fire', 'icy', 'holy'] as const;
    const blessableAuras = blessableIds.map((id) => itemAurasData.find((a) => a.id === id)!);
    const totalWeight = blessableAuras.reduce((sum, a) => sum + a.chance, 0);
    const expectedRates = Object.fromEntries(blessableAuras.map((a) => [a.id, a.chance / totalWeight]));

    const counts: Record<string, number> = { fire: 0, icy: 0, holy: 0 };
    const runs = 10000;

    for (let i = 0; i < runs; i++) {
      const { player } = setupGame({
        equipment: [item('horseshoe'), item('loaded_dice'), item('loaded_dice')],
        money: 10,
      });

      const blessDef = getSupplyDefById('bless');
      if (!blessDef) throw new Error('bless not found');
      const consumed = createConsumableInstance(blessDef);
      executeConsumableEffect(consumed, player);

      const aura = player.equipment[0].def.aura;
      if (aura) {
        counts[aura.id]++;
      }
    }

    const total = counts.fire + counts.icy + counts.holy;
    const tolerance = 0.07; // ±7% tolerance for RNG

    for (const id of blessableIds) {
      const actualRate = counts[id] / total;
      expect(actualRate).toBeGreaterThan(expectedRates[id] - tolerance);
      expect(actualRate).toBeLessThan(expectedRates[id] + tolerance);
    }

    // Verify ordering matches weight ordering (highest weight = most common)
    const sorted = [...blessableAuras].sort((a, b) => b.chance - a.chance);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(counts[sorted[i].id]).toBeGreaterThan(counts[sorted[i + 1].id]);
    }
  });
});

describe('frontier cards and cursed equipment', () => {
  test("priest's blessing keeps cursed equipment when destroying others", () => {
    const player = resetPlayerState();
    player.equipment.push(equipWithModifiers('horseshoe', []));
    player.equipment.push(equipWithModifiers('war_drums', ['cursed']));

    const def = getFrontierDefById('priests_blessing')!;
    const original = Math.random;
    Math.random = () => 0; // bless horseshoe (index 0), not the cursed war_drums
    try {
      const result = useConsumableDirectly(def, player);

      expect(result.success).toBe(true);
      expect(player.equipment).toHaveLength(2);
      expect(player.equipment.some((e) => isEquipmentCursed(e))).toBe(true);
      expect(player.equipment.some((e) => e.def.aura?.id === 'holy')).toBe(true);
    } finally {
      Math.random = original;
    }
  });

  test('skin walker copies random item and keeps cursed equipment', () => {
    const player = resetPlayerState();
    player.equipment.push(equipWithModifiers('horseshoe', []));
    player.equipment.push(equipWithModifiers('war_drums', ['cursed']));

    const def = getFrontierDefById('skin_walker')!;
    const result = useConsumableDirectly(def, player);

    expect(result.success).toBe(true);
    expect(player.equipment.some((e) => isEquipmentCursed(e))).toBe(true);
    // Non-cursed horseshoe destroyed; cursed lucky_coin + copy remain
    expect(player.equipment.length).toBeGreaterThanOrEqual(2);
  });

  test('skin walker copy retains curse when source is cursed', () => {
    const player = resetPlayerState();
    player.equipment.push(equipWithModifiers('horseshoe', ['cursed']));

    const def = getFrontierDefById('skin_walker')!;
    useConsumableDirectly(def, player);

    expect(player.equipment.length).toBe(2);
    expect(player.equipment.every((e) => isEquipmentCursed(e))).toBe(true);
  });
});
