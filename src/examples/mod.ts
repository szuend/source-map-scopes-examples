import type { ExampleDefinition } from "../lib/sourcemap.ts";
import { createExample01 } from "./01-bindings-and-expressions.ts";
import { createExample02 } from "./02-sub-range-bindings.ts";
import { createExample03 } from "./03-function-inlining.ts";
import { createExample04 } from "./04-closures-and-hidden-ranges.ts";
import { createExample05 } from "./05-logical-stepping.ts";
import { createExample06 } from "./06-error-stack-traces.ts";
import { createExample07 } from "./07-multiple-call-sites.ts";

export function getAllExamples(): ExampleDefinition[] {
  return [
    createExample01(),
    createExample02(),
    createExample03(),
    createExample04(),
    createExample05(),
    createExample06(),
    createExample07(),
  ];
}
