// ─── Store instance resolution (No Phaser imports) ───
// Converts stored run slices to EquipmentInstance / ConsumableInstance for game systems.

import type { EquipmentDef, EquipmentInstance } from '../ItemsSystem';
import { getEquipmentDefById, getItemAuraById } from '../equipmentCatalog';
import { acquireEquipmentInstance } from '../EquipmentModifiers';
import {
  createConsumableInstance,
  getConsumableDefById,
  type ConsumableDef,
  type ConsumableInstance,
} from '../ConsumablesSystem';
import { getRunState, runStore } from './runStore';
import type { RunState, StoredConsumableInstance, StoredEquipmentInstance } from './types';

function countEquipmentByDefId(list: StoredEquipmentInstance[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of list) {
    counts.set(item.defId, (counts.get(item.defId) ?? 0) + 1);
  }
  return counts;
}

function trackNewEquipmentObtained(prev: StoredEquipmentInstance[], next: StoredEquipmentInstance[]): string[] {
  const prevCounts = countEquipmentByDefId(prev);
  const nextCounts = countEquipmentByDefId(next);
  const newlySeen: string[] = [];
  for (const [defId, count] of nextCounts) {
    if (count > (prevCounts.get(defId) ?? 0)) {
      newlySeen.push(defId);
    }
  }
  return newlySeen;
}

function mergeEquipmentObtainedIds(existing: string[], newlySeen: string[]): string[] {
  if (newlySeen.length === 0) return existing;
  const merged = new Set(existing);
  for (const id of newlySeen) merged.add(id);
  return [...merged];
}

function resolveEquipmentDef(stored: StoredEquipmentInstance): EquipmentDef {
  const base = getEquipmentDefById(stored.defId);
  if (!base) throw new Error(`Unknown equipment id: ${stored.defId}`);
  if (!stored.auraId) return base as EquipmentDef;
  const aura = getItemAuraById(stored.auraId);
  if (!aura) return base as EquipmentDef;
  return { ...(base as EquipmentDef), aura, cost: base.cost + aura.costIncrease };
}

function resolveConsumableDef(stored: StoredConsumableInstance): ConsumableDef {
  const aura = stored.auraId ? getItemAuraById(stored.auraId) : null;
  const def = getConsumableDefById(stored.defId, aura);
  if (!def) throw new Error(`Unknown consumable id: ${stored.defId}`);
  return def;
}

export function storedFromEquipmentInstance(inst: EquipmentInstance): StoredEquipmentInstance {
  return {
    defId: inst.def.id,
    sellValue: inst.sellValue,
    state: { ...inst.state },
    modifiers: [...inst.modifiers],
    ...(inst.def.aura ? { auraId: inst.def.aura.id } : {}),
    ...(inst.perishableRoundsLeft !== undefined ? { perishableRoundsLeft: inst.perishableRoundsLeft } : {}),
  };
}

export function storedFromEquipmentInstances(instances: EquipmentInstance[]): StoredEquipmentInstance[] {
  return instances.map(storedFromEquipmentInstance);
}

export function resolveEquipmentInstance(
  stored: StoredEquipmentInstance,
  purchasedPermitIds: string[] = [],
): EquipmentInstance {
  const def = resolveEquipmentDef(stored);
  const inst = acquireEquipmentInstance(def, purchasedPermitIds, stored.modifiers);
  inst.sellValue = stored.sellValue;
  inst.state = { ...stored.state };
  if (stored.perishableRoundsLeft !== undefined) {
    inst.perishableRoundsLeft = stored.perishableRoundsLeft;
  }
  return inst;
}

export function resolveEquipmentList(state: RunState = getRunState()): EquipmentInstance[] {
  return state.equipment.map((s) => resolveEquipmentInstance(s, state.purchasedPermits));
}

export function storedFromConsumableInstance(inst: ConsumableInstance): StoredConsumableInstance {
  return {
    defId: inst.def.id,
    sellValue: inst.sellValue,
    ...(inst.def.aura ? { auraId: inst.def.aura.id } : {}),
  };
}

export function resolveConsumableInstance(stored: StoredConsumableInstance): ConsumableInstance {
  const def = resolveConsumableDef(stored);
  const inst = createConsumableInstance(def);
  inst.sellValue = stored.sellValue;
  return inst;
}

export function resolveConsumableList(state: RunState = getRunState()): ConsumableInstance[] {
  return state.consumables.map(resolveConsumableInstance);
}

export function resolveConsumableDefById(defId: string | null, auraId?: string | null): ConsumableDef | null {
  if (!defId) return null;
  const aura = auraId ? getItemAuraById(auraId) : null;
  return getConsumableDefById(defId, aura);
}

export function resolveLastUsedConsumableDef(state = getRunState()): ConsumableDef | null {
  return resolveConsumableDefById(state.lastUsedConsumableId);
}

/** Persist resolved equipment instances to the run store. */
export function replaceEquipmentList(instances: EquipmentInstance[]): void {
  const state = getRunState();
  const prevEquipment = state.equipment;
  const nextEquipment = storedFromEquipmentInstances(instances);
  const newlySeen = trackNewEquipmentObtained(prevEquipment, nextEquipment);
  const prevPackMules = prevEquipment.filter((item) => item.defId === 'pack_mule').length;
  const nextPackMules = instances.filter((item) => item.def.id === 'pack_mule').length;
  const slotDelta = (nextPackMules - prevPackMules) * 2;
  const nextPatch: Partial<RunState> = { equipment: nextEquipment };
  if (newlySeen.length > 0) {
    nextPatch.equipmentObtainedIds = mergeEquipmentObtainedIds(state.equipmentObtainedIds, newlySeen);
  }
  if (slotDelta !== 0) {
    nextPatch.maxConsumableSlots = Math.max(0, state.maxConsumableSlots + slotDelta);
  }
  runStore.setState(nextPatch);
}

/** Persist resolved consumable instances to the run store. */
export function replaceConsumableList(instances: ConsumableInstance[]): void {
  runStore.setState({ consumables: instances.map(storedFromConsumableInstance) });
}
