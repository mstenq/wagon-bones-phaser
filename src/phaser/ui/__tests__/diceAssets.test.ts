import { describe, expect, test } from 'bun:test';
import { die } from '../../../game/__tests__/testHelpers';
import { getDiceAtlasFrame } from '../diceAssets';

describe('getDiceAtlasFrame', () => {
  test('standard die uses zero-padded value frame', () => {
    expect(getDiceAtlasFrame(die({ value: 7 }))).toBe('standard-07.png');
    expect(getDiceAtlasFrame(die({ value: 12 }))).toBe('standard-12.png');
  });

  test('enhanced die uses material prefix', () => {
    expect(getDiceAtlasFrame(die({ value: 3, enhancement: 'bone' }))).toBe('bone-03.png');
    expect(getDiceAtlasFrame(die({ value: 10, enhancement: 'lucky' }))).toBe('lucky-10.png');
  });

  test('stone uses single shared frame regardless of value', () => {
    expect(getDiceAtlasFrame(die({ value: 0, enhancement: 'stone' }))).toBe('stone.png');
    expect(getDiceAtlasFrame(die({ value: 6, enhancement: 'stone' }))).toBe('stone.png');
  });

  test('out-of-range value falls back to face 01', () => {
    expect(getDiceAtlasFrame(die({ value: 0 }))).toBe('standard-01.png');
    expect(getDiceAtlasFrame(die({ value: 13, enhancement: 'gold' }))).toBe('gold-01.png');
  });
});
