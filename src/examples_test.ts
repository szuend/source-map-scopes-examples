import { getAllExamples } from "./examples/mod.ts";
import { buildExampleSourceMap } from "./lib/sourcemap.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

Deno.test("All examples encode and round-trip decode valid ECMA-426 scopes", () => {
  const examples = getAllExamples();
  assert(examples.length === 4, "Expected 4 examples");

  for (const ex of examples) {
    const { sourceMap, decodedScopeInfo } = buildExampleSourceMap(ex);

    assert(
      typeof sourceMap.scopes === "string" && sourceMap.scopes.length > 0,
      `Example ${ex.id} must produce a non-empty encoded 'scopes' string`,
    );
    assert(
      decodedScopeInfo.hasVariableAndBindingInfo === true,
      `Example ${ex.id} must have variable and binding info`,
    );
    assert(
      decodedScopeInfo.scopes.length === 1 && decodedScopeInfo.scopes[0] !== null,
      `Example ${ex.id} must decode 1 root OriginalScope`,
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
});
