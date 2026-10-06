import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
import { availableFrom } from "../lib/bindings.ts";
import { TextLocator } from "../lib/locator.ts";
import type { ExampleDefinition, MappingPoint } from "../lib/sourcemap.ts";

const originalSource = `// Authored TypeScript: multi-callsite.ts
function toCents(amount: number, currency: string): number {
  const rate = currency === "GBP" ? 1.25 : 1;
  const cents = Math.round(amount * rate * 100);
  return cents;
}

export function compareOffers(
  priceA: number,
  currencyA: string,
  priceB: number,
  currencyB: string,
) {
  const centsA = toCents(priceA, currencyA);
  const centsB = toCents(priceB, currencyB);
  return { centsA, centsB, cheaper: centsA <= centsB ? "A" : "B" };
}
`;

const generatedCode = `function compareOffers(a, x, b, y) {
  const r1 = x === "GBP" ? 1.25 : 1;
  const c1 = Math.round(a * r1 * 100);
  const r2 = y === "GBP" ? 1.25 : 1;
  const c2 = Math.round(b * r2 * 100);
  return { centsA: c1, centsB: c2, cheaper: c1 <= c2 ? "A" : "B" };
}
window.runExample07 = function() {
  return compareOffers(20, "GBP", 24.5, "USD");
};
//# sourceMappingURL=bundle.js.map
`;

const builderCodeSnippet = `const builder = new SafeScopeInfoBuilder();

// 1. Original Scopes (abbreviated: positions come from TextLocator).
builder
  .startSource()
  .startScope(0, 0, { kind: "Module", key: "module", variables: ["toCents", "compareOffers"] })
  .startScope(..., { name: "toCents", kind: "Function", isStackFrame: true, key: "toCents",
                     variables: ["amount", "currency", "rate", "cents"] }).endScope(...)
  .startScope(..., { name: "compareOffers", kind: "Function", isStackFrame: true, key: "compareOffers",
                     variables: ["priceA", "currencyA", "priceB", "currencyB", "centsA", "centsB"] })
  .endScope(...)
  .endScope(...)
  .endSource();

// 2. Generated Ranges: TWO inlined ranges reference the SAME "toCents" scope,
//    each with its own callSite and its own bindings.
builder
  .startRange(0, 0, { scopeKey: "module", values: [null, "compareOffers"] })
  .startRange(..., { scopeKey: "compareOffers", isStackFrame: true, values: [
    "a", "x", "b", "y",
    availableFrom(start, afterC1, end, "c1"),
    availableFrom(start, afterC2, end, "c2"),
  ] })
    // const r1 = ...; const c1 = ...;
    .startRange(..., { scopeKey: "toCents", callSite: toCentsA,
                       values: ["a", "x", availableFrom(start, afterR1, end, "r1"), null] })
    .endRange(...)
    // const r2 = ...; const c2 = ...;
    .startRange(..., { scopeKey: "toCents", callSite: toCentsB,
                       values: ["b", "y", availableFrom(start, afterR2, end, "r2"), null] })
    .endRange(...)
  .endRange(...)
  // window.runExample07: generated-only glue.
  .startRange(..., { isStackFrame: true }).endRange(...)
  .endRange(...);

// Note: 'cents' is null in both copies: c1/c2 are only assigned by the last
// statement of each inlined range.`;

