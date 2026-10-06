import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
import { availableFrom } from "../lib/bindings.ts";
import { TextLocator } from "../lib/locator.ts";
import type { ExampleDefinition, MappingPoint } from "../lib/sourcemap.ts";

const originalSource = `// Authored TypeScript: inlining.ts

function clampPercentage(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  debugger; // Pause inside 3-level inlined call stack!
  return clamped;
}

function computeTierDiscount(baseAmount: number, loyaltyYears: number): number {
  const rawPercent = loyaltyYears * 4;
  const effectivePercent = clampPercentage(rawPercent, 5, 25);
  return baseAmount * (effectivePercent / 100);
}

function calculateCartTotal(
  subtotal: number,
  loyaltyYears: number,
  couponFixed: number,
): number {
  const discountAmount = computeTierDiscount(subtotal, loyaltyYears);
  const finalTotal = Math.max(0, subtotal - discountAmount - couponFixed);
  return finalTotal;
}

export function processCustomerOrder(
  customerName: string,
  subtotal: number,
  loyaltyYears: number,
) {
  const payable = calculateCartTotal(subtotal, loyaltyYears, 15);
  return {
    customer: customerName,
    originalSubtotal: subtotal,
    payableTotal: Number(payable.toFixed(2)),
  };
}
`;

const generatedCode = `function processCustomerOrder(n, s, y, pause) {
  // Begin inlined calculateCartTotal -> computeTierDiscount -> clampPercentage
  const pct = Math.min(25, Math.max(5, y * 4));
  if (pause !== false) {
    debugger;
  } else {
    const err = new Error("Diagnostic trace from inlined clampPercentage()");
    console.error(err);
  }
  const d = s * (pct / 100);
  const p = Math.max(0, s - d - 15);
  // End inlined call chain
  return { customer: n, originalSubtotal: s, payableTotal: Number(p.toFixed(2)) };
}
window.runExample03 = function() {
  return processCustomerOrder("Grace Hopper", 240, 8, true);
};
window.logStackExample03 = function() {
  const res = processCustomerOrder("Grace Hopper", 240, 8, false);
  return "Logged Error from inlined clampPercentage() to DevTools Console! Result: " + JSON.stringify(res);
};
//# sourceMappingURL=bundle.js.map
`;

