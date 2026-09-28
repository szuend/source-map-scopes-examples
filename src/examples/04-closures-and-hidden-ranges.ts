import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
import { TextLocator } from "../lib/locator.ts";
import type { ExampleDefinition, MappingPoint } from "../lib/sourcemap.ts";

const originalSource = `// Authored TypeScript: closures-hidden.ts
const DEFAULT_REGION = "us-central1";

export class RateLimiter {
  static readonly VERSION = "3.1.0";

  createEndpointHandler(
    endpointName: string,
    maxBurst: number,
    windowSeconds: number,
  ) {
    let usedTokens = 12;

    return function handleRequest(clientIp: string, requestWeight: number) {
      usedTokens += requestWeight;
      const remainingTokens = maxBurst - usedTokens;
      const allowed = remainingTokens >= 0;

      if (allowed) {
        const burstUtilization = Number(((usedTokens / maxBurst) * 100).toFixed(1));
        debugger; // Pause: Inspect Block, Local, Closure, Class & Hidden Trampoline!
        return {
          region: DEFAULT_REGION,
          endpoint: endpointName,
          clientIp,
          allowed,
          remainingTokens,
          burstUtilization,
        };
      }

      return {
        region: DEFAULT_REGION,
        endpoint: endpointName,
        clientIp,
        allowed: false,
        remainingTokens: 0,
        burstUtilization: 100,
      };
    };
  }
}

export function executeRateLimitCheck() {
  const limiter = new RateLimiter();
  const handler = limiter.createEndpointHandler("/api/v2/inference", 50, 60);
  return handler("192.0.2.44", 8);
}
`;

const generatedCode = `function __withCompilerTrampoline(cb) {
  return cb();
}
function executeRateLimitCheck() {
  const _c = ["/api/v2/inference", 50, 60, 12];
  function handleRequest(ip, w) {
    _c[3] += w;
    const rem = _c[1] - _c[3];
    if (rem >= 0) {
      const util = Number(((_c[3] / _c[1]) * 100).toFixed(1));
      debugger;
      return { region: "us-central1", endpoint: _c[0], clientIp: ip, allowed: true, remainingTokens: rem, burstUtilization: util };
    }
    return { region: "us-central1", endpoint: _c[0], clientIp: ip, allowed: false, remainingTokens: 0, burstUtilization: 100 };
  }
  return __withCompilerTrampoline(function() {
    return handleRequest("192.0.2.44", 8);
  });
}
window.runExample04 = function() {
  return executeRateLimitCheck();
};
//# sourceMappingURL=bundle.js.map
`;

