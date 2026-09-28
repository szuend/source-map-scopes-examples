import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
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
  .endScope(moduleEnd.line, moduleEnd.column);

// 2. Generated Ranges: 3 nested inlined ranges (isStackFrame: false + callSite)
//    inside the single physical function processCustomerOrder (isStackFrame: true)
builder
  .startRange(0, 0, {
    scopeKey: "module",
    values: [null, null, null, "processCustomerOrder"],
  })
  .startRange(genOrderStart.line, genOrderStart.column, {
    scopeKey: "processCustomerOrder",
    isStackFrame: true,
    values: ["n", "s", "y", "p"],
  })
  .startRange(genCartStart.line, genCartStart.column, {
    scopeKey: "calculateCartTotal",
    isStackFrame: false,
    callSite: callSiteCalculateCartTotal, // inlining.ts:30:18
    values: ["s", "y", "15", "d", "p"],
  })
  .startRange(genTierStart.line, genTierStart.column, {
    scopeKey: "computeTierDiscount",
    isStackFrame: false,
    callSite: callSiteComputeTierDiscount, // inlining.ts:20:25
    values: ["s", "y", "y * 4", "pct"],
  })
  .startRange(genClampStart.line, genClampStart.column, {
    scopeKey: "clampPercentage",
    isStackFrame: false,
    callSite: callSiteClampPercentage, // inlining.ts:11:27
    values: ["y * 4", "5", "25", "pct"],
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

  const genRunStart = gen.at('() {\n  return processCustomerOrder("Grace Hopper", 240, 8, true);');
  const genRunEnd = gen.after('return processCustomerOrder("Grace Hopper", 240, 8, true);\n}');
  const genLogStart = gen.at('() {\n  const res = processCustomerOrder("Grace Hopper", 240, 8, false);');
  const genLogEnd = gen.after("JSON.stringify(res);\n}");

  const builder = new SafeScopeInfoBuilder();

  builder
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
    .endScope(origModuleEnd.line, origModuleEnd.column);

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: [null, null, null, "processCustomerOrder"],
    })
    .startRange(genOrderStart.line, genOrderStart.column, {
      scopeKey: "processCustomerOrder",
      isStackFrame: true,
      values: ["n", "s", "y", "p"],
    })
    .startRange(genCartStart.line, genCartStart.column, {
      scopeKey: "calculateCartTotal",
      isStackFrame: false,
      callSite: callSiteCalculateCartTotal,
      values: ["s", "y", "15", "d", "p"],
    })
    .startRange(genTierStart.line, genTierStart.column, {
      scopeKey: "computeTierDiscount",
      isStackFrame: false,
      callSite: callSiteComputeTierDiscount,
      values: ["s", "y", "y * 4", "pct"],
    })
    .startRange(genClampStart.line, genClampStart.column, {
      scopeKey: "clampPercentage",
      isStackFrame: false,
      callSite: callSiteClampPercentage,
      values: ["y * 4", "5", "25", "pct"],
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
        By nesting three <code>GeneratedRange</code> entries with <code>isStackFrame: false</code> and <code>callSite</code> coordinates inside <code>processCustomerOrder</code>'s range, Chrome DevTools synthesizes the full 4-frame <strong>Call Stack</strong>. Clicking any inlined frame in the Call Stack pane switches the editor to that caller's call site and updates both the <strong>Scope</strong> view and <strong>Console Debug Evaluate</strong> to that frame's lexical variables!
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Call Stack",
        title: "Inspect the 4-Frame Virtual Call Stack in DevTools",
        instruction:
          'Open DevTools ("Sources" panel) and click "Run & Pause in Debugger". Execution pauses at `debugger;` on line 5 of `inlining.ts` (`clampPercentage`).',
        expectedObservation:
          'Look at the "Call Stack" pane: even though only one JS function (`processCustomerOrder`) is executing in V8, DevTools shows 4 frames: `clampPercentage` (line 5), `computeTierDiscount` (line 11), `calculateCartTotal` (line 20), and `processCustomerOrder` (line 30).',
      },
      {
        featureTag: "Scope View",
        title: "Click Up and Down the Inlined Call Stack Frames",
        instruction:
          'In the "Call Stack" pane, click on `computeTierDiscount`, then `calculateCartTotal`, then `processCustomerOrder`, and watch both the editor highlight and the "Scope" sidebar.',
        expectedObservation:
          'Selecting `clampPercentage` shows `value: 32`, `min: 5`, `max: 25`, `clamped: 25`. Selecting `computeTierDiscount` highlights `clampPercentage(rawPercent, 5, 25)` on line 11 and updates the Scope pane to `baseAmount: 240`, `loyaltyYears: 8`, `rawPercent: 32`, `effectivePercent: 25`! Selecting `calculateCartTotal` shows `couponFixed: 15`.',
      },
      {
        featureTag: "Inline Hints & Popover",
        title: "Inspect Frame-Specific Inline Variable Hints",
        instruction:
          "As you select different inlined frames in the Call Stack pane, look at the inline variable hints inside that function in `inlining.ts`.",
        expectedObservation:
          "DevTools updates the inline variable hints and hover popovers in the editor to reflect the currently selected inlined frame.",
      },
      {
        featureTag: "Debug Evaluate",
        title: "Run Frame-Contextual Debug Evaluate in Console",
        instruction:
          "Select `clampPercentage` in the Call Stack and evaluate `value > max` in Console; then select `calculateCartTotal` in the Call Stack and evaluate `subtotal - couponFixed`.",
        expectedObservation:
          "Console evaluation automatically resolves identifiers against the selected virtual frame's `OriginalScope` and `GeneratedRange` bindings.",
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
