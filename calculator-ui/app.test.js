/**
 * @file calculator-ui/app.test.js
 * @module calculator-ui/app.test
 * @jest-environment jsdom
 *
 * jsdom-based unit tests for the Percentage (%) button handler in `app.js`
 * (the calculator's presentation layer). This suite is the executable proof of
 * the UI requirement (AAP §0.5.1 Group 3, §0.5.2, §0.7.2): clicking the `%`
 * button computes "b percent of a" via the `calculator-core` API and renders the
 * result into `<input id="display">`, with whole-value numeric coercion and
 * failure-safe handling preventing `NaN`/`Infinity` from ever reaching the user.
 *
 * What is verified:
 *   - The public helper/handler API is exposed (`init`, `handlePercent`,
 *     `toNumber`, `getState`, `resetState`, `getCore`).
 *   - `toNumber` WHOLE-VALUE coercion: whole numeric strings parse, while empty,
 *     whitespace-only, malformed-prefix (`'10abc'`), non-numeric text, `null`,
 *     `undefined`, `NaN`, `±Infinity`, the string `'Infinity'`, and overflow
 *     (`'1e309'`) all collapse to a controlled `0` (finding CQ-3).
 *   - The two-press interaction model (AAP §0.5.3): the first `%` press stores
 *     the base operand `a`, clears the display, announces the stored base via the
 *     `#status` live region, and returns focus to the display; the second press
 *     computes `percentage(a, b) = (a * b) / 100` and shows the result.
 *   - The `calculator-core` API is invoked with the correct, coerced operands.
 *   - Failure safety: an invalid core (no callable `percentage`), a throwing
 *     core, and a non-finite core result (`Infinity`/`NaN`) each render a
 *     controlled `'0'` (never `'NaN'`/`'Infinity'`) and RESET the stored operand
 *     to `null` on every failed second-stage attempt, so the user is never
 *     trapped mid-interaction (findings CQ-1, CQ-2, SAFE-1).
 *   - Decimal percentages render correctly.
 *   - Real-chain integration: a separate suite drives the ACTUAL
 *     `calculator-core` package (which delegates to the real `math-engine`), with
 *     no stub, proving the true UI -> core -> engine path — including a genuine
 *     IEEE-754 overflow that must surface as a controlled `'0'` (finding TEST-2).
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
 *   - The primary suite stubs the `calculator-core` API on `window.calculatorCore`
 *     with a DETERMINISTIC LOCAL MIRROR of the formula `(a * b) / 100`. This stub
 *     is a local stand-in — it does NOT import or call the real core/engine — so
 *     the UI unit test stays hermetic and can assert the exact operands the
 *     handler forwarded. The genuine end-to-end chain is proven separately by the
 *     real-core integration suite at the bottom of this file (finding TEST-2).
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
 * input (the shared result field), one `#percent` button (the `%` operator), and
 * the `#status` live region the handler announces into. The `#status` element
 * mirrors calculator-ui/index.html so the accessibility announcements are under
 * test (finding UI-1).
 * @returns {void}
 */
function setupDom() {
  document.body.innerHTML =
    '<input id="display" type="text" aria-label="Calculator display" value="" />' +
    '<button id="percent" type="button" aria-label="Percent">%</button>' +
    '<p id="status" role="status" aria-live="polite"></p>';
}