const builderCodeSnippet = `const builder = new SafeScopeInfoBuilder();

// 1. Original Scopes: Module -> Class (RateLimiter) -> Closure (createEndpointHandler)
//    -> Function (handleRequest) -> Block (if allowed)
builder
  .startScope(0, 0, {
    kind: "Module",
    key: "module",
    variables: ["DEFAULT_REGION", "RateLimiter", "executeRateLimitCheck"],
  })
  .startScope(classStart.line, classStart.column, {
    name: "RateLimiter",
    kind: "Class",
    key: "RateLimiter",
    variables: ["VERSION"],
  })
  .startScope(factoryStart.line, factoryStart.column, {
    name: "createEndpointHandler",
    kind: "Function",
    isStackFrame: true,
    key: "createEndpointHandler",
    variables: ["endpointName", "maxBurst", "windowSeconds", "usedTokens"],
  })
  .startScope(handlerStart.line, handlerStart.column, {
    name: "handleRequest",
    kind: "Function",
    isStackFrame: true,
    key: "handleRequest",
    variables: ["clientIp", "requestWeight", "remainingTokens", "allowed"],
  })
  .startScope(ifBlockStart.line, ifBlockStart.column, {
    kind: "Block",
    key: "ifBlock",
    variables: ["burstUtilization"],
  })
  .endScope(ifBlockEnd.line, ifBlockEnd.column)
  .endScope(handlerEnd.line, handlerEnd.column)
  .endScope(factoryEnd.line, factoryEnd.column)
  .endScope(classEnd.line, classEnd.column)
  .startScope(execStart.line, execStart.column, {
    name: "executeRateLimitCheck",
    kind: "Function",
    isStackFrame: true,
    key: "executeRateLimitCheck",
    variables: ["limiter", "handler"],
  })
  .endScope(execEnd.line, execEnd.column)
  .endScope(moduleEnd.line, moduleEnd.column);

// 2. Generated Ranges:
//    - __withCompilerTrampoline is marked with isStackFrame: true, isHidden: true
//      so DevTools omits it from the Call Stack!
//    - Captured closure variables are unpacked from tuple _c[0..3].
builder
  .startRange(0, 0, {
    scopeKey: "module",
    values: ['"us-central1"', null, "executeRateLimitCheck"],
  })
  .startRange(trampolineStart.line, trampolineStart.column, {
    isStackFrame: true,
    isHidden: true, // <--- Hides internal compiler wrapper from Call Stack!
  })
  .endRange(trampolineEnd.line, trampolineEnd.column)
  .startRange(genExecStart.line, genExecStart.column, {
    scopeKey: "executeRateLimitCheck",
    isStackFrame: true,
    values: [null, "handleRequest"],
  })
  .startRange(genClosureStart.line, genClosureStart.column, {
    scopeKey: "createEndpointHandler",
    isStackFrame: false,
    values: ["_c[0]", "_c[1]", "_c[2]", "_c[3]"],
  })
  .startRange(genHandlerStart.line, genHandlerStart.column, {
    scopeKey: "handleRequest",
    isStackFrame: true,
    values: ["ip", "w", "rem", "rem >= 0"],
  })
  .startRange(genIfStart.line, genIfStart.column, {
    scopeKey: "ifBlock",
    values: ["util"],
  })
  .endRange(genIfEnd.line, genIfEnd.column)
  .endRange(genHandlerEnd.line, genHandlerEnd.column)
  .endRange(genClosureEnd.line, genClosureEnd.column)
  // Generated wrapper function that contains authored code from executeRateLimitCheck:
  // keep definition scope pointer ('executeRateLimitCheck') and mark isHidden: true.
  .startRange(genAnonTrampolineStart.line, genAnonTrampolineStart.column, {
    scopeKey: "executeRateLimitCheck",
    isStackFrame: true,
    isHidden: true,
    values: [null, "handleRequest"],
  })
  .endRange(genAnonTrampolineEnd.line, genAnonTrampolineEnd.column)
  .endRange(genExecEnd.line, genExecEnd.column)
  // Generated-only entry helper without corresponding authored code:
  .startRange(genRunStart.line, genRunStart.column, {
    isStackFrame: true,
  })
  .endRange(genRunEnd.line, genRunEnd.column)
  .endRange(genModuleEnd.line, genModuleEnd.column);`;