const builderCodeSnippet = `const builder = new SafeScopeInfoBuilder();

// 1. Original Scopes: 4 distinct functions in inlining.ts
builder
  .startSource()
  .startScope(0, 0, {
    kind: "Module",
    key: "module",
    variables: [
      "clampPercentage",
      "computeTierDiscount",
      "calculateCartTotal",
      "processCustomerOrder",
    ],
  })
  .startScope(clampStart.line, clampStart.column, {
    name: "clampPercentage",
    kind: "Function",
    isStackFrame: true,
    key: "clampPercentage",
    variables: ["value", "min", "max", "clamped"],
  })
  .endScope(clampEnd.line, clampEnd.column)
  .startScope(tierStart.line, tierStart.column, {
    name: "computeTierDiscount",
    kind: "Function",
    isStackFrame: true,
    key: "computeTierDiscount",
    variables: ["baseAmount", "loyaltyYears", "rawPercent", "effectivePercent"],
  })
  .endScope(tierEnd.line, tierEnd.column)
  .startScope(cartStart.line, cartStart.column, {
    name: "calculateCartTotal",
    kind: "Function",
    isStackFrame: true,
    key: "calculateCartTotal",
    variables: ["subtotal", "loyaltyYears", "couponFixed", "discountAmount", "finalTotal"],
  })
  .endScope(cartEnd.line, cartEnd.column)
  .startScope(orderStart.line, orderStart.column, {
    name: "processCustomerOrder",
    kind: "Function",
    isStackFrame: true,
    key: "processCustomerOrder",
    variables: ["customerName", "subtotal", "loyaltyYears", "payable"],
  })
  .endScope(orderEnd.line, orderEnd.column)
  .endScope(moduleEnd.line, moduleEnd.column)
  .endSource();

// 2. Generated Ranges: 3 nested inlined ranges (isStackFrame: false + callSite)
//    inside the single physical function processCustomerOrder (isStackFrame: true)
// availableFrom(start, from, end, value) = unavailable in [start, from), bound to value in [from, end).
// Used for generated const (pct, d, p) that are still in their TDZ before their declaration ran.
builder
  .startRange(0, 0, {
    scopeKey: "module",
    values: [null, null, null, "processCustomerOrder"],
  })
  .startRange(genOrderStart.line, genOrderStart.column, {
    scopeKey: "processCustomerOrder",
    isStackFrame: true,
    values: ["n", "s", "y", availableFrom(genOrderStart, afterP, genOrderEnd, "p")],
  })
  .startRange(genCartStart.line, genCartStart.column, {
    scopeKey: "calculateCartTotal",
    isStackFrame: false,
    callSite: callSiteCalculateCartTotal, // calculateCartTotal(...) in processCustomerOrder
    values: [
      "s",
      "y",
      "15",
      availableFrom(genCartStart, afterD, genCartEnd, "d"), // discountAmount
      null, // finalTotal: 'p' is only assigned by the very last statement of this range
    ],
  })
  .startRange(genTierStart.line, genTierStart.column, {
    scopeKey: "computeTierDiscount",
    isStackFrame: false,
    callSite: callSiteComputeTierDiscount, // computeTierDiscount(...) in calculateCartTotal
    values: ["s", "y", "y * 4", availableFrom(genTierStart, afterPct, genTierEnd, "pct")],
  })
  .startRange(genClampStart.line, genClampStart.column, {
    scopeKey: "clampPercentage",
    isStackFrame: false,
    callSite: callSiteClampPercentage, // clampPercentage(...) in computeTierDiscount
    values: ["y * 4", "5", "25", availableFrom(genClampStart, afterPct, genClampEnd, "pct")],
  })
  .endRange(genClampEnd.line, genClampEnd.column)
  .endRange(genTierEnd.line, genTierEnd.column)
  .endRange(genCartEnd.line, genCartEnd.column)
  .endRange(genOrderEnd.line, genOrderEnd.column)
  // Generated-only entry helpers without corresponding authored code:
  .startRange(genRunStart.line, genRunStart.column, {
    isStackFrame: true,
  })
  .endRange(genRunEnd.line, genRunEnd.column)
  .startRange(genLogStart.line, genLogStart.column, {
    isStackFrame: true,
  })
  .endRange(genLogEnd.line, genLogEnd.column)
  .endRange(genModuleEnd.line, genModuleEnd.column);`;

