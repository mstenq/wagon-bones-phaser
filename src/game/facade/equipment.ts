// ─── Equipment facade (No Phaser imports) ───

import {
  applyEquipmentModifierDestructions,
  processEquipmentModifiersEndOfRound,
  type EquipmentModifierRoundResult,
} from '../EquipmentModifiers';
import { isEquipmentLeased, type EquipmentInstance } from '../ItemsSystem';
import { enqueueModifierFeedbackFromRoundResult } from '../store/playbackEnqueue';
import { resolveEquipmentList } from '../store/resolve';

export type { EquipmentModifierRoundResult };

export const gameEquipment = {
  isLeased(equip: EquipmentInstance): boolean {
    return isEquipmentLeased(equip);
  },

  processModifiersEndOfRound(options?: { applyDestruction?: boolean }): EquipmentModifierRoundResult {
    return processEquipmentModifiersEndOfRound(options);
  },

  applyModifierDestructions(result: EquipmentModifierRoundResult): void {
    applyEquipmentModifierDestructions(result);
  },

  findEffectIndex(effectType: string): number {
    return resolveEquipmentList().findIndex((e) => e.def.effectType === effectType);
  },

  /** Queue leased/perishable modifier feedback for the playback runner. */
  enqueueModifierFeedbackEndOfRound(options?: { applyDestruction?: boolean }): EquipmentModifierRoundResult {
    const result = processEquipmentModifiersEndOfRound({ applyDestruction: false });
    enqueueModifierFeedbackFromRoundResult(result, options);
    return result;
  },
};
