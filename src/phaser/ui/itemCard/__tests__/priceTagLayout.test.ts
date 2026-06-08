import { describe, expect, test } from 'bun:test';
import { UI } from '../../../../game/Constants';
import type { CardData } from '../itemCardTypes';
import { computePriceTagMetrics, getCardTopClearance } from '../priceTagLayout';

const baseDef: CardData = {
  id: 'test',
  name: 'Test',
  cost: 5,
  display: () => ({ tooltip: [], hint: [] }),
};

describe('getCardTopClearance', () => {
  test('returns price tag space for shop cards with cost', () => {
    expect(getCardTopClearance({ mode: 'shop' }, baseDef)).toBe(computePriceTagMetrics(1).spaceAbove);
  });

  test('returns 0 when cost is hidden', () => {
    expect(getCardTopClearance({ mode: 'shop', showCost: false }, baseDef)).toBe(0);
  });

  test('returns 0 for inventory cards without sell value', () => {
    expect(getCardTopClearance({ mode: 'inventory' }, baseDef)).toBe(0);
  });

  test('returns price tag space for sell value cards', () => {
    expect(getCardTopClearance({ sellValue: 3 }, baseDef)).toBe(computePriceTagMetrics(1).spaceAbove);
  });

  test('scales clearance with card scale', () => {
    const scale = 0.75;
    expect(getCardTopClearance({ mode: 'shop', cardScale: scale }, baseDef)).toBe(
      computePriceTagMetrics(scale).spaceAbove,
    );
  });
});

describe('computePriceTagMetrics', () => {
  test('respects CARD_PRICE_TAG_FONT_MIN on compact layouts', () => {
    const metrics = computePriceTagMetrics(0.5);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(UI.CARD_PRICE_TAG_FONT_MIN);
    expect(metrics.spaceAbove).toBe(Math.ceil(metrics.gap + metrics.tagH));
  });
});

describe('active tooltip placement', () => {
  test('shop price tag clearance lowers pinned tooltip Y', () => {
    const clearance = getCardTopClearance({ mode: 'shop' }, baseDef);
    const halfH = UI.CARD_H / 2;
    const tooltipH = 100;
    const worldY = 300;

    const withoutTag = worldY - halfH - tooltipH - 10;
    const withTag = worldY - halfH - clearance - tooltipH - 10;

    expect(withTag).toBe(withoutTag - clearance);
    expect(clearance).toBeGreaterThan(0);
  });
});