describe('calculator-ui percentage (%) button', () => {
  /** @type {jest.Mock} A deterministic local stub standing in for calculator-core. */
  let percentSpy;

  beforeEach(() => {
    // Rebuild a clean DOM for every test.
    setupDom();

    // `state` in app.js is module-level and persists across tests (the module is
    // required once), so reset the stored operand to a known baseline.
    app.resetState();

    // Inject a stub calculator-core API that is a DETERMINISTIC LOCAL MIRROR of
    // the percentage formula `(a * b) / 100`. This is a local stand-in, NOT the
    // real core/engine: it keeps this UI unit test hermetic and lets us assert on
    // the exact operands the handler forwards. The genuine UI -> core -> engine
    // chain is exercised separately by the real-core integration suite below
    // (finding TEST-2).
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
    expect(typeof app.init).toBe('function');
    expect(typeof app.handlePercent).toBe('function');
    expect(typeof app.toNumber).toBe('function');
    expect(typeof app.getState).toBe('function');
    expect(typeof app.resetState).toBe('function');
    expect(typeof app.getCore).toBe('function');
  });

  test('toNumber uses whole-value parsing; malformed/non-finite input -> 0', () => {
    // Whole, finite numeric strings parse (surrounding whitespace is trimmed).
    expect(app.toNumber('200')).toBe(200);
    expect(app.toNumber('12.5')).toBe(12.5);
    expect(app.toNumber('  42  ')).toBe(42);
    expect(app.toNumber('-80')).toBe(-80);
    expect(app.toNumber('1e308')).toBe(1e308);
    // Empty / whitespace-only -> 0.
    expect(app.toNumber('')).toBe(0);
    expect(app.toNumber('   ')).toBe(0);
    // A malformed PREFIX is NOT accepted: whole-value parsing yields 0, not 10,
    // closing the parseFloat('10abc') === 10 gap (finding CQ-3).
    expect(app.toNumber('10abc')).toBe(0);
    expect(app.toNumber('abc')).toBe(0);
    // Nullish -> 0.
    expect(app.toNumber(null)).toBe(0);
    expect(app.toNumber(undefined)).toBe(0);
    // Non-finite numbers/strings -> 0 (never NaN/Infinity).
    expect(app.toNumber(NaN)).toBe(0);
    expect(app.toNumber(Infinity)).toBe(0);
    expect(app.toNumber(-Infinity)).toBe(0);
    expect(app.toNumber('Infinity')).toBe(0);
    expect(app.toNumber('1e309')).toBe(0); // overflow -> Infinity -> 0
  });

  test('first % press stores the base operand, clears display, announces + focuses', () => {
    const display = document.getElementById('display');
    display.value = '200';
    document.getElementById('percent').click();
    // The display is cleared so the user can type the percent `b`, the base value
    // `a` is captured in module state, and the core API is NOT called yet.
    expect(display.value).toBe('');
    expect(app.getState().firstOperand).toBe(200);
    expect(percentSpy).not.toHaveBeenCalled();
    // Accessibility (UI-1): the live status announces the stored base, and focus
    // returns to the display so the second operand can be typed immediately.
    expect(document.getElementById('status').textContent).toContain('200');
    expect(document.activeElement).toBe(display);
  });

  test('second % press computes (a*b)/100, shows the result, announces, resets', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = '200';
    button.click(); // store a = 200, clear display
    display.value = '10';
    button.click(); // compute 10% of 200
    // The handler forwarded the two coerced operands in order, wrote the numeric
    // result to the display, announced it, and reset the stored operand. Exactly
    // one invocation on the computing press proves the handler is not double-bound
    // (app.js does not auto-init under Jest; the test binds once).
    expect(percentSpy).toHaveBeenCalledWith(200, 10);
    expect(percentSpy).toHaveBeenCalledTimes(1);
    expect(display.value).toBe('20');
    expect(app.getState().firstOperand).toBeNull();
    expect(document.getElementById('status').textContent).toContain('20');
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

  test('a malformed-prefix operand is coerced to 0 (CQ-3, no partial parse)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = '10abc'; // whole-value parse -> 0 (NOT the prefix 10)
    button.click();          // store base 0
    display.value = '50';
    button.click();          // 50% of 0 = 0
    expect(percentSpy).toHaveBeenCalledWith(0, 50);
    expect(display.value).toBe('0');
    expect(app.getState().firstOperand).toBeNull();
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

  // --- Failure-safety coverage (CQ-1, CQ-2, SAFE-1) -------------------------

  test('getCore rejects an invalid core API shape (CQ-2)', () => {
    // A truthy global that lacks a callable `percentage` must produce a single,
    // clear contract error at the resolution boundary — not a later TypeError.
    window.calculatorCore = { notPercentage: true };
    expect(() => app.getCore()).toThrow(/unavailable or invalid/);
  });

  test('an invalid core resets state and shows a controlled 0 (CQ-1/CQ-2)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    window.calculatorCore = { percentage: 'not-a-function' };
    display.value = '200';
    button.click(); // store base 200 (getCore is not consulted on the first press)
    display.value = '10';
    button.click(); // second press: getCore throws -> caught -> controlled 0, reset
    expect(display.value).toBe('0');
    expect(display.value).not.toBe('NaN');
    expect(app.getState().firstOperand).toBeNull();
  });

  test('a throwing core resets state and shows a controlled 0 (CQ-1)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    window.calculatorCore = {
      percentage: () => { throw new Error('boom'); },
      calculatePercentage: () => { throw new Error('boom'); }
    };
    display.value = '200';
    button.click(); // store base
    display.value = '10';
    button.click(); // core throws -> caught -> controlled 0, state reset
    expect(display.value).toBe('0');
    expect(app.getState().firstOperand).toBeNull();
  });

  test('a non-finite Infinity core result is never displayed (SAFE-1)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    window.calculatorCore = { percentage: () => Infinity, calculatePercentage: () => Infinity };
    display.value = '1e308';
    button.click(); // store base
    display.value = '100';
    button.click(); // provider returns Infinity -> controlled 0
    expect(display.value).toBe('0');
    expect(display.value).not.toBe('Infinity');
    expect(app.getState().firstOperand).toBeNull();
  });

  test('a non-finite NaN core result is never displayed (SAFE-1)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    window.calculatorCore = { percentage: () => NaN, calculatePercentage: () => NaN };
    display.value = '200';
    button.click(); // store base
    display.value = '10';
    button.click(); // provider returns NaN -> controlled 0
    expect(display.value).toBe('0');
    expect(display.value).not.toBe('NaN');
    expect(app.getState().firstOperand).toBeNull();
  });

  test('state resets after a failed second stage so the user is not trapped (CQ-1)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    window.calculatorCore = { percentage: () => { throw new Error('boom'); } };
    display.value = '200';
    button.click(); // store base
    display.value = '10';
    button.click(); // fails -> controlled 0, state reset to null
    expect(app.getState().firstOperand).toBeNull();

    // A subsequent press must begin a FRESH first stage (store + clear), proving
    // the failure did not leave a stale first operand trapping the second stage.
    percentSpy.mockClear();
    window.calculatorCore = { percentage: percentSpy, calculatePercentage: percentSpy };
    display.value = '80';
    button.click(); // fresh stage one: store 80, clear, do NOT compute
    expect(display.value).toBe('');
    expect(app.getState().firstOperand).toBe(80);
    expect(percentSpy).not.toHaveBeenCalled();
  });
});

