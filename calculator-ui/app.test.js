/**
 * @file calculator-ui/app.test.js
 * @module calculator-ui/app.test
 * @jest-environment jsdom
 *
 * jsdom-based unit tests for the Percentage (%) button handler in `app.js`
 * (the calculator's presentation layer). This suite is the executable proof of
 * the UI requirement (AAP §0.5.1 Group 3, §0.5.2, §0.7.2): clicking the `%`
 * button computes "b percent of a" via the `calculator-core` API and renders the
 * result into `<input id="display">`, with numeric coercion preventing `NaN`
 * propagation.
 *
 * What is verified:
 *   - The public helper/handler API is exposed (`handlePercent`, `toNumber`).
 *   - `toNumber` coerces empty/non-numeric input to a finite `0`.
 *   - The two-press interaction model (AAP §0.5.3): the first `%` press stores
 *     the base operand `a` and clears the display; the second press computes
 *     `percentage(a, b) = (a * b) / 100` and shows the result.
 *   - The `calculator-core` API is invoked with the correct, coerced numeric
 *     operands.
 *   - Non-numeric input yields a controlled result (`'0'`), never `'NaN'`.
 *   - Decimal percentages render correctly.
 *
 * Design / conventions:
 *   - Jest with the `*.test.js` naming convention (this file is `app.test.js`),
 *     so it is auto-discovered by Jest's default `testMatch`. Native CommonJS —
 *     no Babel/transform required (AAP §0.2.2, §0.3.1).
 *   - Runs in the jsdom environment so `document`/`window` exist. jsdom is
 *     selected both by the `@jest-environment jsdom` docblock above (belt) and by
 *     `calculator-ui/package.json` (`"jest": { "testEnvironment": "jsdom" }`)
 *     (suspenders).
 *   - The module under test is imported with `require('./app')`. Because `app.js`
 *     guards its browser auto-init with `typeof module === 'undefined'`, requiring
 *     it under Jest does NOT bind the handler; the test calls `app.init()`
 *     explicitly after building the DOM (so there is no double-bind).
 *   - The `calculator-core` API is stubbed on `window.calculatorCore` so this UI
 *     unit test is hermetic (no dependency on the real core module) and the test
 *     can assert the exact operands the handler forwarded. The stub delegates to
 *     the real engine formula `(a * b) / 100`, so displayed results match true
 *     end-to-end behavior.
 *   - Fully deterministic: no network, no timers, no randomness. Re-running
 *     yields identical results.
 *
 * @see module:calculator-ui/app
 */

'use strict';

// Module under test: the % button handler and its helpers. `app.js` exports
// { init, handlePercent, toNumber, getState, resetState, getCore } for tests.
const app = require('./app');

/**
 * Build the minimal calculator DOM the handler expects: a single `#display`
 * input (the shared result field) and one `#percent` button (the `%` operator).
 * @returns {void}
 */
function setupDom() {
  document.body.innerHTML =
    '<input id="display" type="text" aria-label="Calculator display" value="" />' +
    '<button id="percent" type="button" aria-label="Percent">%</button>';
}

describe('calculator-ui percentage (%) button', () => {
  /** @type {jest.Mock} A spy standing in for the real calculator-core API. */
  let percentSpy;

  beforeEach(() => {
    // Rebuild a clean DOM for every test.
    setupDom();

    // `state` in app.js is module-level and persists across tests (the module is
    // required once), so reset the stored operand to a known baseline.
    app.resetState();

    // Inject a stub calculator-core API. It delegates to the real percentage
    // formula so results match end-to-end behavior, while keeping the UI test
    // isolated and letting us assert on the operands the handler receives.
    percentSpy = jest.fn((a, b) => (a * b) / 100);
    window.calculatorCore = { percentage: percentSpy, calculatePercentage: percentSpy };

    // Explicitly bind the click handler (app.js does not auto-bind under Jest).
    app.init();
  });

  afterEach(() => {
    // Tear down the injected global and DOM so tests never leak into each other.
    delete window.calculatorCore;
    document.body.innerHTML = '';
  });

  test('exposes the handler and helper API', () => {
    expect(typeof app.handlePercent).toBe('function');
    expect(typeof app.toNumber).toBe('function');
  });

  test('toNumber coerces empty/non-numeric input to 0', () => {
    expect(app.toNumber('200')).toBe(200);
    expect(app.toNumber('12.5')).toBe(12.5);
    expect(app.toNumber('')).toBe(0);
    expect(app.toNumber('abc')).toBe(0);
    expect(app.toNumber(undefined)).toBe(0);
  });

  test('first % press stores the base operand and clears the display', () => {
    const display = document.getElementById('display');
    display.value = '200';
    document.getElementById('percent').click();
    // The display is cleared so the user can type the percent `b`, and the base
    // value `a` is captured in module state. The core API is NOT called yet.
    expect(display.value).toBe('');
    expect(app.getState().firstOperand).toBe(200);
    expect(percentSpy).not.toHaveBeenCalled();
  });

  test('second % press computes (a*b)/100 and shows the result', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = '200';
    button.click(); // store a = 200, clear display
    display.value = '10';
    button.click(); // compute 10% of 200
    // The handler forwarded the two coerced operands to the core API in order,
    // wrote the numeric result to the display, and reset the stored operand.
    // Exactly one invocation on the computing press proves the handler is not
    // double-bound (app.js does not auto-init under Jest; the test binds once).
    expect(percentSpy).toHaveBeenCalledWith(200, 10);
    expect(percentSpy).toHaveBeenCalledTimes(1);
    expect(display.value).toBe('20');
    expect(app.getState().firstOperand).toBeNull();
  });

  test('non-numeric display input is coerced (no NaN propagation)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = 'abc'; // -> 0 (base)
    button.click();
    display.value = 'xyz'; // -> 0 (percent)
    button.click();
    // Both operands coerce to a finite 0, so the result is a controlled '0'.
    expect(percentSpy).toHaveBeenCalledWith(0, 0);
    expect(display.value).toBe('0');
    expect(display.value).not.toBe('NaN');
  });

  test('a decimal percentage renders correctly', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = '50';
    button.click(); // store a = 50
    display.value = '12.5';
    button.click(); // 12.5% of 50 = 6.25 (exact under IEEE-754)
    expect(percentSpy).toHaveBeenCalledWith(50, 12.5);
    expect(display.value).toBe('6.25');
  });
});
