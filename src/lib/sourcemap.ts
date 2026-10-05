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
  orig: Position;
  sourceIndex?: number;
  name?: string;
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
    | "Logical Stepping";
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
  logStackFunctionName?: string;
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

  // Determine how many lines exist in generated code
  const genLinesCount = example.generatedCode.split("\n").length;
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
    const segment: SourceMapSegment = m.name !== undefined
      ? [
        m.gen.column,
        sourceIdx,
        m.orig.line,
        m.orig.column,
        getNameIndex(m.name),
      ]
      : [m.gen.column, sourceIdx, m.orig.line, m.orig.column];
    lines[m.gen.line].push(segment);
  }

  const mappingsString = encodeVlqMappings(lines);

  const baseSourceMap: SourceMapJson & {
    file?: string;
    sourcesContent?: (string | null)[];
  } = {
    version: 3,
    file: "bundle.js",
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