// --- Unsafe whole-number input guard (finding FA-UI-3) -----------------------
// A whole-number literal beyond the JS safe-integer range would silently round
// under numeric coercion (Number('9007199254740993') === 9007199254740992). The
// handler must reject such input up front: show a controlled '0', announce a
// clear message, clear any pending base, and NEVER compute against a value the
// user did not type. Decimals, exponent forms, malformed input, and safe
// integers (including the MAX_SAFE boundary) must be unaffected.
describe('calculator-ui percentage (%) button — unsafe integer guard (FA-UI-3)', () => {
  /** @type {jest.Mock} A deterministic local stub standing in for calculator-core. */
  let percentSpy;

  beforeEach(() => {
    setupDom();
    app.resetState();
    percentSpy = jest.fn((a, b) => (a * b) / 100);
    window.calculatorCore = { percentage: percentSpy, calculatePercentage: percentSpy };
    app.init();
  });

  afterEach(() => {
    delete window.calculatorCore;
    document.body.innerHTML = '';
    app.resetState();
  });

  test('isUnsafeIntegerInput flags only integer literals beyond the safe range', () => {
    // TRUE: pure integer literals whose exact value is not a JS safe integer.
    expect(app.isUnsafeIntegerInput('9007199254740993')).toBe(true);    // rounds to ...992
    expect(app.isUnsafeIntegerInput('-9007199254740993')).toBe(true);
    expect(app.isUnsafeIntegerInput('  9007199254740993  ')).toBe(true); // surrounding ws trimmed
    // FALSE: the safe-integer boundary and ordinary safe integers.
    expect(app.isUnsafeIntegerInput('9007199254740991')).toBe(false);   // MAX_SAFE_INTEGER
    expect(app.isUnsafeIntegerInput('200')).toBe(false);
    expect(app.isUnsafeIntegerInput('0')).toBe(false);
    expect(app.isUnsafeIntegerInput('+5')).toBe(false);
    // FALSE: not a pure integer literal -> handled by toNumber's controlled-0 path.
    expect(app.isUnsafeIntegerInput('12.5')).toBe(false);   // decimal
    expect(app.isUnsafeIntegerInput('1e309')).toBe(false);  // exponent / overflow form
    expect(app.isUnsafeIntegerInput('10abc')).toBe(false);  // malformed prefix
    expect(app.isUnsafeIntegerInput('')).toBe(false);       // empty
    expect(app.isUnsafeIntegerInput(null)).toBe(false);
    expect(app.isUnsafeIntegerInput(undefined)).toBe(false);
  });

  test('first % press with an unsafe integer shows a controlled 0 and does not compute', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = '9007199254740993'; // would silently round to ...992 under coercion
    button.click();
    // Controlled result: display reset to '0' (never the rounded ...992), the core
    // NOT called, no stale base captured, and a clear safe-range message announced.
    expect(display.value).toBe('0');
    expect(display.value).not.toBe('9007199254740992');
    expect(percentSpy).not.toHaveBeenCalled();
    expect(app.getState().firstOperand).toBeNull();
    expect(document.getElementById('status').textContent).toContain('safe integer');
  });

  test('second % press with an unsafe integer resets the interaction to a controlled 0', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = '200';
    button.click();                     // first press: store base 200, clear display
    expect(app.getState().firstOperand).toBe(200);
    display.value = '9007199254740993'; // unsafe percent operand on the second press
    button.click();                     // guard fires: controlled 0, base cleared, no compute
    expect(display.value).toBe('0');
    expect(percentSpy).not.toHaveBeenCalled();
    expect(app.getState().firstOperand).toBeNull();
    expect(document.getElementById('status').textContent).toContain('safe integer');
  });

  test('the MAX_SAFE boundary and decimals pass the guard unchanged (regression)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    // Boundary: MAX_SAFE_INTEGER is a safe integer and must be accepted normally.
    display.value = '9007199254740991';
    button.click();
    expect(display.value).toBe('');                              // stored, not rejected
    expect(app.getState().firstOperand).toBe(9007199254740991);
    expect(percentSpy).not.toHaveBeenCalled();
    // A decimal percent is never treated as an unsafe integer; compute proceeds.
    display.value = '12.5';
    button.click();
    expect(percentSpy).toHaveBeenCalledWith(9007199254740991, 12.5);
    expect(app.getState().firstOperand).toBeNull();
  });
});

