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
   - Exercises nested `Closure` scopes where captured variables are packed into a heap tuple (`_c[0..3]`) and invoked via an internal compiler wrapper marked with `isHidden: true`.
5. **`05-logical-stepping` (`stepping.ts`)**:
   - Exercises scope-aware **Logical Stepping** (`Step Over`, `Step Into`, `Step Out`) across a multi-statement inlined helper (`calculateCustomsDuty`), an outlined transpiled block (`_outlinedCustomsBlock` with `isStackFrame: true, isHidden: true` + `OriginalScope`), and pure compiler helpers (`__checkPositive`, `__openClearance` with `isStackFrame: true` and no `OriginalScope`).
6. **`06-error-stack-traces` (`errors.ts`)**:
   - Exercises symbolized `Error.stack` traces (caught + `console.error`, uncaught from a timer, pause on exceptions) for an error thrown from inlined code inside an outlined block, called through a runtime helper without `OriginalScope`, from a caller that has the outlined block's owner inlined.
7. **`07-multiple-call-sites` (`multi-callsite.ts`)**:
   - Exercises a function inlined at two call sites: two inlined ranges share one `OriginalScope` with distinct `callSite`s and bindings, so one authored breakpoint (incl. conditional breakpoints and logpoints) must resolve to both copies.
8. **`08-webassembly` (`image-filter.cpp` → `image-filter.wasm`)** *(experimental)*:
   - Applies `scopes` to a hand-assembled WebAssembly module (built with [`src/lib/wasm.ts`](src/lib/wasm.ts)). Positions are `line 0, column = module byte offset`. Binding expressions are plain JS that V8 evaluates on the wasm frame using its wasm debug proxy (`$var0.value`, `memories[0]`, `stack[0].value`, `$_Z11adjustPixeliii`). Combines the features of the other examples: inlining with 2 call sites, a reused wasm local (`SubRangeBinding[]`), structs decoded from linear memory, nested `Block` scopes, a hidden Emscripten `legalstub$`, and a symbolized wasm trap (`divide by zero`).

## Local Development (Deno)

```bash
# Build the static site into ./dist
deno task build

# Run unit and round-trip codec tests
deno task test

# Build and serve locally on http://localhost:8080
deno task serve
```
