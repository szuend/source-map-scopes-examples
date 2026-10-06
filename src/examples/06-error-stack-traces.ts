import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
import { availableFrom } from "../lib/bindings.ts";
import { TextLocator } from "../lib/locator.ts";
import type { ExampleDefinition, MappingPoint } from "../lib/sourcemap.ts";

const originalSource = `// Authored TypeScript: errors.ts
declare function acquireLock(sku: string): Disposable;

function assertValidQuantity(sku: string, quantity: number): void {
  if (quantity <= 0) {
    throw new RangeError(\`Invalid quantity \${quantity} for \${sku}\`);
  }
}

function reserveLine(sku: string, quantity: number): number {
  assertValidQuantity(sku, quantity);
  return quantity * 2;
}

function reserveOrder(orderId: string, sku: string, quantity: number): number {
  let reserved = 0;
  // \`using\` block: outlined into \`_outlinedUsingBlock\` and run through
  // the \`__using\` runtime helper in bundle.js.
  {
    using lock = acquireLock(sku);
    reserved = reserveLine(sku, quantity);
  }
  return reserved;
}

export function submitOrder(orderId: string, sku: string, quantity: number): string {
  const units = reserveOrder(orderId, sku, quantity);
  return \`\${orderId}: reserved \${units} units\`;
}

export function submitOrderAndReport(): string {
  try {
    return submitOrder("ORD-17", "SKU-B", 0);
  } catch (err) {
    console.error(err);
    return String((err as Error).stack);
  }
}

export function submitOrderLater(): void {
  setTimeout(() => submitOrder("ORD-17", "SKU-B", 0), 0);
}
`;

const generatedCode = `function __using(res, body, ...args) {
  try {
    return body(res, ...args);
  } finally {
    res[Symbol.dispose]();
  }
}
function __acquireLock(key) {
  return { key, [Symbol.dispose]() {} };
}
function _outlinedUsingBlock(lock, sku, qty) {
  if (qty <= 0) {
    throw new RangeError("Invalid quantity " + qty + " for " + sku);
  }
  const r = qty * 2;
  return r;
}
function submitOrder(id, sku, qty) {
  let n = 0;
  n = __using(__acquireLock(sku), _outlinedUsingBlock, sku, qty);
  return id + ": reserved " + n + " units";
}
function submitOrderAndReport() {
  try {
    return submitOrder("ORD-17", "SKU-B", 0);
  } catch (e) {
    console.error(e);
    return String(e.stack);
  }
}
function submitOrderLater() {
  setTimeout(() => submitOrder("ORD-17", "SKU-B", 0), 0);
}
window.runExample06 = function() {
  submitOrderLater();
  return "Scheduled submitOrder() in a timer. Check the Console for the uncaught RangeError.";
};
window.logStackExample06 = submitOrderAndReport;
//# sourceMappingURL=bundle.js.map
`;

