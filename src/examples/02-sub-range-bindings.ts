import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
import { TextLocator } from "../lib/locator.ts";
import type { ExampleDefinition, MappingPoint } from "../lib/sourcemap.ts";

const originalSource = `// Authored TypeScript: register-reuse.ts
export interface TelemetryReading {
  sensorId: string;
  rawMillivolts: number;
  calibrationOffset: number;
}

export function processSensorReading(reading: TelemetryReading) {
  // Phase 1: Calibrate raw voltage
  const calibratedMv = reading.rawMillivolts + reading.calibrationOffset;
  debugger; // Step 1: 'r' holds 'calibratedMv' (1250)

  // Phase 2: Convert millivolts to Celsius
  const temperatureCelsius = (calibratedMv - 500) / 10;
  debugger; // Step 2: 'r' is reused for 'temperatureCelsius' (75)

  // Phase 3: Format status alert badge
  const statusBadge = \`[\${reading.sensorId}] \${temperatureCelsius.toFixed(1)}°C (\${
    temperatureCelsius >= 70 ? "WARN" : "OK"
  })\`;
  debugger; // Step 3: 'r' is reused for 'statusBadge'

  return {
    sensorId: reading.sensorId,
    badge: statusBadge,
  };
}
`;

const generatedCode = `function processSensorReading(e) {
  let r = e.rawMillivolts + e.calibrationOffset;
  debugger;
  r = (r - 500) / 10;
  debugger;
  r = "[" + e.sensorId + "] " + r.toFixed(1) + "°C (" + (r >= 70 ? "WARN" : "OK") + ")";
  debugger;
  return { sensorId: e.sensorId, badge: r };
}
window.runExample02 = function() {
  return processSensorReading({
    sensorId: "CORE-TEMP-04",
    rawMillivolts: 1235,
    calibrationOffset: 15
  });
};
//# sourceMappingURL=bundle.js.map
`;

const builderCodeSnippet = `const builder = new SafeScopeInfoBuilder();

builder
  .startSource()
  .startScope(0, 0, {
    kind: "Module",
    key: "module",
    variables: ["processSensorReading"],
  })
  .startScope(origFuncStart.line, origFuncStart.column, {
    name: "processSensorReading",
    kind: "Function",
    isStackFrame: true,
    key: "processSensorReading",
    variables: [
      "reading",
      "calibratedMv",
      "temperatureCelsius",
      "statusBadge",
    ],
  })
  .endScope(origFuncEnd.line, origFuncEnd.column)
  .endScope(origModuleEnd.line, origModuleEnd.column)
  .endSource();

// SubRangeBinding[] tracks how the single generated variable 'r'
// is reused across Phase 1, Phase 2, and Phase 3!
builder
  .startRange(0, 0, {
    scopeKey: "module",
    values: ["processSensorReading"],
  })
  .startRange(genFuncStart.line, genFuncStart.column, {
    scopeKey: "processSensorReading",
    isStackFrame: true,
    values: [
      // 1. reading (valid for entire function)
      "e",

      // 2. calibratedMv (stored in 'r' at Step 1, reconstructed at Step 2, dead at Step 3)
      [
        { from: genFuncStart, to: step1Pos },
        { from: step1Pos, to: step2Pos, value: "r" },
        { from: step2Pos, to: step3Pos, value: "r * 10 + 500" },
        { from: step3Pos, to: genFuncEnd },
      ],

      // 3. temperatureCelsius (unavailable at Step 1, stored in 'r' at Step 2, reconstructed at Step 3)
      [
        { from: genFuncStart, to: step2Pos },
        { from: step2Pos, to: step3Pos, value: "r" },
        {
          from: step3Pos,
          to: genFuncEnd,
          value: "(e.rawMillivolts + e.calibrationOffset - 500) / 10",
        },
      ],

      // 4. statusBadge (unavailable at Steps 1 & 2, stored in 'r' at Step 3)
      [
        { from: genFuncStart, to: step3Pos },
        { from: step3Pos, to: genFuncEnd, value: "r" },
      ],
    ],
  })
  .endRange(genFuncEnd.line, genFuncEnd.column)
  // Generated-only entry helper without corresponding authored code:
  // emit a stack-frame range without a definition OriginalScope.
  .startRange(genRunStart.line, genRunStart.column, {
    isStackFrame: true,
  })
  .endRange(genRunEnd.line, genRunEnd.column)
  .endRange(genModuleEnd.line, genModuleEnd.column);`;

