import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import { die, diceWithValue, item, itemWithState, setupGame, calculateTestScore, resetDieIds } from '../testHelpers';
import { processEquipmentOnRoundStart, processEquipmentAfterHandScored } from '../../EquipmentEffects';
import { HandType } from '../../types';

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
    // Reset xMult AFTER startRound (which adds 0.5) to test scoring in isolation
    totem.state.xMult = 2;

    game.state.phase = 'ROLL';
    game.state.rolledDice = diceWithValue(5, 2);
    game.state.selectedForRoll = game.state.rolledDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(game.state.rolledDice.map((d) => d.id));
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
});

// ─── ROUND_START_CREATE_EQUIPMENT: Junk Dealer ───

describe('ROUND_START_CREATE_EQUIPMENT: Junk Dealer', () => {
  test('reports 2 equipment to create on round start', () => {
    const junk = item('junk_dealer');
    const result = processEquipmentOnRoundStart([junk]);
    expect(result.equipmentToCreate).toBe(2);
    expect(result.equipmentCreateRarity).toBe('common');
  });

  test('multiple junk dealers stack', () => {
    const result = processEquipmentOnRoundStart([item('junk_dealer'), item('junk_dealer')]);
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
});
