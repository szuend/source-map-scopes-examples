import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
import { availableFrom } from "../lib/bindings.ts";
import { TextLocator } from "../lib/locator.ts";
import type { ExampleDefinition, MappingPoint } from "../lib/sourcemap.ts";

const originalSource = `// Authored TypeScript: stepping.ts
export interface CustomsClearance {
  id: string;
  committed: number;
  commit(amount: number): void;
}

declare function openCustomsClearance(trackingId: string): CustomsClearance;

function calculateCustomsDuty(declaredValue: number, category: string): number {
  const rate = category === "electronics" ? 0.12 : 0.05;
  const rawDuty = declaredValue * rate;
  const roundedDuty = Math.round(rawDuty * 100) / 100;
  return roundedDuty;
}

function dispatchPackage(
  trackingId: string,
  declaredValue: number,
  category: string,
) {
  debugger; // Pause: Try Step Over (F10), Step Into (F11) & Step Out (Shift+F11)!
  const handlingFee = 15;
  const dutyAmount = calculateCustomsDuty(declaredValue, category);

  // Transpiled \`using\` block — outlined by the compiler into a separate
  // top-level function \`_outlinedCustomsBlock\` in bundle.js:
  let totalCost = 0;
  {
    const clearance = openCustomsClearance(trackingId);
    const subtotalWithDuty = declaredValue + dutyAmount;
    totalCost = subtotalWithDuty + handlingFee;
    clearance.commit(totalCost);
  }

  return { trackingId, dutyAmount, totalCost };
}

export function runSteppingPipeline() {
  const shipment = dispatchPackage("SHP-9042", 450, "electronics");
  const status = \`Dispatched \${shipment.trackingId}: $\${shipment.totalCost}\`;
  return { shipment, status };
}
`;

const generatedCode = `function __checkPositive(v) {
  if (v < 0) throw new RangeError("Negative value");
  return v;
}
function __openClearance(id) {
  return {
    id,
    committed: 0,
    commit(amt) {
      this.committed = amt;
    }
  };
}
function _outlinedCustomsBlock(id, val, cat, fee, duty) {
  const cl = __openClearance(id);
  const sub = val + duty;
  const tot = sub + fee;
  cl.commit(tot);
  return tot;
}
function dispatchPackage(id, val, cat) {
  debugger;
  const fee = __checkPositive(15);
  const _inlinedArg = __checkPositive(val);
  const r = cat === "electronics" ? 0.12 : 0.05;
  const raw = _inlinedArg * r;
  const duty = Math.round(raw * 100) / 100;
  let tot = 0;
  tot = _outlinedCustomsBlock(id, val, cat, fee, duty);
  return { trackingId: id, dutyAmount: duty, totalCost: tot };
}
function runSteppingPipeline() {
  const s = dispatchPackage("SHP-9042", 450, "electronics");
  const st = "Dispatched " + s.trackingId + ": $" + s.totalCost;
  return { shipment: s, status: st };
}
window.runExample05 = function() {
  return runSteppingPipeline();
};
//# sourceMappingURL=bundle.js.map
`;

