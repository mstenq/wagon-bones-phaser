// Suppress console.log during tests to keep output clean.
// Imported at the top of each test file.

import { expect } from 'bun:test';
import { eq, type DecimalSource } from '../scoreMath';

const originalLog = console.log;
console.log = () => {};

process.on('exit', () => {
  console.log = originalLog;
});

expect.extend({
  toBeMiles(received: unknown, expected: unknown) {
    const value = received as DecimalSource;
    const pass = eq(value, expected as DecimalSource);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(value)} not to equal ${expected} miles`
          : `expected ${expected} miles, received ${String(value)}`,
    };
  },
  toBeMult(received: unknown, expected: unknown) {
    const value = received as DecimalSource;
    const pass = eq(value, expected as DecimalSource);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(value)} not to equal ${expected} mult`
          : `expected ${expected} mult, received ${String(value)}`,
    };
  },
  toBeMilesCloseTo(received: unknown, expected: number, precision = 5) {
    const value = received as DecimalSource;
    const actual = Number(
      value instanceof Object && 'toNumber' in (value as object) ? (value as { toNumber(): number }).toNumber() : value,
    );
    const pass = Math.abs(actual - expected) < 10 ** -precision;
    return {
      pass,
      message: () => `expected ${expected} miles ±10^-${precision}, received ${actual}`,
    };
  },
  toBeMultCloseTo(received: unknown, expected: number, precision = 5) {
    const value = received as DecimalSource;
    const actual = Number(
      value instanceof Object && 'toNumber' in (value as object) ? (value as { toNumber(): number }).toNumber() : value,
    );
    const pass = Math.abs(actual - expected) < 10 ** -precision;
    return {
      pass,
      message: () => `expected ${expected} mult ±10^-${precision}, received ${actual}`,
    };
  },
});

declare module 'bun:test' {
  interface Matchers<T = unknown> {
    toBeMiles(expected: unknown): void;
    toBeMult(expected: unknown): void;
    toBeMilesCloseTo(expected: number, precision?: number): void;
    toBeMultCloseTo(expected: number, precision?: number): void;
  }
}
