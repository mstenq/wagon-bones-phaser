// ─── Cross-run achievement progress (No Phaser imports) ───

import professions from '../data/professions';
import { getSecretHandTypes } from '../data/hands';
import { DIFFICULTIES } from './Constants';
import { getAllEquipment } from './ItemsSystem';
import {
  areAllSecretHandsDiscovered,
  getDiscoveredSecretHands,
  getEquipmentHighestDifficultyBeaten,
  getHighestDifficultyBeaten,
} from './UserStats';

export interface AchievementProgress {
  done: number;
  total: number;
  complete: boolean;
}

const DEVELOPER_PROFESSION_ID = 'developer';
const MAX_DIFFICULTY = DIFFICULTIES.length;

function getPlayableProfessionIds(): string[] {
  return professions.filter((p) => p.id !== DEVELOPER_PROFESSION_ID).map((p) => p.id);
}

export function getCompletionistPlusProgress(): AchievementProgress {
  const playableIds = getPlayableProfessionIds();
  let done = 0;
  for (const professionId of playableIds) {
    if (getHighestDifficultyBeaten(professionId) >= MAX_DIFFICULTY) done++;
  }
  const total = playableIds.length;
  return { done, total, complete: done >= total };
}

export function getCompletionistPlusPlusProgress(): AchievementProgress {
  const allEquipment = getAllEquipment();
  let done = 0;
  for (const def of allEquipment) {
    if (getEquipmentHighestDifficultyBeaten(def.id) >= MAX_DIFFICULTY) done++;
  }
  const total = allEquipment.length;
  return { done, total, complete: done >= total };
}

/** All secret hand types discovered across runs (hidden until complete). */
export function getTrailMysticProgress(): AchievementProgress {
  const total = getSecretHandTypes().length;
  const done = getDiscoveredSecretHands().length;
  return { done, total, complete: areAllSecretHandsDiscovered() };
}
