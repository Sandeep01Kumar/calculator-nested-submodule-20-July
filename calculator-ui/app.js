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
 *     1st press: coerce the #display value to a number, store it as base `a`,
 *                clear the display so the user can type the percent `b`, announce
 *                the stored base via the live status region, and return focus to
 *                the display so the second operand can be typed immediately.
 *     2nd press: coerce the #display value to the percent `b`, compute
 *                percentage(a, b) via calculator-core, show the result, reset state.
 *
 * Accessibility (AAP §0.5.3): the two-press model is explained to assistive tech
 * via a live status region (`#status`, role="status"/aria-live) that this module
 * updates when the base is stored, when a result is produced, and on failure —
 * and by returning focus to `#display` after the first press so keyboard/screen-
 * reader users are not stranded on the % button while the display silently clears.
 *
 * Input hygiene (AAP §0.7.4): the #display value is coerced to a finite number
 * before it reaches the API, so non-numeric/empty/malformed input yields a
 * controlled 0, never NaN. Coercion uses WHOLE-VALUE parsing (`Number` on the
 * trimmed string), so a value that is not entirely numeric (e.g. `'10abc'`)
 * collapses to 0 rather than being silently truncated to a plausible prefix.
 * (The math-engine layer strictly rejects non-number operands with NaN, so this
 * UI-level coercion is what guarantees users see a real number.)
 *
 * Failure safety (extends the AAP §0.7.4 "controlled result" mandate to the
 * failure paths — "failure paths reset state and fail predictably" and "the UI
 * never exposes uncontrolled NaN/Infinity"): the second press runs inside
 * try/catch/finally. A non-finite result (NaN/Infinity from a genuine IEEE-754
 * overflow or a malformed provider) is never rendered — a controlled 0 is shown
 * instead — and the stored base operand is reset on EVERY terminal second-stage
 * path (success, non-finite result, or thrown exception), so a core failure can
 * never trap the user in a stale second stage.
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
   * Coerce an arbitrary display value to a finite number using WHOLE-VALUE
   * parsing (non-numeric/non-finite input -> a controlled 0).
   *
   * The value is trimmed and parsed with `Number(...)` (NOT `parseFloat`), so the
   * ENTIRE string must be a valid number: a partially numeric value such as
   * `'10abc'` yields `0`, not `10` — closing the malformed-prefix gap where
   * `parseFloat('10abc') === 10` could silently turn invalid input into a
   * plausible-but-wrong result (finding CQ-3). Empty/whitespace-only strings and
   * `null`/`undefined` map to `0`, and the `Number.isFinite` guard collapses
   * `NaN` and `±Infinity` (including the string `'Infinity'` and numeric overflow
   * such as `'1e309'`) to `0` as well. This keeps non-numeric/empty/malformed
   * input from propagating `NaN`/`Infinity` into the core API (AAP §0.7.4).
   * @param {*} value - The raw value read from the display input.
   * @returns {number} A finite number (0 when the input is not a whole, finite number).
   */
  function toNumber(value) {
    if (value === null || value === undefined) {
      return 0;
    }
    // Whole-value parse: trim surrounding whitespace, treat empty as 0, then
    // require the entire remaining string to be a finite number. A bad prefix
    // (Number('10abc') === NaN), an empty string, or an overflow
    // (Number('1e309') === Infinity) all fail the finite guard and collapse to 0.
    var trimmed = String(value).trim();
    if (trimmed === '') {
      return 0;
    }
    var n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Resolve and VALIDATE the calculator-core percentage API.
   *
   * Browser/jsdom: the global `window.calculatorCore` (published by
   * calculator-core/index.js). Node fallback: `require('../calculator-core')`,
   * valid because calculator-core/package.json sets `main: index.js`. The API is
   * resolved at CALL TIME (not at module load) so tests can inject a stub before
   * a click and so browser <script> load order is respected.
   *
   * The resolved value is validated for SHAPE before being returned: a truthy
   * `window.calculatorCore` is not enough — its `percentage` member must be
   * callable. This converts a latent "percentage is not a function" TypeError
   * (which would otherwise surface deep inside handlePercent on first use) into a
   * single, clear contract error at the resolution boundary (finding CQ-2). A
   * failed `require` is likewise not swallowed: it is re-thrown as one descriptive
   * error that preserves the original load failure as its `cause`, so the
   * underlying module-resolution problem remains diagnosable.
   * @returns {{percentage: function(number, number): number}} The core API,
   *   exposing a callable `percentage(a, b)` delegating function (its
   *   interchangeable `calculatePercentage` alias is also available on the object).
   * @throws {Error} If the API cannot be resolved (require failure, with the
   *   original error attached as `cause`), or if the resolved value does not
   *   expose a callable `percentage` function.
   */
  function getCore() {
    var core = null;

    if (typeof window !== 'undefined' && window.calculatorCore) {
      // Browser/jsdom: prefer the global published by calculator-core/index.js.
      core = window.calculatorCore;
    } else if (typeof require === 'function') {
      // Node fallback (used by the jsdom unit test when no global is injected).
      try {
        core = require('../calculator-core');
      } catch (e) {
        // Do NOT discard the resolution failure: surface a single clear contract
        // error while preserving the original error as `cause` for diagnosis.
        throw new Error(
          'calculator-core percentage API could not be resolved via ' +
          'require("../calculator-core")',
          { cause: e }
        );
      }
    }

    // Validate the API SHAPE: `percentage` must be callable. Fail fast here with
    // one descriptive contract error rather than letting an absent/invalid API
    // throw a generic TypeError later inside the handler.
    if (!core || typeof core.percentage !== 'function') {
      throw new Error(
        'calculator-core percentage API is unavailable or invalid: expected an ' +
        'object exposing a callable `percentage(a, b)` function'
      );
    }

    return core;
  }

  /**
   * Update the live status region (`#status`) so assistive tech announces the
   * current interaction state (base stored, result produced, or failure).
   *
   * The status element is optional: when it is absent (e.g. a minimal test DOM
   * that does not include it) this is a safe no-op, so the handler never depends
   * on its presence. In index.html the element carries role="status" plus
   * aria-live="polite" so updates are announced without stealing focus (UI-1).
   * @param {string} message - The human-readable status message to announce.
   * @returns {void}
   */
  function setStatus(message) {
    var status = document.getElementById('status');
    if (status) {
      status.textContent = message;
    }
  }

  /**
   * Return keyboard focus to the shared display and select its contents.
   *
   * Called after the first % press so a keyboard/screen-reader user is placed
   * back on the (now-cleared) display to type the percent `b`, instead of being
   * stranded on the % button while the display silently clears (UI-1). Native
   * button activation is preserved — this only moves focus AFTER the click has
   * been handled. Guarded so it is a safe no-op if the element or the DOM focus
   * APIs are unavailable.
   * @param {?HTMLInputElement} display - The display input to focus/select.
   * @returns {void}
   */
  function focusDisplay(display) {
    if (display && typeof display.focus === 'function') {
      display.focus();
      if (typeof display.select === 'function') {
        display.select();
      }
    }
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
   * First press: stores the base operand `a` (coerced from the display), clears
   * the display so the user can type the percent `b`, announces the stored base
   * via the live status region, and returns focus to the display (UI-1). Second
   * press: coerces the display to `b`, computes percentage(a, b) = (a * b) / 100
   * by DELEGATING to the calculator-core API (no arithmetic is performed here),
   * validates the result is finite, writes it back to the display, and resets the
   * stored operand.
   *
   * Robust second stage (CQ-1, SAFE-1): the compute/render runs inside
   * try/catch/finally so that EVERY terminal path is safe and predictable:
   *   - success            -> render the finite result + announce it;
   *   - non-finite result  -> render a controlled '0' + announce the failure
   *                           (never expose NaN/Infinity);
   *   - thrown exception   -> render a controlled '0' + announce the failure
   *                           (e.g. an unavailable/invalid core);
   *   - in ALL cases       -> the stored base operand is reset in `finally`, so a
   *                           failure can never leave a stale first operand that
   *                           traps later clicks in the second stage.
   * If the display element is missing the handler is a no-op.
   * @returns {void}
   */
  function handlePercent() {
    var display = getDisplay();
    if (!display) {
      return;
    }
    var current = toNumber(display.value);

    if (state.firstOperand === null) {
      // First press: capture the base value `a`, clear the display for the
      // percent `b`, announce the stored base, and move focus back to the display
      // so the second operand can be typed without unexplained navigation (UI-1).
      state.firstOperand = current;
      display.value = '';
      setStatus(
        'Base value ' + current + ' stored. Enter the percent, then press % again.'
      );
      focusDisplay(display);
      return;
    }

    // Second press: `current` is the percent `b`; delegate "b percent of a" to the
    // core API. This module performs NO computation of its own. Capture the base
    // in a local so `finally` can always clear the module state regardless of the
    // path taken (success, non-finite result, or thrown exception) — CQ-1.
    var base = state.firstOperand;
    try {
      var result = getCore().percentage(base, current);
      // Never render an uncontrolled NaN/Infinity — from a genuine IEEE-754
      // overflow or a malformed provider (SAFE-1). Apply a controlled 0 policy.
      if (!Number.isFinite(result)) {
        display.value = '0';
        setStatus('Could not compute a finite result; display reset to 0.');
        return;
      }
      display.value = String(result);
      setStatus(current + '% of ' + base + ' is ' + result + '.');
    } catch (err) {
      // Controlled failure: the core API was unavailable/invalid or threw. Show a
      // controlled 0 instead of propagating the error to the user (CQ-1, CQ-2).
      display.value = '0';
      setStatus('Percentage calculation failed; display reset to 0.');
    } finally {
      // Terminal second-stage path: always clear the stored base so the next %
      // press starts a fresh first stage (reset on success AND failure) — CQ-1.
      state.firstOperand = null;
    }
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
