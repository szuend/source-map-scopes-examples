import type {
  GeneratedRange,
  Position,
} from "@chrome-devtools/source-map-scopes-codec";
import { getAllExamples } from "./examples/mod.ts";
import { TextLocator } from "./lib/locator.ts";
import { buildExampleSourceMap } from "./lib/sourcemap.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function comparePositions(a: Position, b: Position): number {
  return a.line - b.line || a.column - b.column;
}

Deno.test("No binding references a generated let/const while it is still in its TDZ", () => {
  for (const ex of getAllExamples()) {
    const gen = new TextLocator(ex.generatedCode);
    const { decodedScopeInfo } = buildExampleSourceMap(ex);

    // Every `const x`/`let x` (incl. `for (const x of ...)`) with the position
    // where it becomes initialized (end of the declaration statement / loop head).
    const decls: { name: string; start: Position; initialized: Position }[] = [];
    for (const m of ex.generatedCode.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g)) {
      const rest = ex.generatedCode.slice(m.index);
      const endOffset = m.index + Math.min(
        ...[rest.indexOf(";"), rest.indexOf("{")].filter((i) => i >= 0),
      );
      decls.push({
        name: m[1],
        start: gen.offsetToPosition(m.index),
        initialized: gen.offsetToPosition(endOffset),
      });
    }

    const identifiers = (expr: string) =>
      [...expr.replace(/"[^"]*"/g, "").matchAll(/(?<![.\w$])[A-Za-z_$][\w$]*/g)]
        .map((m) => m[0]);

    const check = (range: GeneratedRange) => {
      range.values.forEach((binding, i) => {
        const varName = range.originalScope?.variables[i];
        const parts = typeof binding === "string"
          ? [{ value: binding, from: range.start }]
          : binding ?? [];
        for (const { value, from } of parts) {
          if (!value) continue;
          for (const id of identifiers(value)) {
            for (const d of decls) {
              const declaredInRange = d.name === id &&
                comparePositions(d.start, range.start) >= 0 &&
                comparePositions(d.start, range.end) < 0;
              assert(
                !declaredInRange || comparePositions(from, d.initialized) >= 0,
                `Example ${ex.id}: '${varName}' is bound to '${value}' from ${from.line}:${from.column}, but '${id}' is only initialized at ${d.initialized.line}:${d.initialized.column}`,
              );
            }
          }
        }
      });
      range.children.forEach(check);
    };
    decodedScopeInfo.ranges.forEach(check);
  }
});

Deno.test("All examples encode and round-trip decode valid ECMA-426 scopes and ranges", () => {
  const examples = getAllExamples();
  assert(examples.length === 5, "Expected 5 examples");

  for (const ex of examples) {
    const { sourceMap, decodedScopeInfo } = buildExampleSourceMap(ex);

    assert(
      Array.isArray(sourceMap.scopes) &&
        sourceMap.scopes.length === 1 &&
        typeof sourceMap.scopes[0] === "string" &&
        sourceMap.scopes[0].length > 0,
      `Example ${ex.id} must produce a non-empty encoded 'scopes' array entry`,
    );
    assert(
      Array.isArray(sourceMap.ranges) && sourceMap.ranges.length > 0,
      `Example ${ex.id} must produce a non-empty encoded 'ranges' array`,
    );
    assert(
      decodedScopeInfo.hasVariableAndBindingInfo === true,
      `Example ${ex.id} must have variable and binding info`,
    );
    assert(
      decodedScopeInfo.scopes.length === 1 &&
        Array.isArray(decodedScopeInfo.scopes[0]) &&
        decodedScopeInfo.scopes[0].length === 1,
      `Example ${ex.id} must decode 1 root OriginalScope for source 0`,
    );
    assert(
      decodedScopeInfo.ranges.length === 1,
      `Example ${ex.id} must decode 1 root GeneratedRange`,
    );
  }
});

Deno.test("Example 02 preserves SubRangeBindings across register reuse phases", () => {
  const ex02 = getAllExamples().find((e) => e.id === "02-sub-range-bindings")!;
  const { decodedScopeInfo } = buildExampleSourceMap(ex02);

  const fnRange = decodedScopeInfo.ranges[0].children[0];
  assert(
    fnRange.originalScope?.name === "processSensorReading",
    "Expected processSensorReading range",
  );
  // values[1] is calibratedMv (4 sub-ranges)
  assert(
    Array.isArray(fnRange.values[1]) && fnRange.values[1].length === 4,
    "Expected 4 sub-ranges for calibratedMv",
  );
});

Deno.test("Example 03 encodes 3 nested inlined callSite ranges inside processCustomerOrder", () => {
  const ex03 = getAllExamples().find((e) => e.id === "03-function-inlining")!;
  const { decodedScopeInfo } = buildExampleSourceMap(ex03);

  const orderRange = decodedScopeInfo.ranges[0].children[0];
  assert(orderRange.isStackFrame === true, "Outer function is a physical stack frame");

  const cartRange = orderRange.children[0];
  assert(cartRange.isStackFrame === false, "calculateCartTotal is inlined");
  assert(cartRange.callSite !== undefined, "calculateCartTotal has callSite");

  const tierRange = cartRange.children[0];
  assert(tierRange.isStackFrame === false, "computeTierDiscount is inlined");
  assert(tierRange.callSite !== undefined, "computeTierDiscount has callSite");

  const clampRange = tierRange.children[0];
  assert(clampRange.isStackFrame === false, "clampPercentage is inlined");
  assert(clampRange.callSite !== undefined, "clampPercentage has callSite");
});

