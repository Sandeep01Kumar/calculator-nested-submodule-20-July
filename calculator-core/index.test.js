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

// Node built-ins used only by the browser-contract suite below, which evaluates
// index.js in a fresh VM context to exercise its UMD browser branch.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Module under test: the calculator-core public API surface.
const core = require('./index');

// The computation engine itself. Imported for the OUTPUT-EQUIVALENCE check below
// (that core's results match the real engine's results for the same inputs).
// NOTE: output equivalence alone does NOT prove delegation — a core that
// re-implemented `(a*b)/100` would also match. Genuine forwarding is proven
// separately, with a mock, in the "delegation to the math-engine (mock/spy
// proof)" suite. This path is part of this file's declared dependencies.
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

  test('produces no output divergence from the real engine', () => {
    // Sanity check: the core API returns exactly what the real engine returns
    // for the same inputs. This guards against accidental output drift, but by
    // itself it does NOT prove delegation — a core that re-implemented the same
    // formula would also match. Genuine forwarding is proven separately in the
    // "delegation to the math-engine (mock/spy proof)" suite below.
    // Because both paths compute on identical inputs, the outputs are
    // bit-for-bit equal, so strict equality (toBe) is appropriate.
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

describe('calculator-core delegation to the math-engine (mock/spy proof)', () => {
  // A true delegation proof must show the core FORWARDS to the engine and
  // RETURNS whatever the engine returns — independent of the arithmetic. We
  // replace the engine module with a mock that returns a unique sentinel, then
  // assert the core forwards the exact arguments and propagates the exact
  // sentinel. A core that re-implemented `(a*b)/100` would return a NUMBER (not
  // the sentinel) and would therefore FAIL these assertions — which is exactly
  // why an output-only comparison cannot establish delegation.
  afterEach(() => {
    // Restore the real module registry between cases in this suite.
    jest.resetModules();
    jest.dontMock('./math-engine/percentage');
  });

  test('forwards the exact arguments to the engine and returns its exact result', () => {
    jest.isolateModules(() => {
      const engineMock = jest.fn();
      // `jest.doMock` is NOT hoisted, so it must run BEFORE requiring the core
      // inside this isolated module registry.
      jest.doMock('./math-engine/percentage', () => engineMock);

      const isolatedCore = require('./index');
      const sentinel = Symbol('engine-result');
      engineMock.mockReturnValue(sentinel);

      // `percentage` alias forwards exact args and returns the engine's value.
      expect(isolatedCore.percentage(200, 10)).toBe(sentinel);
      expect(engineMock).toHaveBeenCalledTimes(1);
      expect(engineMock).toHaveBeenLastCalledWith(200, 10);

      // `calculatePercentage` alias forwards identically.
      expect(isolatedCore.calculatePercentage(50, 25)).toBe(sentinel);
      expect(engineMock).toHaveBeenCalledTimes(2);
      expect(engineMock).toHaveBeenLastCalledWith(50, 25);
    });
  });

  test('both public aliases are the same delegating function object', () => {
    jest.isolateModules(() => {
      const engineMock = jest.fn();
      jest.doMock('./math-engine/percentage', () => engineMock);

      const isolatedCore = require('./index');
      // Interchangeable: the two public names reference the very same function.
      expect(isolatedCore.percentage).toBe(isolatedCore.calculatePercentage);
    });
  });
});

describe('calculator-core browser (UMD) dependency contract', () => {
  // Exercise the BROWSER branch of index.js by evaluating its source in a fresh
  // VM context where `module` is undefined and a browser-like global object
  // (`self`) is present. This reproduces loading the file via a <script> tag.
  const indexSource = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

  function runInBrowserContext(sandbox) {
    vm.createContext(sandbox);
    vm.runInContext(indexSource, sandbox);
    return sandbox;
  }

  test('publishes a working window.calculatorCore when the engine global is present', () => {
    // Happy path: the engine <script> is loaded first, so window.percentage
    // exists as a function before index.js runs.
    const sandbox = { self: null };
    sandbox.self = sandbox;
    sandbox.percentage = (a, b) => (a * b) / 100;

    runInBrowserContext(sandbox);

    expect(typeof sandbox.calculatorCore).toBe('object');
    expect(sandbox.calculatorCore).not.toBeNull();
    expect(typeof sandbox.calculatorCore.percentage).toBe('function');
    expect(typeof sandbox.calculatorCore.calculatePercentage).toBe('function');
    expect(sandbox.calculatorCore.percentage(200, 10)).toBe(20);
    expect(sandbox.calculatorCore.calculatePercentage(50, 10)).toBe(5);
  });

  test('fails fast and does NOT publish a broken API when the engine global is missing', () => {
    // Negative path: index.js is loaded WITHOUT the engine <script> first, so
    // window.percentage is undefined. The module must throw a clear
    // module-contract error at load time instead of publishing a
    // window.calculatorCore whose methods would later throw a generic TypeError.
    const sandbox = { self: null };
    sandbox.self = sandbox; // browser-like global; no `percentage` defined

    let caught;
    try {
      runInBrowserContext(sandbox);
    } catch (err) {
      caught = err;
    }

    // The error originates inside the VM realm, so its constructor is that
    // realm's TypeError (not this test realm's). Assert by name/message rather
    // than `instanceof`, which is not reliable across realms.
    expect(caught).toBeDefined();
    expect(caught.name).toBe('TypeError');
    expect(caught.message).toMatch(/calculator-core: missing dependency/i);
    // Crucially, no broken global was published.
    expect(sandbox.calculatorCore).toBeUndefined();
  });

  test('rejects a present-but-non-callable engine global', () => {
    // Defensive: even if `percentage` exists but is not a function, the API
    // must not be published in a broken state.
    const sandbox = { self: null };
    sandbox.self = sandbox;
    sandbox.percentage = 'not-a-function';

    let caught;
    try {
      runInBrowserContext(sandbox);
    } catch (err) {
      caught = err;
    }

    // Realm-safe assertion (see note above): check by name, not `instanceof`.
    expect(caught).toBeDefined();
    expect(caught.name).toBe('TypeError');
    expect(sandbox.calculatorCore).toBeUndefined();
  });
});
