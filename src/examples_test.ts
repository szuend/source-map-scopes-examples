import type {
  GeneratedRange,
  Position,
} from "@chrome-devtools/source-map-scopes-codec";
import { decode } from "@jridgewell/sourcemap-codec";
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
    if (ex.wasm) continue; // Bindings refer to wasm state, not JS let/const.
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
  assert(examples.length === 8, "Expected 8 examples");

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

Deno.test("Example 06 encodes the raw frames of the thrown error as outlined, hidden, and inlined ranges", () => {
  const ex06 = getAllExamples().find((e) => e.id === "06-error-stack-traces")!;
  const { decodedScopeInfo } = buildExampleSourceMap(ex06);
  const gen = new TextLocator(ex06.generatedCode);

  // Outer-to-inner chain of generated ranges containing `pos`.
  const rangeChain = (pos: Position) => {
    const chain: GeneratedRange[] = [];
    let ranges = decodedScopeInfo.ranges;
    for (;;) {
      const r = ranges.find((r) =>
        comparePositions(r.start, pos) <= 0 && comparePositions(pos, r.end) < 0
      );
      if (!r) return chain;
      chain.push(r);
      ranges = r.children;
    }
  };

  // Raw frame 0: the `throw` inside _outlinedUsingBlock.
  const [, outlined, block, reserveLine, assertFn] = rangeChain(
    gen.at('new RangeError("Invalid'),
  );
  assert(
    outlined.isStackFrame && outlined.isHidden &&
      outlined.originalScope?.name === "reserveOrder",
    "Throw site must be in an outlined range with definition 'reserveOrder'",
  );
  assert(block.originalScope?.kind === "Block", "Outlined body maps to the using block");
  assert(
    !reserveLine.isStackFrame && reserveLine.callSite &&
      reserveLine.originalScope?.name === "reserveLine",
    "reserveLine is inlined into the outlined block",
  );
  assert(
    !assertFn.isStackFrame && assertFn.callSite &&
      assertFn.originalScope?.name === "assertValidQuantity",
    "assertValidQuantity is inlined into reserveLine",
  );

  // Raw frame 1: `body(...)` inside the __using helper.
  const usingChain = rangeChain(gen.at("body(res, ...args)"));
  const usingRange = usingChain.at(-1)!;
  assert(
    usingRange.isStackFrame && usingRange.originalScope === undefined,
    "__using is a helper range without definition",
  );

  // Raw frame 2: the `__using(...)` call in submitOrder.
  const [, submit, reserveOrder] = rangeChain(gen.at("__using(__acquireLock"));
  assert(
    submit.isStackFrame && !submit.isHidden &&
      submit.originalScope?.name === "submitOrder",
    "Caller is the visible submitOrder range",
  );
  assert(
    !reserveOrder.isStackFrame && reserveOrder.callSite &&
      reserveOrder.originalScope === outlined.originalScope,
    "reserveOrder (owner of the outlined block) is inlined into submitOrder",
  );
});

Deno.test("Example 07 inlines the same original function at two distinct call sites", () => {
  const ex07 = getAllExamples().find((e) => e.id === "07-multiple-call-sites")!;
  const { sourceMap, decodedScopeInfo } = buildExampleSourceMap(ex07);

  const compareRange = decodedScopeInfo.ranges[0].children[0];
  const [copyA, copyB] = compareRange.children;
  assert(compareRange.children.length === 2, "Expected two inlined copies");
  assert(
    copyA.originalScope?.name === "toCents" &&
      copyA.originalScope === copyB.originalScope,
    "Both copies reference the same 'toCents' OriginalScope",
  );
  assert(
    !copyA.isStackFrame && !copyB.isStackFrame && copyA.callSite &&
      copyB.callSite && copyA.callSite.line !== copyB.callSite.line,
    "Each copy is inlined with its own callSite",
  );
  assert(
    copyA.values[0] === "a" && copyB.values[0] === "b",
    "Each copy binds 'amount' to its own generated variable",
  );

  // `const cents = ...` must be mapped from both generated copies.
  const centsLine = new TextLocator(ex07.originalSource).at("const cents =").line;
  const mappedGenLines = decode(sourceMap.mappings)
    .flatMap((segments, genLine) =>
      segments.some((s) => s[2] === centsLine) ? [genLine] : []
    );
  assert(
    mappedGenLines.length === 2,
    `Expected 'const cents' to be mapped from 2 generated lines, got ${mappedGenLines}`,
  );
});