const builderCodeSnippet = `const builder = new SafeScopeInfoBuilder();

// 1. Original Scopes (abbreviated: positions come from TextLocator).
builder
  .startSource()
  .startScope(0, 0, { kind: "Module", key: "module", variables: [
    "acquireLock", "assertValidQuantity", "reserveLine", "reserveOrder",
    "submitOrder", "submitOrderAndReport", "submitOrderLater",
  ] })
  .startScope(..., { name: "assertValidQuantity", kind: "Function", isStackFrame: true,
                     key: "assertValidQuantity", variables: ["sku", "quantity"] }).endScope(...)
  .startScope(..., { name: "reserveLine", kind: "Function", isStackFrame: true,
                     key: "reserveLine", variables: ["sku", "quantity"] }).endScope(...)
  .startScope(..., { name: "reserveOrder", kind: "Function", isStackFrame: true,
                     key: "reserveOrder", variables: ["orderId", "sku", "quantity", "reserved"] })
    .startScope(..., { kind: "Block", key: "usingBlock", variables: ["lock"] }).endScope(...)
  .endScope(...)
  .startScope(..., { name: "submitOrder", kind: "Function", isStackFrame: true,
                     key: "submitOrder", variables: ["orderId", "sku", "quantity", "units"] }).endScope(...)
  .startScope(..., { name: "submitOrderAndReport", kind: "Function", isStackFrame: true,
                     key: "submitOrderAndReport", variables: [] })
    .startScope(..., { kind: "Block", key: "catchBlock", variables: ["err"] }).endScope(...)
  .endScope(...)
  .startScope(..., { name: "submitOrderLater", kind: "Function", isStackFrame: true,
                     key: "submitOrderLater", variables: [] })
    .startScope(..., { kind: "Function", isStackFrame: true, key: "timerCallback", variables: [] }).endScope(...)
  .endScope(...)
  .endScope(...)
  .endSource();

// 2. Generated Ranges.
builder
  .startRange(0, 0, { scopeKey: "module", values: [
    "__acquireLock", null, null, null, "submitOrder", "submitOrderAndReport", "submitOrderLater",
  ] })
  // __using: runtime helper WITHOUT definition -> dropped from stack traces.
  .startRange(..., { isStackFrame: true, isHidden: true }).endRange(...)
  // __acquireLock (+ its [Symbol.dispose] method): helpers without definition.
  .startRange(..., { isStackFrame: true })
    .startRange(..., { isStackFrame: true }).endRange(...)
  .endRange(...)
  // _outlinedUsingBlock: outlined (isHidden + definition "reserveOrder")
  // -> merged with the caller that owns reserveOrder.
  .startRange(..., { scopeKey: "reserveOrder", isStackFrame: true, isHidden: true,
                     values: [null /* orderId is not passed */, "sku", "qty", "0"] })
    .startRange(..., { scopeKey: "usingBlock", values: ["lock"] })
      // reserveLine and assertValidQuantity are inlined INTO the outlined block.
      .startRange(..., { scopeKey: "reserveLine", callSite: reserveLineCall, values: ["sku", "qty"] })
        .startRange(..., { scopeKey: "assertValidQuantity", callSite: assertCall, values: ["sku", "qty"] })
        .endRange(...)
      .endRange(...)
    .endRange(...)
  .endRange(...)
  // submitOrder, with reserveOrder (the owner of the outlined block) inlined into it.
  .startRange(..., { scopeKey: "submitOrder", isStackFrame: true,
                     values: ["id", "sku", "qty", availableFrom(start, afterUsingCall, end, "n")] })
    .startRange(..., { scopeKey: "reserveOrder", callSite: reserveOrderCall,
                       values: ["id", "sku", "qty", availableFrom(start, afterLetN, end, "n")] })
    .endRange(...)
  .endRange(...)
  .startRange(..., { scopeKey: "submitOrderAndReport", isStackFrame: true, values: [] })
    .startRange(..., { scopeKey: "catchBlock", values: ["e"] }).endRange(...)
  .endRange(...)
  .startRange(..., { scopeKey: "submitOrderLater", isStackFrame: true, values: [] })
    .startRange(..., { scopeKey: "timerCallback", isStackFrame: true, values: [] }).endRange(...)
  .endRange(...)
  // window.runExample06: generated-only glue.
  .startRange(..., { isStackFrame: true }).endRange(...)
  .endRange(...);`;

