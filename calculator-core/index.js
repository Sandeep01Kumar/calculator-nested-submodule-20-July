/**
 * calculator-core — percentage API (thin delegation layer).
 *
 * This module is the PUBLIC API SURFACE of the `calculator-core` submodule —
 * the API layer of the nested-submodule calculator
 * (parent -> calculator-core/ -> nested math-engine/). Its sole responsibility
 * is to EXPOSE a percentage calculation API and DELEGATE the computation to the
 * nested `math-engine` `percentage` function. It deliberately does NOT
 * re-implement any arithmetic: the single source of truth for computing
 * "b percent of a" lives in `./math-engine/percentage.js`, and this layer only
 * forwards to it.
 *
 * Control / data flow:
 *   calculator-ui/app.js
 *     -> calculator-core/index.js (this module)
 *       -> require('./math-engine/percentage')   // the computation engine
 *     <- numeric result
 *   <- rendered onto the UI display
 *
 * UMD dual-export (a single file works in BOTH runtimes, with NO bundler and
 * ZERO production dependencies):
 *   - Node.js / CommonJS:
 *       const core = require('.'); // resolves the package "main" (index.js)
 *       core.percentage(200, 10);         // => 20
 *       core.calculatePercentage(50, 10); // => 5
 *     The engine is resolved via `require('./math-engine/percentage')`.
 *   - Browser <script> (no bundler):
 *       <script src="math-engine/percentage.js"></script> <!-- window.percentage -->
 *       <script src="index.js"></script>                  <!-- window.calculatorCore -->
 *       window.calculatorCore.percentage(200, 10);         // => 20
 *     The engine is read from the `window.percentage` global that the
 *     math-engine module exposes when it is loaded first.
 *
 * The exported API is an object exposing TWO interchangeable delegating
 * functions — `percentage` and `calculatePercentage` — so consumers
 * (calculator-ui, tests) may use either name.
 *
 * @module calculator-core
 * @see module:math-engine/percentage
 * @example
 * // Node.js
 * const core = require('.');
 * core.percentage(200, 10);         // => 20  (10% of 200)
 * core.calculatePercentage(50, 10); // => 5   (10% of 50)
 */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    // Node.js / CommonJS runtime: resolve the nested math-engine function via
    // `require` and build the API around it. This is the authoritative export
    // consumed by calculator-core/index.test.js and by the calculator-ui tests
    // when they require the core module under Node.
    module.exports = factory(require('./math-engine/percentage'));
  } else {
    // Browser runtime (no module system): the math-engine module must be loaded
    // FIRST via its own <script> tag, exposing the bare function as the global
    // `window.percentage` (root.percentage).
    //
    // Validate that dependency is present AND callable BEFORE building or
    // publishing the API. Failing fast here means a missing or malformed engine
    // produces an immediate, descriptive module-contract error, instead of a
    // `window.calculatorCore` that looks initialized but whose methods throw a
    // generic "percentage is not a function" TypeError only on first use — a
    // broken state that loading the engine afterwards would not repair.
    if (typeof root.percentage !== 'function') {
      throw new TypeError(
        'calculator-core: missing dependency — the math-engine `percentage` ' +
        'global was not found. Load "math-engine/percentage.js" via its own ' +
        '<script> tag (so that window.percentage is defined as a function) ' +
        'BEFORE loading "calculator-core/index.js".'
      );
    }

    // Dependency validated: build the API around the engine global and publish
    // it as `window.calculatorCore`.
    root.calculatorCore = factory(root.percentage);
  }
}(typeof self !== 'undefined' ? self : this, function (percentage) {
  'use strict';

  /**
   * Compute "b percent of a" by DELEGATING to the math-engine `percentage`
   * function. This is a thin pass-through: the arithmetic itself is owned
   * exclusively by `./math-engine/percentage.js`; this function performs no
   * computation of its own and simply forwards its arguments to the engine.
   *
   * @param {number} a - The base value.
   * @param {number} b - The percent to apply.
   * @returns {number} The engine's result for "b percent of a": `(a * b) / 100`
   *                    when both operands are of type `number`, otherwise `NaN`.
   *                    This layer performs NO validation of its own — it
   *                    forwards operands verbatim, so the engine's strict
   *                    non-number-rejection contract applies unchanged. The
   *                    calculator-ui layer separately coerces user-entered text
   *                    to numbers before calling (AAP §0.7.4).
   * @example
   * calculatePercentage(200, 10);  // => 20    (10% of 200)
   * calculatePercentage(50, 12.5); // => 6.25
   */
  function calculatePercentage(a, b) {
    return percentage(a, b);
  }

  // Public API surface. Both keys reference the SAME delegating function so
  // `core.percentage` and `core.calculatePercentage` are fully interchangeable;
  // neither performs computation locally — both call through to the engine.
  return {
    percentage: calculatePercentage,
    calculatePercentage: calculatePercentage
  };
}));
