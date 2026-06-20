import { describe, expect, test } from 'bun:test';
import {
  getOverflowMultiplierLabel,
  getScoreProgressState,
  getScoreProgressTierColor,
  getStackedProgressLayers,
} from '../../phaser/ui/roundScoreProgressMath';

describe('getScoreProgressState', () => {
  test('returns empty bar when target is 0', () => {
    expect(getScoreProgressState(100, 0)).toEqual({ tierIndex: 0, tierFill: 0, ratio: 0 });
  });

  test('tier 0 partial fill at 50%', () => {
    expect(getScoreProgressState(150, 300)).toEqual({ tierIndex: 0, tierFill: 0.5, ratio: 0.5 });
  });

  test('tier 0 full at exactly 1x', () => {
    expect(getScoreProgressState(300, 300)).toEqual({ tierIndex: 0, tierFill: 1, ratio: 1 });
  });

  test('tier 1 half fill at 1.5x', () => {
    expect(getScoreProgressState(450, 300)).toEqual({ tierIndex: 1, tierFill: 0.5, ratio: 1.5 });
  });

  test('tier 2 at 2.5x', () => {
    expect(getScoreProgressState(750, 300)).toEqual({ tierIndex: 2, tierFill: 0.5, ratio: 2.5 });
  });

  test('tier 2 full at 3x exact', () => {
    expect(getScoreProgressState(900, 300)).toEqual({ tierIndex: 2, tierFill: 1, ratio: 3 });
  });

  test('tier 3 at 3.5x', () => {
    expect(getScoreProgressState(1050, 300)).toEqual({ tierIndex: 3, tierFill: 0.5, ratio: 3.5 });
  });

  test('tier 3 full at 4x exact', () => {
    expect(getScoreProgressState(1200, 300)).toEqual({ tierIndex: 3, tierFill: 1, ratio: 4 });
  });

  test('tier 4 full at 5x exact', () => {
    expect(getScoreProgressState(1500, 300)).toEqual({ tierIndex: 4, tierFill: 1, ratio: 5 });
  });

  test('tier 5 full at 6x exact', () => {
    expect(getScoreProgressState(1800, 300)).toEqual({ tierIndex: 5, tierFill: 1, ratio: 6 });
  });

  test('tier 10 half fill at 10.5x', () => {
    expect(getScoreProgressState(3150, 300)).toEqual({ tierIndex: 10, tierFill: 0.5, ratio: 10.5 });
  });
});

describe('getScoreProgressTierColor', () => {
  test('tier 0 is green-dominant', () => {
    const color = getScoreProgressTierColor(0);
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  test('consecutive tiers are distinct', () => {
    for (let tier = 0; tier < 20; tier++) {
      expect(getScoreProgressTierColor(tier)).not.toBe(getScoreProgressTierColor(tier + 1));
    }
  });
});

describe('overflow multiplier label', () => {
  test('hidden at or below target', () => {
    expect(getOverflowMultiplierLabel(1)).toBeNull();
    expect(getOverflowMultiplierLabel(0.5)).toBeNull();
  });

  test('x2 during second lap', () => {
    expect(getOverflowMultiplierLabel(1.5)).toBe(2);
  });

  test('x2 at exactly 2x', () => {
    expect(getOverflowMultiplierLabel(2)).toBe(2);
  });

  test('x3 during third lap', () => {
    expect(getOverflowMultiplierLabel(2.5)).toBe(3);
  });

  test('hidden when overflow lap count exceeds display cap', () => {
    expect(getOverflowMultiplierLabel(1_000_000)).toBeNull();
    expect(getOverflowMultiplierLabel(1_000_000.5)).toBeNull();
    expect(getOverflowMultiplierLabel(999_998.5)).toBe(999_999);
  });
});

describe('stacked progress layers', () => {
  test('single layer below target', () => {
    expect(getStackedProgressLayers(150, 300).layers).toEqual([{ tierIndex: 0, fill: 0.5 }]);
  });

  test('green below blue when past target', () => {
    expect(getStackedProgressLayers(450, 300).layers).toEqual([
      { tierIndex: 0, fill: 1 },
      { tierIndex: 1, fill: 0.5 },
    ]);
  });

  test('two visible layers at 2.5x (earlier full tiers are covered)', () => {
    expect(getStackedProgressLayers(750, 300).layers).toEqual([
      { tierIndex: 1, fill: 1 },
      { tierIndex: 2, fill: 0.5 },
    ]);
  });

  test('single layer at exact 10,000x', () => {
    expect(getStackedProgressLayers(3_000_000, 300).layers).toEqual([{ tierIndex: 9999, fill: 1 }]);
  });

  test('two visible layers at 10,000.5x', () => {
    expect(getStackedProgressLayers(3_000_150, 300).layers).toEqual([
      { tierIndex: 9999, fill: 1 },
      { tierIndex: 10000, fill: 0.5 },
    ]);
    expect(getStackedProgressLayers(3_000_150, 300).multiplierLabel).toBe(10001);
  });

  test('extreme ratio caps layer count at 2', () => {
    const stacked = getStackedProgressLayers(9_000_045, 300);
    expect(stacked.layers.length).toBeLessThanOrEqual(2);
    expect(stacked.multiplierLabel).toBe(30001);
  });
});
