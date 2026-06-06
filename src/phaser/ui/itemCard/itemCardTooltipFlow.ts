// ─── Pure tooltip line-flow helpers (word wrap across styled segments) ───

import type { HintSegment } from '../../../game/ItemsSystem';
import { tooltipSegmentColors } from './itemCardHintStyles';

/** Chip-style segments (mult / xmult) must stay on one piece */
export function segmentIsAtomic(seg: HintSegment): boolean {
  const colors = tooltipSegmentColors(seg.style);
  return colors.bg !== undefined;
}

/** Split wrappable segments into word tokens so lines can break mid-sentence */
export function expandSegmentRowToTokens(row: HintSegment[]): HintSegment[] {
  const tokens: HintSegment[] = [];

  for (const seg of row) {
    if (segmentIsAtomic(seg) || !/\s/.test(seg.text)) {
      tokens.push(seg);
      continue;
    }

    const words = seg.text.match(/\S+\s*/g);
    if (!words) {
      tokens.push(seg);
      continue;
    }

    for (const word of words) {
      tokens.push({ text: word, style: seg.style, size: seg.size });
    }
  }

  return tokens;
}

/** Rejoin adjacent tokens that share style/size after line wrapping */
export function mergeAdjacentSegments(segments: HintSegment[]): HintSegment[] {
  if (segments.length === 0) return [];

  const merged: HintSegment[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const last = merged[merged.length - 1];
    if (last.style === seg.style && last.size === seg.size) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}
