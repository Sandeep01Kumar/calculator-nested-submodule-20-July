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
   * Only genuine `number` operands are computed. Any non-number operand — a
   * string (including a numeric string such as `'10'` and the empty string
   * `''`), `null`, `undefined`, a boolean, an array, or an object — is
   * REJECTED and the function returns `NaN` rather than being silently coerced
   * by the `*` operator. This keeps the engine's documented return contract
   * truthful and prevents malformed input from becoming a plausible-but-wrong
   * number (for example `percentage('', 20)` is `NaN`, not `0`, and
   * `percentage(true, 20)` is `NaN`, not `0.2`). A numeric `NaN` or `Infinity`
   * is `number`-typed and therefore follows ordinary IEEE-754 arithmetic.
   *
   * The engine enforces this strict rejection itself so its behavior matches
   * its documentation. The `calculator-ui` layer additionally coerces
   * user-supplied display text to numbers BEFORE calling this function, so end
   * users see a controlled value instead of `NaN` (AAP §0.7.4); that UI-level
   * coercion is a separate presentation concern and does not relax this
   * contract.
   *
   * The primary evaluation strategy is the AAP-specified expression
   * `(a * b) / 100`, which is exact for the overwhelming majority of inputs. In
   * one extreme case, however, that grouping loses a value that IS representable:
   * when the intermediate product `a * b` overflows to `±Infinity` even though
   * both operands (and the true mathematical result) are finite — e.g.
   * `percentage(Number.MAX_VALUE, 100)`, whose exact answer is `Number.MAX_VALUE`
   * itself. To avoid discarding a representable result, the function detects that
   * spurious intermediate overflow (a non-finite result from two finite operands)
   * and re-evaluates using the mathematically equivalent regrouping
   * `a * (b / 100)`, which scales `b` down first and so never forms the
   * overflowing product. A GENUINE overflow (where the true result really does
   * exceed `Number.MAX_VALUE`, e.g. `percentage(Number.MAX_VALUE, 200)`) still
   * returns `±Infinity` from both groupings, so the contract is unchanged there.
   *
   * @param {number} a - The base value.
   * @param {number} b - The percent to apply.
   * @returns {number} The result of `(a * b) / 100` when both operands are of
   *                   type `number`; otherwise `NaN`. If `(a * b) / 100` is
   *                   non-finite only because the intermediate product `a * b`
   *                   overflowed while both operands are finite, the equivalent
   *                   `a * (b / 100)` is returned instead so a representable
   *                   finite result (e.g. 100% of `Number.MAX_VALUE`) is not lost.
   * @example
   * percentage(200, 10);            // => 20    (10% of 200)
   * percentage(50, 12.5);           // => 6.25
   * percentage('', 20);             // => NaN   (non-number operand is rejected)
   * percentage(Number.MAX_VALUE, 100); // => Number.MAX_VALUE (overflow-safe)
   */
  function percentage(a, b) {
    // Strict input contract: reject any operand that is not a real `number`
    // (numeric strings, '', null, undefined, booleans, arrays, and objects are
    // all rejected) so malformed input yields NaN instead of being coerced by
    // the `*` operator into a misleading numeric result. The function stays
    // pure — same inputs always produce the same output, with no side effects.
    if (typeof a !== 'number' || typeof b !== 'number') {
      return NaN;
    }

    // Primary computation: the AAP-specified `(a * b) / 100`. This is exact for
    // ordinary inputs (including decimals such as `percentage(0.1, 20) === 0.02`),
    // so the documented formula is preserved verbatim for the common path.
    var result = (a * b) / 100;

    // Overflow-safe fallback (finding FA-ENG-1): if the primary grouping produced
    // a non-finite result even though BOTH operands are finite, the only cause is
    // that the intermediate product `a * b` overflowed to ±Infinity while the true
    // result is representable. Re-evaluate with the mathematically equivalent
    // `a * (b / 100)`, which divides first and therefore avoids forming the
    // overflowing product. A genuine overflow (true result > Number.MAX_VALUE)
    // remains ±Infinity under this grouping too, so that contract is unchanged.
    if (!Number.isFinite(result) && Number.isFinite(a) && Number.isFinite(b)) {
      return a * (b / 100);
    }

    return result;
  }

  return percentage;
}));
