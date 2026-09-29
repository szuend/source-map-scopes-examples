import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
import { TextLocator } from "../lib/locator.ts";
import type { ExampleDefinition, MappingPoint } from "../lib/sourcemap.ts";

const originalSource = `// Authored TypeScript: order-pricing.ts
const TAX_RATE = 0.085;
const CURRENCY = "USD";
const FREE_SHIPPING_MIN = 100;

export interface Customer {
  firstName: string;
  lastName: string;
  tier: "standard" | "vip";
}

export interface LineItem {
  sku: string;
  unitPrice: number;
  quantity: number;
}

export function calculateInvoice(customer: Customer, items: LineItem[]) {
  const fullName = \`\${customer.firstName} \${customer.lastName}\`;
  const isVip = customer.tier === "vip";
  const rawAuditToken = Math.random().toString(36);

  let subtotal = 0;
  for (const item of items) {
    const lineTotal = item.unitPrice * item.quantity;
    subtotal += lineTotal; // Try a Conditional Breakpoint here: item.quantity > 1 && lineTotal < 100
  }

  const discountRate = isVip ? 0.15 : 0.0;
  const discountedSubtotal = subtotal * (1 - discountRate);
  const taxAmount = discountedSubtotal * TAX_RATE;
  const shippingFee = discountedSubtotal >= FREE_SHIPPING_MIN ? 0 : 12.99;
  const grandTotal = discountedSubtotal + taxAmount + shippingFee;

  debugger; // Pause: Inspect folded constants, autocomplete & synthesized expressions

  return {
    recipient: fullName,
    currency: CURRENCY,
    grandTotal: Number(grandTotal.toFixed(2)),
  };
}
`;

const generatedCode = `function calculateInvoice(c, a) {
  let s = 0;
  for (const i of a) {
    s += i.unitPrice * i.quantity;
  }
  const d = s * (c.tier === "vip" ? 0.85 : 1);
  const g = d * 1.085 + (d >= 100 ? 0 : 12.99);
  debugger;
  return { recipient: c.firstName + " " + c.lastName, currency: "USD", grandTotal: Number(g.toFixed(2)) };
}
window.runExample01 = function() {
  return calculateInvoice(
    { firstName: "Ada", lastName: "Lovelace", tier: "vip" },
    [
      { sku: "MECH-KB", unitPrice: 140, quantity: 1 },
      { sku: "USB-C-CABLE", unitPrice: 22.5, quantity: 2 },
      { sku: "KEYCAP-SET", unitPrice: 65, quantity: 1 }
    ]
  );
};
//# sourceMappingURL=bundle.js.map
`;

const builderCodeSnippet = `const builder = new SafeScopeInfoBuilder();

// 1. Original Scopes Tree (order-pricing.ts)
builder
  .startScope(0, 0, {
    kind: "Module",
    key: "module",
    variables: ["TAX_RATE", "CURRENCY", "FREE_SHIPPING_MIN", "calculateInvoice"],
  })
  .startScope(funcStart.line, funcStart.column, {
    name: "calculateInvoice",
    kind: "Function",
    isStackFrame: true,
    key: "calculateInvoice",
    variables: [
      "customer",
      "items",
      "fullName",
      "isVip",
      "rawAuditToken",
      "subtotal",
      "discountRate",
      "discountedSubtotal",
      "taxAmount",
      "shippingFee",
      "grandTotal",
    ],
  })
  .startScope(loopStart.line, loopStart.column, {
    kind: "Block",
    key: "forOfLoop",
    variables: ["item", "lineTotal"],
  })
  .endScope(loopEnd.line, loopEnd.column)
  .endScope(funcEnd.line, funcEnd.column)
  .endScope(moduleEnd.line, moduleEnd.column);

// 2. Generated Ranges & Binding Expressions (bundle.js)
builder
  .startRange(0, 0, {
    scopeKey: "module",
    values: ["0.085", '"USD"', "100", "calculateInvoice"],
  })
  .startRange(genFuncStart.line, genFuncStart.column, {
    scopeKey: "calculateInvoice",
    isStackFrame: true,
    values: [
      "c",                              // customer
      "a",                              // items
      'c.firstName + " " + c.lastName', // fullName (synthesized!)
      'c.tier === "vip"',               // isVip (synthesized!)
      null,                             // rawAuditToken (dead-code eliminated -> <unavailable>)
      "s",                              // subtotal
      'c.tier === "vip" ? 0.15 : 0',    // discountRate (synthesized!)
      "d",                              // discountedSubtotal
      "d * 0.085",                      // taxAmount (synthesized!)
      "d >= 100 ? 0 : 12.99",           // shippingFee (synthesized!)
      "g",                              // grandTotal
    ],
  })
  .startRange(genLoopStart.line, genLoopStart.column, {
    scopeKey: "forOfLoop",
    values: [
      "i",                        // item
      "i.unitPrice * i.quantity", // lineTotal (synthesized!)
    ],
  })
  .endRange(genLoopEnd.line, genLoopEnd.column)
  .endRange(genFuncEnd.line, genFuncEnd.column)
  // Generated-only entry helper without corresponding authored code:
  // emit a stack-frame range without a definition OriginalScope.
  .startRange(genRunStart.line, genRunStart.column, {
    isStackFrame: true,
  })
  .endRange(genRunEnd.line, genRunEnd.column)
  .endRange(genModuleEnd.line, genModuleEnd.column);`;