const builderCodeSnippet = `const builder = new SafeScopeInfoBuilder();

// 1. Original Scopes:
//    - calculateCustomsDuty (inlined into dispatchPackage)
//    - dispatchPackage + inner customsBlock (outlined into _outlinedCustomsBlock)
//    - runSteppingPipeline (outer caller)
builder
  .startSource()
  .startScope(0, 0, {
    kind: "Module",
    key: "module",
    variables: [
      "openCustomsClearance",
      "calculateCustomsDuty",
      "dispatchPackage",
      "runSteppingPipeline",
    ],
  })
  .startScope(dutyStart.line, dutyStart.column, {
    name: "calculateCustomsDuty",
    kind: "Function",
    isStackFrame: true,
    key: "calculateCustomsDuty",
    variables: ["declaredValue", "category", "rate", "rawDuty", "roundedDuty"],
  })
  .endScope(dutyEnd.line, dutyEnd.column)
  .startScope(dispatchStart.line, dispatchStart.column, {
    name: "dispatchPackage",
    kind: "Function",
    isStackFrame: true,
    key: "dispatchPackage",
    variables: [
      "trackingId",
      "declaredValue",
      "category",
      "handlingFee",
      "dutyAmount",
      "totalCost",
    ],
  })
  .startScope(blockStart.line, blockStart.column, {
    kind: "Block",
    key: "customsBlock",
    variables: ["clearance", "subtotalWithDuty"],
  })
  .endScope(blockEnd.line, blockEnd.column)
  .endScope(dispatchEnd.line, dispatchEnd.column)
  .startScope(pipelineStart.line, pipelineStart.column, {
    name: "runSteppingPipeline",
    kind: "Function",
    isStackFrame: true,
    key: "runSteppingPipeline",
    variables: ["shipment", "status"],
  })
  .endScope(pipelineEnd.line, pipelineEnd.column)
  .endScope(origModuleEnd.line, origModuleEnd.column)
  .endSource();

// 2. Generated Ranges:
//    - __checkPositive & __openClearance: pure compiler helpers (isStackFrame: true, no OriginalScope)
//    - _outlinedCustomsBlock: outlined block function (isStackFrame: true, isHidden: true, scopeKey: "dispatchPackage")
//    - dispatchPackage: contains inlined calculateCustomsDuty range (isStackFrame: false, callSite)
//    - availableFrom(start, from, end, value) = unavailable in [start, from), bound to value in [from, end).
//      Used for generated let/const that are still in their TDZ before their declaration ran.
builder
  .startRange(0, 0, {
    scopeKey: "module",
    values: ["__openClearance", null, "dispatchPackage", "runSteppingPipeline"],
  })
  // Pure compiler helpers (no OriginalScope -> automatically blackboxed during stepping!)
  .startRange(checkPosStart.line, checkPosStart.column, { isStackFrame: true })
  .endRange(checkPosEnd.line, checkPosEnd.column)
  .startRange(openClrStart.line, openClrStart.column, { isStackFrame: true })
  .startRange(commitMethodStart.line, commitMethodStart.column, { isStackFrame: true })
  .endRange(commitMethodEnd.line, commitMethodEnd.column)
  .endRange(openClrEnd.line, openClrEnd.column)
  // Outlined block helper (isStackFrame: true, isHidden: true + definition OriginalScope)
  .startRange(outlinedStart.line, outlinedStart.column, {
    scopeKey: "dispatchPackage",
    isStackFrame: true,
    isHidden: true,
    values: [
      "id", "val", "cat", "fee", "duty",
      // totalCost is still 0 until the outlined 'const tot' is assigned
      [
        { from: outlinedStart, to: afterOutlinedTot, value: "0" },
        { from: afterOutlinedTot, to: outlinedEnd, value: "tot" },
      ],
    ],
  })
  .startRange(outlinedBodyStart.line, outlinedBodyStart.column, {
    scopeKey: "customsBlock",
    isStackFrame: false,
    values: [
      availableFrom(outlinedBodyStart, afterCl, outlinedBodyEnd, "cl"),
      availableFrom(outlinedBodyStart, afterSub, outlinedBodyEnd, "sub"),
    ],
  })
  .endRange(outlinedBodyEnd.line, outlinedBodyEnd.column)
  .endRange(outlinedEnd.line, outlinedEnd.column)
  // Main function with inlined calculateCustomsDuty range
  .startRange(genDispatchStart.line, genDispatchStart.column, {
    scopeKey: "dispatchPackage",
    isStackFrame: true,
    values: [
      "id", "val", "cat",
      availableFrom(genDispatchStart, afterFee, genDispatchEnd, "fee"),
      availableFrom(genDispatchStart, afterDuty, genDispatchEnd, "duty"),
      availableFrom(genDispatchStart, afterTot, genDispatchEnd, "tot"),
    ],
  })
  .startRange(genInlinedStart.line, genInlinedStart.column, {
    scopeKey: "calculateCustomsDuty",
    isStackFrame: false,
    callSite: callSiteCalculateDuty,
    values: [
      "_inlinedArg", "cat",
      availableFrom(genInlinedStart, afterR, genInlinedEnd, "r"),
      availableFrom(genInlinedStart, afterRaw, genInlinedEnd, "raw"),
      null, // roundedDuty: 'duty' is only assigned by the very last statement of this range
    ],
  })
  .endRange(genInlinedEnd.line, genInlinedEnd.column)
  .endRange(genDispatchEnd.line, genDispatchEnd.column)
  .startRange(genPipelineStart.line, genPipelineStart.column, {
    scopeKey: "runSteppingPipeline",
    isStackFrame: true,
    values: [
      availableFrom(genPipelineStart, afterS, genPipelineEnd, "s"),
      availableFrom(genPipelineStart, afterSt, genPipelineEnd, "st"),
    ],
  })
  .endRange(genPipelineEnd.line, genPipelineEnd.column)
  .startRange(genRunStart.line, genRunStart.column, { isStackFrame: true })
  .endRange(genRunEnd.line, genRunEnd.column)
  .endRange(genModuleEnd.line, genModuleEnd.column);`;

