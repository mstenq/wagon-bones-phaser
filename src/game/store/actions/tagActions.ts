// ─── Run tag actions ───

import type { TagCategory } from '../../types';
import type { TrailTagDef, TrailTagInstance } from '../../../data/trail_tags';
import type { RoundSkipPreviewMeta } from '../../../data/trail_tags';
import { getRunState, runStore } from '../runStore';
import { selectPendingTags } from '../selectors/runSelectors';

export const tagActions = {
  addTag(def: TrailTagDef, meta?: RoundSkipPreviewMeta): void {
    const state = getRunState();
    if (def.id === 'tag_twin_wagon') {
      const copies = 1 + state.twinWagonCount;
      runStore.setState({ twinWagonCount: state.twinWagonCount + copies });
      return;
    }
    const copies = 1 + state.twinWagonCount;
    const stored: { tagId: string; copies: number; surveyorHand?: RoundSkipPreviewMeta['surveyorHand'] } = {
      tagId: def.id,
      copies,
    };
    if (meta?.surveyorHand) {
      stored.surveyorHand = meta.surveyorHand;
    }
    runStore.setState((s) => ({
      twinWagonCount: 0,
      pendingTags: [...s.pendingTags, stored],
    }));
  },

  consumeTag(index: number): TrailTagInstance | null {
    const pending = selectPendingTags(getRunState());
    if (index < 0 || index >= pending.length) return null;
    const removed = pending[index]!;
    runStore.setState((s) => ({
      pendingTags: s.pendingTags.filter((_, i) => i !== index),
    }));
    return removed;
  },

  consumeTagsByCategory(category: TagCategory): TrailTagInstance[] {
    const state = getRunState();
    const consumed: TrailTagInstance[] = [];
    const remaining: typeof state.pendingTags = [];
    for (const stored of state.pendingTags) {
      const pending = selectPendingTags({ ...state, pendingTags: [stored] })[0];
      if (pending && pending.def.category === category) {
        consumed.push(pending);
      } else {
        remaining.push(stored);
      }
    }
    runStore.setState({ pendingTags: remaining });
    return consumed;
  },

  recordRoundSkipped(tag: TrailTagDef, previewMeta?: RoundSkipPreviewMeta): void {
    const state = getRunState();
    const round = state.round;
    const skippedRoundTags = { ...state.skippedRoundTags, [round]: tag.id };
    const skippedRoundTagMeta = { ...state.skippedRoundTagMeta };
    const previewHand = previewMeta?.surveyorHand ?? state.roundSkipPreviewMeta[round]?.surveyorHand;
    if (previewHand) {
      skippedRoundTagMeta[round] = { surveyorHand: previewHand };
    }
    const roundSkipPreviewTags = { ...state.roundSkipPreviewTags };
    const roundSkipPreviewMeta = { ...state.roundSkipPreviewMeta };
    delete roundSkipPreviewTags[round];
    delete roundSkipPreviewMeta[round];
    runStore.setState({
      skippedRoundsThisLeg: [...state.skippedRoundsThisLeg, round],
      skippedRoundTags,
      skippedRoundTagMeta,
      roundSkipPreviewTags,
      roundSkipPreviewMeta,
    });
  },
};
