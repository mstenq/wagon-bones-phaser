// ─── Tutorial seen-state preferences (No Phaser imports) ───

import { TUTORIAL_MESSAGE_IDS, type TutorialMessageId } from '../data/tutorialMessages';
import { patchStoredUserPreferences, readStoredUserPreferences } from './PreferencesStorage';

export interface TutorialPreferences {
  seenIds: TutorialMessageId[];
}

export const DEFAULT_TUTORIAL_PREFERENCES: TutorialPreferences = {
  seenIds: [],
};

let cachedSeen: Set<TutorialMessageId> | null = null;

function normalizeSeenIds(ids: unknown): TutorialMessageId[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter(
    (id): id is TutorialMessageId =>
      typeof id === 'string' && (TUTORIAL_MESSAGE_IDS as readonly string[]).includes(id),
  );
}

function readFromStorage(): Set<TutorialMessageId> {
  const parsed = readStoredUserPreferences();
  return new Set(normalizeSeenIds(parsed.tutorial?.seenIds));
}

function persistSeen(seen: Set<TutorialMessageId>): void {
  patchStoredUserPreferences({ tutorial: { seenIds: [...seen] } });
}

/** Load tutorial preferences from localStorage into memory (idempotent). */
export function initTutorialPreferences(): void {
  cachedSeen = readFromStorage();
}

function getSeenSet(): Set<TutorialMessageId> {
  if (!cachedSeen) cachedSeen = readFromStorage();
  return cachedSeen;
}

export function isTutorialSeen(id: TutorialMessageId): boolean {
  return getSeenSet().has(id);
}

export function markTutorialSeen(id: TutorialMessageId): void {
  const seen = getSeenSet();
  if (seen.has(id)) return;
  seen.add(id);
  persistSeen(seen);
}

export function markAllTutorialsSeen(): void {
  cachedSeen = new Set(TUTORIAL_MESSAGE_IDS);
  persistSeen(cachedSeen);
}

export function resetAllTutorials(): void {
  cachedSeen = new Set();
  persistSeen(cachedSeen);
}

export function getTutorialPreferences(): TutorialPreferences {
  return { seenIds: [...getSeenSet()] };
}
