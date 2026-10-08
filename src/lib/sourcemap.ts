import {
  decode,
  type DecodedScopeInfo,
  encode,
  type Position,
  type ScopeInfo,
  type SourceMapJson,
} from "@chrome-devtools/source-map-scopes-codec";
import {
  encode as encodeVlqMappings,
  type SourceMapSegment,
} from "@jridgewell/sourcemap-codec";

export interface MappingPoint {
  gen: Position;
  /**
   * Omit to emit an explicitly *unmapped* 1-field segment. This matters for
   * WebAssembly, where all code lives on generated line 0 and unmapped
   * compiler-generated code would otherwise inherit the previous mapping.
   */
  orig?: Position;
  sourceIndex?: number;
  name?: string;
}

/**
 * Present for examples whose generated code is a WebAssembly module instead
 * of a JavaScript bundle. Positions in mappings and scopes then use line 0 and
 * the absolute module byte offset as the column.
 */
export interface WasmArtifact {
  /** File name of the `.wasm` module, e.g. `image-filter.wasm`. */
  fileName: string;
  bytes: Uint8Array<ArrayBuffer>;
  /** WAT-like disassembly annotated with module byte offsets. */
  disassembly: string;
}

export interface DebugStep {
  title: string;
  tryPrompt: string;
  checkPoints: string[];
  featureTag:
    | "Call Stack"
    | "Scope View"
    | "Inline Hints & Popover"
    | "Debug Evaluate"
    | "Autocomplete"
    | "Conditional Breakpoints"
    | "Logical Stepping"
    | "Error Stack Traces";
}

export interface EvalExpression {
  expression: string;
  expectedResult: string;
  explanation: string;
}

export interface ExampleDefinition {
  id: string;
  number: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  proposalFeatures: string[];
  devtoolsFeatures: string[];
  originalFileName: string;
  originalSource: string;
  generatedCode: string;
  builderCodeSnippet: string;
  scopeInfo: ScopeInfo;
  mappings: MappingPoint[];
  overviewHtml: string;
  debugSteps: DebugStep[];
  evalExpressions: EvalExpression[];
  runFunctionName: string;
  /** Label of the button that calls `runFunctionName`. */
  runButtonLabel?: string;
  logStackFunctionName?: string;
  /** Label of the button that calls `logStackFunctionName`. */
  logStackButtonLabel?: string;
  /** Short, open-ended ideas for exploring beyond the walkthrough. */
  otherThingsToTry?: string[];
  /**
   * Set for WebAssembly examples. The source map then describes this module,
   * and `generatedCode` is the (non-source-mapped) JS glue served as
   * `bundle.js` that instantiates it.
   */
  wasm?: WasmArtifact;
}

export interface BuiltExample {
  example: ExampleDefinition;
  sourceMap: SourceMapJson & {
    file?: string;
    sourcesContent?: (string | null)[];
  };
  decodedScopeInfo: DecodedScopeInfo;
}

/**
 * Builds a complete v3 SourceMapJson containing both standard VLQ `mappings`
 * and ECMA-426 `scopes` encoded via `@chrome-devtools/source-map-scopes-codec`.
 */
export function buildExampleSourceMap(
  example: ExampleDefinition,
): BuiltExample {
  const names: string[] = [];
  const nameToIndex = new Map<string, number>();

  const getNameIndex = (name: string): number => {
    let idx = nameToIndex.get(name);
    if (idx === undefined) {
      idx = names.length;
      names.push(name);
      nameToIndex.set(name, idx);
    }
    return idx;
  };

  // Determine how many lines exist in generated code. WebAssembly modules
  // are a single "line" whose columns are module byte offsets.
  const genLinesCount = example.wasm
    ? 1
    : example.generatedCode.split("\n").length;
  const lines: SourceMapSegment[][] = Array.from(
    { length: genLinesCount },
    () => [],
  );

  // Sort mappings by generated line, then generated column
  const sortedMappings = [...example.mappings].sort((a, b) =>
    a.gen.line !== b.gen.line
      ? a.gen.line - b.gen.line
      : a.gen.column - b.gen.column
  );

  for (const m of sortedMappings) {
    while (lines.length <= m.gen.line) {
      lines.push([]);
    }
    const sourceIdx = m.sourceIndex ?? 0;
    let segment: SourceMapSegment;
    if (!m.orig) {
      segment = [m.gen.column];
    } else if (m.name !== undefined) {
      segment = [
        m.gen.column,
        sourceIdx,
        m.orig.line,
        m.orig.column,
        getNameIndex(m.name),
      ];
    } else {
      segment = [m.gen.column, sourceIdx, m.orig.line, m.orig.column];
    }
    lines[m.gen.line].push(segment);
  }

  const mappingsString = encodeVlqMappings(lines);

  const baseSourceMap: SourceMapJson & {
    file?: string;
    sourcesContent?: (string | null)[];
  } = {
    version: 3,
    file: example.wasm?.fileName ?? "bundle.js",
    sources: [example.originalFileName],
    sourcesContent: [example.originalSource],
    names,
    mappings: mappingsString,
  };

  // Encode scopes using @chrome-devtools/source-map-scopes-codec
  const finalMap = encode(example.scopeInfo, baseSourceMap) as SourceMapJson & {
    file?: string;
    sourcesContent?: (string | null)[];
  };

  // Round-trip decode check to guarantee validity
  const decodedScopeInfo = decode(finalMap);

  return {
    example,
    sourceMap: finalMap,
    decodedScopeInfo,
  };
}