export function createExample07(): ExampleDefinition {
  const orig = new TextLocator(originalSource);
  const gen = new TextLocator(generatedCode);

  const toCentsStart = orig.at("(amount: number, currency: string): number {");
  const toCentsEnd = orig.after("  return cents;\n}");
  const compareStart = orig.at("(\n  priceA: number,");
  const compareEnd = orig.after('cheaper: centsA <= centsB ? "A" : "B" };\n}');
  const toCentsA = orig.origAt("toCents(priceA, currencyA)");
  const toCentsB = orig.origAt("toCents(priceB, currencyB)");

  const genCompareStart = gen.at("(a, x, b, y) {");
  const genCompareEnd = gen.after('cheaper: c1 <= c2 ? "A" : "B" };\n}');
  const inlinedAStart = gen.at("const r1 =");
  const inlinedAEnd = gen.after("const c1 = Math.round(a * r1 * 100);");
  const inlinedBStart = gen.at("const r2 =");
  const inlinedBEnd = gen.after("const c2 = Math.round(b * r2 * 100);");
  const afterR1 = gen.after('const r1 = x === "GBP" ? 1.25 : 1;');
  const afterR2 = gen.after('const r2 = y === "GBP" ? 1.25 : 1;');
  const genRunStart = gen.at("() {\n  return compareOffers(");
  const genRunEnd = gen.after('  return compareOffers(20, "GBP", 24.5, "USD");\n}');

  const builder = new SafeScopeInfoBuilder();

  builder
    .startSource()
    .startScope(0, 0, {
      kind: "Module",
      key: "module",
      variables: ["toCents", "compareOffers"],
    })
    .startScope(toCentsStart.line, toCentsStart.column, {
      name: "toCents",
      kind: "Function",
      isStackFrame: true,
      key: "toCents",
      variables: ["amount", "currency", "rate", "cents"],
    })
    .endScope(toCentsEnd.line, toCentsEnd.column)
    .startScope(compareStart.line, compareStart.column, {
      name: "compareOffers",
      kind: "Function",
      isStackFrame: true,
      key: "compareOffers",
      variables: ["priceA", "currencyA", "priceB", "currencyB", "centsA", "centsB"],
    })
    .endScope(compareEnd.line, compareEnd.column)
    .endScope(orig.end().line, orig.end().column)
    .endSource();

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: [null, "compareOffers"],
    })
    .startRange(genCompareStart.line, genCompareStart.column, {
      scopeKey: "compareOffers",
      isStackFrame: true,
      values: [
        "a",
        "x",
        "b",
        "y",
        availableFrom(genCompareStart, inlinedAEnd, genCompareEnd, "c1"),
        availableFrom(genCompareStart, inlinedBEnd, genCompareEnd, "c2"),
      ],
    })
    .startRange(inlinedAStart.line, inlinedAStart.column, {
      scopeKey: "toCents",
      callSite: toCentsA,
      values: [
        "a",
        "x",
        availableFrom(inlinedAStart, afterR1, inlinedAEnd, "r1"),
        // cents: 'c1' is only assigned by the last statement of this range.
        null,
      ],
    })
    .endRange(inlinedAEnd.line, inlinedAEnd.column)
    .startRange(inlinedBStart.line, inlinedBStart.column, {
      scopeKey: "toCents",
      callSite: toCentsB,
      values: [
        "b",
        "y",
        availableFrom(inlinedBStart, afterR2, inlinedBEnd, "r2"),
        null,
      ],
    })
    .endRange(inlinedBEnd.line, inlinedBEnd.column)
    .endRange(genCompareEnd.line, genCompareEnd.column)
    .startRange(genRunStart.line, genRunStart.column, { isStackFrame: true })
    .endRange(genRunEnd.line, genRunEnd.column)
    .endRange(gen.end().line, gen.end().column);

  // Both inlined copies map to the same authored lines in toCents.
  const mappings: MappingPoint[] = [
    {
      gen: gen.at("function compareOffers"),
      orig: orig.at("export function compareOffers"),
      name: "compareOffers",
    },
    {
      gen: gen.at("const r1 ="),
      orig: orig.at("const rate ="),
      name: "rate",
    },
    {
      gen: gen.at("const c1 ="),
      orig: orig.at("const cents ="),
      name: "cents",
    },
    {
      gen: gen.at("const r2 ="),
      orig: orig.at("const rate ="),
      name: "rate",
    },
    {
      gen: gen.at("const c2 ="),
      orig: orig.at("const cents ="),
      name: "cents",
    },
    {
      gen: gen.at("return { centsA: c1"),
      orig: orig.at("return { centsA, centsB"),
    },
  ];

  // 1-based line numbers in multi-callsite.ts, for walkthrough text.
  const L = (needle: string) => orig.lineNumber(needle);
  const lCents = L("const cents =");
  const lRate = L("const rate =");
  const lCallA = L("const centsA =");
  const lCallB = L("const centsB =");

  return {
    id: "07-multiple-call-sites",
    number: "07",
    title: "One Function Inlined at Two Call Sites",
    shortTitle: "Multiple Call Sites",
    subtitle:
      "toCents() is inlined twice into compareOffers(). One authored breakpoint must resolve to both copies, each with its own call site and values.",
    proposalFeatures: [
      "Two Inlined Ranges Sharing One OriginalScope",
      "Distinct callSite per Inlined Copy",
      "Per-Copy Bindings",
    ],
    devtoolsFeatures: [
      "Breakpoints Resolving to Multiple Generated Locations",
      "Conditional Breakpoints & Logpoints in Inlined Code",
      "Per-Copy Call Stack & Scope",
    ],
    originalFileName: "multi-callsite.ts",
    originalSource,
    generatedCode,
    builderCodeSnippet,
    scopeInfo: builder.build(),
    mappings,
    overviewHtml: `
      <p>
        The compiler inlined <code>toCents</code> at both of its call sites, so every line of <code>toCents</code> exists <strong>twice</strong> in <code>bundle.js</code>. Both generated ranges reference the same <code>toCents</code> original scope, but each has its own <code>callSite</code> and binds the parameters to different generated variables.
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Call Stack",
        title: "1. One breakpoint, two inlined copies",
        tryPrompt:
          `Set a breakpoint on line ${lCents} (\`const cents = ...\`) of \`multi-callsite.ts\` and click **Run compareOffers()**. Resume (\`F8\`) after the first pause.`,
        checkPoints: [
          `**Pauses twice.** 1st: \`toCents\` → \`compareOffers\` (line ${lCallA}). 2nd: \`toCents\` → \`compareOffers\` (line ${lCallB}).`,
          '**Scope:** 1st `amount: 20`, `currency: "GBP"`, `rate: 1.25`. 2nd `amount: 24.5`, `currency: "USD"`, `rate: 1`. `cents` is `<unavailable>` both times.',
          "**At the 2nd pause, select `compareOffers`:** `centsA: 2500`, `centsB` `<unavailable>`.",
          "**Breakpoints pane:** a single breakpoint entry, not one per copy.",
        ],
      },
      {
        featureTag: "Conditional Breakpoints",
        title: "2. Conditional breakpoint & logpoint",
        tryPrompt:
          `Edit the breakpoint to the condition \`currency === "USD"\` and re-run. Then turn it into a logpoint \`amount, currency, rate\` and re-run.`,
        checkPoints: [
          "**Condition:** pauses only once, in the 2nd copy (`amount: 24.5`).",
          "**Logpoint:** the Console logs two lines, one per copy: `20`, `GBP`, `1.25` and `24.5`, `USD`, `1`.",
        ],
      },
    ],
    evalExpressions: [
      {
        expression: "amount * rate",
        expectedResult: "25 (1st pause), 24.5 (2nd pause)",
        explanation: "Same expression, different generated variables (`a * r1` vs. `b * r2`).",
      },
      {
        expression: "priceA + priceB",
        expectedResult: "44.5",
        explanation: "With `compareOffers` selected in the Call Stack.",
      },
    ],
    runFunctionName: "runExample07",
    runButtonLabel: "Run compareOffers()",
    otherThingsToTry: [
      "From the 1st pause, press `F10` or `Shift+F11`. `compareOffers` has no code of its own between the two copies: where should you land?",
      `Also set a breakpoint on line ${lRate} (\`const rate = ...\`): it should hit in both copies, too.`,
      "Disable and re-enable the breakpoint from the Breakpoints pane, or reload the page with the breakpoint set.",
    ],
  };
}
