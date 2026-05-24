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
  toBeMiles(received: DecimalSource, expected: number) {
    const pass = eq(received, expected);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(received)} not to equal ${expected} miles`
          : `expected ${expected} miles, received ${String(received)}`,
    };
  },
  toBeMult(received: DecimalSource, expected: number) {
    const pass = eq(received, expected);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${String(received)} not to equal ${expected} mult`
          : `expected ${expected} mult, received ${String(received)}`,
    };
  },
  toBeMilesCloseTo(received: DecimalSource, expected: number, precision = 5) {
    const actual = Number(received instanceof Object && 'toNumber' in (received as object) ? (received as { toNumber(): number }).toNumber() : received);
    const pass = Math.abs(actual - expected) < 10 ** -precision;
    return {
      pass,
      message: () => `expected ${expected} miles ±10^-${precision}, received ${actual}`,
    };
  },
  toBeMultCloseTo(received: DecimalSource, expected: number, precision = 5) {
    const actual = Number(received instanceof Object && 'toNumber' in (received as object) ? (received as { toNumber(): number }).toNumber() : received);
    const pass = Math.abs(actual - expected) < 10 ** -precision;
    return {
      pass,
      message: () => `expected ${expected} mult ±10^-${precision}, received ${actual}`,
    };
  },
});

declare module 'bun:test' {
  interface Matchers<T = unknown> {
    toBeMiles(expected: number): void;
    toBeMult(expected: number): void;
    toBeMilesCloseTo(expected: number, precision?: number): void;
    toBeMultCloseTo(expected: number, precision?: number): void;
  }
}