export function createExample01(): ExampleDefinition {
  const orig = new TextLocator(originalSource);
  const gen = new TextLocator(generatedCode);

  const origModuleEnd = orig.end();
  const origFuncStart = orig.at("(customer: Customer");
  const origFuncEnd = orig.after("  };\n}");
  const origLoopStart = orig.at("for (const item of items) {");
  const origLoopEnd = orig.after(
    "    subtotal += lineTotal; // Try a Conditional Breakpoint here: item.quantity > 1 && lineTotal < 100\n  }",
  );

  const genModuleEnd = gen.end();
  const genFuncStart = gen.at("(c, a) {");
  const genFuncEnd = gen.after("grandTotal: Number(g.toFixed(2)) };\n}");
  const genLoopStart = gen.at("for (const i of a) {");
  const genLoopEnd = gen.after("    s += i.unitPrice * i.quantity;\n  }");
  const genRunStart = gen.at("() {\n  return calculateInvoice(");
  const genRunEnd = gen.after("  );\n}");

  const builder = new SafeScopeInfoBuilder();

  builder
    .startScope(0, 0, {
      kind: "Module",
      key: "module",
      variables: [
        "TAX_RATE",
        "CURRENCY",
        "FREE_SHIPPING_MIN",
        "calculateInvoice",
      ],
    })
    .startScope(origFuncStart.line, origFuncStart.column, {
      name: "calculateInvoice",
      kind: "Function",
      isStackFrame: true,
      key: "calculateInvoice",
      variables: [
        "customer",
        "items",
        "fullName",
        "isVip",
        "rawAuditToken",
        "subtotal",
        "discountRate",
        "discountedSubtotal",
        "taxAmount",
        "shippingFee",
        "grandTotal",
      ],
    })
    .startScope(origLoopStart.line, origLoopStart.column, {
      kind: "Block",
      key: "forOfLoop",
      variables: ["item", "lineTotal"],
    })
    .endScope(origLoopEnd.line, origLoopEnd.column)
    .endScope(origFuncEnd.line, origFuncEnd.column)
    .endScope(origModuleEnd.line, origModuleEnd.column);

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: ["0.085", '"USD"', "100", "calculateInvoice"],
    })
    .startRange(genFuncStart.line, genFuncStart.column, {
      scopeKey: "calculateInvoice",
      isStackFrame: true,
      values: [
        "c",
        "a",
        'c.firstName + " " + c.lastName',
        'c.tier === "vip"',
        null,
        "s",
        'c.tier === "vip" ? 0.15 : 0',
        "d",
        "d * 0.085",
        "d >= 100 ? 0 : 12.99",
        "g",
      ],
    })
    .startRange(genLoopStart.line, genLoopStart.column, {
      scopeKey: "forOfLoop",
      values: ["i", "i.unitPrice * i.quantity"],
    })
    .endRange(genLoopEnd.line, genLoopEnd.column)
    .endRange(genFuncEnd.line, genFuncEnd.column)
    .startRange(genRunStart.line, genRunStart.column, {
      isStackFrame: true,
    })
    .endRange(genRunEnd.line, genRunEnd.column)
    .endRange(genModuleEnd.line, genModuleEnd.column);

  const mappings: MappingPoint[] = [
    {
      gen: gen.at("function calculateInvoice"),
      orig: orig.at("export function calculateInvoice"),
      name: "calculateInvoice",
    },
    {
      gen: gen.at("c, a"),
      orig: orig.at("customer: Customer"),
      name: "customer",
    },
    {
      gen: gen.at("a) {"),
      orig: orig.at("items: LineItem[]"),
      name: "items",
    },
    {
      gen: gen.at("let s = 0;"),
      orig: orig.at("let subtotal = 0;"),
      name: "subtotal",
    },
    {
      gen: gen.at("for (const i of a)"),
      orig: orig.at("for (const item of items)"),
    },
    {
      gen: gen.at("i of a"),
      orig: orig.at("item of items"),
      name: "item",
    },
    {
      gen: gen.at("s += i.unitPrice * i.quantity;"),
      orig: orig.at("subtotal += lineTotal;"),
    },
    {
      gen: gen.at("i.unitPrice * i.quantity;"),
      orig: orig.at("const lineTotal = item.unitPrice * item.quantity;"),
      name: "lineTotal",
    },
    {
      gen: gen.at("const d ="),
      orig: orig.at("const discountedSubtotal ="),
      name: "discountedSubtotal",
    },
    {
      gen: gen.at("const g ="),
      orig: orig.at("const grandTotal ="),
      name: "grandTotal",
    },
    {
      gen: gen.at("debugger;"),
      orig: orig.at("debugger; // Pause: Inspect folded constants"),
    },
    {
      gen: gen.at("return { recipient:"),
      orig: orig.at("return {"),
    },
  ];

  return {
    id: "01-bindings-and-expressions",
    number: "01",
    title: "Variable Renaming, Constant Folding & Binding Expressions",
    shortTitle: "Bindings & Expressions",
    subtitle:
      "Reconstruct mangled identifiers, folded module constants, complex multi-variable expressions, and eliminated dead variables.",
    proposalFeatures: [
      "OriginalScope (Module, Function, Block)",
      "Simple Identifier Bindings (c -> customer)",
      "Constant Literal Bindings (0.085 -> TAX_RATE)",
      "Complex JS Expression Bindings (d * 0.085 -> taxAmount)",
      "Null / Eliminated Variable Bindings (null -> rawAuditToken)",
    ],
    devtoolsFeatures: [
      "Scope Sidebar Reconstruction",
      "Inline Variable Hints & Hover Popovers",
      "Scope-Aware Autocomplete Suggestions",
      "Conditional Breakpoints with Original Names",
      "Console Debug Evaluate (AST Substitution)",
    ],
    originalFileName: "order-pricing.ts",
    originalSource,
    generatedCode,
    builderCodeSnippet,
    scopeInfo: builder.build(),
    mappings,
    overviewHtml: `
      <p>
        Production minifiers rename identifiers (<code>customer</code> &rarr; <code>c</code>), fold module constants directly into arithmetic (<code>TAX_RATE = 0.085</code> disappears), eliminate unused variables (<code>rawAuditToken</code>), and inline single-use variables like <code>fullName</code>, <code>isVip</code>, <code>lineTotal</code>, and <code>taxAmount</code>.
      </p>
      <p>
        With the <strong>Scopes proposal</strong>, each <code>GeneratedRange</code> provides a <code>values</code> array mapping every variable in its <code>OriginalScope</code> to an arbitrary JavaScript binding expression (or <code>null</code> when optimized out). Chrome DevTools uses this information to reconstruct the <strong>Scope</strong> sidebar, render <strong>inline variable hints</strong>, populate <strong>autocomplete suggestions</strong> with original variable names, and evaluate <strong>Conditional Breakpoints</strong> and <strong>Console expressions</strong> via <code>debug evaluate</code>.
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Scope View",
        title: "Pause & Inspect Folded Constants, Synthesized Expressions & <unavailable>",
        instruction:
          'Open Chrome DevTools (F12), switch to the "Sources" panel, and click "Run & Pause in Debugger". Execution pauses at `debugger;` in `order-pricing.ts`.',
        expectedObservation:
          'In the "Scope" pane under `calculateInvoice` and `Module`: `fullName` (`"Ada Lovelace"`), `isVip` (`true`), `subtotal` (`250`), `discountRate` (`0.15`), `discountedSubtotal` (`212.5`), `taxAmount` (`18.0625`), `TAX_RATE` (`0.085`), and `CURRENCY` (`"USD"`) are all reconstructed. Meanwhile, `rawAuditToken` (bound to `null`) cleanly displays as `<unavailable>`.',
      },
      {
        featureTag: "Inline Hints & Popover",
        title: "Verify Editor Inline Variable Hints & Hover Popovers",
        instruction:
          "While paused in `order-pricing.ts`, look at the inline value hints at the end of lines 19–34 and hover your mouse cursor over `customer`, `discountedSubtotal`, `taxAmount`, and `TAX_RATE` in the editor.",
        expectedObservation:
          "DevTools displays inline hints for the authored TypeScript variables and opens an interactive object popover when hovering over `customer` or synthesized expressions like `taxAmount`.",
      },
      {
        featureTag: "Autocomplete",
        title: "Try Scope-Aware Autocomplete Suggestions in the Console",
        instruction:
          "While paused, press `Esc` to open the Console drawer and start typing prefixes of authored identifiers such as `disc`, `tax`, `FREE_`, or `fullN`.",
        expectedObservation:
          "Chrome DevTools includes the original TypeScript variable and constant names (`discountRate`, `discountedSubtotal`, `taxAmount`, `FREE_SHIPPING_MIN`, `fullName`) from the active `OriginalScope` chain directly in the autocomplete dropdown!",
      },
      {
        featureTag: "Conditional Breakpoints",
        title: "Set a Conditional Breakpoint Inside the Loop Using Original Variable Names",
        instruction:
          'In `order-pricing.ts`, right-click line 26 (`subtotal += lineTotal;`) inside the `for..of` loop, select "Add conditional breakpoint...", and enter `item.quantity > 1 && lineTotal < 100` (notice autocomplete suggests `item` and `lineTotal`!). Press `Enter`, resume (`F8`), and click "Run & Pause in Debugger" again.',
        expectedObservation:
          'Because conditional breakpoints use `debug evaluate` under the hood, DevTools evaluates `i.quantity > 1 && (i.unitPrice * i.quantity) < 100` on each iteration: it skips item 1 (`MECH-KB`, `qty: 1, lineTotal: 140`), pauses inside the `Block` scope ONLY on item 2 (`USB-C-CABLE`, `qty: 2, lineTotal: 45`), and skips item 3 (`KEYCAP-SET`, `qty: 1`)!',
      },
      {
        featureTag: "Debug Evaluate",
        title: "Evaluate Authored Expressions in the DevTools Console",
        instruction:
          "While paused at either the conditional breakpoint or the `debugger;` statement, evaluate the test expressions below in the Console.",
        expectedObservation:
          "DevTools parses your Console input into an AST, substitutes original identifiers (`fullName`, `taxAmount`, `TAX_RATE`, `CURRENCY`, `lineTotal`) with their binding expressions from the source map, and evaluates the result in V8.",
      },
    ],
    evalExpressions: [
      {
        expression: '`${fullName} (${CURRENCY}): $${grandTotal.toFixed(2)}`',
        expectedResult: '"Ada Lovelace (USD): $230.56"',
        explanation:
          "Combines synthesized expression `fullName` (`c.firstName + ' ' + c.lastName`), folded constant `CURRENCY` (`'USD'`), and renamed local `grandTotal` (`g`).",
      },
      {
        expression: "discountedSubtotal + taxAmount + shippingFee",
        expectedResult: "230.5625",
        explanation:
          "Evaluates arithmetic across renamed register `d` (`discountedSubtotal`) and two non-existent variables (`taxAmount` -> `d * 0.085`, `shippingFee` -> `d >= 100 ? 0 : 12.99`).",
      },
      {
        expression: "isVip && discountRate === 0.15 && TAX_RATE === 0.085",
        expectedResult: "true",
        explanation:
          "Verifies boolean and numeric expressions using synthesized `isVip`, `discountRate`, and module-scoped constant `TAX_RATE`.",
      },
    ],
    runFunctionName: "runExample01",
  };
}
