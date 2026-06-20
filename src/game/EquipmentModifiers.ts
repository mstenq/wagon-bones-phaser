// ─── Equipment Modifiers (No Phaser imports) ───
// Difficulty-based modifier rolls applied when equipment enters the player's inventory.

import { DifficultyLevel, EquipmentModifier } from './types';
import { EQUIPMENT_MODIFIER } from './Constants';
import {
  createEquipmentInstance,
  EquipmentDef,
  EquipmentInstance,
  isEquipmentLeased,
  isEquipmentModifierImmune,
  isEquipmentPerishable,
} from './ItemsSystem';
import { resolveEffectParam } from './effectParams';
import { getRunState } from './store/runStore';
import { replaceEquipmentList, resolveEquipmentList } from './store/resolve';
import { economyActions } from './store/actions/economyActions';
import { equipmentActions } from './store/actions/equipmentActions';
import { getDiscountedShopPrice } from './PermitsSystem';
import { rngFloat } from './RunRng';

/**
 * Roll equipment modifiers based on current difficulty level.
 * Cursed is rolled first; Perishable is skipped if Cursed succeeded (incompatible).
 */
export function rollEquipmentModifiers(difficulty: DifficultyLevel, def: EquipmentDef): EquipmentModifier[] {
  const modifiers: EquipmentModifier[] = [];

  if (
    difficulty >= 4 &&
    !isEquipmentModifierImmune(def, 'cursed') &&
    rngFloat('equipment') < EQUIPMENT_MODIFIER.CURSED_RATE
  ) {
    modifiers.push('cursed');
  }

  if (
    difficulty >= 7 &&
    !modifiers.includes('cursed') &&
    !isEquipmentModifierImmune(def, 'perishable') &&
    rngFloat('equipment') < EQUIPMENT_MODIFIER.PERISHABLE_RATE
  ) {
    modifiers.push('perishable');
  }

  if (difficulty >= 8 && rngFloat('equipment') < EQUIPMENT_MODIFIER.LEASED_RATE) {
    modifiers.push('leased');
  }

  return modifiers;
}

/** Apply rolled modifiers to an equipment instance (mutates in place). */
export function applyModifiersToEquipment(instance: EquipmentInstance, modifiers: EquipmentModifier[]): void {
  instance.modifiers = modifiers;

  if (modifiers.includes('perishable')) {
    instance.perishableRoundsLeft = EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS;
  }

  if (modifiers.includes('leased')) {
    instance.sellValue = EQUIPMENT_MODIFIER.LEASED_BUY_PRICE;
  }
}

/**
 * Roll modifiers for shop/pack display. Modifiers are fixed when stock is generated
 * and reused when the player acquires the item.
 */
export function rollShopEquipmentPreview(def: EquipmentDef, purchasedPermitIds: string[] = []): EquipmentInstance {
  const instance = createEquipmentInstance(def, purchasedPermitIds);
  const modifiers = rollEquipmentModifiers(getRunState().difficulty, def);
  applyModifiersToEquipment(instance, modifiers);
  return instance;
}

/**
 * Create equipment with explicit difficulty modifiers.
 * Use for shop purchases and pack equipment picks (pass preview modifiers from rollShopEquipmentPreview).
 */
function applyFlourSackProfessionState(instance: EquipmentInstance): void {
  if (instance.def.effectType !== 'FLOUR_SACK') return;
  const professionId = getRunState().professionId;
  const params = instance.def.effectParams as Record<string, unknown>;
  const decay = resolveEffectParam<number>(params, 'decayPerRound', professionId);
  if (decay !== 0) return;
  const bonus = resolveEffectParam<number>(params, 'handSizeBonus', professionId);
  if (typeof bonus === 'number') {
    instance.state.handSizeBonus = bonus;
  }
}

export function acquireEquipmentInstance(
  def: EquipmentDef,
  purchasedPermitIds: string[] = [],
  modifiers?: EquipmentModifier[],
): EquipmentInstance {
  const instance = createEquipmentInstance(def, purchasedPermitIds);
  const mods = modifiers ?? rollEquipmentModifiers(getRunState().difficulty, def);
  applyModifiersToEquipment(instance, mods);
  applyFlourSackProfessionState(instance);
  return instance;
}

/** Grant equipment without difficulty modifiers (trail events, consumables, tags, junk dealer, etc.). */
export function acquireRewardEquipmentInstance(
  def: EquipmentDef,
  purchasedPermitIds: string[] = [],
): EquipmentInstance {
  return acquireEquipmentInstance(def, purchasedPermitIds, []);
}

/** Shop purchase price after modifiers are known (leased items cost $1).
 *  When def.cost is $0 (trail tag free slot, On the House, etc.), purchase is always free. */
export function getEquipmentPurchasePrice(
  def: EquipmentDef,
  modifiers: EquipmentModifier[],
  listPrice: number,
  purchasedPermitIds: string[] = [],
): number {
  if (def.cost === 0) return 0;
  if (modifiers.includes('leased')) {
    return EQUIPMENT_MODIFIER.LEASED_BUY_PRICE;
  }
  return getDiscountedShopPrice(listPrice, purchasedPermitIds);
}

export interface EquipmentModifierRoundResult {
  perished: { index: number; equipmentName: string }[];
  leasePaid: { index: number; equipmentName: string; cost: number }[];
  leaseDefaulted: { index: number; equipmentName: string }[];
}

/**
 * End-of-round modifier upkeep: perishable countdown, leased payments.
 * Call when a round ends (win or loss), before payout interest is calculated.
 */
/** Remove equipment marked for destruction in a modifier round result (indices captured before splice). */
export function applyEquipmentModifierDestructions(result: EquipmentModifierRoundResult): void {
  const indices = [
    ...new Set([...result.perished.map((p) => p.index), ...result.leaseDefaulted.map((p) => p.index)]),
  ].sort((a, b) => b - a);

  for (const idx of indices) {
    equipmentActions.destroyEquipment(idx);
  }
}

export function processEquipmentModifiersEndOfRound(
  options: { applyDestruction?: boolean } = {},
): EquipmentModifierRoundResult {
  const applyDestruction = options.applyDestruction ?? true;
  const result: EquipmentModifierRoundResult = {
    perished: [],
    leasePaid: [],
    leaseDefaulted: [],
  };

  const equipment = resolveEquipmentList();
  const perishableToDestroy: number[] = [];
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i]!;
    if (isEquipmentPerishable(equip) && equip.perishableRoundsLeft !== undefined) {
      equip.perishableRoundsLeft -= 1;
      if (equip.perishableRoundsLeft <= 0) {
        perishableToDestroy.push(i);
      }
    }
  }

  const leaseToDestroy: number[] = [];
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i]!;
    if (!isEquipmentLeased(equip)) continue;

    const cost = EQUIPMENT_MODIFIER.LEASED_UPKEEP;
    if (economyActions.trySpend(cost)) {
      result.leasePaid.push({ index: i, equipmentName: equip.def.name, cost });
    } else {
      leaseToDestroy.push(i);
    }
  }

  const toDestroy = [...new Set([...perishableToDestroy, ...leaseToDestroy])];
  replaceEquipmentList(equipment);

  for (const idx of toDestroy) {
    const equip = equipment[idx];
    if (!equip) continue;

    const name = equip.def.name;
    if (perishableToDestroy.includes(idx)) {
      result.perished.push({ index: idx, equipmentName: name });
    }
    if (leaseToDestroy.includes(idx)) {
      result.leaseDefaulted.push({ index: idx, equipmentName: name });
    }
  }

  if (applyDestruction) {
    applyEquipmentModifierDestructions(result);
  }

  return result;
}
