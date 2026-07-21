/**
 * @file calculator-ui/app.js
 * @module calculator-ui/app
 *
 * Browser click handler for the calculator's Percentage (%) button — the
 * presentation-layer wiring that connects the UI to the `calculator-core`
 * percentage API. It reads the operand(s) from the shared display, delegates
 * the computation to calculator-core, and writes the numeric result back into
 * `<input id="display">`.
 *
 * Data/control flow (AAP §0.1.3, §0.4.2):
 *   #percent click -> handlePercent() -> window.calculatorCore.percentage(a, b)
 *   -> math-engine percentage(a, b) = (a * b) / 100 -> result written to #display.
 *
 * Dual consumption model (no bundler, ZERO production dependencies):
 *   - Browser: the calculator-core API is consumed as the global
 *     `window.calculatorCore`, published by calculator-core/index.js when it is
 *     loaded via a <script> tag in index.html (after math-engine/percentage.js,
 *     which publishes the `window.percentage` global the core depends on).
 *   - Node/jsdom test: a CommonJS `module.exports` is added at the bottom purely
 *     so the jsdom-based unit test (app.test.js) can import and exercise the
 *     helpers/handler; when the `window.calculatorCore` global is absent the
 *     handler falls back to `require('../calculator-core')`.
 *
 * Interaction model — single #display + one % button (AAP §0.5.3):
 *   percentage is BINARY: percentage(a, b) = (a * b) / 100. The two operands are
 *   supplied across two % presses using a stored first operand:
 *     1st press: coerce the #display value to a number, store it as base `a`, and
 *                clear the display so the user can type the percent `b`.
 *     2nd press: coerce the #display value to the percent `b`, compute
 *                percentage(a, b) via calculator-core, show the result, reset state.
 *
 * Input hygiene (AAP §0.7.4): the #display value is coerced to a finite number
 * before it reaches the API, so non-numeric/empty input yields a controlled 0,
 * never NaN. (The math-engine layer strictly rejects non-number operands with
 * NaN, so this UI-level coercion is what guarantees users see a real number.)
 *
 * This module deliberately performs NO percentage arithmetic of its own: the
 * single source of truth for the computation lives in math-engine, calculator-core
 * delegates to it, and this UI layer delegates to calculator-core (AAP §0.7.2).
 */
(function () {
  'use strict';

  // Module-scoped interaction state: the stored first operand (base value `a`).
  // `null` means "no base captured yet" (i.e. the next % press is the 1st press).
  var state = { firstOperand: null };

  /**
   * Coerce an arbitrary display value to a finite number (non-finite -> 0).
   *
   * Uses `parseFloat` to read a leading numeric portion, then guards the result
   * with `Number.isFinite` so that empty strings, non-numeric text, `undefined`,
   * `NaN`, and `Infinity` all collapse to a controlled `0` rather than
   * propagating `NaN` into the core API (AAP §0.7.4).
   * @param {*} value - The raw value read from the display input.
   * @returns {number} A finite number (0 when the input is not a finite number).
   */
  function toNumber(value) {
    var n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Resolve the calculator-core percentage API.
   *
   * Browser/jsdom: the global `window.calculatorCore` (published by
   * calculator-core/index.js). Node fallback: `require('../calculator-core')`,
   * valid because calculator-core/package.json sets `main: index.js`. The API is
   * resolved at CALL TIME (not at module load) so tests can inject a stub before
   * a click and so browser <script> load order is respected.
   * @returns {{percentage: function(number, number): number}} The core API,
   *   exposing a `percentage(a, b)` delegating function (its interchangeable
   *   `calculatePercentage` alias is also available on the same object).
   * @throws {Error} If no calculator-core API can be resolved in either runtime.
   */
  function getCore() {
    if (typeof window !== 'undefined' && window.calculatorCore) {
      return window.calculatorCore;
    }
    if (typeof require === 'function') {
      try {
        return require('../calculator-core');
      } catch (e) {
        /* fall through to the descriptive error below */
      }
    }
    throw new Error('calculator-core percentage API is not available');
  }

  /**
   * Read the #display input element from the current document.
   * @returns {?HTMLInputElement} The display element, or null if it is absent.
   */
  function getDisplay() {
    return document.getElementById('display');
  }

  /**
   * Handle a click on the Percentage (%) button (two-press binary model).
   *
   * First press stores the base operand `a` (coerced from the display) and clears
   * the display so the user can type the percent `b`. Second press coerces the
   * display to `b`, computes percentage(a, b) = (a * b) / 100 by DELEGATING to the
   * calculator-core API (no arithmetic is performed here), writes the numeric
   * result back to the display, then resets the stored operand. If the display
   * element is missing the handler is a no-op.
   * @returns {void}
   */
  function handlePercent() {
    var display = getDisplay();
    if (!display) {
      return;
    }
    var current = toNumber(display.value);

    if (state.firstOperand === null) {
      // First press: capture the base value `a`, then clear for the percent `b`.
      state.firstOperand = current;
      display.value = '';
      return;
    }

    // Second press: `current` is the percent `b`; delegate "b percent of a" to
    // the core API. This module performs NO computation of its own.
    var result = getCore().percentage(state.firstOperand, current);
    display.value = String(result);
    state.firstOperand = null;
  }

  /**
   * Wire the % button's click handler.
   *
   * Looks up `#percent` in the current document and registers `handlePercent` as
   * its click listener. Safe to call once after the DOM exists; a no-op if the
   * button is absent. In the browser this is invoked automatically (see the
   * auto-init guard below); under Jest/jsdom the test calls it explicitly.
   * @returns {void}
   */
  function init() {
    var button = document.getElementById('percent');
    if (button) {
      button.addEventListener('click', handlePercent);
    }
  }

  /**
   * Test helper: read-only snapshot of the interaction state.
   *
   * Returns a fresh object so callers cannot mutate the internal state through
   * the returned reference.
   * @returns {{firstOperand: (number|null)}} The current state snapshot.
   */
  function getState() {
    return { firstOperand: state.firstOperand };
  }

  /**
   * Test helper: reset the interaction state back to its initial value.
   * @returns {void}
   */
  function resetState() {
    state.firstOperand = null;
  }

  // Browser (no CommonJS): auto-initialize once the DOM is ready. Guarded with
  // `typeof module === 'undefined'` so Jest/jsdom (CommonJS, where `module` is
  // defined) does NOT auto-bind — the test calls init() explicitly, which avoids
  // a double-bound handler firing twice per click.
  if (typeof module === 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // CommonJS export for the jsdom unit test (app.test.js). The browser never
  // reaches this branch because `module` is undefined there.
  if (typeof module === 'object' && module.exports) {
    module.exports = {
      init: init,
      handlePercent: handlePercent,
      toNumber: toNumber,
      getState: getState,
      resetState: resetState,
      getCore: getCore
    };
  }
}());
