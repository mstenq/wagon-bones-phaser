import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import {
  die,
  diceWithValue,
  item,
  itemWithState,
  setupGame,
  calculateTestScore,
  resetDieIds,
  persistPlayerEquipment,
  seedTestRoll,
} from '../testHelpers';
import {
  processEquipmentOnRoundStart,
  processEquipmentAfterHandScored,
  processEquipmentOnDayStart,
} from '../../EquipmentEffects';
import { HandType } from '../../types';
import { D } from '../../scoreMath';
import { createConsumableInstance, getSupplyDefById, getTrailGuideDefById } from '../../ConsumablesSystem';
import { replaceConsumableList, resolveConsumableList, resolveEquipmentList } from '../../store/resolve';
import { runActions } from '../../store';
import { applyBossOnDayStart, getBossRoundState } from '../../BossEffectsSystem';

beforeEach(() => resetDieIds());

// ─── ROUND_START_DESTROY_RIGHT: Funeral Pyre ───

describe('ROUND_START_DESTROY_RIGHT: Funeral Pyre', () => {
  test('destroys right neighbor and gains mult', () => {
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const neighbor = item('horseshoe'); // sellValue is floor(cost/2)
    const neighborSellValue = neighbor.sellValue;

    const result = processEquipmentOnRoundStart([pyre, neighbor]);
    expect(result.animatedDestructions).toEqual([{ sourceIdx: 0, victimIdx: 1 }]);
    expect(pyre.state.mult).toBe(neighborSellValue * 2);
  });

  test('does not destroy if no right neighbor', () => {
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const result = processEquipmentOnRoundStart([pyre]);
    expect(result.animatedDestructions).toEqual([]);
    expect(pyre.state.mult).toBe(0);
  });

  test('accumulates mult across rounds', () => {
    const pyre = itemWithState('funeral_pyre', { mult: 10 });
    const neighbor = item('horseshoe');
    const neighborSellValue = neighbor.sellValue;

    processEquipmentOnRoundStart([pyre, neighbor]);
    expect(pyre.state.mult).toBe(10 + neighborSellValue * 2);
  });

  test('applies accumulated mult as bonusMult in scoring', () => {
    const pyre = itemWithState('funeral_pyre', { mult: 15 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [pyre],
    });
    // PAIR: baseMult=1, +15 bonusMult from funeral_pyre state
    expect(result.mult).toBeMult(16);
  });

  test('Mirror Lake copying funeral pyre does not trigger a second destruction', () => {
    const equipment = [item('mirror_lake'), itemWithState('funeral_pyre', { mult: 6 }), item('horseshoe')];
    const result = processEquipmentOnRoundStart(equipment);
    expect(result.animatedDestructions.length).toBe(1);
  });

  test('Mirror Lake copying funeral pyre still applies stored mult when scoring', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), itemWithState('funeral_pyre', { mult: 6 })],
    });
    expect(result.mult).toBeMult(13);
  });
});

// ─── ROUND_START_ADD_STONE: Quarry Stone ───

describe('ROUND_START_ADD_STONE: Quarry Stone', () => {
  test('reports stone dice to add', () => {
    const quarry = item('quarry_stone');
    const result = processEquipmentOnRoundStart([quarry]);
    expect(result.stoneDiceToAdd).toBe(1);
  });

  test('multiple quarry stones stack', () => {
    const result = processEquipmentOnRoundStart([item('quarry_stone'), item('quarry_stone')]);
    expect(result.stoneDiceToAdd).toBe(2);
  });

  test('Mirror Lake copying quarry stone adds a second stone die', () => {
    const result = processEquipmentOnRoundStart([item('mirror_lake'), item('quarry_stone')]);
    expect(result.stoneDiceToAdd).toBe(2);
  });
});

// ─── ROUND_START_XMULT_DESTROY: Haunted Totem ───

