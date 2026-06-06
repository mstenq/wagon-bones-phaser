// ─── UI-focused store selectors (No Phaser imports) ───
// Composite slices for Phaser shared UI subscriptions (step 5).

import type { TrailTagInstance } from '../../types';
import { selectRunStatusTraits } from '../../runStatusTraits';
import { getConsumableDefById, isSecondHelpingsCloneTarget } from '../../ConsumablesSystem';
import { getQueuedAuraTags } from '../../TagSystem';
import { getRunState } from '../runStore';
import { getRoundState } from '../roundStore';
import type { RunState } from '../types';
import {
  selectAvailableDice,
  selectCurrentBoss,
  selectEffectiveDays,
  selectEffectiveRerolls,
  selectPendingTags,
  selectTargetMiles,
  selectUsedConsumableSlots,
  selectUsedEquipmentSlots,
} from './runSelectors';
import { selectEquipmentHintRoundContext } from './roundSelectors';

function groupTagsById(tags: TrailTagInstance[]): TrailTagInstance[] {
  const grouped = new Map<string, TrailTagInstance>();
  for (const tag of tags) {
    const existing = grouped.get(tag.def.id);
    if (existing) {
      existing.copies += tag.copies;
    } else {
      grouped.set(tag.def.id, { def: tag.def, copies: tag.copies });
    }
  }
  return [...grouped.values()];
}

export function selectDicePouchCounts(state: RunState = getRunState()) {
  return {
    available: selectAvailableDice(state).length,
    total: state.dice.length,
  };
}

export function selectTagStackModel(state: RunState = getRunState()) {
  const pending = selectPendingTags(state).filter((t) => !t.def.category.startsWith('immediate_'));
  const nonAuraPending = pending.filter((t) => t.def.category !== 'shop_aura');
  const tags = groupTagsById([...nonAuraPending, ...getQueuedAuraTags(state)]);
  return {
    tags,
    twinWagonCount: state.twinWagonCount,
  };
}

/** Portrait GameScene entry: show round-modifiers modal for boss rounds or negative traits only. */
export function shouldPromptRoundModifications(state: RunState = getRunState()): boolean {
  if (selectCurrentBoss(state)) return true;
  return selectRunStatusTraits(state).some((trait) => trait.polarity === 'negative');
}

export function selectRunSidebarModel(state: RunState = getRunState()) {
  const round = getRoundState();
  const daysRerolls = round
    ? {
        daysRemaining: round.config.maxDays - round.day + 1,
        rerolls: round.rerollsRemaining,
      }
    : {
        daysRemaining: selectEffectiveDays(state),
        rerolls: selectEffectiveRerolls(state),
      };

  return {
    balance: state.balance,
    leg: state.leg,
    round: state.round,
    endlessMode: state.endlessMode,
    targetMiles: round?.config.targetMiles ?? selectTargetMiles(state),
    difficulty: state.difficulty,
    professionId: state.professionId,
    boss: selectCurrentBoss(state),
    statusTraits: selectRunStatusTraits(state),
    ...daysRerolls,
  };
}

/** Revision token for round sidebar overlay (triggers Sidebar subscriber). */
export function selectSidebarOverlayRevision(state = getRoundState()): string {
  const o = state?.sidebarOverlay;
  if (!o) return '';
  return JSON.stringify(o);
}

export function selectEquipmentBarSlotLabel(state: RunState = getRunState()): string {
  return `${selectUsedEquipmentSlots(state)}/${state.maxEquipmentSlots}`;
}

export function selectEquipmentBarSnapshot(state: RunState = getRunState()): string {
  const boss = state.bossRoundState;
  const equipKey = state.equipment
    .map(
      (e, i) => `${i}:${e.defId}:${e.sellValue}:${e.auraId ?? ''}:${JSON.stringify(e.state)}:${e.modifiers.join(',')}`,
    )
    .join('|');
  const bossKey = `${boss.equipmentDisplayOrder?.join(',') ?? ''}:${boss.equipmentHidden}:${boss.landSlideRevealed}:${boss.disabledEquipmentIndices.join(',')}`;
  return `${equipKey}#${bossKey}`;
}

export function selectConsumableBarSnapshot(state: RunState = getRunState()): string {
  return `${state.consumables.map((c) => `${c.defId}:${c.sellValue}`).join('|')}#${state.lastUsedConsumableId ?? ''}#${state.maxConsumableSlots}`;
}

export function selectConsumableBarSlotLabel(state: RunState = getRunState()): string {
  return `${selectUsedConsumableSlots(state)}/${state.maxConsumableSlots}`;
}

export function selectLastUsedConsumableDef(state: RunState = getRunState()) {
  if (!state.lastUsedConsumableId) return null;
  return getConsumableDefById(state.lastUsedConsumableId) ?? null;
}

export function selectCanUseSecondHelpings(state: RunState = getRunState()): boolean {
  return isSecondHelpingsCloneTarget(selectLastUsedConsumableDef(state));
}

export { selectEquipmentHintRoundContext };