export function createExample06(): ExampleDefinition {
  const orig = new TextLocator(originalSource);
  const gen = new TextLocator(generatedCode);

  // --- Original scope positions ---
  const assertStart = orig.at("(sku: string, quantity: number): void {");
  const assertEnd = orig.after("for ${sku}`);\n  }\n}");
  const reserveLineStart = orig.at("(sku: string, quantity: number): number {");
  const reserveLineEnd = orig.after("  return quantity * 2;\n}");
  const reserveOrderStart = orig.at("(orderId: string, sku: string, quantity: number): number {");
  const reserveOrderEnd = orig.after("  return reserved;\n}");
  const usingBlockStart = orig.at("{\n    using lock");
  const usingBlockEnd = orig.after("    reserved = reserveLine(sku, quantity);\n  }");
  const submitStart = orig.at("(orderId: string, sku: string, quantity: number): string {");
  const submitEnd = orig.after("units`;\n}");
  const reportStart = orig.at("(): string {\n  try {");
  const reportEnd = orig.after("    return String((err as Error).stack);\n  }\n}");
  const catchStart = orig.at("(err) {");
  const catchEnd = orig.after("    return String((err as Error).stack);\n  }");
  const laterStart = orig.at("(): void {\n  setTimeout");
  const laterEnd = orig.after('  setTimeout(() => submitOrder("ORD-17", "SKU-B", 0), 0);\n}');
  const timerCbStart = orig.at('() => submitOrder("ORD-17", "SKU-B", 0)');
  const timerCbEnd = orig.after('() => submitOrder("ORD-17", "SKU-B", 0)');

  const assertCall = orig.origAt("assertValidQuantity(sku, quantity);");
  const reserveLineCall = orig.origAt("reserveLine(sku, quantity);");
  const reserveOrderCall = orig.origAt("reserveOrder(orderId, sku, quantity);");

  // --- Generated range positions ---
  const usingStart = gen.at("(res, body, ...args) {");
  const usingEnd = gen.after("    res[Symbol.dispose]();\n  }\n}");
  const acquireStart = gen.at("(key) {");
  const acquireEnd = gen.after("  return { key, [Symbol.dispose]() {} };\n}");
  const disposeStart = gen.at("() {} }");
  const disposeEnd = gen.after("[Symbol.dispose]() {}");

  const outlinedStart = gen.at("(lock, sku, qty) {");
  const outlinedEnd = gen.after("  return r;\n}");
  const outlinedBodyStart = gen.at("if (qty <= 0) {");
  const outlinedBodyEnd = gen.after("  return r;");
  const genReserveLineEnd = gen.after("const r = qty * 2;");
  const genAssertEnd = gen.after('" for " + sku);\n  }');

  const genSubmitStart = gen.at("(id, sku, qty) {");
  const genSubmitEnd = gen.after('  return id + ": reserved " + n + " units";\n}');
  const genReserveOrderStart = gen.at("let n = 0;");
  const afterLetN = gen.after("let n = 0;");
  const afterUsingCall = gen.after(
    "n = __using(__acquireLock(sku), _outlinedUsingBlock, sku, qty);",
  );

  const genReportStart = gen.at("() {\n  try {");
  const genReportEnd = gen.after("    return String(e.stack);\n  }\n}");
  const genCatchStart = gen.at("(e) {");
  const genCatchEnd = gen.after("    return String(e.stack);\n  }");

  const genLaterStart = gen.at("() {\n  setTimeout");
  const genLaterEnd = gen.after('  setTimeout(() => submitOrder("ORD-17", "SKU-B", 0), 0);\n}');
  const genTimerCbStart = gen.at('() => submitOrder("ORD-17", "SKU-B", 0)');
  const genTimerCbEnd = gen.after('() => submitOrder("ORD-17", "SKU-B", 0)');

  const genRunStart = gen.at("() {\n  submitOrderLater();");
  const genRunEnd = gen.after('the uncaught RangeError.";\n}');

  const builder = new SafeScopeInfoBuilder();

  builder
    .startSource()
    .startScope(0, 0, {
      kind: "Module",
      key: "module",
      variables: [
        "acquireLock",
        "assertValidQuantity",
        "reserveLine",
        "reserveOrder",
        "submitOrder",
        "submitOrderAndReport",
        "submitOrderLater",
      ],
    })
    .startScope(assertStart.line, assertStart.column, {
      name: "assertValidQuantity",
      kind: "Function",
      isStackFrame: true,
      key: "assertValidQuantity",
      variables: ["sku", "quantity"],
    })
    .endScope(assertEnd.line, assertEnd.column)
    .startScope(reserveLineStart.line, reserveLineStart.column, {
      name: "reserveLine",
      kind: "Function",
      isStackFrame: true,
      key: "reserveLine",
      variables: ["sku", "quantity"],
    })
    .endScope(reserveLineEnd.line, reserveLineEnd.column)
    .startScope(reserveOrderStart.line, reserveOrderStart.column, {
      name: "reserveOrder",
      kind: "Function",
      isStackFrame: true,
      key: "reserveOrder",
      variables: ["orderId", "sku", "quantity", "reserved"],
    })
    .startScope(usingBlockStart.line, usingBlockStart.column, {
      kind: "Block",
      key: "usingBlock",
      variables: ["lock"],
    })
    .endScope(usingBlockEnd.line, usingBlockEnd.column)
    .endScope(reserveOrderEnd.line, reserveOrderEnd.column)
    .startScope(submitStart.line, submitStart.column, {
      name: "submitOrder",
      kind: "Function",
      isStackFrame: true,
      key: "submitOrder",
      variables: ["orderId", "sku", "quantity", "units"],
    })
    .endScope(submitEnd.line, submitEnd.column)
    .startScope(reportStart.line, reportStart.column, {
      name: "submitOrderAndReport",
      kind: "Function",
      isStackFrame: true,
      key: "submitOrderAndReport",
      variables: [],
    })
    .startScope(catchStart.line, catchStart.column, {
      kind: "Block",
      key: "catchBlock",
      variables: ["err"],
    })
    .endScope(catchEnd.line, catchEnd.column)
    .endScope(reportEnd.line, reportEnd.column)
    .startScope(laterStart.line, laterStart.column, {
      name: "submitOrderLater",
      kind: "Function",
      isStackFrame: true,
      key: "submitOrderLater",
      variables: [],
    })
    .startScope(timerCbStart.line, timerCbStart.column, {
      kind: "Function",
      isStackFrame: true,
      key: "timerCallback",
      variables: [],
    })
    .endScope(timerCbEnd.line, timerCbEnd.column)
    .endScope(laterEnd.line, laterEnd.column)
    .endScope(orig.end().line, orig.end().column)
    .endSource();

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: [
        "__acquireLock",
        null,
        null,
        null,
        "submitOrder",
        "submitOrderAndReport",
        "submitOrderLater",
      ],
    })
    // Runtime helper without definition: dropped from stack traces.
    .startRange(usingStart.line, usingStart.column, {
      isStackFrame: true,
      isHidden: true,
    })
    .endRange(usingEnd.line, usingEnd.column)
    .startRange(acquireStart.line, acquireStart.column, { isStackFrame: true })
    .startRange(disposeStart.line, disposeStart.column, { isStackFrame: true })
    .endRange(disposeEnd.line, disposeEnd.column)
    .endRange(acquireEnd.line, acquireEnd.column)
    // Outlined block: isHidden + definition -> merged with its owner's frame.
    .startRange(outlinedStart.line, outlinedStart.column, {
      scopeKey: "reserveOrder",
      isStackFrame: true,
      isHidden: true,
      // orderId is not passed to the outlined function; reserved is still 0
      // until the outlined block returned.
      values: [null, "sku", "qty", "0"],
    })
    .startRange(outlinedBodyStart.line, outlinedBodyStart.column, {
      scopeKey: "usingBlock",
      values: ["lock"],
    })
    .startRange(outlinedBodyStart.line, outlinedBodyStart.column, {
      scopeKey: "reserveLine",
      callSite: reserveLineCall,
      values: ["sku", "qty"],
    })
    .startRange(outlinedBodyStart.line, outlinedBodyStart.column, {
      scopeKey: "assertValidQuantity",
      callSite: assertCall,
      values: ["sku", "qty"],
    })
    .endRange(genAssertEnd.line, genAssertEnd.column)
    .endRange(genReserveLineEnd.line, genReserveLineEnd.column)
    .endRange(outlinedBodyEnd.line, outlinedBodyEnd.column)
    .endRange(outlinedEnd.line, outlinedEnd.column)
    // submitOrder with reserveOrder (the owner of the outlined block) inlined.
    .startRange(genSubmitStart.line, genSubmitStart.column, {
      scopeKey: "submitOrder",
      isStackFrame: true,
      values: [
        "id",
        "sku",
        "qty",
        availableFrom(genSubmitStart, afterUsingCall, genSubmitEnd, "n"),
      ],
    })
    .startRange(genReserveOrderStart.line, genReserveOrderStart.column, {
      scopeKey: "reserveOrder",
      callSite: reserveOrderCall,
      values: [
        "id",
        "sku",
        "qty",
        availableFrom(genReserveOrderStart, afterLetN, afterUsingCall, "n"),
      ],
    })
    .endRange(afterUsingCall.line, afterUsingCall.column)
    .endRange(genSubmitEnd.line, genSubmitEnd.column)
    .startRange(genReportStart.line, genReportStart.column, {
      scopeKey: "submitOrderAndReport",
      isStackFrame: true,
      values: [],
    })
    .startRange(genCatchStart.line, genCatchStart.column, {
      scopeKey: "catchBlock",
      values: ["e"],
    })
    .endRange(genCatchEnd.line, genCatchEnd.column)
    .endRange(genReportEnd.line, genReportEnd.column)
    .startRange(genLaterStart.line, genLaterStart.column, {
      scopeKey: "submitOrderLater",
      isStackFrame: true,
      values: [],
    })
    .startRange(genTimerCbStart.line, genTimerCbStart.column, {
      scopeKey: "timerCallback",
      isStackFrame: true,
      values: [],
    })
    .endRange(genTimerCbEnd.line, genTimerCbEnd.column)
    .endRange(genLaterEnd.line, genLaterEnd.column)
    .startRange(genRunStart.line, genRunStart.column, { isStackFrame: true })
    .endRange(genRunEnd.line, genRunEnd.column)
    .endRange(gen.end().line, gen.end().column);

  // __using, __acquireLock, `return r;` and window.* glue are intentionally unmapped.
  const mappings: MappingPoint[] = [
    // Outlined block with inlined reserveLine -> assertValidQuantity
    {
      gen: gen.at("if (qty <= 0) {"),
      orig: orig.at("if (quantity <= 0) {"),
    },
    {
      gen: gen.at('throw new RangeError("Invalid'),
      orig: orig.at("throw new RangeError(`Invalid"),
    },
    {
      gen: gen.at('new RangeError("Invalid'),
      orig: orig.at("new RangeError(`Invalid"),
    },
    {
      gen: gen.at("const r = qty * 2;"),
      orig: orig.at("return quantity * 2;"),
    },

    // submitOrder (+ inlined reserveOrder)
    {
      gen: gen.at("function submitOrder("),
      orig: orig.at("export function submitOrder("),
      name: "submitOrder",
    },
    {
      gen: gen.at("let n = 0;"),
      orig: orig.at("let reserved = 0;"),
      name: "reserved",
    },
    {
      gen: gen.at("n = __using("),
      orig: orig.at("using lock = acquireLock(sku);"),
    },
    {
      gen: gen.at("__acquireLock(sku)"),
      orig: orig.at("acquireLock(sku)"),
      name: "acquireLock",
    },
    {
      gen: gen.at(", _outlinedUsingBlock, sku, qty);"),
      orig: orig.at("using lock = acquireLock(sku);"),
    },
    {
      gen: gen.at('return id + ": reserved "'),
      orig: orig.at("return `${orderId}: reserved"),
    },

    // submitOrderAndReport
    {
      gen: gen.at("function submitOrderAndReport"),
      orig: orig.at("export function submitOrderAndReport"),
      name: "submitOrderAndReport",
    },
    {
      gen: gen.at("try {", 2),
      orig: orig.at("try {"),
    },
    {
      gen: gen.at('return submitOrder("ORD-17", "SKU-B", 0);'),
      orig: orig.at('return submitOrder("ORD-17", "SKU-B", 0);'),
    },
    {
      gen: gen.at("console.error(e);"),
      orig: orig.at("console.error(err);"),
    },
    {
      gen: gen.at("return String(e.stack);"),
      orig: orig.at("return String((err as Error).stack);"),
    },

    // submitOrderLater + timer callback
    {
      gen: gen.at("function submitOrderLater"),
      orig: orig.at("export function submitOrderLater"),
      name: "submitOrderLater",
    },
    {
      gen: gen.at("setTimeout("),
      orig: orig.at("setTimeout("),
    },
    {
      gen: gen.at('submitOrder("ORD-17", "SKU-B", 0), 0)'),
      orig: orig.at('submitOrder("ORD-17", "SKU-B", 0), 0)'),
    },
  ];

  // 1-based line numbers in errors.ts, for walkthrough text.
  const L = (needle: string) => orig.lineNumber(needle);
  const lThrow = L("throw new RangeError");
  const lAssertCall = L("assertValidQuantity(sku, quantity);");
  const lReserveLineCall = L("reserved = reserveLine(sku, quantity);");
  const lReserveOrderCall = L("const units = reserveOrder(");
  const lReportCall = L('return submitOrder("ORD-17"');
  const lTimer = L("setTimeout(() =>");

  const expectedStack =
    `\`assertValidQuantity\` (${lThrow}) → \`reserveLine\` (${lAssertCall}) → \`reserveOrder\` (${lReserveLineCall}) → \`submitOrder\` (${lReserveOrderCall})`;

  return {
    id: "06-error-stack-traces",
    number: "06",
    title: "Thrown Errors & Symbolized Stack Traces",
    shortTitle: "Error Stack Traces",
    subtitle:
      "An error thrown from inlined code inside an outlined block, called through a runtime helper, from an inlined caller. DevTools rebuilds the authored stack trace.",
    proposalFeatures: [
      "Inlined Ranges Inside an Outlined Function",
      "Outlined Function (isHidden + definition)",
      "Runtime Helper Without Definition (dropped)",
      "Outlined Owner Inlined Into Its Caller",
    ],
    devtoolsFeatures: [
      "Symbolized Error.stack in the Console",
      "Uncaught Errors & Async Stack Traces",
      "Pause on Exceptions",
    ],
    originalFileName: "errors.ts",
    originalSource,
    generatedCode,
    builderCodeSnippet,
    scopeInfo: builder.build(),
    mappings,
    overviewHtml: `
      <p>
        The <code>RangeError</code> is thrown in <code>_outlinedUsingBlock</code> (the outlined <code>using</code> block of <code>reserveOrder</code>, with <code>reserveLine</code> and <code>assertValidQuantity</code> inlined into it). It is called through the runtime helper <code>__using</code>, from <code>submitOrder</code>, which in turn has <code>reserveOrder</code> inlined.
      </p>
      <p>
        The raw <code>err.stack</code> only knows the generated frames. DevTools should expand inlined frames, merge the outlined block into its owner, drop the helper, and show each authored frame <strong>once</strong>.
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Error Stack Traces",
        title: "1. Caught error logged with console.error()",
        tryPrompt:
          "Click **Catch & console.error()** and expand the error in the Console.",
        checkPoints: [
          `**Stack:** ${expectedStack} → \`submitOrderAndReport\` (${lReportCall}), all linking to \`errors.ts\`.`,
          "**No generated frames:** `_outlinedUsingBlock` and `__using` are not shown, and `reserveOrder` shows up exactly once.",
          "**Raw vs. symbolized:** the page readout shows the raw `err.stack` with `bundle.js` frames. Only DevTools symbolizes it.",
        ],
      },
      {
        featureTag: "Error Stack Traces",
        title: "2. Uncaught error thrown from a timer",
        tryPrompt: "Click **Throw Uncaught Error**.",
        checkPoints: [
          `**Stack:** \`Uncaught RangeError\` with ${expectedStack} → anonymous timer callback (${lTimer}).`,
          `**Async part:** \`setTimeout\` → \`submitOrderLater\` (${lTimer}). \`window.runExample06\` is not shown.`,
        ],
      },
      {
        featureTag: "Call Stack",
        title: "3. Pause on exceptions",
        tryPrompt:
          "In **Sources › Breakpoints**, enable **Pause on uncaught exceptions** and click **Throw Uncaught Error** again (or enable **Pause on caught exceptions** and use the other button).",
        checkPoints: [
          `**Paused on line ${lThrow}** of \`errors.ts\`. The Call Stack matches the Console stack trace.`,
          "**Select `reserveOrder`:** Scope shows Block `lock`, and `orderId` `<unavailable>`, `sku: \"SKU-B\"`, `quantity: 0`, `reserved: 0`.",
          "**Select `submitOrder`:** `units` is `<unavailable>` (not assigned yet).",
        ],
      },
    ],
    evalExpressions: [
      {
        expression: "`${sku} x ${quantity}`",
        expectedResult: '"SKU-B x 0"',
        explanation:
          "Paused on the `throw` (step 3), with any frame from `assertValidQuantity` to `submitOrder` selected.",
      },
      {
        expression: "orderId",
        expectedResult: 'unavailable with reserveOrder selected; "ORD-17" with submitOrder selected',
        explanation:
          "The outlined block does not receive `orderId`, but the `submitOrder` frame still has it.",
      },
    ],
    runFunctionName: "runExample06",
    runButtonLabel: "Throw Uncaught Error",
    logStackFunctionName: "logStackExample06",
    logStackButtonLabel: "Catch & console.error()",
    otherThingsToTry: [
      "Right-click the stack trace in the Console or Call Stack › **Copy stack trace**.",
      "Add `bundle.js` to the ignore list, or toggle the source map scopes experiment, and compare the stack traces.",
      "Close DevTools, click both buttons, then open DevTools: the already-logged errors should still get symbolized.",
      "While paused on the exception, use **Restart frame** on `reserveOrder` or `submitOrder`.",
    ],
  };
}
