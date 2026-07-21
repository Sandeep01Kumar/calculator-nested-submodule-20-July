/**
 * Jest test suite for the `calculator-core` percentage API.
 *
 * This suite is the executable proof of the AAP's "connect API with math-engine"
 * requirement (AAP §0.5.1 Group 2, §0.5.2, §0.7.2). It asserts that the public
 * API exposed by `calculator-core/index.js` is a thin DELEGATION layer over the
 * nested `math-engine` `percentage` function, and that every call therefore
 * returns "b percent of a" computed as `(a * b) / 100`.
 *
 * Design / conventions:
 *   - Jest with the `*.test.js` naming convention (this file is `index.test.js`),
 *     so it is auto-discovered by Jest's default `testMatch`.
 *   - Native CommonJS — no Babel/transform is required. The module under test is
 *     imported with `require('./index')`.
 *   - DEFAULT Node test environment. This suite deliberately uses NO DOM globals
 *     (`document`/`window`); the jsdom environment belongs to `calculator-ui`
 *     only (AAP §0.3.1).
 *   - Fully deterministic: no network, no DOM, no filesystem, no timers, no
 *     randomness. Re-running yields identical results.
 *
 * Contract under test (see `calculator-core/index.js`):
 *   - The module exports an object exposing TWO interchangeable delegating
 *     functions — `percentage` and `calculatePercentage` — each of which forwards
 *     to the engine so the result equals `(a * b) / 100`.
 *
 * @module calculator-core/index.test
 * @see module:calculator-core
 * @see module:math-engine/percentage
 */

'use strict';

// Module under test: the calculator-core public API surface.
const core = require('./index');

// The computation engine itself. Imported ONLY to prove, in the delegation
// assertions below, that the core API does not diverge from the single source
// of truth for the arithmetic. This path is part of this file's declared
// dependencies (depends_on_files).
const engine = require('./math-engine/percentage');

describe('calculator-core percentage API', () => {
  test('module exports an object', () => {
    // The Node/CommonJS export of index.js is the API object; guard against a
    // regression to a bare function or a nullish export.
    expect(core).toBeDefined();
    expect(typeof core).toBe('object');
    expect(core).not.toBeNull();
  });

  test('exposes percentage and calculatePercentage functions', () => {
    expect(typeof core.percentage).toBe('function');
    expect(typeof core.calculatePercentage).toBe('function');
  });

  test('computes b percent of a via delegation: (a*b)/100', () => {
    // Values chosen so (a*b)/100 is an exact integer — no floating-point slack.
    expect(core.percentage(200, 10)).toBe(20); // 10% of 200
    expect(core.percentage(50, 10)).toBe(5); // 10% of 50
    expect(core.calculatePercentage(200, 10)).toBe(20);
    expect(core.calculatePercentage(50, 10)).toBe(5);
  });

  test('handles zero operands', () => {
    expect(core.percentage(0, 50)).toBe(0);
    expect(core.percentage(200, 0)).toBe(0);
    expect(core.calculatePercentage(0, 0)).toBe(0);
  });

  test('handles negative operands', () => {
    expect(core.percentage(-200, 10)).toBe(-20);
    expect(core.percentage(200, -10)).toBe(-20);
    // Two negatives yield a positive result: (-200 * -10) / 100 = 20.
    expect(core.calculatePercentage(-200, -10)).toBe(20);
  });

  test('handles decimal results', () => {
    // (50 * 12.5) / 100 = 6.25 — use toBeCloseTo to remain robust against any
    // IEEE-754 representation slack for the non-integer case.
    expect(core.calculatePercentage(50, 12.5)).toBeCloseTo(6.25, 10);
    expect(core.percentage(50, 12.5)).toBeCloseTo(6.25, 10);
  });

  test('percentage and calculatePercentage are equivalent', () => {
    // Both public names must reference the same delegating behavior.
    expect(core.percentage(80, 25)).toBe(core.calculatePercentage(80, 25));
    expect(core.percentage(200, 10)).toBe(core.calculatePercentage(200, 10));
  });

  test('delegates to the math-engine percentage function (no divergence)', () => {
    // Prove the core API returns exactly what the engine returns for the same
    // inputs — i.e. it forwards rather than re-implementing the arithmetic.
    // Because both call the identical engine function on identical inputs, the
    // outputs are bit-for-bit equal, so strict equality (toBe) is appropriate.
    const cases = [
      [200, 10],
      [50, 10],
      [80, 25],
      [0, 50],
      [200, 0],
      [-200, 10],
      [200, -10],
      [-200, -10],
      [123, 45],
    ];

    for (const [a, b] of cases) {
      const expected = engine(a, b);
      expect(core.percentage(a, b)).toBe(expected);
      expect(core.calculatePercentage(a, b)).toBe(expected);
    }
  });
});
