import { describe, expect, test } from 'bun:test';
import {
  barLabelTextColor,
  contrastingTextColor,
  getOverflowMultiplierLabel,
  getScoreProgressState,
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

  test('caps at tier 4 white beyond 5x', () => {
    expect(getScoreProgressState(1800, 300)).toEqual({ tierIndex: 4, tierFill: 1, ratio: 6 });
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

  test('three layers at 2.5x', () => {
    expect(getStackedProgressLayers(750, 300).layers).toEqual([
      { tierIndex: 0, fill: 1 },
      { tierIndex: 1, fill: 1 },
      { tierIndex: 2, fill: 0.5 },
    ]);
  });
});

describe('bar label contrast', () => {
  test('uses dark text on white fill', () => {
    expect(contrastingTextColor(0xffffff)).toBe('#1a1a2e');
  });

  test('uses light text on blue fill', () => {
    expect(contrastingTextColor(0x4488cc)).toBe('#ffffff');
  });

  test('uses dark text when fill covers label center', () => {
    expect(barLabelTextColor(0xffffff, 100, 100)).toBe('#1a1a2e');
  });

  test('uses light text when label sits on empty track', () => {
    expect(barLabelTextColor(0xffffff, 10, 100)).toBe('#ffffff');
  });
});
