import { UI } from '../../../game/Constants';

export interface PriceTagMetrics {
  tagScale: number;
  fontSize: number;
  tagW: number;
  tagH: number;
  gap: number;
  /** Vertical space reserved above the card top (gap + full tag height). */
  spaceAbove: number;
}

/** Price-tag scale that respects CARD_PRICE_TAG_FONT_MIN on compact layouts. */
export function computePriceTagMetrics(cardScale: number): PriceTagMetrics {
  const fontAtScale = UI.CARD_PRICE_TAG_FONT * cardScale;
  const fontSize = Math.max(UI.CARD_PRICE_TAG_FONT_MIN, Math.round(fontAtScale));
  const tagScale = fontSize / UI.CARD_PRICE_TAG_FONT;
  const tagH = UI.CARD_PRICE_TAG_H * tagScale;
  const tagW = UI.CARD_PRICE_TAG_W * tagScale;
  const gap = UI.CARD_PRICE_TAG_GAP * tagScale;
  const spaceAbove = Math.ceil(gap + tagH);
  return { tagScale, fontSize, tagW, tagH, gap, spaceAbove };
}