export function createExample02(): ExampleDefinition {
  const orig = new TextLocator(originalSource);
  const gen = new TextLocator(generatedCode);

  const origModuleEnd = orig.end();
  const origFuncStart = orig.at("(reading: TelemetryReading)");
  const origFuncEnd = orig.after("  };\n}");

  const genModuleEnd = gen.end();
  const genFuncStart = gen.at("(e) {");
  const genFuncEnd = gen.after("return { sensorId: e.sensorId, badge: r };\n}");
  const genRunStart = gen.at("() {\n  return processSensorReading(");
  const genRunEnd = gen.after("  });\n}");

  const step1Pos = gen.at("debugger;", 1);
  const step2Pos = gen.at("debugger;", 2);
  const step3Pos = gen.at("debugger;", 3);

  const builder = new SafeScopeInfoBuilder();

  builder
    .startSource()
    .startScope(0, 0, {
      kind: "Module",
      key: "module",
      variables: ["processSensorReading"],
    })
    .startScope(origFuncStart.line, origFuncStart.column, {
      name: "processSensorReading",
      kind: "Function",
      isStackFrame: true,
      key: "processSensorReading",
      variables: [
        "reading",
        "calibratedMv",
        "temperatureCelsius",
        "statusBadge",
      ],
    })
    .endScope(origFuncEnd.line, origFuncEnd.column)
    .endScope(origModuleEnd.line, origModuleEnd.column)
    .endSource();

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: ["processSensorReading"],
    })
    .startRange(genFuncStart.line, genFuncStart.column, {
      scopeKey: "processSensorReading",
      isStackFrame: true,
      values: [
        "e",
        [
          { from: genFuncStart, to: step1Pos },
          { from: step1Pos, to: step2Pos, value: "r" },
          { from: step2Pos, to: step3Pos, value: "r * 10 + 500" },
          { from: step3Pos, to: genFuncEnd },
        ],
        [
          { from: genFuncStart, to: step2Pos },
          { from: step2Pos, to: step3Pos, value: "r" },
          {
            from: step3Pos,
            to: genFuncEnd,
            value: "(e.rawMillivolts + e.calibrationOffset - 500) / 10",
          },
        ],
        [
          { from: genFuncStart, to: step3Pos },
          { from: step3Pos, to: genFuncEnd, value: "r" },
        ],
      ],
    })
    .endRange(genFuncEnd.line, genFuncEnd.column)
    .startRange(genRunStart.line, genRunStart.column, {
      isStackFrame: true,
    })
    .endRange(genRunEnd.line, genRunEnd.column)
    .endRange(genModuleEnd.line, genModuleEnd.column);

  const mappings: MappingPoint[] = [
    {
      gen: gen.at("function processSensorReading"),
      orig: orig.at("export function processSensorReading"),
      name: "processSensorReading",
    },
    {
      gen: gen.at("e) {"),
      orig: orig.at("reading: TelemetryReading"),
      name: "reading",
    },
    {
      gen: gen.at("let r = e.rawMillivolts + e.calibrationOffset;"),
      orig: orig.at(
        "const calibratedMv = reading.rawMillivolts + reading.calibrationOffset;",
      ),
      name: "calibratedMv",
    },
    {
      gen: step1Pos,
      orig: orig.at("debugger; // Step 1"),
    },
    {
      gen: gen.at("r = (r - 500) / 10;"),
      orig: orig.at("const temperatureCelsius = (calibratedMv - 500) / 10;"),
      name: "temperatureCelsius",
    },
    {
      gen: step2Pos,
      orig: orig.at("debugger; // Step 2"),
    },
    {
      gen: gen.at('r = "[" + e.sensorId'),
      orig: orig.at("const statusBadge ="),
      name: "statusBadge",
    },
    {
      gen: step3Pos,
      orig: orig.at("debugger; // Step 3"),
    },
    {
      gen: gen.at("return { sensorId:"),
      orig: orig.at("return {"),
    },
  ];

  return {
    id: "02-sub-range-bindings",
    number: "02",
    title: "Register Reuse & Sub-Range Variable Bindings",
    shortTitle: "Sub-Range Bindings",
    subtitle:
      "Track variable liveness and register coalescing when a single minified variable 'r' is overwritten across multiple stages.",
    proposalFeatures: [
      "SubRangeBinding[] Contiguous Intervals",
      "Register Coalescing / Reuse (r -> calibratedMv, temperatureCelsius, statusBadge)",
      "Temporal Variable Liveness (unavailable before init & after overwrite)",
      "Reverse Algebraic Reconstruction across Sub-Ranges",
    ],
    devtoolsFeatures: [
      "Dynamic Scope View Updates Across PC Steps",
      "Context-Sensitive Inline Hints & Popovers",
      "Sub-Range Autocomplete & Conditional Breakpoints",
      "PC-Aware Console Debug Evaluate",
    ],
    originalFileName: "register-reuse.ts",
    originalSource,
    generatedCode,
    builderCodeSnippet,
    scopeInfo: builder.build(),
    mappings,
    overviewHtml: `
      <p>
        Optimizing compilers and minifiers perform <strong>register allocation / variable coalescing</strong>: if three authored variables (<code>calibratedMv</code>, <code>temperatureCelsius</code>, and <code>statusBadge</code>) have non-overlapping lifetimes, the compiler reuses a single JavaScript variable <code>let r</code> for all three!
      </p>
      <p>
        Without sub-range bindings, mapping all three names to <code>r</code> would cause every variable to show the wrong value (e.g. <code>statusBadge</code> showing <code>1250</code> at Step 1). Using <code>SubRangeBinding[]</code>, each variable specifies exact <code>[from, to)</code> positions in generated code where it is unavailable, bound directly to <code>"r"</code>, or algebraically reconstructed (` +
      "`r * 10 + 500`" +
      `).
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Scope View",
        title: "Step 1: Pause After Voltage Calibration",
        tryPrompt:
          'Click **"Run & Pause in Debugger"** to stop at `debugger; // Step 1` in `register-reuse.ts` (where `let r = 1250`).',
        checkPoints: [
          "**Active Binding:** `calibratedMv` displays `1250` (bound directly to `r`).",
          "**Pre-Initialization Liveness:** `temperatureCelsius` and `statusBadge` both display `<unavailable>` instead of leaking `r`'s current value.",
        ],
      },
      {
        featureTag: "Scope View",
        title: "Step 2: Resume to Celsius Conversion & Observe Register Reuse",
        tryPrompt:
          "Press `F8` (Resume) once to advance to `debugger; // Step 2` (where `r` is overwritten with `75`).",
        checkPoints: [
          "**Reassigned Register:** `temperatureCelsius` becomes live with value `75` (now bound to `r`).",
          '**Reverse Algebraic Binding:** `calibratedMv` stays `1250` because its active sub-range `[step2Pos, step3Pos)` switches its binding expression to `"r * 10 + 500"`.',
          "**Still Uninitialized:** `statusBadge` remains `<unavailable>`.",
        ],
      },
      {
        featureTag: "Inline Hints & Popover",
        title: "Step 3: Resume to Status Badge Formatting",
        tryPrompt:
          "Press `F8` (Resume) once more to reach `debugger; // Step 3` (where `r` is overwritten with the badge string).",
        checkPoints: [
          '**New Register Owner:** `statusBadge` becomes `"[CORE-TEMP-04] 75.0°C (WARN)"` (bound to `r`).',
          "**Clobbered Register:** `calibratedMv` transitions to `<unavailable>` because `r` now holds a string.",
          "**Fallback Expression:** `temperatureCelsius` (`75`) stays live via `(e.rawMillivolts + e.calibrationOffset - 500) / 10`.",
        ],
      },
      {
        featureTag: "Conditional Breakpoints",
        title: "Test Autocomplete & Sub-Range Conditional Breakpoints",
        tryPrompt:
          `Type \`cal\`, \`temp\`, or \`statusB\` in the Console to check autocomplete, or set a conditional breakpoint on line ${orig.lineNumber("const statusBadge =")} (\`const statusBadge = ...\`) with condition \`temperatureCelsius >= 70 && calibratedMv === 1250\`.`,
        checkPoints: [
          "**Autocomplete:** All three coalesced variables appear in Console and breakpoint autocomplete.",
          `**Sub-Range Condition Evaluation:** At line ${orig.lineNumber("const statusBadge =")}, DevTools simultaneously resolves \`temperatureCelsius\` (\`r\`) and \`calibratedMv\` (\`r * 10 + 500\`) to pause execution.`,
        ],
      },
      {
        featureTag: "Debug Evaluate",
        title: "Evaluate Variables Across Different Program Counters",
        tryPrompt:
          "Run the expressions below in the Console at Steps 1, 2, and 3.",
        checkPoints: [
          "**PC-Sensitive Rewriting:** DevTools picks the exact `SubRangeBinding` interval matching the current paused `line:column` in `bundle.js`.",
        ],
      },
    ],
    evalExpressions: [
      {
        expression: "calibratedMv",
        expectedResult: "1250 (at Step 1 & Step 2) | ReferenceError / unavailable (at Step 3)",
        explanation:
          "Resolves to `r` at Step 1, `r * 10 + 500` at Step 2, and is marked unavailable at Step 3.",
      },
      {
        expression: "temperatureCelsius * 1.8 + 32",
        expectedResult: "167 (at Step 2 & Step 3)",
        explanation:
          "Converts Celsius (`75`) to Fahrenheit (`167°F`) using `r` at Step 2 and `(e.rawMillivolts + e.calibrationOffset - 500) / 10` at Step 3.",
      },
      {
        expression: "statusBadge",
        expectedResult: '"[CORE-TEMP-04] 75.0°C (WARN)" (at Step 3)',
        explanation:
          "Resolves to `r` only after execution reaches `step3Pos`.",
      },
    ],
    otherThingsToTry: [
      "Step with `F10` instead of resuming, and watch when each variable switches between a value and `<unavailable>`.",
      "Add `calibratedMv`, `temperatureCelsius` and `statusBadge` as Watch expressions before running.",
      "Set a breakpoint on each `const` line (instead of using `debugger;`) and check the Scope view.",
    ],
    runFunctionName: "runExample02",
  };
}