// --- Defensive missing-#display behavior (APP-1) -----------------------------
// Regression coverage for the fail-safe missing-display policy: when #display is
// absent while the handler runs, handlePercent() must CLEAR any pending base and
// no-op, so a later restoration begins a FRESH calculation and never silently
// computes against a stale base. (The no-global-`document` calls are covered by
// the companion app.node.test.js, which runs in the Node test environment where
// `document` is genuinely undefined — jsdom always installs a non-configurable
// `document`, so the no-document path cannot be exercised from this jsdom file.)
describe('calculator-ui percentage (%) button — missing #display fail-safe (APP-1)', () => {
  /** @type {jest.Mock} A deterministic local stub standing in for calculator-core. */
  let percentSpy;

  beforeEach(() => {
    setupDom();
    app.resetState();
    percentSpy = jest.fn((a, b) => (a * b) / 100);
    window.calculatorCore = { percentage: percentSpy, calculatePercentage: percentSpy };
    app.init();
  });

  afterEach(() => {
    delete window.calculatorCore;
    document.body.innerHTML = '';
    app.resetState();
  });

  test('display absent on the FIRST stage: no throw, no compute, state stays clear', () => {
    // Remove the display before any base is captured (first-stage absence).
    document.getElementById('display').remove();
    expect(() => app.handlePercent()).not.toThrow();
    expect(percentSpy).not.toHaveBeenCalled();
    expect(app.getState().firstOperand).toBeNull();
  });

  test('display removed BETWEEN presses clears the pending base (no stale compute)', () => {
    const display = document.getElementById('display');
    display.value = '200';
    document.getElementById('percent').click(); // first press: store base 200
    expect(app.getState().firstOperand).toBe(200);

    // The display disappears before the second press (second-stage absence).
    display.remove();
    expect(() => app.handlePercent()).not.toThrow();
    // Fail-safe policy: nothing is computed and the pending base is cleared, so a
    // restored display cannot later compute against the stale 200 (APP-1).
    expect(percentSpy).not.toHaveBeenCalled();
    expect(app.getState().firstOperand).toBeNull();
  });

  test('after the display is restored, the next press starts a FRESH first stage', () => {
    const display = document.getElementById('display');
    display.value = '200';
    document.getElementById('percent').click(); // store base 200
    display.remove();
    app.handlePercent();                         // missing-display policy clears the base
    expect(app.getState().firstOperand).toBeNull();

    // Restore the DOM and press again: this MUST be a fresh first press that
    // stores the NEW base (50), never silently computing 50% of the stale 200.
    setupDom();
    app.init();
    const restored = document.getElementById('display');
    restored.value = '50';
    document.getElementById('percent').click();
    expect(percentSpy).not.toHaveBeenCalled();     // fresh first press: no compute
    expect(restored.value).toBe('');               // display cleared for the percent b
    expect(app.getState().firstOperand).toBe(50);  // NEW base, not the stale 200
  });
});

