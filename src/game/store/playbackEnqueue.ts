// ─── Playback enqueue helpers (No Phaser imports) ───

import type { ModifierFeedbackPayload } from '../playback/types';
import type { HandUpgradeInfo, HandUpgradeMissInfo } from '../types';
import type { UseConsumableResult } from '../ConsumablesSystem';
import type { EquipmentModifierRoundResult } from '../EquipmentModifiers';
import { runActions } from './runStore';

/** Queue failed pre-score hand upgrade rolls (before successful hand-upgrades / score). */
export function enqueueHandUpgradeMisses(misses: HandUpgradeMissInfo[] | HandUpgradeMissInfo | undefined | null): void {
  const list = misses == null ? [] : Array.isArray(misses) ? misses : [misses];
  if (list.length === 0) return;
  runActions.enqueuePlayback({ kind: 'hand-upgrade-misses', misses: list });
}

/** Queue hand level-up banners (before score, consumables, tags, etc.). */
export function enqueueHandUpgrades(upgrades: HandUpgradeInfo[] | HandUpgradeInfo | undefined | null): void {
  const list = upgrades == null ? [] : Array.isArray(upgrades) ? upgrades : [upgrades];
  if (list.length === 0) return;
  runActions.enqueuePlayback({ kind: 'hand-upgrades', upgrades: list });
}

/** Queue consumable bar animations, equipment pop-in, and optional hand upgrades. */
export function enqueueConsumablePlayback(
  result: Pick<UseConsumableResult, 'consumableAnimEvents' | 'equipmentCreatedCount' | 'handUpgrade' | 'handUpgrades'>,
): void {
  const events = result.consumableAnimEvents ?? [];
  const equipmentCreatedCount = result.equipmentCreatedCount ?? 0;
  if (events.length > 0 || equipmentCreatedCount > 0) {
    runActions.enqueuePlayback({
      kind: 'consumable-playback',
      events,
      equipmentCreatedCount: equipmentCreatedCount > 0 ? equipmentCreatedCount : undefined,
    });
  }
  const upgrades = result.handUpgrades ?? (result.handUpgrade ? [result.handUpgrade] : []);
  enqueueHandUpgrades(upgrades);
}

export function enqueueDayEndDestructions(indices: number[], destroyedNames: string[], holdMs: number): void {
  if (indices.length === 0) return;
  runActions.enqueuePlayback({ kind: 'day-end-destructions', indices, destroyedNames, holdMs });
}

export function enqueueModifierFeedback(
  payload: ModifierFeedbackPayload,
  options?: { applyDestruction?: boolean },
): void {
  const hasFeedback = payload.leasePaid.length > 0 || payload.perished.length > 0 || payload.leaseDefaulted.length > 0;
  if (!hasFeedback) return;
  runActions.enqueuePlayback({
    kind: 'modifier-feedback',
    payload,
    applyDestruction: options?.applyDestruction,
  });
}

export function enqueueModifierFeedbackFromRoundResult(
  result: EquipmentModifierRoundResult,
  options?: { applyDestruction?: boolean },
): void {
  enqueueModifierFeedback(
    {
      leasePaid: result.leasePaid,
      perished: result.perished,
      leaseDefaulted: result.leaseDefaulted,
    },
    options,
  );
}

export function enqueueTagEarned(tagId: string, category: string, round: number): void {
  runActions.enqueuePlayback({ kind: 'tag-earned', tagId, category, round });
}