describe('ROUND_START_XMULT_DESTROY: Haunted Totem', () => {
  test('gains x0.5 mult on round start', () => {
    const totem = item('haunted_totem');
    const other = item('horseshoe');
    processEquipmentOnRoundStart([totem, other]);
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);
  });

  test('destroys a random other equipment on round start', () => {
    const totem = item('haunted_totem');
    const other = item('horseshoe');
    const result = processEquipmentOnRoundStart([totem, other]);
    expect(result.animatedDestructions).toEqual([{ sourceIdx: 0, victimIdx: 1 }]);
  });

  test('does not destroy itself', () => {
    const totem = item('haunted_totem');
    const result = processEquipmentOnRoundStart([totem]);
    expect(result.animatedDestructions).toEqual([]);
  });

  test('gains xMult even if no other equipment to destroy', () => {
    const totem = item('haunted_totem');
    processEquipmentOnRoundStart([totem]);
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);
  });

  test('does NOT activate on boss rounds', () => {
    const totem = item('haunted_totem');
    const other = item('horseshoe');
    const result = processEquipmentOnRoundStart([totem, other], true);
    expect(totem.state.xMult).toBe(1); // unchanged
    expect(result.animatedDestructions.length).toBe(0);
  });

  test('accumulated xMult applies during scoring', () => {
    const totem = itemWithState('haunted_totem', { xMult: 2 });

    const { game, player } = setupGame({
      equipment: [totem],
      dice: [...diceWithValue(5, 2), ...diceWithValue(1, 50)],
    });

    game.startRound();
    player.equipment[0]!.state.xMult = 2;
    persistPlayerEquipment();

    const rolled = player.dice.slice(0, 2);
    seedTestRoll(rolled);
    game.selectForScore(rolled.map((d) => d.id));
    const result = game.calculateScore()!;
    // PAIR: baseMult=1, x2 from totem = 2
    expect(result.mult).toBeMult(2);
  });

  test('stacks across multiple rounds', () => {
    const totem = item('haunted_totem');
    const other1 = item('horseshoe');
    const other2 = item('dynamite');
    processEquipmentOnRoundStart([totem, other1, other2]);
    // xMult should be 1.5 after first round
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);

    // Second round with remaining equipment
    processEquipmentOnRoundStart([totem, other2]);
    expect(totem.state.xMult).toBeCloseTo(2.0, 5);
  });

  test('Mirror Lake copying haunted totem does not trigger a second destruction', () => {
    const equipment = [item('mirror_lake'), itemWithState('haunted_totem', { xMult: 2 }), item('horseshoe')];
    const result = processEquipmentOnRoundStart(equipment);
    expect(result.animatedDestructions.length).toBe(1);
  });

  test('Mirror Lake copying haunted totem still applies xMult when scoring', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), itemWithState('haunted_totem', { xMult: 2 })],
    });
    expect(result.mult).toBeMult(6.25);
  });
});

// ─── ROUND_START_CREATE_EQUIPMENT: Junk Dealer ───

describe('ROUND_START_CREATE_EQUIPMENT: Junk Dealer', () => {
  test('reports 2 equipment to create on round start', () => {
    const junk = item('junk_dealer');
    const result = processEquipmentOnRoundStart([junk]);
    expect(result.equipmentToCreate).toBe(2);
    expect(result.equipmentCreateRarities).toEqual(['common']);
  });

  test('multiple junk dealers stack', () => {
    const result = processEquipmentOnRoundStart([item('junk_dealer'), item('junk_dealer')]);
    expect(result.equipmentToCreate).toBe(4);
    expect(result.equipmentCreateRarities).toEqual(['common']);
  });

  test('occult trader override allows common through rare (not rare-only)', () => {
    setupGame({ profession: 'occult_trader' });
    const result = processEquipmentOnRoundStart([item('junk_dealer')]);
    expect(result.equipmentCreateRarities).toEqual(['common', 'uncommon', 'rare']);
  });

  test('non-occult profession keeps junk dealer at common-only', () => {
    setupGame({ profession: 'farmer' });
    const result = processEquipmentOnRoundStart([item('junk_dealer')]);
    expect(result.equipmentCreateRarities).toEqual(['common']);
  });

  test('Mirror Lake copying junk dealer doubles equipment to create', () => {
    const result = processEquipmentOnRoundStart([item('mirror_lake'), item('junk_dealer')]);
    expect(result.equipmentToCreate).toBe(4);
  });
});

