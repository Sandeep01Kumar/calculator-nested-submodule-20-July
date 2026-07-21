/**
 * Unit tests for the math-engine `percentage` function.
 *
 * Module under test: {@link module:math-engine/percentage} (`./percentage.js`).
 *
 * These tests are the executable proof of the calculator's innermost
 * computation layer. They assert that the engine computes "b percent of a":
 *
 *     percentage(a, b) = (a * b) / 100
 *
 * Design notes / conventions (see AAP §0.2.2, §0.3.1, §0.7.2, §0.7.4):
 *   - Runner:        Jest, using the `*.test.js` naming convention. Jest has
 *                    native CommonJS support, so no Babel/transform is needed.
 *   - Environment:   the DEFAULT Node test environment. This suite touches no
 *                    DOM — there is intentionally NO `document`/`window` usage
 *                    here (jsdom is reserved for the `calculator-ui` layer).
 *   - Import:        CommonJS `require('./percentage')`. The engine exports the
 *                    BARE function, so `percentage` is directly callable as
 *                    `percentage(a, b)` (no `.percentage` / `.default` access).
 *   - Determinism:   no network, DOM, filesystem, timers, or randomness — the
 *                    same inputs always produce the same results.
 *   - Assertions:    `toBe` is used for integer-exact expectations; the
 *                    floating-point-friendly `toBeCloseTo` is used for any
 *                    non-exact decimal result to avoid IEEE-754 flakiness.
 *
 * Only two dependencies are permitted in this file: the module under test and
 * Jest's injected globals (`describe` / `test` / `expect`).
 */

'use strict';

// Module under test. Because the engine exports the bare function, `percentage`
// is directly invocable. The path is relative to THIS file — both this test and
// `percentage.js` live in `calculator-core/math-engine/`.
const percentage = require('./percentage');

describe('math-engine percentage(a, b) = (a * b) / 100', () => {
  test('is exported as a bare callable function', () => {
    // Contract check: consumers (this suite and calculator-core/index.js) call
    // the imported value directly, so it MUST be a function — not an object
    // wrapper or a namespace with a `.percentage` member.
    expect(typeof percentage).toBe('function');
  });

  test('computes typical percentages (b percent of a)', () => {
    // Integer-exact results — `toBe` is safe (no floating-point rounding).
    expect(percentage(200, 10)).toBe(20); // 10% of 200
    expect(percentage(50, 10)).toBe(5); //  10% of 50
    expect(percentage(80, 25)).toBe(20); // 25% of 80
  });

  test('handles zero operands', () => {
    // A zero base or a zero percent both yield exactly 0.
    expect(percentage(0, 50)).toBe(0); //  50% of 0
    expect(percentage(200, 0)).toBe(0); //  0% of 200
  });

  test('handles negative operands', () => {
    // Sign follows ordinary multiplication rules: (-)(+) => (-),
    // (+)(-) => (-), and (-)(-) => (+).
    expect(percentage(-200, 10)).toBe(-20);
    expect(percentage(200, -10)).toBe(-20);
    expect(percentage(-200, -10)).toBe(20);
  });

  test('handles decimal results (use toBeCloseTo)', () => {
    // Non-exact decimals: compare with a generous precision to sidestep
    // IEEE-754 representation error while still pinning the value tightly.
    expect(percentage(50, 12.5)).toBeCloseTo(6.25, 10); // 12.5% of 50
    expect(percentage(33, 33)).toBeCloseTo(10.89, 10); // 33% of 33
  });

  test('rejects non-number operands by returning NaN (strict input contract)', () => {
    // The engine strictly validates operand TYPES: any operand that is not a
    // real `number` is rejected with NaN instead of being coerced by the `*`
    // operator. This is the engine's OWN contract (see percentage.js JSDoc);
    // the calculator-ui layer separately coerces display text to numbers before
    // calling (AAP §0.7.4). We deliberately include *coercible* non-numbers,
    // because those are precisely the values `*` would otherwise turn into a
    // plausible-but-wrong result.
    const nonNumbers = [
      'a', // non-numeric string
      '10', // numeric STRING — must NOT be coerced to the number 10
      '', // empty string — must NOT be coerced to 0
      null, // must NOT be coerced to 0
      undefined, // must NOT be treated as a number
      true, // boolean — must NOT be coerced to 1
      false, // boolean — must NOT be coerced to 0
      [], // array — must NOT be coerced to 0
      {}, // object
      NaN, // number-typed but not-a-number; result stays NaN
    ];

    for (const bad of nonNumbers) {
      // Rejected in either operand position...
      expect(Number.isNaN(percentage(bad, 10))).toBe(true);
      expect(Number.isNaN(percentage(10, bad))).toBe(true);
      // ...and when both operands are non-numbers.
      expect(Number.isNaN(percentage(bad, bad))).toBe(true);
    }
  });

  test('regression: coercible non-numbers are not turned into plausible results', () => {
    // Pin the exact coercion cases the input-integrity review flagged. Without
    // the strict type guard these previously returned 2, 0, 0, 0.2, and 0
    // respectively — a documented-contract violation. They must now be NaN.
    expect(Number.isNaN(percentage('10', 20))).toBe(true); // previously 2
    expect(Number.isNaN(percentage('', 20))).toBe(true); //   previously 0
    expect(Number.isNaN(percentage(null, 20))).toBe(true); // previously 0
    expect(Number.isNaN(percentage(true, 20))).toBe(true); // previously 0.2
    expect(Number.isNaN(percentage([], 20))).toBe(true); //   previously 0
  });
});