export function createExample05(): ExampleDefinition {
  const orig = new TextLocator(originalSource);
  const gen = new TextLocator(generatedCode);

  const origModuleEnd = orig.end();
  const dutyStart = orig.at("(declaredValue: number, category: string)");
  const dutyEnd = orig.after("  return roundedDuty;\n}");

  const dispatchStart = orig.at("(\n  trackingId: string,");
  const dispatchEnd = orig.after("  return { trackingId, dutyAmount, totalCost };\n}");

  const blockStart = orig.at("{\n    const clearance = openCustomsClearance(trackingId);");
  const blockEnd = orig.after("    clearance.commit(totalCost);\n  }");

  const pipelineStart = orig.at("() {\n  const shipment = dispatchPackage");
  const pipelineEnd = orig.after("  return { shipment, status };\n}");

  const callSiteCalculateDuty = orig.origAt(
    "calculateCustomsDuty(declaredValue, category)",
  );

  const genModuleEnd = gen.end();
  const checkPosStart = gen.at("(v) {");
  const checkPosEnd = gen.after("  return v;\n}");

  const openClrStart = gen.at("(id) {\n  return {");
  const openClrEnd = gen.after("    }\n  };\n}");
  const commitMethodStart = gen.at("(amt) {");
  const commitMethodEnd = gen.after("      this.committed = amt;\n    }");

  const outlinedStart = gen.at("(id, val, cat, fee, duty) {");
  const outlinedEnd = gen.after("  return tot;\n}");
  const outlinedBodyStart = gen.at("const cl = __openClearance(id);");
  const outlinedBodyEnd = gen.after("  cl.commit(tot);");

  const genDispatchStart = gen.at("(id, val, cat) {");
  const genDispatchEnd = gen.after(
    "  return { trackingId: id, dutyAmount: duty, totalCost: tot };\n}",
  );

  const genInlinedStart = gen.at('const r = cat === "electronics" ? 0.12 : 0.05;');
  const genInlinedEnd = gen.after("const duty = Math.round(raw * 100) / 100;");

  const genPipelineStart = gen.at("() {\n  const s = dispatchPackage");
  const genPipelineEnd = gen.after("  return { shipment: s, status: st };\n}");

  const genRunStart = gen.at("() {\n  return runSteppingPipeline();");
  const genRunEnd = gen.after("  return runSteppingPipeline();\n}");

  // TDZ boundaries: generated let/const become readable after their declaration ran.
  const afterCl = gen.after("const cl = __openClearance(id);");
  const afterSub = gen.after("const sub = val + duty;");
  const afterOutlinedTot = gen.after("const tot = sub + fee;");
  const afterFee = gen.after("const fee = __checkPositive(15);");
  const afterR = gen.after('const r = cat === "electronics" ? 0.12 : 0.05;');
  const afterRaw = gen.after("const raw = _inlinedArg * r;");
  const afterDuty = genInlinedEnd;
  const afterTot = gen.after("let tot = 0;");
  const afterS = gen.after('const s = dispatchPackage("SHP-9042", 450, "electronics");');
  const afterSt = gen.after('const st = "Dispatched " + s.trackingId + ": $" + s.totalCost;');

  const builder = new SafeScopeInfoBuilder();

  builder
    .startSource()
    .startScope(0, 0, {
      kind: "Module",
      key: "module",
      variables: [
        "openCustomsClearance",
        "calculateCustomsDuty",
        "dispatchPackage",
        "runSteppingPipeline",
      ],
    })
    .startScope(dutyStart.line, dutyStart.column, {
      name: "calculateCustomsDuty",
      kind: "Function",
      isStackFrame: true,
      key: "calculateCustomsDuty",
      variables: ["declaredValue", "category", "rate", "rawDuty", "roundedDuty"],
    })
    .endScope(dutyEnd.line, dutyEnd.column)
    .startScope(dispatchStart.line, dispatchStart.column, {
      name: "dispatchPackage",
      kind: "Function",
      isStackFrame: true,
      key: "dispatchPackage",
      variables: [
        "trackingId",
        "declaredValue",
        "category",
        "handlingFee",
        "dutyAmount",
        "totalCost",
      ],
    })
    .startScope(blockStart.line, blockStart.column, {
      kind: "Block",
      key: "customsBlock",
      variables: ["clearance", "subtotalWithDuty"],
    })
    .endScope(blockEnd.line, blockEnd.column)
    .endScope(dispatchEnd.line, dispatchEnd.column)
    .startScope(pipelineStart.line, pipelineStart.column, {
      name: "runSteppingPipeline",
      kind: "Function",
      isStackFrame: true,
      key: "runSteppingPipeline",
      variables: ["shipment", "status"],
    })
    .endScope(pipelineEnd.line, pipelineEnd.column)
    .endScope(origModuleEnd.line, origModuleEnd.column)
    .endSource();

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: ["__openClearance", null, "dispatchPackage", "runSteppingPipeline"],
    })
    .startRange(checkPosStart.line, checkPosStart.column, {
      isStackFrame: true,
    })
    .endRange(checkPosEnd.line, checkPosEnd.column)
    .startRange(openClrStart.line, openClrStart.column, {
      isStackFrame: true,
    })
    .startRange(commitMethodStart.line, commitMethodStart.column, {
      isStackFrame: true,
    })
    .endRange(commitMethodEnd.line, commitMethodEnd.column)
    .endRange(openClrEnd.line, openClrEnd.column)
    .startRange(outlinedStart.line, outlinedStart.column, {
      scopeKey: "dispatchPackage",
      isStackFrame: true,
      isHidden: true,
      values: [
        "id",
        "val",
        "cat",
        "fee",
        "duty",
        // totalCost is still 0 until the outlined 'const tot' is assigned.
        [
          { from: outlinedStart, to: afterOutlinedTot, value: "0" },
          { from: afterOutlinedTot, to: outlinedEnd, value: "tot" },
        ],
      ],
    })
    .startRange(outlinedBodyStart.line, outlinedBodyStart.column, {
      scopeKey: "customsBlock",
      isStackFrame: false,
      values: [
        availableFrom(outlinedBodyStart, afterCl, outlinedBodyEnd, "cl"),
        availableFrom(outlinedBodyStart, afterSub, outlinedBodyEnd, "sub"),
      ],
    })
    .endRange(outlinedBodyEnd.line, outlinedBodyEnd.column)
    .endRange(outlinedEnd.line, outlinedEnd.column)
    .startRange(genDispatchStart.line, genDispatchStart.column, {
      scopeKey: "dispatchPackage",
      isStackFrame: true,
      values: [
        "id",
        "val",
        "cat",
        availableFrom(genDispatchStart, afterFee, genDispatchEnd, "fee"),
        availableFrom(genDispatchStart, afterDuty, genDispatchEnd, "duty"),
        availableFrom(genDispatchStart, afterTot, genDispatchEnd, "tot"),
      ],
    })
    .startRange(genInlinedStart.line, genInlinedStart.column, {
      scopeKey: "calculateCustomsDuty",
      isStackFrame: false,
      callSite: callSiteCalculateDuty,
      values: [
        "_inlinedArg",
        "cat",
        availableFrom(genInlinedStart, afterR, genInlinedEnd, "r"),
        availableFrom(genInlinedStart, afterRaw, genInlinedEnd, "raw"),
        // roundedDuty: 'duty' is only assigned by the very last statement of this range.
        null,
      ],
    })
    .endRange(genInlinedEnd.line, genInlinedEnd.column)
    .endRange(genDispatchEnd.line, genDispatchEnd.column)
    .startRange(genPipelineStart.line, genPipelineStart.column, {
      scopeKey: "runSteppingPipeline",
      isStackFrame: true,
      values: [
        availableFrom(genPipelineStart, afterS, genPipelineEnd, "s"),
        availableFrom(genPipelineStart, afterSt, genPipelineEnd, "st"),
      ],
    })
    .endRange(genPipelineEnd.line, genPipelineEnd.column)
    .startRange(genRunStart.line, genRunStart.column, {
      isStackFrame: true,
    })
    .endRange(genRunEnd.line, genRunEnd.column)
    .endRange(genModuleEnd.line, genModuleEnd.column);

  // Note:
  // - __checkPositive, __openClearance, return tot; (in _outlinedCustomsBlock), and
  //   tot = _outlinedCustomsBlock(...) have NO mappings so unmapped positions are
  //   automatically stepped through and pure helpers are blackboxed.
  const mappings: MappingPoint[] = [
    // Outlined block statements -> mapped to the { ... } block in dispatchPackage
    {
      gen: gen.at("const cl = __openClearance(id);"),
      orig: orig.at("const clearance = openCustomsClearance(trackingId);"),
      name: "clearance",
    },
    {
      gen: gen.at("const sub = val + duty;"),
      orig: orig.at("const subtotalWithDuty = declaredValue + dutyAmount;"),
      name: "subtotalWithDuty",
    },
    {
      gen: gen.at("const tot = sub + fee;"),
      orig: orig.at("totalCost = subtotalWithDuty + handlingFee;"),
    },
    {
      gen: gen.at("cl.commit(tot);"),
      orig: orig.at("clearance.commit(totalCost);"),
    },

    // dispatchPackage & inlined calculateCustomsDuty statements
    {
      gen: gen.at("function dispatchPackage"),
      orig: orig.at("function dispatchPackage"),
      name: "dispatchPackage",
    },
    {
      gen: gen.at("debugger;"),
      orig: orig.at("debugger; // Pause: Try Step Over"),
    },
    {
      gen: gen.at("const fee = __checkPositive(15);"),
      orig: orig.at("const handlingFee = 15;"),
      name: "handlingFee",
    },
    {
      gen: gen.at("const _inlinedArg = __checkPositive(val);"),
      orig: orig.at("const dutyAmount = calculateCustomsDuty(declaredValue, category);"),
      name: "dutyAmount",
    },
    {
      gen: gen.at('const r = cat === "electronics" ? 0.12 : 0.05;'),
      orig: orig.at('const rate = category === "electronics" ? 0.12 : 0.05;'),
      name: "rate",
    },
    {
      gen: gen.at("const raw = _inlinedArg * r;"),
      orig: orig.at("const rawDuty = declaredValue * rate;"),
      name: "rawDuty",
    },
    {
      gen: gen.at("const duty = Math.round(raw * 100) / 100;"),
      orig: orig.at("const roundedDuty = Math.round(rawDuty * 100) / 100;"),
      name: "roundedDuty",
    },
    {
      gen: gen.at("let tot = 0;"),
      orig: orig.at("let totalCost = 0;"),
      name: "totalCost",
    },
    {
      gen: gen.at("return { trackingId: id, dutyAmount: duty, totalCost: tot };"),
      orig: orig.at("return { trackingId, dutyAmount, totalCost };"),
    },

    // runSteppingPipeline statements
    {
      gen: gen.at("function runSteppingPipeline"),
      orig: orig.at("export function runSteppingPipeline"),
      name: "runSteppingPipeline",
    },
    {
      gen: gen.at('const s = dispatchPackage("SHP-9042", 450, "electronics");'),
      orig: orig.at('const shipment = dispatchPackage("SHP-9042", 450, "electronics");'),
      name: "shipment",
    },
    {
      gen: gen.at('const st = "Dispatched " + s.trackingId + ": $" + s.totalCost;'),
      orig: orig.at("const status = `Dispatched ${shipment.trackingId}: $${shipment.totalCost}`;"),
      name: "status",
    },
    {
      gen: gen.at("return { shipment: s, status: st };"),
      orig: orig.at("return { shipment, status };"),
    },
  ];

  // 1-based line number in stepping.ts, for walkthrough text.
  const L = (needle: string) => orig.lineNumber(needle);

  return {
    id: "05-logical-stepping",
    number: "05",
    title: "Logical Stepping Across Inlined & Outlined Functions",
    shortTitle: "Logical Stepping",
    subtitle:
      "Step Over, Into, and Out of inlined helper functions and outlined transpiled blocks while automatically skipping compiler helpers.",
    proposalFeatures: [
      "Multi-Statement Inlined Range (calculateCustomsDuty)",
      "Outlined Function Range (isStackFrame: true, isHidden: true + OriginalScope)",
      "Pure Compiler Helper Ranges (isStackFrame: true, no OriginalScope)",
      "Unmapped Compiler Glue Auto-Stepping",
    ],
    devtoolsFeatures: [
      "Step Over (F10) Skips Inlined Callee Ranges",
      "Step Out (Shift+F11) Exits Inlined Body to Caller",
      "Step Over (F10) Enters Outlined Block Seamlessly",
      "Step Out (Shift+F11) Exits Both Outlined Block & Owner Function",
      "Automatic V8 Blackboxing of Pure Compiler Helpers",
    ],
    originalFileName: "stepping.ts",
    originalSource,
    generatedCode,
    builderCodeSnippet,
    scopeInfo: builder.build(),
    mappings,
    overviewHtml: `
      <p>
        Compilers routinely both <strong>inline</strong> helper calls (<code>calculateCustomsDuty</code> flattened into <code>dispatchPackage</code>) and <strong>outline</strong> transpiled language constructs (such as extracting a block into a separate top-level function <code>_outlinedCustomsBlock</code> marked <code>isStackFrame: true, isHidden: true</code> with a definition <code>OriginalScope</code>), while injecting pure runtime helpers like <code>__checkPositive</code> (<code>isStackFrame: true</code> with no <code>OriginalScope</code>).
      </p>
      <p>
        With scope-aware <strong>Logical Stepping</strong>, Chrome DevTools follows the <em>authored</em> control flow:
        <strong>Step Over (<code>F10</code>)</strong> skips over inlined callees but steps <em>through</em> outlined blocks; <strong>Step Out (<code>Shift+F11</code>)</strong> exits an inlined function back to its caller or exits an outlined block all the way out of its enclosing authored function; and pure compiler helpers / unmapped glue are skipped automatically.
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Logical Stepping",
        title: "1. Step Over (F10) an Inlined Call & Pure Compiler Helpers",
        tryPrompt:
          `Click **"Run & Pause in Debugger"** to pause at \`debugger;\` (line ${L("debugger;")} of \`stepping.ts\`), then press **Step Over (\`F10\`)** three times.`,
        checkPoints: [
          `**At the \`debugger;\`:** \`handlingFee\`, \`dutyAmount\` and \`totalCost\` show as \`<unavailable>\` (not initialized yet).`,
          `**1st \`F10\` (Line ${L("const handlingFee")} \`const handlingFee = 15;\`):** Stops on line ${L("const handlingFee")} (\`__checkPositive(15)\` in \`bundle.js\` is not entered).`,
          `**2nd \`F10\` (Line ${L("const dutyAmount")} \`const dutyAmount = calculateCustomsDuty(...)\`):** Stops at the call site before entering the inlined range.`,
          `**3rd \`F10\` (Skips Inlined Body &rarr; Line ${L("let totalCost")} \`let totalCost = 0;\`):** DevTools passes the inlined callee range in \`skipList\`, skipping all 3 statements of \`calculateCustomsDuty\`!`,
        ],
      },
      {
        featureTag: "Logical Stepping",
        title: "2. Step Into (F11) & Step Out (Shift+F11) of an Inlined Function",
        tryPrompt:
          `Re-run, press \`F10\` twice to reach line ${L("const dutyAmount")} (\`calculateCustomsDuty(...)\`), press **Step Into (\`F11\`)**, then press **Step Out (\`Shift+F11\`)**.`,
        checkPoints: [
          `**Step Into (\`F11\`) Enters Inlined Body:** Execution moves to line ${L("const rate")} (\`const rate = ...\`) inside \`calculateCustomsDuty\`, and the Call Stack adds the virtual \`calculateCustomsDuty\` frame.`,
          "**Pure Helper Skipped on `F11`:** Even though `const _inlinedArg = __checkPositive(val)` runs first on that line, `__checkPositive` has no original scope, so `F11` lands directly in `calculateCustomsDuty`.",
          `**Step Out (\`Shift+F11\`) Returns to Caller:** Pressing \`Shift+F11\` inside \`calculateCustomsDuty\` skips its remaining lines (\`rawDuty\`, \`roundedDuty\`) and pauses back in \`dispatchPackage\` on line ${L("let totalCost")} (\`let totalCost = 0;\`).`,
        ],
      },
      {
        featureTag: "Logical Stepping",
        title: "3. Step Over (F10) Seamlessly Through an Outlined Block",
        tryPrompt:
          `From line ${L("let totalCost")} (\`let totalCost = 0;\`), press **Step Over (\`F10\`)** repeatedly through lines ${L("const clearance")}–${L("return { trackingId")}.`,
        checkPoints: [
          `**Enters \`_outlinedCustomsBlock\` Automatically:** Even though \`{ const clearance = ... }\` is extracted into a separate function \`_outlinedCustomsBlock\` in \`bundle.js\`, \`F10\` steps *into* line ${L("const clearance")} (\`const clearance = openCustomsClearance(trackingId);\`) instead of skipping the call!`,
          "**Merged Call Stack & Live Scopes:** While paused inside the outlined block, the Call Stack shows `dispatchPackage` (hiding `_outlinedCustomsBlock`), and the Scope pane shows both `Block` (`clearance`, `subtotalWithDuty`) and `dispatchPackage` variables. `totalCost` is `0` until the `totalCost = ...` line ran.",
          `**Seamless Exit:** Pressing \`F10\` after \`clearance.commit(totalCost);\` skips the unmapped \`return tot;\` and pauses on line ${L("return { trackingId")} (\`return { trackingId, dutyAmount, totalCost };\`).`,
        ],
      },
      {
        featureTag: "Logical Stepping",
        title: "4. Step Out (Shift+F11) from Inside an Outlined Block",
        tryPrompt:
          `Re-run, step (\`F10\`) into line ${L("const subtotalWithDuty")} (\`const subtotalWithDuty = ...\`) inside the outlined block, and press **Step Out (\`Shift+F11\`)**.`,
        checkPoints: [
          `**Exits the Whole Authored Function (\`dispatchPackage\`):** Instead of merely returning from \`_outlinedCustomsBlock\` back into \`dispatchPackage\`, DevTools unwinds both \`_outlinedCustomsBlock\` and \`dispatchPackage\`, pausing in the caller \`runSteppingPipeline()\` (line ${L("const status")})!`,
        ],
      },
    ],
    evalExpressions: [
      {
        expression: "{ trackingId, declaredValue, handlingFee, dutyAmount }",
        expectedResult: '{ trackingId: "SHP-9042", declaredValue: 450, handlingFee: 15, dutyAmount: 54 }',
        explanation:
          "Works in `dispatchPackage` once `dutyAmount` is initialized (before that, `handlingFee`/`dutyAmount` are unavailable) and while paused inside `_outlinedCustomsBlock` via its `dispatchPackage` definition scope bindings.",
      },
      {
        expression: "subtotalWithDuty + handlingFee",
        expectedResult: "519 (when paused inside the outlined block after line 31)",
        explanation:
          "Combines `subtotalWithDuty` (`sub` in `customsBlock`) with `handlingFee` (`fee` in `dispatchPackage`).",
      },
    ],
    runFunctionName: "runExample05",
  };
}
