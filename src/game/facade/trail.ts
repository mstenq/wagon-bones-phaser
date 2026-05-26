// ─── Trail event facade (No Phaser imports) ───

import { isEquipmentCursed } from '../ItemsSystem';
import { equipmentActions } from '../store';
import {
  applySpyglassAvoid,
  applySpyglassInvestigate,
  findTrailRepairKit,
  getAvailableChoices,
  getTrailEventById,
  hasScoutsSpyglass,
  isNegativeEffect,
  isTrailNegativeNegated,
  markTrailEventSeen,
  resolveChoice,
  selectTrailEvent,
  type TrailEventChoice,
  type TrailEventDef,
  type TrailEventEffect,
  type TrailEventResult,
} from '../TrailEventsSystem';

export type { TrailEventChoice, TrailEventDef, TrailEventEffect, TrailEventResult };

export const gameTrail = {
  selectEvent(): TrailEventDef {
    return selectTrailEvent();
  },

  getEventById(id: string): TrailEventDef | undefined {
    return getTrailEventById(id) ?? undefined;
  },

  markSeen(eventId: string): void {
    markTrailEventSeen(eventId);
  },

  getAvailableChoices,
  resolveChoice,
  isNegativeEffect,
  hasScoutsSpyglass,
  applySpyglassAvoid,
  applySpyglassInvestigate,
  findTrailRepairKit,
  isTrailNegativeNegated,
  isEquipmentCursed,

  destroyEquipment(index: number): void {
    equipmentActions.destroyEquipment(index);
  },
};