// ─── ROUND_START_SELL_VALUE: Antique Revolver ───

describe('ROUND_START_SELL_VALUE: Antique Revolver', () => {
  test('gains $3 sell value on round start', () => {
    const revolver = item('antique_revolver');
    const initialSellValue = revolver.sellValue;
    processEquipmentOnRoundStart([revolver]);
    expect(revolver.sellValue).toBe(initialSellValue + 3);
  });

  test('accumulates across multiple rounds', () => {
    const revolver = item('antique_revolver');
    const initialSellValue = revolver.sellValue;
    processEquipmentOnRoundStart([revolver]);
    processEquipmentOnRoundStart([revolver]);
    expect(revolver.sellValue).toBe(initialSellValue + 6);
  });
});

// ─── ROUND_START_DAYS_NO_REROLLS: Hardtack ───

describe('ROUND_START_DAYS_NO_REROLLS: Hardtack', () => {
  test('reports +3 days bonus on round start', () => {
    const hardtack = item('hardtack');
    const result = processEquipmentOnRoundStart([hardtack]);
    expect(result.daysBonus).toBe(3);
    expect(result.loseAllRerolls).toBe(true);
  });

  test('Mirror Lake copying hardtack grants +6 days total', () => {
    const result = processEquipmentOnRoundStart([item('mirror_lake'), item('hardtack')]);
    expect(result.daysBonus).toBe(6);
    expect(result.loseAllRerolls).toBe(true);
  });
});

// ─── LOW_MONEY_SUPPLY: Emergency Supplies ───

describe('LOW_MONEY_SUPPLY: Emergency Supplies', () => {
  test('creates supply card when balance <= $4', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 3 });
    const initialConsumables = player.consumables.length;
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(player.consumables.length).toBe(initialConsumables + 1);
  });

  test('does NOT create supply card when balance > $4', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 10 });
    const initialConsumables = player.consumables.length;
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(player.consumables.length).toBe(initialConsumables);
  });

  test('creates supply card at exactly $4', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 4 });
    const initialConsumables = player.consumables.length;
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(player.consumables.length).toBe(initialConsumables + 1);
  });

  test('created card is a supply category', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 2 });
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    const lastConsumable = player.consumables[player.consumables.length - 1];
    expect(lastConsumable.def.category).toBe('supply');
  });

  test('doctor triggers at $8 or less', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 8, profession: 'doctor' });
    player.consumables = [];
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(player.consumables.length).toBe(1);
  });

  test('doctor does NOT trigger above $8', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [inst], money: 9, profession: 'doctor' });
    const initialConsumables = player.consumables.length;
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(player.consumables.length).toBe(initialConsumables);
  });

  test('Mirror Lake copying emergency supplies grants two supply cards when eligible', () => {
    const inst = item('emergency_supplies');
    const { player } = setupGame({ equipment: [item('mirror_lake'), inst], money: 3 });
    const before = player.consumables.length;
    processEquipmentAfterHandScored([item('mirror_lake'), inst], HandType.PAIR);
    expect(player.consumables.length).toBe(before + 2);
  });
});

// ─── Funeral Pyre + Haunted Totem Interaction Tests ───