Deno.test("Generated-only entry helpers have stack-frame ranges without a definition scope", () => {
  for (const ex of getAllExamples()) {
    const { decodedScopeInfo } = buildExampleSourceMap(ex);
    const rootChildren = decodedScopeInfo.ranges[0].children;
    const lastChild = rootChildren.at(-1)!;
    assert(
      lastChild.isStackFrame === true && lastChild.originalScope === undefined,
      `Example ${ex.id} must emit a stack-frame range without an OriginalScope for its generated-only entry helper`,
    );
  }
});

Deno.test("Example 04 marks compiler trampoline ranges with isHidden: true and keeps definition scope when containing authored code", () => {
  const ex04 = getAllExamples().find(
    (e) => e.id === "04-closures-and-hidden-ranges",
  )!;
  const { decodedScopeInfo } = buildExampleSourceMap(ex04);

  const trampolineRange = decodedScopeInfo.ranges[0].children[0];
  assert(
    trampolineRange.isHidden === true &&
      trampolineRange.isStackFrame === true &&
      trampolineRange.originalScope === undefined,
    "Expected __withCompilerTrampoline range to have isHidden: true, isStackFrame: true, and no definition scope",
  );

  const execRange = decodedScopeInfo.ranges[0].children[1];
  const anonWrapperRange = execRange.children[1];
  assert(
    anonWrapperRange.isHidden === true &&
      anonWrapperRange.isStackFrame === true &&
      anonWrapperRange.originalScope?.name === "executeRateLimitCheck",
    "Expected anonymous wrapper containing authored code to keep definition scope 'executeRateLimitCheck' and have isHidden: true",
  );
});

Deno.test("Example 05 encodes pure compiler helpers, an outlined block function, and an inlined helper range", () => {
  const ex05 = getAllExamples().find((e) => e.id === "05-logical-stepping")!;
  const { decodedScopeInfo } = buildExampleSourceMap(ex05);

  const rootChildren = decodedScopeInfo.ranges[0].children;
  // 0: __checkPositive (pure helper)
  // 1: __openClearance (pure helper)
  // 2: _outlinedCustomsBlock (outlined function: isStackFrame && isHidden && originalScope)
  // 3: dispatchPackage (with inlined calculateCustomsDuty child)
  // 4: runSteppingPipeline
  // 5: window.runExample05
  const checkPosRange = rootChildren[0];
  assert(
    checkPosRange.isStackFrame === true && checkPosRange.originalScope === undefined,
    "Expected __checkPositive to be a pure helper range without an OriginalScope",
  );

  const outlinedRange = rootChildren[2];
  assert(
    outlinedRange.isStackFrame === true &&
      outlinedRange.isHidden === true &&
      outlinedRange.originalScope?.name === "dispatchPackage",
    "Expected _outlinedCustomsBlock to be an outlined function range (isStackFrame: true, isHidden: true, originalScope: dispatchPackage)",
  );
  assert(
    outlinedRange.children[0]?.originalScope?.kind === "Block",
    "Expected _outlinedCustomsBlock body child range to reference the inner Block scope",
  );

  const dispatchRange = rootChildren[3];
  const inlinedDutyRange = dispatchRange.children[0];
  assert(
    inlinedDutyRange.isStackFrame === false &&
      inlinedDutyRange.callSite !== undefined &&
      inlinedDutyRange.originalScope?.name === "calculateCustomsDuty",
    "Expected calculateCustomsDuty to be an inlined range with a callSite inside dispatchPackage",
  );
});

Deno.test("All generated bundle.js functions execute and return expected outputs", () => {
  const fakeWindow: Record<string, () => unknown> = {};

  for (const ex of getAllExamples()) {
    const executableCode = ex.generatedCode.replaceAll("debugger;", "");
    const runner = new Function("window", executableCode);
    runner(fakeWindow);
  }

  const res01 = fakeWindow.runExample01() as {
    recipient: string;
    currency: string;
    grandTotal: number;
  };
  assert(res01.recipient === "Ada Lovelace", "Ex01 recipient");
  assert(res01.currency === "USD", "Ex01 currency");
  assert(res01.grandTotal === 230.56, "Ex01 grandTotal");

  const res02 = fakeWindow.runExample02() as {
    sensorId: string;
    badge: string;
  };
  assert(
    res02.badge === "[CORE-TEMP-04] 75.0°C (WARN)",
    "Ex02 formatted badge",
  );

  const res03 = fakeWindow.runExample03() as {
    customer: string;
    payableTotal: number;
  };
  assert(res03.customer === "Grace Hopper", "Ex03 customer");
  assert(res03.payableTotal === 165, "Ex03 payableTotal");

  const res04 = fakeWindow.runExample04() as {
    region: string;
    endpoint: string;
    remainingTokens: number;
    burstUtilization: number;
  };
  assert(res04.region === "us-central1", "Ex04 region");
  assert(res04.endpoint === "/api/v2/inference", "Ex04 endpoint");
  assert(res04.remainingTokens === 30, "Ex04 remainingTokens");
  assert(res04.burstUtilization === 40, "Ex04 burstUtilization");

  const res05 = fakeWindow.runExample05() as {
    shipment: { trackingId: string; dutyAmount: number; totalCost: number };
    status: string;
  };
  assert(res05.shipment.trackingId === "SHP-9042", "Ex05 trackingId");
  assert(res05.shipment.dutyAmount === 54, "Ex05 dutyAmount");
  assert(res05.shipment.totalCost === 519, "Ex05 totalCost");
  assert(res05.status === "Dispatched SHP-9042: $519", "Ex05 status");
});