export function createExample04(): ExampleDefinition {
  const orig = new TextLocator(originalSource);
  const gen = new TextLocator(generatedCode);

  const origModuleEnd = orig.end();
  const classStart = orig.at("export class RateLimiter {");
  const classEnd = orig.after("    };\n  }\n}");

  const factoryStart = orig.at("(\n    endpointName: string,");
  const factoryEnd = orig.after("      };\n    };\n  }");

  const handlerStart = orig.at("(clientIp: string, requestWeight: number)");
  const handlerEnd = orig.after("        burstUtilization: 100,\n      };\n    }");

  const ifBlockStart = orig.at("if (allowed) {");
  const ifBlockEnd = orig.after("          burstUtilization,\n        };\n      }");

  const execStart = orig.at("() {\n  const limiter = new RateLimiter();");
  const execEnd = orig.after('  return handler("192.0.2.44", 8);\n}');

  const genModuleEnd = gen.end();
  const trampolineStart = gen.at("(cb) {");
  const trampolineEnd = gen.after("  return cb();\n}");

  const genExecStart = gen.at("() {\n  const _c =");
  const genExecEnd = gen.after('    return handleRequest("192.0.2.44", 8);\n  });\n}');

  const genClosureStart = gen.at('const _c = ["/api/v2/inference", 50, 60, 12];');
  const genClosureEnd = gen.after(
    '    return { region: "us-central1", endpoint: _c[0], clientIp: ip, allowed: false, remainingTokens: 0, burstUtilization: 100 };\n  }',
  );

  const genHandlerStart = gen.at("(ip, w) {");
  const genHandlerEnd = genClosureEnd;

  const genIfStart = gen.at("if (rem >= 0) {");
  const genIfEnd = gen.after(
    '      return { region: "us-central1", endpoint: _c[0], clientIp: ip, allowed: true, remainingTokens: rem, burstUtilization: util };\n    }',
  );

  const genAnonTrampolineStart = gen.at("() {\n    return handleRequest");
  const genAnonTrampolineEnd = gen.after('    return handleRequest("192.0.2.44", 8);\n  }');

  const genRunStart = gen.at("() {\n  return executeRateLimitCheck();");
  const genRunEnd = gen.after("  return executeRateLimitCheck();\n}");

  const builder = new SafeScopeInfoBuilder();

  builder
    .startScope(0, 0, {
      kind: "Module",
      key: "module",
      variables: ["DEFAULT_REGION", "RateLimiter", "executeRateLimitCheck"],
    })
    .startScope(classStart.line, classStart.column, {
      name: "RateLimiter",
      kind: "Class",
      key: "RateLimiter",
      variables: ["VERSION"],
    })
    .startScope(factoryStart.line, factoryStart.column, {
      name: "createEndpointHandler",
      kind: "Function",
      isStackFrame: true,
      key: "createEndpointHandler",
      variables: ["endpointName", "maxBurst", "windowSeconds", "usedTokens"],
    })
    .startScope(handlerStart.line, handlerStart.column, {
      name: "handleRequest",
      kind: "Function",
      isStackFrame: true,
      key: "handleRequest",
      variables: ["clientIp", "requestWeight", "remainingTokens", "allowed"],
    })
    .startScope(ifBlockStart.line, ifBlockStart.column, {
      kind: "Block",
      key: "ifBlock",
      variables: ["burstUtilization"],
    })
    .endScope(ifBlockEnd.line, ifBlockEnd.column)
    .endScope(handlerEnd.line, handlerEnd.column)
    .endScope(factoryEnd.line, factoryEnd.column)
    .endScope(classEnd.line, classEnd.column)
    .startScope(execStart.line, execStart.column, {
      name: "executeRateLimitCheck",
      kind: "Function",
      isStackFrame: true,
      key: "executeRateLimitCheck",
      variables: ["limiter", "handler"],
    })
    .endScope(execEnd.line, execEnd.column)
    .endScope(origModuleEnd.line, origModuleEnd.column);

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: ['"us-central1"', null, "executeRateLimitCheck"],
    })
    .startRange(trampolineStart.line, trampolineStart.column, {
      isStackFrame: true,
      isHidden: true,
    })
    .endRange(trampolineEnd.line, trampolineEnd.column)
    .startRange(genExecStart.line, genExecStart.column, {
      scopeKey: "executeRateLimitCheck",
      isStackFrame: true,
      values: [null, "handleRequest"],
    })
    .startRange(genClosureStart.line, genClosureStart.column, {
      scopeKey: "createEndpointHandler",
      isStackFrame: false,
      values: ["_c[0]", "_c[1]", "_c[2]", "_c[3]"],
    })
    .startRange(genHandlerStart.line, genHandlerStart.column, {
      scopeKey: "handleRequest",
      isStackFrame: true,
      values: ["ip", "w", "rem", "rem >= 0"],
    })
    .startRange(genIfStart.line, genIfStart.column, {
      scopeKey: "ifBlock",
      values: ["util"],
    })
    .endRange(genIfEnd.line, genIfEnd.column)
    .endRange(genHandlerEnd.line, genHandlerEnd.column)
    .endRange(genClosureEnd.line, genClosureEnd.column)
    .startRange(genAnonTrampolineStart.line, genAnonTrampolineStart.column, {
      scopeKey: "executeRateLimitCheck",
      isStackFrame: true,
      isHidden: true,
      values: [null, "handleRequest"],
    })
    .endRange(genAnonTrampolineEnd.line, genAnonTrampolineEnd.column)
    .endRange(genExecEnd.line, genExecEnd.column)
    .startRange(genRunStart.line, genRunStart.column, {
      isStackFrame: true,
    })
    .endRange(genRunEnd.line, genRunEnd.column)
    .endRange(genModuleEnd.line, genModuleEnd.column);

  const mappings: MappingPoint[] = [
    {
      gen: gen.at("function executeRateLimitCheck"),
      orig: orig.at("export function executeRateLimitCheck"),
      name: "executeRateLimitCheck",
    },
    {
      gen: gen.at('const _c = ["/api/v2/inference", 50, 60, 12];'),
      orig: orig.at("let usedTokens = 12;"),
      name: "usedTokens",
    },
    {
      gen: gen.at("function handleRequest(ip, w)"),
      orig: orig.at(
        "return function handleRequest(clientIp: string, requestWeight: number)",
      ),
      name: "handleRequest",
    },
    {
      gen: gen.at("_c[3] += w;"),
      orig: orig.at("usedTokens += requestWeight;"),
    },
    {
      gen: gen.at("const rem = _c[1] - _c[3];"),
      orig: orig.at("const remainingTokens = maxBurst - usedTokens;"),
      name: "remainingTokens",
    },
    {
      gen: gen.at("if (rem >= 0)"),
      orig: orig.at("if (allowed)"),
    },
    {
      gen: gen.at("const util ="),
      orig: orig.at("const burstUtilization ="),
      name: "burstUtilization",
    },
    {
      gen: gen.at("debugger;"),
      orig: orig.at("debugger; // Pause: Inspect Block"),
    },
    {
      gen: gen.at('return { region: "us-central1", endpoint: _c[0], clientIp: ip, allowed: true'),
      orig: orig.at("return {\n          region: DEFAULT_REGION,"),
    },
    {
      gen: gen.at('return handleRequest("192.0.2.44", 8);'),
      orig: orig.at('return handler("192.0.2.44", 8);'),
    },
  ];

  return {
    id: "04-closures-and-hidden-ranges",
    number: "04",
    title: "Closures, Class Scopes & Hidden Compiler Frames",
    shortTitle: "Closures & Hidden Frames",
    subtitle:
      "Unpack tuple-compressed closure state (_c[0..3]) across nested scopes while hiding internal compiler trampolines (isHidden: true).",
    proposalFeatures: [
      "Nested Scope Chain (Module -> Class -> Closure Function -> Inner Function -> Block)",
      "Hidden Stack Frame Ranges (isStackFrame: true, isHidden: true)",
      "Tuple-Packed Closure Capture Bindings (_c[0] -> endpointName, _c[3] -> usedTokens)",
      "Synthesized Boolean Guard Bindings (rem >= 0 -> allowed)",
    ],
    devtoolsFeatures: [
      "Hiding Internal Trampoline Frames in Call Stack",
      "Multi-Scope Chain Reconstruction (Block + Local + Closure + Module)",
      "Closure Variable Evaluation in Console Debug Evaluate",
    ],
    originalFileName: "closures-hidden.ts",
    originalSource,
    generatedCode,
    builderCodeSnippet,
    scopeInfo: builder.build(),
    mappings,
    overviewHtml: `
      <p>
        Compilers frequently transform closures by packing captured outer variables (<code>endpointName</code>, <code>maxBurst</code>, <code>windowSeconds</code>, <code>usedTokens</code>) into a flat heap array <code>_c = ["/api/v2/inference", 50, 60, 12]</code>, and wrap calls in internal runtime trampolines like <code>__withCompilerTrampoline(cb)</code>.
      </p>
      <p>
        This example demonstrates two key features of the Scopes proposal:
        <br/>1) Marking <code>__withCompilerTrampoline</code>'s range with <code>isHidden: true</code> so Chrome DevTools automatically strips internal compiler frames from the Call Stack.
        <br/>2) Reconstructing the outer <code>createEndpointHandler</code> closure scope from <code>_c[0..3]</code> alongside the inner <code>handleRequest</code> function scope and <code>if (allowed)</code> block scope.
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Call Stack",
        title: "Verify Hidden Trampoline Frames Are Filtered from Call Stack",
        instruction:
          'Open DevTools ("Sources" panel) and click "Run & Pause in Debugger". Execution pauses inside `handleRequest` in `closures-hidden.ts`.',
        expectedObservation:
          'Check the "Call Stack" pane: `handleRequest` is called directly by `executeRateLimitCheck`. Even though `bundle.js` routes execution through `__withCompilerTrampoline(function() { ... })`, both trampoline ranges are marked `isHidden: true` and are hidden from the stack trace!',
      },
      {
        featureTag: "Scope View",
        title: "Inspect the Full Scope Chain (Block -> Local -> Closure -> Module)",
        instruction:
          'Look at the "Scope" sidebar while paused at `debugger;` on line 24 of `closures-hidden.ts`.',
        expectedObservation:
          'You will see: (1) `Block` scope with `burstUtilization: 40`, (2) `handleRequest` Function scope with `clientIp: "192.0.2.44"`, `requestWeight: 8`, `remainingTokens: 30`, `allowed: true`, (3) `createEndpointHandler` Closure scope with `endpointName: "/api/v2/inference"`, `maxBurst: 50`, `windowSeconds: 60`, `usedTokens: 20` (all unpacked from `_c[0..3]`), and (4) `Module` scope with `DEFAULT_REGION: "us-central1"`.',
      },
      {
        featureTag: "Inline Hints & Popover",
        title: "Hover Over Captured Closure Variables in the Editor",
        instruction:
          "In `closures-hidden.ts`, hover over `usedTokens`, `maxBurst`, and `endpointName` inside `handleRequest`.",
        expectedObservation:
          "DevTools resolves the captured identifiers through the outer `createEndpointHandler` range bindings (`_c[3]`, `_c[1]`, `_c[0]`) and shows their live values (`20`, `50`, `\"/api/v2/inference\"`).",
      },
      {
        featureTag: "Debug Evaluate",
        title: "Evaluate Expressions Mixing Block, Local, and Closure Scopes",
        instruction:
          "Open the Console drawer (`Esc`) while paused and run the expressions below.",
        expectedObservation:
          "DevTools seamlessly combines identifiers from the `Block` (`burstUtilization`), `Local` (`remainingTokens`), `Closure` (`endpointName`, `usedTokens`, `maxBurst`), and `Module` (`DEFAULT_REGION`) scopes in a single expression!",
      },
    ],
    evalExpressions: [
      {
        expression: '`${DEFAULT_REGION}:${endpointName} -> ${usedTokens}/${maxBurst} tokens (${burstUtilization}%)`',
        expectedResult: '"us-central1:/api/v2/inference -> 20/50 tokens (40%)"',
        explanation:
          "Combines variables from 4 different scope levels (`Module`, `Closure`, and `Block`) into a single template string.",
      },
      {
        expression: "usedTokens + remainingTokens === maxBurst",
        expectedResult: "true",
        explanation:
          "Substitutes `_c[3] + rem === _c[1]` (`20 + 30 === 50`).",
      },
      {
        expression: "allowed && windowSeconds === 60",
        expectedResult: "true",
        explanation:
          "Substitutes synthesized boolean `rem >= 0` for `allowed` and tuple slot `_c[2]` for `windowSeconds`.",
      },
    ],
    runFunctionName: "runExample04",
  };
}