describe('Funeral Pyre + Haunted Totem interactions', () => {
  test('both trigger when neither destroys the other (totem left, pyre right)', () => {
    // [totem, other1, pyre, other2]
    // Totem destroys random from [other1, pyre, other2]
    // Pyre destroys other2 (its right neighbor) — unless totem already destroyed pyre or other2
    const totem = item('haunted_totem');
    const other1 = item('horseshoe');
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const other2 = item('dynamite');

    const result = processEquipmentOnRoundStart([totem, other1, pyre, other2]);

    // Totem always triggers (gains xMult)
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);

    // First destruction is always from totem (index 0)
    expect(result.animatedDestructions[0].sourceIdx).toBe(0);

    const totemVictim = result.animatedDestructions[0].victimIdx;
    if (totemVictim === 1) {
      // Totem destroyed other1 — pyre still has other2 as right neighbor
      expect(result.animatedDestructions.length).toBe(2);
      expect(result.animatedDestructions[1].sourceIdx).toBe(2);
      expect(result.animatedDestructions[1].victimIdx).toBe(3);
    } else if (totemVictim === 2) {
      // Totem destroyed pyre — pyre is skipped
      expect(result.animatedDestructions.length).toBe(1);
      expect(pyre.state.mult).toBe(0);
    } else {
      // Totem destroyed other2 (pyre's right neighbor) — pyre has no valid target
      expect(totemVictim).toBe(3);
      expect(result.animatedDestructions.length).toBe(1);
      expect(pyre.state.mult).toBe(0);
    }
  });

  test('pyre is skipped when totem destroys it (totem is left of pyre)', () => {
    // [totem, pyre, other] — totem is at index 0, pyre at index 1
    // Force totem to destroy pyre by having only pyre and other as candidates
    const totem = item('haunted_totem');
    const pyre = itemWithState('funeral_pyre', { mult: 0 });

    // With only [totem, pyre], totem must destroy pyre (only option)
    const result = processEquipmentOnRoundStart([totem, pyre]);

    expect(totem.state.xMult).toBeCloseTo(1.5, 5);
    expect(result.animatedDestructions).toEqual([{ sourceIdx: 0, victimIdx: 1 }]);
    // Pyre was destroyed before it could trigger, so no mult gained
    expect(pyre.state.mult).toBe(0);
  });

  test('totem is skipped when pyre destroys it (pyre is left of totem)', () => {
    // [pyre, totem, other] — pyre at index 0, totem at index 1
    // Pyre destroys totem (its right neighbor)
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const totem = item('haunted_totem');
    const other = item('horseshoe');

    const result = processEquipmentOnRoundStart([pyre, totem, other]);

    // Pyre should destroy totem and gain mult
    expect(result.animatedDestructions).toEqual([{ sourceIdx: 0, victimIdx: 1 }]);
    expect(pyre.state.mult).toBe(totem.sellValue * 2);

    // Totem should NOT have triggered (destroyed before its turn)
    expect(totem.state.xMult).toBe(1); // unchanged from initial
  });

  test('both trigger independently when not adjacent and neither targets the other', () => {
    // [pyre, other1, totem, other2, other3]
    // Pyre destroys other1 (right neighbor)
    // Totem picks from remaining [other2, other3] (pyre still alive, but totem won't pick already-destroyed other1)
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const other1 = item('horseshoe');
    const totem = item('haunted_totem');
    const other2 = item('dynamite');
    const other3 = item('toolbelt');

    const result = processEquipmentOnRoundStart([pyre, other1, totem, other2, other3]);

    // Pyre triggers first (index 0) and destroys other1 (index 1)
    expect(result.animatedDestructions[0]).toEqual({ sourceIdx: 0, victimIdx: 1 });
    expect(pyre.state.mult).toBe(other1.sellValue * 2);

    // Totem triggers second (index 2) and destroys something other than pyre's victim
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);
    expect(result.animatedDestructions[1].sourceIdx).toBe(2);
    // Totem should not target other1 (already destroyed by pyre) or itself
    expect(result.animatedDestructions[1].victimIdx).not.toBe(1); // other1 already destroyed
    expect(result.animatedDestructions[1].victimIdx).not.toBe(2); // not itself
  });

  test('equipment processing order is left to right', () => {
    // [pyre, other] — pyre at index 0 processes before anything else
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const other = item('horseshoe');

    const result = processEquipmentOnRoundStart([pyre, other]);
    expect(result.animatedDestructions).toEqual([{ sourceIdx: 0, victimIdx: 1 }]);
  });

  test('destroyed equipment cannot be picked as totem victim', () => {
    // [pyre, victimA, totem]
    // Pyre destroys victimA, then totem has no valid targets (only pyre left, and itself)
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const victimA = item('horseshoe');
    const totem = item('haunted_totem');

    const result = processEquipmentOnRoundStart([pyre, victimA, totem]);

    // Pyre destroys victimA
    expect(result.animatedDestructions[0]).toEqual({ sourceIdx: 0, victimIdx: 1 });

    // Totem still gains xMult even with no valid targets
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);

    // Totem has only pyre as a candidate (victimA already destroyed, can't target self)
    // So it destroys pyre
    expect(result.animatedDestructions.length).toBe(2);
    expect(result.animatedDestructions[1]).toEqual({ sourceIdx: 2, victimIdx: 0 });
  });
});