// --- Real-core integration (no stub): proves the true UI -> core -> engine chain (TEST-2) ---
describe('calculator-ui percentage (%) button — real calculator-core integration', () => {
  // The ACTUAL calculator-core package (which delegates to the real math-engine).
  // This is NOT a local mirror of the formula — it exercises the genuine
  // cross-module chain end to end, so displayed results reflect real behavior.
  const realCore = require('../calculator-core');

  beforeEach(() => {
    setupDom();
    app.resetState();
    window.calculatorCore = realCore;
    app.init();
  });

  afterEach(() => {
    delete window.calculatorCore;
    document.body.innerHTML = '';
  });

  test('computes 10% of 200 = 20 through the real core + engine', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = '200';
    button.click();
    display.value = '10';
    button.click();
    expect(display.value).toBe('20');
    expect(app.getState().firstOperand).toBeNull();
  });

  test('computes 12.5% of 50 = 6.25 through the real core + engine', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    display.value = '50';
    button.click();
    display.value = '12.5';
    button.click();
    expect(display.value).toBe('6.25');
    expect(app.getState().firstOperand).toBeNull();
  });

  test('a genuine IEEE-754 overflow surfaces as a controlled 0, never Infinity (SAFE-1)', () => {
    const display = document.getElementById('display');
    const button = document.getElementById('percent');
    // After the FA-ENG-1 overflow-recovery fix, percentage(1e308, 100) no longer
    // spuriously overflows — the engine factors the /100 and returns the finite
    // 1e308 (100% of 1e308). To still exercise the controlled-0 policy for a
    // GENUINE IEEE-754 overflow, use two large operands whose product overflows
    // even under the engine's factored a*(b/100) fallback: percentage(1e308,
    // 1e308) = Infinity. The UI must render a controlled '0', never 'Infinity'.
    display.value = '1e308';
    button.click();
    display.value = '1e308';
    button.click();
    expect(display.value).toBe('0');
    expect(display.value).not.toBe('Infinity');
    expect(app.getState().firstOperand).toBeNull();
  });
});
