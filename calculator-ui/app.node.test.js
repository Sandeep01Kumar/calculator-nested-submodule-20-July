/**
 * @file calculator-ui/app.node.test.js
 * @module calculator-ui/app.node.test
 * @jest-environment node
 *
 * Node-environment regression tests for the defensive DOM handling in `app.js`
 * (finding APP-1). This companion suite runs in the DEFAULT Node test
 * environment — NOT jsdom — so `document` is genuinely `undefined`, exactly like
 * a plain Node (non-browser) context. It proves the exported helpers are safe to
 * call without a DOM instead of throwing a `ReferenceError`.
 *
 * Why a separate file (and not more cases inside app.test.js): jsdom installs
 * `document` as a NON-CONFIGURABLE getter on the global object, so it cannot be
 * deleted or reassigned to simulate its absence from within the jsdom suite. The
 * only faithful way to exercise the `typeof document === 'undefined'` guards is
 * to run in the Node environment, which this docblock selects via
 * `@jest-environment node` (overriding the jsdom default from package.json for
 * THIS file only). The display-absent / restoration / stale-state cases (where a
 * `document` exists but `#display` is missing) are covered by app.test.js.
 *
 * What is verified here:
 *   - Requiring `app.js` in a no-`document` context exposes the full helper API
 *     without throwing at load time.
 *   - `init()` and `handlePercent()` are safe no-ops (no `ReferenceError`) when
 *     `document` is undefined, and `handlePercent()` leaves the interaction state
 *     cleared (the fail-safe missing-display policy).
 *   - The pure, DOM-free helpers still work in Node: `toNumber` whole-value
 *     coercion, `getState`/`resetState`, and `getCore()`'s Node fallback
 *     (`require('../calculator-core')`) resolving a callable `percentage`.
 *
 * Fully deterministic: no network, no DOM, no timers, no randomness. Re-running
 * yields identical results.
 *
 * @see module:calculator-ui/app
 */

'use strict';

// Module under test. Requiring it in the Node environment must NOT throw: app.js
// guards its browser auto-init with `typeof document !== 'undefined'` (false
// here) and `typeof module === 'undefined'` (false under CommonJS), so no DOM is
// touched at load time; only the CommonJS export branch runs.
const app = require('./app');

describe('calculator-ui app.js — no-`document` (plain Node) defensive behavior (APP-1)', () => {
  beforeEach(() => {
    // The module-level `state` persists across tests (the module is required
    // once), so reset it to a known baseline before each case.
    app.resetState();
  });

  test('sanity: this suite runs with no `document` global', () => {
    // Confirms the Node environment is in effect so the guards are truly exercised.
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  test('requiring app.js exposes the full helper API without throwing', () => {
    expect(typeof app.init).toBe('function');
    expect(typeof app.handlePercent).toBe('function');
    expect(typeof app.toNumber).toBe('function');
    expect(typeof app.getState).toBe('function');
    expect(typeof app.resetState).toBe('function');
    expect(typeof app.getCore).toBe('function');
  });

  test('init() is a safe no-op when `document` is undefined', () => {
    // Before the guard was added this threw `ReferenceError: document is not defined`.
    expect(() => app.init()).not.toThrow();
  });

  test('handlePercent() does not throw and leaves state cleared when `document` is undefined', () => {
    // getDisplay() returns null (guarded), so the handler takes the fail-safe
    // missing-display path: clear any pending base and no-op. No compute, no throw.
    expect(() => app.handlePercent()).not.toThrow();
    expect(app.getState().firstOperand).toBeNull();

    // Calling it repeatedly is still safe and keeps the state cleared.
    expect(() => app.handlePercent()).not.toThrow();
    expect(app.getState().firstOperand).toBeNull();
  });

  test('pure DOM-free helpers still work in Node: toNumber / getState / resetState', () => {
    // Whole-value coercion (no DOM needed).
    expect(app.toNumber('200')).toBe(200);
    expect(app.toNumber('12.5')).toBe(12.5);
    expect(app.toNumber('10abc')).toBe(0); // whole-value parse rejects a bad prefix
    expect(app.toNumber('')).toBe(0);
    expect(app.toNumber(undefined)).toBe(0);
    expect(app.toNumber('1e309')).toBe(0); // overflow -> Infinity -> 0

    // State snapshot/reset helpers are DOM-independent.
    expect(app.getState().firstOperand).toBeNull();
    app.resetState();
    expect(app.getState().firstOperand).toBeNull();
  });

  test('getCore() resolves the real core via the Node `require` fallback', () => {
    // With no `window` global, getCore() falls back to require('../calculator-core')
    // and validates the resolved API shape before returning it.
    const core = app.getCore();
    expect(typeof core.percentage).toBe('function');
    // The resolved core delegates to the real math-engine: 10% of 200 = 20.
    expect(core.percentage(200, 10)).toBe(20);
  });
});