// ─── ROUND_START_DESTROY_STANDARD_DICE: Burn Barrel ───

describe('ROUND_START_DESTROY_STANDARD_DICE: Burn Barrel', () => {
  test('destroys one standard die and earns $3', () => {
    const inst = item('burn_barrel');
    const { player } = setupGame({
      equipment: [inst],
      money: 10,
      dice: [die({ value: 5 }), die({ value: 3 }), die({ value: 7, enhancement: 'bone' })],
    });
    const result = processEquipmentOnRoundStart([inst]);
    expect(result.burnBarrelTriggered).toBe(true);
    expect(result.burnBarrelMoney).toBe(3);
    // One standard die removed, enhanced one remains + 1 standard
    expect(player.dice.length).toBe(2);
    expect(player.economy.balance).toBe(13);
  });

  test('does nothing if no standard dice available', () => {
    const inst = item('burn_barrel');
    const { player } = setupGame({
      equipment: [inst],
      money: 10,
      dice: [die({ value: 5, enhancement: 'bone' }), die({ value: 3, enhancement: 'steel' })],
    });
    const result = processEquipmentOnRoundStart([inst]);
    expect(result.burnBarrelTriggered).toBe(false);
    expect(result.burnBarrelMoney).toBe(0);
    expect(player.dice.length).toBe(2);
    expect(player.economy.balance).toBe(10);
  });

  test('Mirror Lake copying burn barrel destroys two standard dice and earns $6', () => {
    const inst = item('burn_barrel');
    const { player } = setupGame({
      equipment: [item('mirror_lake'), inst],
      money: 10,
      dice: [die({ value: 5 }), die({ value: 3 }), die({ value: 7 })],
    });
    const result = processEquipmentOnRoundStart([item('mirror_lake'), inst]);
    expect(result.burnBarrelTriggered).toBe(true);
    expect(result.burnBarrelMoney).toBe(6);
    expect(player.dice.length).toBe(1);
    expect(player.economy.balance).toBe(16);
  });
});

// ─── ROUND_START_DESTROY_TRAIL_GUIDES_XMULT: Ashfang ───

describe('ROUND_START_DESTROY_TRAIL_GUIDES_XMULT: Ashfang', () => {
  test('destroys all trail guides and gains x0.25 mult each', () => {
    const ashfang = item('ashfang');
    const tg = createConsumableInstance(getTrailGuideDefById('tg_high_value')!);
    const supply = createConsumableInstance(getSupplyDefById('coffee_tin')!);
    replaceConsumableList([tg, supply]);

    const result = processEquipmentOnRoundStart([ashfang]);

    expect(resolveConsumableList()).toHaveLength(1);
    expect(resolveConsumableList()[0]!.def.id).toBe('coffee_tin');
    expect(ashfang.state.xMult).toBeCloseTo(1.25, 5);
    expect(result.trailGuideEats).toEqual([
      {
        equipIndex: 0,
        priorConsumableCount: 2,
        eaten: [{ slotIndex: 0, defId: 'tg_high_value' }],
        xMultGained: 0.25,
      },
    ]);
  });

  test('records empty trailGuideEats when no trail guides are present', () => {
    const ashfang = item('ashfang');
    const supply = createConsumableInstance(getSupplyDefById('coffee_tin')!);
    replaceConsumableList([supply]);

    const result = processEquipmentOnRoundStart([ashfang]);

    expect(result.trailGuideEats).toEqual([]);
    expect(ashfang.state.xMult).toBe(1);
  });

  test('records all eaten trail guide slots when multiple are present', () => {
    const ashfang = item('ashfang');
    const tgA = createConsumableInstance(getTrailGuideDefById('tg_high_value')!);
    const tgB = createConsumableInstance(getTrailGuideDefById('tg_pair')!);
    const supply = createConsumableInstance(getSupplyDefById('coffee_tin')!);
    replaceConsumableList([supply, tgA, tgB]);

    const result = processEquipmentOnRoundStart([ashfang]);

    expect(result.trailGuideEats).toEqual([
      {
        equipIndex: 0,
        priorConsumableCount: 3,
        eaten: [
          { slotIndex: 1, defId: 'tg_high_value' },
          { slotIndex: 2, defId: 'tg_pair' },
        ],
        xMultGained: 0.5,
      },
    ]);
    expect(ashfang.state.xMult).toBeCloseTo(1.5, 5);
  });

  test('jinxed Ashfang still eats trail guides but gains no xMult', () => {
    setupGame({
      bossId: 'the_jinx',
      equipment: [item('ashfang'), item('horseshoe')],
      round: 3,
    });
    applyBossOnDayStart(1);
    getBossRoundState().disabledEquipmentIndices = [0];

    const ashfang = resolveEquipmentList()[0]!;
    const tg = createConsumableInstance(getTrailGuideDefById('tg_high_value')!);
    replaceConsumableList([tg]);

    const result = processEquipmentOnRoundStart([ashfang]);

    expect(resolveConsumableList()).toHaveLength(0);
    expect(ashfang.state.xMult).toBe(1);
    expect(result.trailGuideEats).toEqual([
      {
        equipIndex: 0,
        priorConsumableCount: 1,
        eaten: [{ slotIndex: 0, defId: 'tg_high_value' }],
        xMultGained: 0,
      },
    ]);
  });
});

