# Source Map `scopes` Proposal — Interactive Examples

Interactive Chrome DevTools debugging showcase for the [TC39 / ECMA-426 Source Map Scopes Proposal](https://github.com/tc39/ecma426/blob/main/proposals/scopes.md), built with [`@chrome-devtools/source-map-scopes-codec`](https://jsr.io/@chrome-devtools/source-map-scopes-codec).

## Examples Included

1. **`01-bindings-and-expressions` (`order-pricing.ts`)**:
   - Exercises `OriginalScope` (`Module`, `Function`, `Block`), identifier renaming (`c -> customer`), constant folding (`0.085 -> TAX_RATE`, `"USD" -> CURRENCY`), multi-variable binding expressions (`d * 0.085 -> taxAmount`, `c.firstName + " " + c.lastName -> fullName`), and optimized-out variables (`null -> rawAuditToken`).
2. **`02-sub-range-bindings` (`register-reuse.ts`)**:
   - Exercises `SubRangeBinding[]` where a single generated variable `r` is overwritten across 3 phases (`calibratedMv`, `temperatureCelsius`, `statusBadge`), demonstrating variable liveness transitions and algebraic reconstruction across sub-ranges.
3. **`03-function-inlining` (`inlining.ts`)**:
   - Exercises 3-level nested function inlining (`processCustomerOrder -> calculateCartTotal -> computeTierDiscount -> clampPercentage`) with `callSite` positions and `isStackFrame: false`, expanding a single physical JS frame into 4 navigable call frames in Chrome DevTools.
4. **`04-closures-and-hidden-ranges` (`closures-hidden.ts`)**:
   - Exercises `Class` and `Closure` scopes where captured variables are packed into a heap tuple (`_c[0..3]`) and invoked via an internal compiler wrapper marked with `isHidden: true`.

## Local Development (Deno)

```bash
# Build the static site into ./dist
deno task build

# Run unit and round-trip codec tests
deno task test

# Build and serve locally on http://localhost:8080
deno task serve
```