export function createExample03(): ExampleDefinition {
  const orig = new TextLocator(originalSource);
  const gen = new TextLocator(generatedCode);

  const origModuleEnd = orig.end();
  const clampStart = orig.at("(value: number, min: number, max: number)");
  const clampEnd = orig.after("  return clamped;\n}");

  const tierStart = orig.at("(baseAmount: number, loyaltyYears: number)");
  const tierEnd = orig.after("  return baseAmount * (effectivePercent / 100);\n}");

  const cartStart = orig.at("(\n  subtotal: number,\n  loyaltyYears: number,\n  couponFixed: number,");
  const cartEnd = orig.after("  return finalTotal;\n}");

  const orderStart = orig.at("(\n  customerName: string,\n  subtotal: number,\n  loyaltyYears: number,");
  const orderEnd = orig.after("    payableTotal: Number(payable.toFixed(2)),\n  };\n}");

  const callSiteClampPercentage = orig.origAt("clampPercentage(rawPercent, 5, 25)");
  const callSiteComputeTierDiscount = orig.origAt("computeTierDiscount(subtotal, loyaltyYears)");
  const callSiteCalculateCartTotal = orig.origAt("calculateCartTotal(subtotal, loyaltyYears, 15)");

  const genModuleEnd = gen.end();
  const genOrderStart = gen.at("(n, s, y, pause) {");
  const genOrderEnd = gen.after("payableTotal: Number(p.toFixed(2)) };\n}");

  const genCartStart = gen.at("const pct = Math.min(25, Math.max(5, y * 4));");
  const genClampStart = genCartStart;
  const genTierStart = genCartStart;

  const genClampEnd = gen.after("    console.error(err);\n  }");
  const genTierEnd = gen.after("const d = s * (pct / 100);");
  const genCartEnd = gen.after("const p = Math.max(0, s - d - 15);");

  // TDZ boundaries: generated const become readable after their declaration ran.
  const afterPct = gen.after("const pct = Math.min(25, Math.max(5, y * 4));");
  const afterD = genTierEnd;
  const afterP = genCartEnd;

  const genRunStart = gen.at('() {\n  return processCustomerOrder("Grace Hopper", 240, 8, true);');
  const genRunEnd = gen.after('return processCustomerOrder("Grace Hopper", 240, 8, true);\n}');
  const genLogStart = gen.at('() {\n  const res = processCustomerOrder("Grace Hopper", 240, 8, false);');
  const genLogEnd = gen.after("JSON.stringify(res);\n}");

  const builder = new SafeScopeInfoBuilder();

  builder
    .startSource()
    .startScope(0, 0, {
      kind: "Module",
      key: "module",
      variables: [
        "clampPercentage",
        "computeTierDiscount",
        "calculateCartTotal",
        "processCustomerOrder",
      ],
    })
    .startScope(clampStart.line, clampStart.column, {
      name: "clampPercentage",
      kind: "Function",
      isStackFrame: true,
      key: "clampPercentage",
      variables: ["value", "min", "max", "clamped"],
    })
    .endScope(clampEnd.line, clampEnd.column)
    .startScope(tierStart.line, tierStart.column, {
      name: "computeTierDiscount",
      kind: "Function",
      isStackFrame: true,
      key: "computeTierDiscount",
      variables: ["baseAmount", "loyaltyYears", "rawPercent", "effectivePercent"],
    })
    .endScope(tierEnd.line, tierEnd.column)
    .startScope(cartStart.line, cartStart.column, {
      name: "calculateCartTotal",
      kind: "Function",
      isStackFrame: true,
      key: "calculateCartTotal",
      variables: [
        "subtotal",
        "loyaltyYears",
        "couponFixed",
        "discountAmount",
        "finalTotal",
      ],
    })
    .endScope(cartEnd.line, cartEnd.column)
    .startScope(orderStart.line, orderStart.column, {
      name: "processCustomerOrder",
      kind: "Function",
      isStackFrame: true,
      key: "processCustomerOrder",
      variables: ["customerName", "subtotal", "loyaltyYears", "payable"],
    })
    .endScope(orderEnd.line, orderEnd.column)
    .endScope(origModuleEnd.line, origModuleEnd.column)
    .endSource();

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: [null, null, null, "processCustomerOrder"],
    })
    .startRange(genOrderStart.line, genOrderStart.column, {
      scopeKey: "processCustomerOrder",
      isStackFrame: true,
      values: [
        "n",
        "s",
        "y",
        availableFrom(genOrderStart, afterP, genOrderEnd, "p"),
      ],
    })
    .startRange(genCartStart.line, genCartStart.column, {
      scopeKey: "calculateCartTotal",
      isStackFrame: false,
      callSite: callSiteCalculateCartTotal,
      values: [
        "s",
        "y",
        "15",
        availableFrom(genCartStart, afterD, genCartEnd, "d"),
        // finalTotal: 'p' is only assigned by the very last statement of this range.
        null,
      ],
    })
    .startRange(genTierStart.line, genTierStart.column, {
      scopeKey: "computeTierDiscount",
      isStackFrame: false,
      callSite: callSiteComputeTierDiscount,
      values: [
        "s",
        "y",
        "y * 4",
        availableFrom(genTierStart, afterPct, genTierEnd, "pct"),
      ],
    })
    .startRange(genClampStart.line, genClampStart.column, {
      scopeKey: "clampPercentage",
      isStackFrame: false,
      callSite: callSiteClampPercentage,
      values: [
        "y * 4",
        "5",
        "25",
        availableFrom(genClampStart, afterPct, genClampEnd, "pct"),
      ],
    })
    .endRange(genClampEnd.line, genClampEnd.column)
    .endRange(genTierEnd.line, genTierEnd.column)
    .endRange(genCartEnd.line, genCartEnd.column)
    .endRange(genOrderEnd.line, genOrderEnd.column)
    .startRange(genRunStart.line, genRunStart.column, {
      isStackFrame: true,
    })
    .endRange(genRunEnd.line, genRunEnd.column)
    .startRange(genLogStart.line, genLogStart.column, {
      isStackFrame: true,
    })
    .endRange(genLogEnd.line, genLogEnd.column)
    .endRange(genModuleEnd.line, genModuleEnd.column);

  const mappings: MappingPoint[] = [
    {
      gen: gen.at("function processCustomerOrder"),
      orig: orig.at("export function processCustomerOrder"),
      name: "processCustomerOrder",
    },
    {
      gen: gen.at("n, s, y"),
      orig: orig.at("customerName: string"),
      name: "customerName",
    },
    {
      gen: gen.at("const pct = Math.min(25, Math.max(5, y * 4));"),
      orig: orig.at("const clamped = Math.min(max, Math.max(min, value));"),
      name: "clamped",
    },
    {
      gen: gen.at("debugger;"),
      orig: orig.at("debugger; // Pause inside 3-level inlined call stack!"),
    },
    {
      gen: gen.at('const err = new Error("Diagnostic trace from inlined clampPercentage()");'),
      orig: orig.at("debugger; // Pause inside 3-level inlined call stack!"),
    },
    {
      gen: gen.at("console.error(err);"),
      orig: orig.at("return clamped;"),
    },
    {
      gen: gen.at("const d = s * (pct / 100);"),
      orig: orig.at("return baseAmount * (effectivePercent / 100);"),
    },
    {
      gen: gen.at("const p = Math.max(0, s - d - 15);"),
      orig: orig.at(
        "const finalTotal = Math.max(0, subtotal - discountAmount - couponFixed);",
      ),
      name: "finalTotal",
    },
    {
      gen: gen.at("return { customer: n"),
      orig: orig.at("return {\n    customer: customerName"),
    },
  ];

  return {
    id: "03-function-inlining",
    number: "03",
    title: "Multi-Level Function Inlining & Virtual Call Stacks",
    shortTitle: "Function Inlining",
    subtitle:
      "Expand a single physical V8 stack frame into 4 authored call frames with per-frame scopes, call sites, and Debug Evaluate.",
    proposalFeatures: [
      "Multi-Level Inlined Ranges (processCustomerOrder -> calculateCartTotal -> computeTierDiscount -> clampPercentage)",
      "Call-Site Positions (callSite: { sourceIndex, line, column })",
      "isStackFrame: true (OriginalScope) vs isStackFrame: false (Inlined GeneratedRange)",
      "Inlined Argument & Parameter Expression Bindings (value -> y * 4, min -> 5, max -> 25)",
    ],
    devtoolsFeatures: [
      "Virtual Call Stack Frame Reconstruction",
      "Per-Frame Call-Site Highlighting in Editor",
      "Per-Frame Autocomplete & Inlined Conditional Breakpoints",
      "Frame-Sensitive Scope Sidebar & Console Debug Evaluate",
    ],
    originalFileName: "inlining.ts",
    originalSource,
    generatedCode,
    builderCodeSnippet,
    scopeInfo: builder.build(),
    mappings,
    overviewHtml: `
      <p>
        Modern bundlers and compilers aggressively inline small helper functions. Here, <code>processCustomerOrder</code> calls <code>calculateCartTotal</code>, which calls <code>computeTierDiscount</code>, which calls <code>clampPercentage</code>. In <code>bundle.js</code>, all three helpers are completely inlined into <code>processCustomerOrder(n, s, y)</code>.
      </p>
      <p>
        By nesting three <code>GeneratedRange</code> entries with <code>isStackFrame: false</code> and <code>callSite</code> coordinates inside <code>processCustomerOrder</code>'s range, Chrome DevTools synthesizes the full 4-frame <strong>Call Stack</strong>. Clicking any inlined frame in the Call Stack pane switches the editor to that caller's call site and updates the <strong>Scope</strong> view, <strong>Autocomplete suggestions</strong>, and <strong>Console Debug Evaluate</strong> to that frame's lexical variables!
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Call Stack",
        title: "Inspect the 4-Frame Virtual Call Stack",
        tryPrompt:
          `Click **"Run & Pause in Debugger"** to pause at \`debugger;\` on line ${orig.lineNumber("debugger;")} of \`inlining.ts\` (\`clampPercentage\`).`,
        checkPoints: [
          `**4 Virtual Frames from 1 Physical Frame:** Even though only \`processCustomerOrder\` exists in \`bundle.js\`, the Call Stack pane shows \`clampPercentage\` (line ${orig.lineNumber("debugger;")}) &rarr; \`computeTierDiscount\` (line ${orig.lineNumber("clampPercentage(rawPercent")}) &rarr; \`calculateCartTotal\` (line ${orig.lineNumber("computeTierDiscount(subtotal")}) &rarr; \`processCustomerOrder\` (line ${orig.lineNumber("calculateCartTotal(subtotal")}).`,
        ],
      },
      {
        featureTag: "Scope View",
        title: "Navigate Up and Down the Inlined Call Stack Frames",
        tryPrompt:
          'Click each frame in the **Call Stack** pane (`clampPercentage`, `computeTierDiscount`, `calculateCartTotal`, `processCustomerOrder`) and watch the editor and **Scope** pane.',
        checkPoints: [
          "**`clampPercentage` Frame:** Shows `value: 32`, `min: 5`, `max: 25`, `clamped: 25`.",
          `**\`computeTierDiscount\` Frame:** Highlights the call site on line ${orig.lineNumber("clampPercentage(rawPercent")} (\`clampPercentage(rawPercent, 5, 25)\`) and switches Scope variables to \`baseAmount: 240\`, \`loyaltyYears: 8\`, \`rawPercent: 32\`, \`effectivePercent: 25\`.`,
          `**\`calculateCartTotal\` Frame:** Highlights line ${orig.lineNumber("computeTierDiscount(subtotal")} and shows \`subtotal: 240\`, \`loyaltyYears: 8\`, \`couponFixed: 15\`. \`discountAmount\` and \`finalTotal\` are \`<unavailable>\` (not computed yet).`,
          `**\`processCustomerOrder\` Frame:** Highlights line ${orig.lineNumber("calculateCartTotal(subtotal")} and shows \`customerName: "Grace Hopper"\`, \`subtotal: 240\`, \`loyaltyYears: 8\`. \`payable\` is \`<unavailable>\`. The generated-only parameter \`pause\` must not show up.`,
        ],
      },
      {
        featureTag: "Autocomplete",
        title: "Verify Frame-Contextual Console Autocomplete",
        tryPrompt:
          "Select `computeTierDiscount` in the Call Stack and type `rawP` or `eff` in the Console; then switch to `calculateCartTotal` and type `coup`.",
        checkPoints: [
          "**Per-Frame Suggestions:** Autocomplete dynamically updates to suggest the lexical variables of whichever virtual inlined frame is currently selected.",
        ],
      },
      {
        featureTag: "Conditional Breakpoints",
        title: "Set a Conditional Breakpoint Inside an Inlined Helper",
        tryPrompt:
          `Right-click line ${orig.lineNumber("return baseAmount")} (\`return baseAmount * (effectivePercent / 100);\` inside \`computeTierDiscount\`), set conditional breakpoint \`rawPercent > effectivePercent\`, resume (\`F8\`), and click **"Run & Pause in Debugger"** again.`,
        checkPoints: [
          "**Inlined Condition Evaluation:** DevTools evaluates `(y * 4) > pct` (`32 > 25` &rarr; `true`) and pauses directly inside the inlined `computeTierDiscount` frame.",
        ],
      },
      {
        featureTag: "Debug Evaluate",
        title: "Run Frame-Contextual Debug Evaluate in the Console",
        tryPrompt:
          "Select different frames in the Call Stack and run the corresponding expressions below in the Console.",
        checkPoints: [
          "**Frame-Relative Resolution:** Identical variable names (like `subtotal`) or frame-specific parameters (`rawPercent`, `couponFixed`) resolve against the selected virtual frame's `GeneratedRange`.",
        ],
      },
    ],
    evalExpressions: [
      {
        expression: "{ value, min, max, clamped }",
        expectedResult: "{ value: 32, min: 5, max: 25, clamped: 25 } (when clampPercentage frame is selected)",
        explanation:
          "Evaluates the inlined arguments (`y * 4`, `5`, `25`) and local variable (`pct`) of `clampPercentage`.",
      },
      {
        expression: "rawPercent - effectivePercent",
        expectedResult: "7 (when computeTierDiscount frame is selected)",
        explanation:
          "In the caller frame `computeTierDiscount`, `rawPercent` (`32`) minus `effectivePercent` (`25`) equals `7`.",
      },
      {
        expression: "subtotal - couponFixed",
        expectedResult: "225 (when calculateCartTotal frame is selected)",
        explanation:
          "In `calculateCartTotal`, `subtotal` (`240`) and constant-inlined parameter `couponFixed` (`15`) evaluate to `225`.",
      },
    ],
    runFunctionName: "runExample03",
    logStackFunctionName: "logStackExample03",
  };
}
