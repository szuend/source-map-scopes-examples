import type {
  Position,
  SubRangeBinding,
} from "@chrome-devtools/source-map-scopes-codec";

/**
 * Builds a `SubRangeBinding[]` for a variable that only becomes available
 * part-way through a generated range, e.g. because the generated `let`/`const`
 * it is bound to is still in its temporal dead zone (TDZ) before `from`.
 *
 *   [rangeStart, from)  -> unavailable
 *   [from, rangeEnd)    -> `value`
 *
 * Without this, DevTools would evaluate the binding expression while the
 * generated variable is uninitialized and get a ReferenceError.
 */
export function availableFrom(
  rangeStart: Position,
  from: Position,
  rangeEnd: Position,
  value: string,
): SubRangeBinding[] {
  return [
    { from: rangeStart, to: from },
    { from, to: rangeEnd, value },
  ];
}
