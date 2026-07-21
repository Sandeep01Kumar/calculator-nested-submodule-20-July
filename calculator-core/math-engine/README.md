# math-engine

The **computation layer** of the calculator — the innermost module in the
nested-submodule topology (parent → `calculator-core/` → nested `math-engine/`).

This module holds pure arithmetic functions that follow a strict
**one-function-per-file, CommonJS** convention: each file defines a single
function and exports it via `module.exports`. For the percentage feature it
provides exactly one function, **`percentage(a, b)`**, which is the *single
source of truth* for the percentage computation. The sibling
`calculator-core` module does not re-implement the math — it is a thin
delegation layer that simply forwards to this function (see
[Documentation & Scope](#documentation--scope)).

---

## Function / API

### `percentage(a, b)`

Computes **"b percent of a"**:

```text
percentage(a, b) = (a * b) / 100
```

The function is a pure, stateless, constant-time calculation with no I/O. It is
implemented as a **binary** function so its signature matches the calculator's
other binary operations.

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `a` | `number` | The base value. |
| `b` | `number` | The percent to apply. |
| **returns** | `number` | The result of `(a * b) / 100`. |

> **Input hygiene.** The engine **strictly rejects non-number operands**: if
> either argument is not of type `number` — a string (including a numeric
> string like `'10'` or the empty string `''`), `null`, `undefined`, a boolean,
> an array, or an object — the function returns **`NaN`** rather than coercing
> the value. Valid numbers are computed exactly as `(a * b) / 100`. The
> `calculator-ui` layer *additionally* coerces user-entered display text to
> numbers **before** calling, so end users see a controlled value instead of
> `NaN` (a presentation concern, AAP §0.7.4); that UI coercion does not relax
> the engine's own contract.

#### Export shape

The value exported/exposed is the **bare function** (not an object), named
exactly `percentage`. Both consumption modes below hand you that same function
directly.

#### Node.js / CommonJS usage

Under Node, `require` returns the bare function:

```js
const percentage = require('./percentage');

percentage(200, 10);  // => 20    (10% of 200)
percentage(50, 12.5); // => 6.25
```

#### Browser `<script>` usage

Including the file from a plain `<script>` tag exposes the bare function as the
global **`window.percentage`** (the global name is exactly `percentage`):

```html
<script src="percentage.js"></script>
<script>
  window.percentage(200, 10); // => 20
</script>
```

This dual-export (UMD-style) guard lets the **same file** work under both
runtimes with **no bundler and zero dependencies**. The sibling
`calculator-core` consumes `percentage` through whichever path applies:

- **Node:** `require('./math-engine/percentage')`
- **Browser:** the `window.percentage` global

---

## Build & Test

### Prerequisites

- **Node.js** — Jest 30 supports `^18.14.0 || ^20.0.0 || ^22.0.0 || >=24.0.0`; verified on **Node 22.x**.

### Commands

Run the module's tests from its own directory (`calculator-core/math-engine`):

```bash
npm install   # installs jest ^30.4.2 (devDependency)
npm test      # runs jest -> executes percentage.test.js (default Node env)
```

> From the parent repository root, run it in a subshell so the `cd` does not
> persist: `(cd calculator-core/math-engine && npm install && npm test)`.

`npm test` invokes `jest`, which discovers and runs the module's `*.test.js`
files. This module uses the **default Node test environment** (not jsdom), since
the computation has no DOM dependency.

### Test coverage

`percentage.test.js` exercises the function across representative cases:

- **typical** values (e.g. `percentage(200, 10) === 20`),
- **zero** (e.g. `percentage(100, 0) === 0`),
- **negative** operands (e.g. `percentage(-80, 25) === -20`),
- **decimal** operands (e.g. `percentage(50, 12.5) === 6.25`), and
- **non-number** operands — including *coercible* values such as `'10'`, `''`,
  `null`, booleans, and arrays — each of which is rejected and yields `NaN`.

---

## Documentation & Scope

This nested submodule is a **first-class part of the project**. It carries this
`README.md` and its source is annotated with **JSDoc** — no submodule is skipped
or excluded from the documentation.

Its position in the architecture is the innermost computation layer:

```text
parent repository
└── calculator-core/        (API layer — thin delegation)
    └── math-engine/        (computation layer — this module)
        └── percentage.js   percentage(a, b) = (a * b) / 100
```

Because `calculator-core` delegates to this function rather than duplicating the
math, `percentage.js` is the **single source of truth** for the percentage
computation: anyone changing the percentage math changes this one file.

---

## License

Released under the **MIT License**, consistent with the `license` field declared
in this module's `package.json`.
