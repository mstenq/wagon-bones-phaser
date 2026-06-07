// ─── Shared hint / tooltip segment styling ───

import { COLORS, UI } from '../../../game/Constants';
import type { HintSegment, HintSize } from '../../../game/ItemsSystem';
import type { SegmentRenderMetrics } from './itemCardTypes';

export const HINT_COLORS: Record<string, { text: string; bg?: number }> = {
  miles: { text: '#55aaff' },
  mult: { text: '#ffffff', bg: 0xcc3333 },
  xmult: { text: '#ffffff', bg: 0xcc3333 },
  retrigger: { text: '#b266ff' },
  odds: { text: '#55cc55' },
  inactive: { text: '#777777' },
  condition: { text: '#ddaa44' },
  active: { text: '#55dd55' },
  money: { text: '#ffd700' },
  text: { text: '#7b7b7b' },
  aura_fire: { text: '#ff4500' },
  aura_arcane: { text: '#00bfff' },
  aura_holy: { text: '#fffacd' },
};

/** Tooltip uses larger type and brighter plain text than on-card hints */
export function tooltipSegmentColors(style: string): { text: string; bg?: number } {
  const base = HINT_COLORS[style] ?? HINT_COLORS.text;
  if (style === 'text') return { text: COLORS.TOOLTIP_BODY_TEXT };
  return base;
}

const SIZE_SCALE: Record<HintSize, number> = {
  xs: 0.7,
  sm: 0.85,
  md: 1,
};

function getSegmentSize(seg: HintSegment): HintSize {
  return seg.size ?? 'md';
}

export function getHintMetrics(seg: HintSegment, scale: number): SegmentRenderMetrics {
  const segmentScale = SIZE_SCALE[getSegmentSize(seg)];
  return {
    fontSize: Math.max(12, Math.round(24 * scale * segmentScale)),
    padX: Math.max(1, Math.round(3 * scale * segmentScale)),
    padY: Math.max(1, Math.round(scale * segmentScale)),
  };
}

export function getTooltipMetrics(seg: HintSegment): SegmentRenderMetrics {
  const segmentScale = SIZE_SCALE[getSegmentSize(seg)];
  return {
    fontSize: Math.max(10, Math.round(UI.CARD_TOOLTIP_FONT_SIZE * segmentScale)),
    padX: Math.max(1, Math.round(3 * segmentScale)),
    padY: Math.max(1, Math.round(segmentScale)),
  };
}

export function getAuraHintRow(auraId: string | undefined): HintSegment[] | null {
  if (!auraId) return null;
  switch (auraId) {
    case 'fire':
      return [
        { text: '+10', style: 'mult', size: 'xs' },
        { text: 'Fire', style: 'aura_fire', size: 'xs' },
      ];
    case 'arcane':
      return [
        { text: '+50', style: 'miles', size: 'xs' },
        { text: 'Arcane', style: 'aura_arcane', size: 'xs' },
      ];
    case 'holy':
      return [
        { text: 'x1.5', style: 'xmult', size: 'xs' },
        { text: 'Holy', style: 'aura_holy', size: 'xs' },
      ];
    default:
      return null;
  }
}
