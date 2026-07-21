/**
 * math-engine/percentage — percentage computation (single source of truth).
 *
 * Computes "b percent of a":  percentage(a, b) = (a * b) / 100
 *
 * This module is the innermost computation layer of the calculator
 * (parent → calculator-core/ → nested math-engine/). It follows the
 * one-function-per-file CommonJS convention and adds a UMD-style dual-export
 * guard so the SAME file works, with NO bundler and ZERO dependencies, under:
 *   - Node.js / CommonJS:  const percentage = require('./percentage');
 *   - Browser <script>:    exposes the function as the global `window.percentage`.
 *
 * The value exported/exposed is the BARE FUNCTION (not an object), because the
 * sibling `calculator-core/index.js` consumes it directly:
 *   - Node:    module.exports = factory(require('./math-engine/percentage'))
 *   - Browser: root.calculatorCore = factory(root.percentage)
 *
 * Both consumer paths call the imported/global value straight away as a
 * function, so the export must remain a bare function named exactly
 * `percentage`. Do not wrap it in an object and do not rename the browser
 * global without coordinating with the `calculator-core/index.js` consumer.
 *
 * @module math-engine/percentage
 */
(function (root, factory) {
  'use strict';

  // Build the bare function once, then attach it to whichever module system(s)
  // are present in the current runtime.
  var percentage = factory();

  // Node.js / CommonJS: export the bare function (used by percentage.test.js
  // and by calculator-core/index.js). This is the authoritative Node export.
  if (typeof module === 'object' && module.exports) {
    module.exports = percentage;
  }

  // Browser / any global object: expose the bare function as the global
  // `percentage` (i.e. window.percentage). The `if (root)` guard keeps this
  // harmless under Node — where `root` resolves to the module's initial
  // `this` (the module.exports object) — and avoids ever referencing a bare
  // `window` identifier that would throw a ReferenceError outside a browser.
  if (root) {
    root.percentage = percentage;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Compute b percent of a.
   *
   * @param {number} a - The base value.
   * @param {number} b - The percent to apply.
   * @returns {number} The result of (a * b) / 100. Non-numeric inputs yield NaN
   *                   (numeric coercion/validation is intentionally handled at
   *                   the UI layer per the project's input-hygiene decision).
   * @example
   * percentage(200, 10); // => 20    (10% of 200)
   * percentage(50, 12.5); // => 6.25
   */
  function percentage(a, b) {
    return (a * b) / 100;
  }

  return percentage;
}));
