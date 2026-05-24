import { describe, test, expect, afterEach } from 'bun:test';
import { isDevMode, setUrlDevModeForTests } from '../DevMode';
import { setupGame } from './testHelpers';

describe('isDevMode', () => {
  afterEach(() => {
    setUrlDevModeForTests(false);
  });

  test('false for non-developer when URL flag off', () => {
    setupGame({ profession: 'farmer' });
    expect(isDevMode()).toBe(false);
  });

  test('true for non-developer when URL flag on', () => {
    setUrlDevModeForTests(true);
    setupGame({ profession: 'farmer' });
    expect(isDevMode()).toBe(true);
  });

  test('true for developer profession without URL flag', () => {
    setupGame({ profession: 'developer' });
    expect(isDevMode()).toBe(true);
  });
});