// ─── Funeral Pyre Witch synergy ───

describe('ROUND_START_DESTROY_RIGHT: Funeral Pyre (Witch)', () => {
  test('witch gains 4x sell value instead of 2x', () => {
    runActions.patch({ professionId: 'witch' });
    const pyre = itemWithState('funeral_pyre', { mult: 0 });
    const neighbor = item('horseshoe');
    const neighborSellValue = neighbor.sellValue;

    processEquipmentOnRoundStart([pyre, neighbor]);
    expect(pyre.state.mult).toBe(neighborSellValue * 4);
  });
});

// ─── DAY_START_DOMINANT_ENHANCEMENT_HAND: Nightshard ───

describe('DAY_START_DOMINANT_ENHANCEMENT_HAND: Nightshard', () => {
  test('queues up to 3 unspent dice of the dominant enhancement', () => {
    const bones = [
      die({ enhancement: 'bone', value: 12 }),
      die({ enhancement: 'bone', value: 11 }),
      die({ enhancement: 'bone', value: 10 }),
      die({ enhancement: 'bone', value: 9 }),
    ];
    setupGame({
      equipment: [item('nightshard')],
      dice: [...bones, die({ enhancement: 'diamond', value: 8 }), ...diceWithValue(1, 100)],
    });
    const nightshard = item('nightshard');
    const result = processEquipmentOnDayStart([nightshard]);
    expect(result.priorityHandDiceIds).toHaveLength(3);
    expect(result.priorityHandDiceIds.every((id) => bones.some((d) => d.id === id))).toBe(true);
  });

  test('still surfaces diamond dice when diamond is dominant', () => {
    const diamonds = [
      die({ enhancement: 'diamond', value: 12 }),
      die({ enhancement: 'diamond', value: 11 }),
      die({ enhancement: 'diamond', value: 10 }),
      die({ enhancement: 'diamond', value: 9 }),
    ];
    setupGame({
      equipment: [item('nightshard')],
      dice: [...diamonds, ...diceWithValue(1, 100)],
    });
    const result = processEquipmentOnDayStart([item('nightshard')]);
    expect(result.priorityHandDiceIds).toHaveLength(3);
    expect(result.priorityHandDiceIds.every((id) => diamonds.some((d) => d.id === id))).toBe(true);
  });

  test('tie surfaces dice from any tied dominant enhancement', () => {
    const bones = [
      die({ enhancement: 'bone', value: 12 }),
      die({ enhancement: 'bone', value: 11 }),
      die({ enhancement: 'bone', value: 10 }),
      die({ enhancement: 'bone', value: 9 }),
    ];
    const diamonds = [
      die({ enhancement: 'diamond', value: 8 }),
      die({ enhancement: 'diamond', value: 7 }),
      die({ enhancement: 'diamond', value: 6 }),
      die({ enhancement: 'diamond', value: 5 }),
    ];
    setupGame({
      equipment: [item('nightshard')],
      dice: [...bones, ...diamonds, ...diceWithValue(1, 10)],
    });
    const result = processEquipmentOnDayStart([item('nightshard')]);
    expect(result.priorityHandDiceIds).toHaveLength(3);
    const dominantIds = new Set([...bones, ...diamonds].map((d) => d.id));
    expect(result.priorityHandDiceIds.every((id) => dominantIds.has(id))).toBe(true);
  });

  test('no enhanced dice yields no priority picks', () => {
    setupGame({
      equipment: [item('nightshard')],
      dice: diceWithValue(1, 20),
    });
    const result = processEquipmentOnDayStart([item('nightshard')]);
    expect(result.priorityHandDiceIds).toEqual([]);
  });

  test('spent dominant dice still count for dominance but are not surfaced', () => {
    const bones = [
      die({ enhancement: 'bone', value: 12 }),
      die({ enhancement: 'bone', value: 11 }),
      die({ enhancement: 'bone', value: 10 }),
      die({ enhancement: 'bone', value: 9 }),
      die({ enhancement: 'bone', value: 8 }),
    ];
    setupGame({
      equipment: [item('nightshard')],
      dice: [...bones, ...diceWithValue(1, 10)],
    });
    runActions.patch({ spentDiceIds: bones.map((d) => d.id) });
    const result = processEquipmentOnDayStart([item('nightshard')]);
    expect(result.priorityHandDiceIds).toEqual([]);
  });

  test('day 1 hand prefers dominant dice without increasing hand size', () => {
    const bones = [
      die({ enhancement: 'bone', value: 12 }),
      die({ enhancement: 'bone', value: 11 }),
      die({ enhancement: 'bone', value: 10 }),
    ];
    const { game } = setupGame({
      equipment: [item('nightshard')],
      dice: [...bones, die({ enhancement: 'diamond', value: 8 }), ...diceWithValue(1, 100)],
    });
    game.startRound();
    expect(game.state.hand.length).toBe(game.config.rollSize);
    const bonesInHand = game.state.hand.filter((d) => d.enhancement === 'bone');
    expect(bonesInHand).toHaveLength(3);
  });

  test('day 2 refill prefers dominant dice without increasing hand size', () => {
    const diamonds = [
      die({ enhancement: 'diamond', value: 12 }),
      die({ enhancement: 'diamond', value: 11 }),
      die({ enhancement: 'diamond', value: 10 }),
    ];
    const { game } = setupGame({
      equipment: [item('nightshard')],
      dice: [...diamonds, ...diceWithValue(1, 10)],
    });
    game.startRound();
    game.config.targetMiles = D(999_999);
    const handIds = game.state.hand.map((d) => d.id);
    expect(game.selectForRoll(handIds)).toBe(true);
    const scoreTarget = game.state.hand.find((d) => d.enhancement !== 'diamond');
    expect(scoreTarget).toBeDefined();
    expect(game.selectForScore([scoreTarget!.id])).toBe(true);
    expect(game.calculateScore()).not.toBeNull();

    const result = game.endDay();
    expect(result.outcome).toBe('next-day');
    expect(game.state.hand.length).toBe(game.config.rollSize);
    const diamondsInHand = game.state.hand.filter((d) => d.enhancement === 'diamond');
    expect(diamondsInHand).toHaveLength(3);
  });
});

// ─── Cursed equipment protection on round-start destruction ───

describe('cursed equipment round-start destruction', () => {
  test('haunted totem does not target cursed equipment', () => {
    const totem = item('haunted_totem');
    const cursed = item('horseshoe');
    cursed.modifiers = ['cursed'];
    const result = processEquipmentOnRoundStart([totem, cursed]);
    expect(result.animatedDestructions).toEqual([]);
    expect(totem.state.xMult).toBeCloseTo(1.5, 5);
  });
});
