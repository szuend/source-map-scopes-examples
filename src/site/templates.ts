import type {
  GeneratedRange,
  OriginalScope,
} from "@chrome-devtools/source-map-scopes-codec";
import type { BuiltExample, DebugStep } from "../lib/sourcemap.ts";

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInlineBackticks(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderCodeTable(code: string): string {
  const lines = code.replace(/\n$/, "").split("\n");
  const rows = lines
    .map((line, idx) => {
      const isDebugger = line.includes("debugger;");
      return `<tr class="code-line-row${isDebugger ? " debugger-line" : ""}">
        <td class="code-line-num">${idx + 1}</td>
        <td class="code-line-text">${escapeHtml(line) || " "}</td>
      </tr>`;
    })
    .join("\n");
  return `<div class="code-block-wrapper"><table class="code-table"><tbody>${rows}</tbody></table></div>`;
}

function renderFeatureTagClass(tag: DebugStep["featureTag"]): string {
  switch (tag) {
    case "Call Stack":
      return "tag-stack";
    case "Scope View":
      return "tag-scope";
    case "Inline Hints & Popover":
      return "tag-hints";
    case "Debug Evaluate":
      return "tag-eval";
    case "Autocomplete":
      return "tag-auto";
    case "Conditional Breakpoints":
      return "tag-bp";
    case "Logical Stepping":
      return "tag-stack";
    case "Error Stack Traces":
      return "tag-stack";
  }
}

const FILE_BUG_URL =
  "https://issues.chromium.org/issues/new?component=1456920&template=2037817";

const fileBugLink =
  `<a href="${FILE_BUG_URL}" class="nav-pill bug-link" target="_blank" rel="noopener">&#128027; File a bug</a>`;

function renderOriginalScopeTree(scope: OriginalScope | null): string {
  if (!scope) return `<div class="scope-tree-node">null</div>`;
  const vars = scope.variables.length
    ? `[${scope.variables.map((v) => escapeHtml(v)).join(", ")}]`
    : "[]";
  const childrenHtml = scope.children
    .map((c) => renderOriginalScopeTree(c))
    .join("");

  return `<div class="scope-tree-node">
    <div>
      <span class="node-badge tag-scope">${escapeHtml(scope.kind ?? "Scope")}</span>
      <strong>${escapeHtml(scope.name ?? "(anonymous)")}</strong>
      <span style="color: var(--text-muted);">[${scope.start.line}:${scope.start.column} &rarr; ${scope.end.line}:${scope.end.column})</span>
      ${scope.isStackFrame ? `<span class="node-badge tag-stack">isStackFrame</span>` : ""}
    </div>
    <div style="margin-top: 0.25rem; color: var(--text-secondary);">variables: <code>${vars}</code></div>
    ${childrenHtml}
  </div>`;
}

function renderGeneratedRangeTree(range: GeneratedRange): string {
  const scopeLabel = range.originalScope
    ? `${range.originalScope.kind ?? "Scope"}${
      range.originalScope.name ? `(${range.originalScope.name})` : ""
    }`
    : "unmapped range";

  const callSiteHtml = range.callSite
    ? `<span class="node-badge tag-amber" style="background: var(--accent-amber-bg); color: var(--accent-amber);">callSite @ ${range.callSite.line + 1}:${range.callSite.column + 1}</span>`
    : "";

  const bindingsHtml =
    range.originalScope && range.originalScope.variables.length > 0
      ? `<div style="margin-top: 0.3rem; color: var(--text-secondary);">
          bindings: ${
        range.originalScope.variables
          .map((varName, i) => {
            const val = range.values[i];
            if (val === null || val === undefined) {
              return `<code>${escapeHtml(varName)} &rarr; &lt;unavailable&gt;</code>`;
            }
            if (typeof val === "string") {
              return `<code>${escapeHtml(varName)} &rarr; ${escapeHtml(val)}</code>`;
            }
            const subSummary = val
              .map(
                (s) =>
                  `[${s.from.line}:${s.from.column}-${s.to.line}:${s.to.column}]: ${
                    s.value ?? "unavailable"
                  }`,
              )
              .join(" | ");
            return `<code>${escapeHtml(varName)} &rarr; SubRanges(${escapeHtml(subSummary)})</code>`;
          })
          .join(", ")
      }
        </div>`
      : "";

  const childrenHtml = range.children
    .map((c) => renderGeneratedRangeTree(c))
    .join("");

  return `<div class="scope-tree-node">
    <div>
      <span class="node-badge tag-hints">Range [${range.start.line}:${range.start.column} &rarr; ${range.end.line}:${range.end.column})</span>
      <strong>&rarr; ${escapeHtml(scopeLabel)}</strong>
      ${range.isStackFrame ? `<span class="node-badge tag-stack">isStackFrame</span>` : `<span class="node-badge" style="background: var(--bg-interactive); color: var(--text-secondary);">isStackFrame: false</span>`}
      ${range.isHidden ? `<span class="node-badge tag-eval">isHidden: true</span>` : ""}
      ${callSiteHtml}
    </div>
    ${bindingsHtml}
    ${childrenHtml}
  </div>`;
}

export function renderIndexHtml(builtExamples: BuiltExample[]): string {
  const cardsHtml = builtExamples
    .map(({ example }) => {
      const tags = [...new Set(example.debugSteps.map((s) => s.featureTag))]
        .map((tag) =>
          `<span class="capability-tag ${renderFeatureTagClass(tag)}">${escapeHtml(tag)}</span>`
        )
        .join("");

      return `<a href="./examples/${example.id}/index.html" class="example-card" id="card-${example.id}">
        <div class="example-card-header">
          <span class="example-num">EXAMPLE ${example.number}</span>
        </div>
        <h3>${escapeHtml(example.title)}</h3>
        <p>${escapeHtml(example.subtitle)}</p>
        <div class="chip-list">${tags}</div>
      </a>`;
    })
    .join("\n");

  const navPills = builtExamples
    .map(
      ({ example }) =>
        `<a href="./examples/${example.id}/index.html" class="nav-pill">${example.number}. ${escapeHtml(example.shortTitle)}</a>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Source Map "Scopes" Proposal — Interactive Chrome DevTools Examples</title>
  <meta name="description" content="Interactive debugging examples showcasing the ECMA-426 Source Map Scopes proposal in Chrome DevTools: function inlining, scope reconstruction, inline hints, and debug evaluate." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="./index.html" class="brand-link">
        <span class="brand-badge">{S}</span>
        <span>ECMA-426 Source Map <code>scopes</code> Showcase</span>
      </a>
      <nav class="header-nav" aria-label="Examples navigation">
        <a href="./index.html" class="nav-pill active">Overview</a>
        ${navPills}
        ${fileBugLink}
      </nav>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <span class="hero-eyebrow">ECMA-426 Source Map Scopes &bull; Chrome DevTools</span>
      <h1>Debug Optimized JavaScript as Authored TypeScript</h1>
      <p class="hero-lead">
        Each example ships minified JavaScript with a hand-crafted <code>scopes</code> source map.
        Pick an example, follow the steps with DevTools open, and use <strong>&#128027; File a bug</strong> for anything that looks off.
      </p>
      <div class="prereq-banner">
        <div class="prereq-item">
          <strong>1. Use Chrome Canary &amp; Enable the Flag</strong>
          <span>Stable Chrome can't parse the current <code>scopes</code> format yet. In Chrome Canary, enable <code>chrome://flags/#devtools-source-map-scopes-in-sources-panel</code> and relaunch.</span>
        </div>
        <div class="prereq-item">
          <strong>2. Open an Example</strong>
          <span>Open DevTools, click the example's run button, and work through the steps. Each step lists what DevTools should show.</span>
        </div>
      </div>
    </section>

    <div class="section-heading">
      <h2>Interactive Debugging Examples</h2>
    </div>

    <section class="examples-grid">
      ${cardsHtml}
    </section>
  </main>
</body>
</html>`;
}

export function renderExampleHtml(
  built: BuiltExample,
  allExamples: BuiltExample[],
): string {
  const { example, sourceMap, decodedScopeInfo } = built;
  const runButtonLabel = example.runButtonLabel ?? "Run & Pause in Debugger";

  const navPills = allExamples
    .map(
      (b) =>
        `<a href="../${b.example.id}/index.html" class="nav-pill${
          b.example.id === example.id ? " active" : ""
        }">${b.example.number}. ${escapeHtml(b.example.shortTitle)}</a>`,
    )
    .join("\n");

  const stepsHtml = example.debugSteps
    .map(
      (step) => `<div class="step-item">
        <div class="step-header">
          <label class="step-num-title">
            <input type="checkbox" class="step-checkbox" />
            <span>${escapeHtml(step.title)}</span>
          </label>
          <span class="capability-tag ${renderFeatureTagClass(step.featureTag)}" style="margin-bottom: 0;">${escapeHtml(step.featureTag)}</span>
        </div>
        <p class="try-prompt"><span class="try-label">Try:</span>${formatInlineBackticks(step.tryPrompt)}</p>
        <ul class="check-list">
          ${step.checkPoints.map((pt) => `<li>${formatInlineBackticks(pt)}</li>`).join("")}
        </ul>
      </div>`,
    )
    .join("\n");

  const evalsHtml = example.evalExpressions
    .map(
      (ev, idx) => `<div class="eval-card">
        <div class="eval-top">
          <code class="eval-expr" id="eval-code-${idx}">${escapeHtml(ev.expression)}</code>
          <button type="button" class="btn-copy" data-copy-target="eval-code-${idx}">Copy</button>
        </div>
        <div class="eval-meta">
          <div><strong>Expected Result:</strong> <span class="eval-result">${escapeHtml(ev.expectedResult)}</span></div>
          <div style="margin-top: 0.2rem;">${formatInlineBackticks(ev.explanation)}</div>
        </div>
      </div>`,
    )
    .join("\n");

  const originalScopeTreesHtml = decodedScopeInfo.scopes
    .map((sourceScopes) =>
      sourceScopes
        ? sourceScopes.map((s) => renderOriginalScopeTree(s)).join("")
        : `<div class="scope-tree-node">null</div>`
    )
    .join("");

  const generatedRangeTreesHtml = decodedScopeInfo.ranges
    .map((r) => renderGeneratedRangeTree(r))
    .join("");

  const rawMapFormatted = JSON.stringify(sourceMap, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Example ${example.number}: ${escapeHtml(example.title)} — Source Map Scopes</title>
  <meta name="description" content="${escapeHtml(example.subtitle)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a href="../../index.html" class="brand-link">
        <span class="brand-badge">{S}</span>
        <span>ECMA-426 Source Map <code>scopes</code> Showcase</span>
      </a>
      <nav class="header-nav" aria-label="Examples navigation">
        <a href="../../index.html" class="nav-pill">Overview</a>
        ${navPills}
        ${fileBugLink}
      </nav>
    </div>
  </header>

  <main class="container">
    <section class="example-header-bar">
      <div class="example-title-block">
        <span class="example-num">EXAMPLE ${example.number} &bull; ${escapeHtml(example.originalFileName)}</span>
        <h1>${escapeHtml(example.title)}</h1>
        <p>${escapeHtml(example.subtitle)}</p>
        <div class="chip-list" style="margin-top: 0.85rem; margin-bottom: 0;">
          ${example.proposalFeatures.map((f) => `<span class="chip">${escapeHtml(f)}</span>`).join("")}
        </div>
      </div>

      <div class="action-panel">
        <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem;">
          OPEN CHROME DEVTOOLS (F12) FIRST, THEN TRIGGER:
        </div>
        <div class="action-buttons">
          <button type="button" class="btn-primary" id="btn-run-debugger">
            <span>&#9654; ${escapeHtml(runButtonLabel)}</span>
          </button>
          ${
            example.logStackFunctionName
              ? `<button type="button" class="btn-secondary" id="btn-log-stack">${escapeHtml(example.logStackButtonLabel ?? "Log Inlined Error Stack")}</button>`
              : ""
          }
        </div>
        <div class="output-readout" id="live-output-readout">Ready. Click "${escapeHtml(runButtonLabel)}" with DevTools open.</div>
      </div>
    </section>

    <div class="workbench-grid">
      <div>
        <section class="panel-card">
          <h2>How This Example Works</h2>
          ${example.overviewHtml}
        </section>

        <section class="panel-card">
          <h2>What to Try &amp; Verify in DevTools</h2>
          <div class="steps-list">
            ${stepsHtml}
          </div>
          ${
            example.otherThingsToTry?.length
              ? `<details class="other-things">
            <summary>Other things to try</summary>
            <ul class="check-list">
              ${example.otherThingsToTry.map((t) => `<li>${formatInlineBackticks(t)}</li>`).join("")}
            </ul>
          </details>`
              : ""
          }
        </section>

        <section class="panel-card">
          <h2>Console <code>Debug Evaluate</code> Expressions to Try While Paused</h2>
          <p style="margin-top: 0; font-size: 0.88rem; color: var(--text-secondary);">
            While execution is paused at a <code>debugger;</code> statement in DevTools, open the Console drawer (<code>Esc</code>) and paste these expressions using the authored TypeScript identifiers:
          </p>
          <div class="eval-list">
            ${evalsHtml}
          </div>
        </section>
      </div>

      <aside class="inspector-card" aria-label="Source and Scope Map Inspector">
        <div class="tabs-bar" role="tablist">
          <button type="button" class="tab-btn active" data-tab="tab-orig" role="tab" aria-selected="true">
            1. Authored (${escapeHtml(example.originalFileName)})
          </button>
          <button type="button" class="tab-btn" data-tab="tab-gen" role="tab" aria-selected="false">
            2. Minified (bundle.js)
          </button>
          <button type="button" class="tab-btn" data-tab="tab-builder" role="tab" aria-selected="false">
            3. SafeScopeInfoBuilder
          </button>
          <button type="button" class="tab-btn" data-tab="tab-map" role="tab" aria-selected="false">
            4. Decoded Scopes &amp; .map
          </button>
        </div>

        <div class="tab-pane active" id="tab-orig" role="tabpanel">
          ${renderCodeTable(example.originalSource)}
        </div>

        <div class="tab-pane" id="tab-gen" role="tabpanel">
          ${renderCodeTable(example.generatedCode)}
        </div>

        <div class="tab-pane" id="tab-builder" role="tabpanel">
          ${renderCodeTable(example.builderCodeSnippet)}
        </div>

        <div class="tab-pane" id="tab-map" role="tabpanel">
          <div class="code-block-wrapper" style="padding: 0;">
            <div class="tree-section">
              <h3>Decoded OriginalScope Tree (${escapeHtml(example.originalFileName)})</h3>
              ${originalScopeTreesHtml}
            </div>
            <div class="tree-section">
              <h3>Decoded GeneratedRange &amp; Binding Tree (bundle.js)</h3>
              ${generatedRangeTreesHtml}
            </div>
            <div class="tree-section">
              <h3>Raw Source Map JSON (bundle.js.map)</h3>
              <pre style="margin: 0; font-size: 0.78rem; color: hsl(204, 80%, 82%); overflow-x: auto;">${escapeHtml(rawMapFormatted)}</pre>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </main>

  <script src="./bundle.js"></script>
  <script>
    (function() {
      const runBtn = document.getElementById("btn-run-debugger");
      const stackBtn = document.getElementById("btn-log-stack");
      const readout = document.getElementById("live-output-readout");

      if (runBtn) {
        runBtn.addEventListener("click", function() {
          readout.textContent = "Paused at debugger; statement in DevTools... Resume execution (F8) to see return value.";
          setTimeout(function() {
            try {
              const fn = window[${JSON.stringify(example.runFunctionName)}];
              const result = fn();
              readout.textContent = "Return Value: " + JSON.stringify(result, null, 2);
            } catch (err) {
              readout.textContent = "Error: " + (err && err.message ? err.message : String(err));
            }
          }, 20);
        });
      }

      if (stackBtn) {
        stackBtn.addEventListener("click", function() {
          const fn = window[${JSON.stringify(example.logStackFunctionName ?? "")}];
          if (typeof fn === "function") {
            const trace = fn();
            readout.textContent = "Logged Error to DevTools Console!\\n" + trace;
          }
        });
      }

      // Checklist toggle
      const checkboxes = document.querySelectorAll(".step-checkbox");
      checkboxes.forEach(function(cb) {
        cb.addEventListener("change", function() {
          const card = cb.closest(".step-item");
          if (card) {
            card.classList.toggle("checked", cb.checked);
          }
        });
      });

      // Tab switcher
      const tabButtons = document.querySelectorAll(".tab-btn");
      const tabPanes = document.querySelectorAll(".tab-pane");
      tabButtons.forEach(function(btn) {
        btn.addEventListener("click", function() {
          const targetId = btn.getAttribute("data-tab");
          tabButtons.forEach(function(b) {
            b.classList.toggle("active", b === btn);
            b.setAttribute("aria-selected", b === btn ? "true" : "false");
          });
          tabPanes.forEach(function(pane) {
            pane.classList.toggle("active", pane.id === targetId);
          });
        });
      });

      // Copy buttons
      const copyButtons = document.querySelectorAll(".btn-copy");
      copyButtons.forEach(function(btn) {
        btn.addEventListener("click", function() {
          const targetId = btn.getAttribute("data-copy-target");
          const codeEl = document.getElementById(targetId);
          if (codeEl && navigator.clipboard) {
            navigator.clipboard.writeText(codeEl.textContent || "");
            const prev = btn.textContent;
            btn.textContent = "Copied!";
            setTimeout(function() {
              btn.textContent = prev;
            }, 1200);
          }
        });
      });
    })();
  </script>
</body>
</html>`;
}