Deno.test("All generated bundle.js functions execute and return expected outputs", () => {
  const fakeWindow: Record<string, () => unknown> = {};

  for (const ex of getAllExamples()) {
    if (ex.wasm) continue; // Covered by the dedicated WebAssembly test below.
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

  const res07 = fakeWindow.runExample07() as {
    centsA: number;
    centsB: number;
    cheaper: string;
  };
  assert(res07.centsA === 2500, "Ex07 centsA");
  assert(res07.centsB === 2450, "Ex07 centsB");
  assert(res07.cheaper === "B", "Ex07 cheaper");

  // Ex06: only the caught path; runExample06 throws from a timer by design.
  const originalConsoleError = console.error;
  const logged: unknown[] = [];
  console.error = (e: unknown) => logged.push(e);
  try {
    const stack06 = fakeWindow.logStackExample06() as string;
    assert(
      logged.length === 1 && logged[0] instanceof RangeError &&
        logged[0].message === "Invalid quantity 0 for SKU-B",
      "Ex06 logs the RangeError",
    );
    assert(
      stack06.includes("_outlinedUsingBlock") && stack06.includes("__using"),
      "Ex06 raw stack contains the generated frames",
    );
  } finally {
    console.error = originalConsoleError;
  }
});

Deno.test("Example 08 wasm: ranges/mappings sit on instruction boundaries and the scope tree has the expected shape", () => {
  const ex08 = getAllExamples().find((e) => e.id === "08-webassembly")!;
  assert(ex08.wasm !== undefined, "Example 08 ships a wasm module");
  const { sourceMap, decodedScopeInfo } = buildExampleSourceMap(ex08);
  const { bytes, disassembly } = ex08.wasm;

  // Instruction offsets, parsed from the offset-annotated disassembly.
  const instructionOffsets = new Set(
    disassembly.split("\n")
      .filter((line) => /^0x[0-9a-f]+\s+[a-z]/.test(line))
      .map((line) => parseInt(line.slice(2, line.indexOf(" ")), 16)),
  );
  const functionBodies = decodedScopeInfo.ranges[0].children.map((r) => r.start.column);
  const isBoundary = (column: number) =>
    instructionOffsets.has(column) || functionBodies.includes(column) ||
    decodedScopeInfo.ranges[0].children.some((r) => r.end.column === column);

  // Every mapping segment points at an instruction.
  const mappingLines = decode(sourceMap.mappings);
  assert(mappingLines.length === 1, "Wasm mappings live on a single generated line");
  for (const segment of mappingLines[0]) {
    assert(
      instructionOffsets.has(segment[0]),
      `Mapping at 0x${segment[0].toString(16)} is not an instruction start`,
    );
  }

  // Every range and sub-range boundary is an instruction start or a function boundary.
  const checkRange = (range: GeneratedRange) => {
    for (const p of [range.start, range.end]) {
      assert(p.line === 0, "Wasm range positions are on line 0");
      if (range !== decodedScopeInfo.ranges[0]) {
        assert(isBoundary(p.column), `Range boundary 0x${p.column.toString(16)} is not an instruction`);
      }
    }
    for (const binding of range.values) {
      if (!Array.isArray(binding)) continue;
      for (const sub of binding) {
        assert(isBoundary(sub.from.column), `Sub-range start 0x${sub.from.column.toString(16)}`);
        assert(isBoundary(sub.to.column), `Sub-range end 0x${sub.to.column.toString(16)}`);
      }
    }
    range.children.forEach(checkRange);
  };
  checkRange(decodedScopeInfo.ranges[0]);

  // Shape: adjustPixel (with 2x clampLevel + applyContrast inlined), adjustImage, hidden legalstub.
  const [adjustPixel, adjustImage, legalstub] = decodedScopeInfo.ranges[0].children;
  assert(adjustPixel.originalScope?.name === "adjustPixel" && adjustPixel.isStackFrame, "adjustPixel frame");
  const [clamp1, applyContrast] = adjustPixel.children;
  const clamp2 = applyContrast.children[0];
  assert(
    clamp1.originalScope?.name === "clampLevel" && clamp1.originalScope === clamp2.originalScope &&
      !clamp1.isStackFrame && !clamp2.isStackFrame && clamp1.callSite && clamp2.callSite &&
      clamp1.callSite.line !== clamp2.callSite.line,
    "clampLevel is inlined at two distinct call sites",
  );
  assert(applyContrast.originalScope?.name === "applyContrast" && applyContrast.callSite, "applyContrast inlined");
  assert(adjustImage.originalScope?.name === "adjustImage" && adjustImage.isStackFrame, "adjustImage frame");
  assert(
    adjustImage.children[0].originalScope?.kind === "Block" &&
      adjustImage.children[0].children[0].originalScope?.kind === "Block",
    "adjustImage has nested for/body Block ranges",
  );
  const averageLevel = adjustImage.children[1];
  assert(averageLevel.originalScope?.name === "averageLevel" && averageLevel.callSite, "averageLevel inlined");
  assert(bytes[averageLevel.start.column] === 0x7f, "averageLevel range starts at the trapping i64.div_s");
  assert(
    legalstub.isHidden && legalstub.isStackFrame && !legalstub.originalScope,
    "legalstub$adjustImage is a hidden range without an OriginalScope",
  );

  // The module references its source map via the "sourceMappingURL" custom section.
  assert(
    new TextDecoder().decode(bytes).includes("sourceMappingURL\u0015image-filter.wasm.map"),
    "sourceMappingURL custom section points at image-filter.wasm.map",
  );
});

Deno.test("Example 08 wasm: the module and its JS glue compute the expected results and trap on empty images", async () => {
  const ex08 = getAllExamples().find((e) => e.id === "08-webassembly")!;
  const wasmBytes = ex08.wasm!.bytes;
  const fakeWindow: Record<string, () => unknown> = {};
  const fakeFetch = () =>
    Promise.resolve(
      new Response(wasmBytes, { headers: { "Content-Type": "application/wasm" } }),
    );

  let pixelsAtPause: number[] = [];
  const glue = ex08.generatedCode.replace(
    "debugger;",
    "globalThis.__onPause();",
  );
  (globalThis as Record<string, unknown>).__onPause = () => {
    pixelsAtPause = [...new Uint8Array(memory().buffer, 2064, 4)];
  };
  let instanceMemory: WebAssembly.Memory | undefined;
  const memory = () => instanceMemory!;
  const realInstantiateStreaming = WebAssembly.instantiateStreaming;
  WebAssembly.instantiateStreaming = async (source, imports) => {
    const result = await realInstantiateStreaming(source, imports);
    instanceMemory = result.instance.exports.memory as WebAssembly.Memory;
    return result;
  };
  try {
    new Function("window", "fetch", glue)(fakeWindow, fakeFetch);
    for (let i = 0; i < 50 && !instanceMemory; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const res = fakeWindow.runExample08() as {
      checksum: number;
      pixels: number[];
      lastAverage: number;
      imagesProcessed: number;
    };
    assert(res.checksum === 712, `Ex08 checksum, got ${res.checksum}`);
    assert(res.pixels.join() === "41,161,255,255", `Ex08 pixels, got ${res.pixels}`);
    assert(res.lastAverage === 178, "Ex08 lastAverage");
    assert(res.imagesProcessed === 1, "Ex08 imagesProcessed");
    assert(
      pixelsAtPause.join() === "41,161,255,250",
      `emscripten_debugger() runs once, after pixel 2, got ${pixelsAtPause}`,
    );

    const originalConsoleError = console.error;
    const logged: unknown[] = [];
    console.error = (e: unknown) => logged.push(e);
    try {
      const stack = fakeWindow.logStackExample08() as string;
      assert(
        logged.length === 1 && logged[0] instanceof WebAssembly.RuntimeError &&
          /divide by zero/.test(logged[0].message),
        "Ex08 traps with 'divide by zero' for an empty image",
      );
      assert(
        stack.includes("adjustImage") && stack.includes("legalstub$adjustImage"),
        `Ex08 raw stack contains the wasm frames, got ${stack}`,
      );
    } finally {
      console.error = originalConsoleError;
    }
  } finally {
    WebAssembly.instantiateStreaming = realInstantiateStreaming;
    delete (globalThis as Record<string, unknown>).__onPause;
  }
});
