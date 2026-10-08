import { SafeScopeInfoBuilder } from "@chrome-devtools/source-map-scopes-codec";
import type {
  Position,
  SubRangeBinding,
} from "@chrome-devtools/source-map-scopes-codec";
import { TextLocator } from "../lib/locator.ts";
import type { ExampleDefinition, MappingPoint } from "../lib/sourcemap.ts";
import { assembleModule, WasmCode } from "../lib/wasm.ts";

const WASM_FILE_NAME = "image-filter.wasm";

// Linear-memory layout shared by the wasm module, the bindings and the JS glue.
const G_IMAGES_PROCESSED = 1024; // &g_imagesProcessed
const G_LAST_AVERAGE = 1028; // &g_lastAverage
const PIXELS_PTR = 2064; // Image::pixels of the sample image

const originalSource = `// Authored C++: image-filter.cpp
// Pretend build: em++ -O2 -gsource-map -sWASM_BIGINT=0 image-filter.cpp
#include <cstdint>
#include <emscripten.h>

struct Image {
  int32_t width;
  int32_t height;
  uint8_t* pixels;  // 8-bit grayscale, row-major
};

constexpr int32_t kMaxLevel = 255;

int32_t g_imagesProcessed = 0;
int32_t g_lastAverage = 0;

static inline int32_t clampLevel(int32_t level) {
  if (level < 0) return 0;
  if (level > kMaxLevel) return kMaxLevel;
  return level;
}

static inline int32_t applyContrast(int32_t level, int32_t contrastPct) {
  int32_t centered = level - 128;
  int32_t scaled = centered * contrastPct / 100;
  return clampLevel(scaled + 128);
}

__attribute__((noinline))
int32_t adjustPixel(int32_t level, int32_t brightness, int32_t contrastPct) {
  int32_t brightened = clampLevel(level + brightness);
  int32_t result = applyContrast(brightened, contrastPct);
  return result;
}

static inline int32_t averageLevel(int64_t sum, int32_t count) {
  return static_cast<int32_t>(sum / count);  // Traps in wasm if count == 0!
}

extern "C" EMSCRIPTEN_KEEPALIVE
int64_t adjustImage(Image* image, int32_t brightness, int32_t contrastPct) {
  const int32_t pixelCount = image->width * image->height;
  int64_t checksum = 0;
  for (int32_t i = 0; i < pixelCount; ++i) {
    uint8_t* pixel = &image->pixels[i];
    const int32_t adjusted = adjustPixel(*pixel, brightness, contrastPct);
    *pixel = static_cast<uint8_t>(adjusted);
    checksum += adjusted;
    if (i == 2) emscripten_debugger();  // Pause once, mid-image.
  }
  g_lastAverage = averageLevel(checksum, pixelCount);
  ++g_imagesProcessed;
  return checksum;
}
`;

// The JS glue is served as bundle.js. It is intentionally NOT source-mapped:
// the source map (with "scopes") belongs to image-filter.wasm.
const glueCode = `// bundle.js: hand-written, Emscripten-style JS glue for ${WASM_FILE_NAME}.
// This file is NOT source-mapped. The source map with "scopes" belongs to
// ${WASM_FILE_NAME} (see its "sourceMappingURL" custom section).
(function() {
  "use strict";
  const G_IMAGES_PROCESSED = ${G_IMAGES_PROCESSED}; // &g_imagesProcessed
  const G_LAST_AVERAGE = ${G_LAST_AVERAGE}; // &g_lastAverage
  const IMAGE_PTR = 2048; // Image { width, height, pixels }
  const PIXELS_PTR = ${PIXELS_PTR};
  const EMPTY_IMAGE_PTR = 2096; // Image { 0, 0, pixels }
  const SAMPLE_PIXELS = [40, 120, 200, 250];

  let instance = null;
  let tempRet0 = 0;

  const imports = {
    env: {
      // Like in Emscripten, emscripten_debugger() is a JS library function.
      emscripten_debugger: function() {
        debugger; // Step out (Shift+F11) to continue in image-filter.cpp.
      },
      // Receives the high 32 bits of i64 results from legalstub$adjustImage.
      setTempRet0: function(value) {
        tempRet0 = value;
      },
    },
  };

  WebAssembly.instantiateStreaming(fetch("./${WASM_FILE_NAME}"), imports).then(
    function(result) {
      instance = result.instance;
    },
    function(err) {
      console.error("Failed to instantiate ${WASM_FILE_NAME}", err);
    },
  );

  function wasmExports() {
    if (!instance) throw new Error("${WASM_FILE_NAME} is still loading, try again.");
    return instance.exports;
  }

  function writeImage(ptr, width, height, pixelsPtr, pixels) {
    const memory = wasmExports().memory;
    const view = new DataView(memory.buffer);
    view.setInt32(ptr, width, true);
    view.setInt32(ptr + 4, height, true);
    view.setUint32(ptr + 8, pixelsPtr, true);
    new Uint8Array(memory.buffer, pixelsPtr, pixels.length).set(pixels);
  }

  function callAdjustImage(imagePtr) {
    const low = wasmExports().adjustImage(imagePtr, 30, 150);
    return tempRet0 * 2 ** 32 + (low >>> 0);
  }

  window.runExample08 = function() {
    writeImage(IMAGE_PTR, 2, 2, PIXELS_PTR, SAMPLE_PIXELS);
    const checksum = callAdjustImage(IMAGE_PTR);
    const memory = wasmExports().memory;
    const view = new DataView(memory.buffer);
    return {
      checksum: checksum,
      pixels: Array.from(new Uint8Array(memory.buffer, PIXELS_PTR, SAMPLE_PIXELS.length)),
      lastAverage: view.getInt32(G_LAST_AVERAGE, true),
      imagesProcessed: view.getInt32(G_IMAGES_PROCESSED, true),
    };
  };

  window.logStackExample08 = function() {
    writeImage(EMPTY_IMAGE_PTR, 0, 0, PIXELS_PTR, []);
    try {
      callAdjustImage(EMPTY_IMAGE_PTR);
      return "Unexpectedly, no trap.";
    } catch (err) {
      console.error(err);
      return String(err.stack);
    }
  };
})();
`;

// Function index space: imports first, then defined functions.
const F_DEBUGGER = 0;
const F_SET_TEMP_RET0 = 1;
const F_ADJUST_PIXEL = 2;
const F_ADJUST_IMAGE = 3;

const ADJUST_PIXEL = "_Z11adjustPixeliii"; // Itanium-mangled C++ name
const ADJUST_IMAGE = "adjustImage"; // extern "C"
const LEGALSTUB = "legalstub$adjustImage";

/**
 * "Compiles" image-filter.cpp by hand. Labels (`mark`) record the offsets that
 * the mappings and the scopes ranges/bindings refer to.
 */
function buildWasm() {
  // ---- int32_t adjustPixel(int32_t level, int32_t brightness, int32_t contrastPct)
  // params: $var0 = level, $var1 = brightness, $var2 = contrastPct
  // local:  $var3 is reused for 4 different values (register reuse!)
  const px = new WasmCode();
  px.comment("brightened = clampLevel(level + brightness)")
    .mark("brightenedArg")
    .op("local.get", 0)
    .op("local.get", 1)
    .op("i32.add")
    .op("local.tee", 3) // $var3 = level + brightness
    .comment("inlined clampLevel(level + brightness)")
    .mark("clamp1.lt0")
    .op("i32.const", 0)
    .op("local.get", 3)
    .op("i32.const", 0)
    .op("i32.gt_s")
    .op("select")
    .mark("clamp1.gtMax")
    .op("local.tee", 3)
    .op("i32.const", 255)
    .op("local.get", 3)
    .op("i32.const", 255)
    .op("i32.lt_s")
    .op("select")
    .mark("clamp1.end")
    .op("local.set", 3) // $var3 = brightened
    .comment("inlined applyContrast(brightened, contrastPct)")
    .mark("centered")
    .op("local.get", 3)
    .op("i32.const", 128)
    .op("i32.sub")
    .mark("scaled")
    .op("local.get", 2)
    .op("i32.mul")
    .op("i32.const", 100)
    .op("i32.div_s")
    .mark("contrastReturn")
    .op("i32.const", 128)
    .op("i32.add")
    .mark("scaledPlus128Tee")
    .op("local.tee", 3) // $var3 = scaled + 128
    .comment("inlined clampLevel(scaled + 128)")
    .mark("clamp2.lt0")
    .op("i32.const", 0)
    .op("local.get", 3)
    .op("i32.const", 0)
    .op("i32.gt_s")
    .op("select")
    .mark("clamp2.gtMax")
    .op("local.tee", 3) // $var3 = max(scaled + 128, 0)
    .mark("clamp2.afterTee")
    .op("i32.const", 255)
    .op("local.get", 3)
    .op("i32.const", 255)
    .op("i32.lt_s")
    .op("select")
    .comment("return result;  (result is on the wasm value stack)")
    .mark("return")
    .op("end");

  // ---- int64_t adjustImage(Image* image, int32_t brightness, int32_t contrastPct)
  // params: $var0 = image, $var1 = brightness, $var2 = contrastPct
  // locals: $var3 = image->pixels, $var4 = &image->pixels[i] (strength-reduced i),
  //         $var5 = image->pixels + pixelCount, $var6 = checksum (i64), $var7 = adjusted
  const img = new WasmCode();
  img.comment("pixels = image->pixels; end = pixels + image->width * image->height")
    .mark("pixelCount")
    .op("local.get", 0)
    .op("i32.load", 8)
    .op("local.tee", 3)
    .op("local.get", 0)
    .op("i32.load", 0)
    .op("local.get", 0)
    .op("i32.load", 4)
    .op("i32.mul")
    .op("i32.add")
    .op("local.set", 5)
    .comment("for (int32_t i = 0; i < pixelCount; ++i)  -- i is strength-reduced into a pointer")
    .mark("for")
    .op("block")
    .mark("forGuard")
    .op("local.get", 3)
    .op("local.get", 5)
    .op("i32.ge_u")
    .op("br_if", 0)
    .mark("forInit")
    .op("local.get", 3)
    .op("local.set", 4)
    .mark("loop")
    .op("loop")
    .mark("body")
    .op("local.get", 4)
    .mark("adjusted")
    .op("i32.load8_u", 0)
    .op("local.get", 1)
    .op("local.get", 2)
    .mark("callAdjustPixel")
    .op("call", F_ADJUST_PIXEL, ADJUST_PIXEL)
    .op("local.set", 7)
    .mark("store")
    .op("local.get", 4)
    .op("local.get", 7)
    .op("i32.store8", 0)
    .mark("checksum")
    .op("local.get", 6)
    .op("local.get", 7)
    .op("i64.extend_i32_s")
    .op("i64.add")
    .op("local.set", 6)
    .mark("if")
    .op("local.get", 4)
    .op("local.get", 3)
    .op("i32.sub")
    .op("i32.const", 2)
    .op("i32.eq")
    .op("if")
    .mark("debugger")
    .op("call", F_DEBUGGER, "emscripten_debugger")
    .mark("ifEnd")
    .op("end")
    .mark("increment")
    .op("local.get", 4)
    .op("i32.const", 1)
    .op("i32.add")
    .op("local.tee", 4)
    .mark("cond")
    .op("local.get", 5)
    .op("i32.lt_u")
    .op("br_if", 0)
    .op("end")
    .op("end")
    .mark("forEnd")
    .comment("g_lastAverage = averageLevel(checksum, pixelCount)")
    .mark("average")
    .op("i32.const", 0)
    .op("local.get", 6)
    .op("local.get", 5)
    .op("local.get", 3)
    .op("i32.sub")
    .op("i64.extend_i32_s")
    .comment("inlined averageLevel(): traps with 'divide by zero' if count == 0")
    .mark("divide")
    .op("i64.div_s")
    .mark("storeAverage")
    .op("i64.store32", G_LAST_AVERAGE)
    .mark("counter")
    .op("i32.const", 0)
    .op("i32.const", 0)
    .op("i32.load", G_IMAGES_PROCESSED)
    .op("i32.const", 1)
    .op("i32.add")
    .op("i32.store", G_IMAGES_PROCESSED)
    .mark("return")
    .op("local.get", 6)
    .op("end");

  // ---- Emscripten-generated legalization stub (no authored code): splits the
  // i64 result into a 32-bit return value plus setTempRet0(high bits).
  const stub = new WasmCode();
  stub.mark("start")
    .op("local.get", 0)
    .op("local.get", 1)
    .op("local.get", 2)
    .op("call", F_ADJUST_IMAGE, ADJUST_IMAGE)
    .op("local.tee", 3)
    .op("i64.const", 32)
    .op("i64.shr_u")
    .op("i32.wrap_i64")
    .op("call", F_SET_TEMP_RET0, "setTempRet0")
    .op("local.get", 3)
    .op("i32.wrap_i64")
    .op("end");

  return assembleModule({
    imports: [
      {
        module: "env",
        field: "emscripten_debugger",
        name: "emscripten_debugger",
        params: [],
        results: [],
      },
      {
        module: "env",
        field: "setTempRet0",
        name: "setTempRet0",
        params: ["i32"],
        results: [],
      },
    ],
    funcs: [
      {
        name: ADJUST_PIXEL,
        params: ["i32", "i32", "i32"],
        results: ["i32"],
        locals: ["i32"],
        code: px,
      },
      {
        name: ADJUST_IMAGE,
        params: ["i32", "i32", "i32"],
        results: ["i64"],
        locals: ["i32", "i32", "i32", "i64", "i32"],
        code: img,
      },
      {
        name: LEGALSTUB,
        params: ["i32", "i32", "i32"],
        results: ["i32"],
        locals: ["i64"],
        code: stub,
      },
    ],
    memory: { minPages: 1 },
    exports: [
      { name: "memory", kind: "memory", target: 0 },
      { name: "adjustImage", kind: "func", target: LEGALSTUB },
    ],
    sourceMappingURL: `${WASM_FILE_NAME}.map`,
  });
}

// Binding expressions. They are evaluated by V8 on the *wasm* call frame,
// where `$var<N>`, `memories[0]`, `$<funcName>`, `stack`, ... are provided by
// V8's wasm debug proxy. Locals are `{ type, value }` objects.
const IMAGE_STRUCT_EXPR =
  "(() => { const m = new DataView(memories[0].buffer), p = $var0.value, w = m.getInt32(p, true), h = m.getInt32(p + 4, true); return { width: w, height: h, pixels: new Uint8Array(m.buffer, m.getUint32(p + 8, true), w * h) }; })()";
const BRIGHTENED_RECONSTRUCTED = "Math.min(Math.max($var0.value + $var1.value, 0), 255)";
const memI32 = (addr: number) => `new DataView(memories[0].buffer).getInt32(${addr}, true)`;

const builderCodeSnippet = `// Every position is { line: 0, column: <byte offset in ${WASM_FILE_NAME}> }.
// wasm.at(func, label) returns the module offset of a labelled instruction.
// Binding expressions run on the wasm frame via V8's wasm debug proxy:
// $var<N> (locals, as { type, value }), memories[0], $<funcName>, stack[N], ...
const builder = new SafeScopeInfoBuilder();

// 1. Original Scopes: image-filter.cpp
builder
  .startSource()
  .startScope(0, 0, {
    kind: "Module",
    key: "module",
    variables: ["kMaxLevel", "g_imagesProcessed", "g_lastAverage", "clampLevel",
                "applyContrast", "adjustPixel", "averageLevel", "adjustImage"],
  })
  .startScope(/* clampLevel( */ { kind: "Function", name: "clampLevel", isStackFrame: true,
    key: "clampLevel", variables: ["level"] }).endScope(/* } */)
  .startScope(/* applyContrast( */ { kind: "Function", name: "applyContrast", isStackFrame: true,
    key: "applyContrast", variables: ["level", "contrastPct", "centered", "scaled"] }).endScope()
  .startScope(/* adjustPixel( */ { kind: "Function", name: "adjustPixel", isStackFrame: true,
    key: "adjustPixel", variables: ["level", "brightness", "contrastPct", "brightened", "result"] })
  .endScope()
  .startScope(/* averageLevel( */ { kind: "Function", name: "averageLevel", isStackFrame: true,
    key: "averageLevel", variables: ["sum", "count"] }).endScope()
  .startScope(/* adjustImage( */ { kind: "Function", name: "adjustImage", isStackFrame: true,
    key: "adjustImage", variables: ["image", "brightness", "contrastPct", "pixelCount", "checksum"] })
    .startScope(/* for ( */ { kind: "Block", key: "for", variables: ["i"] })
      .startScope(/* { */ { kind: "Block", key: "forBody", variables: ["pixel", "adjusted"] })
      .endScope(/* } */)
    .endScope(/* } */)
  .endScope()
  .endScope()
  .endSource();

// 2. Generated Ranges: byte offsets in ${WASM_FILE_NAME}
// sub(start, [from, value?], ...) builds a SubRangeBinding[] over [start, ...).
builder
  .startRange(0, 0, {
    scopeKey: "module",
    values: [
      "255",                                    // kMaxLevel: constant-folded
      "${memI32(G_IMAGES_PROCESSED)}",   // C++ globals live in linear memory
      "${memI32(G_LAST_AVERAGE)}",
      null, null,                               // clampLevel, applyContrast: always inlined
      "$${ADJUST_PIXEL}",                     // the wasm function (mangled name)
      null,                                     // averageLevel: always inlined
      "$${ADJUST_IMAGE}",
    ],
  })
  // ---- wasm function $${ADJUST_PIXEL} ----
  .startRange(0, wasm.bodyStart("${ADJUST_PIXEL}"), {
    scopeKey: "adjustPixel",
    isStackFrame: true,
    values: [
      "$var0.value", "$var1.value", "$var2.value",
      // brightened: $var3 is reused, so reconstruct once it is overwritten.
      sub(fnStart, [at("centered"), "$var3.value"],
                   [at("clamp2.lt0"), "${BRIGHTENED_RECONSTRUCTED}"]),
      // result: only exists on the wasm value stack right before returning.
      sub(fnStart, [at("return"), "stack[0].value"]),
    ],
  })
    .startRange(0, at("clamp1.lt0"), {
      scopeKey: "clampLevel", isStackFrame: false,
      callSite: /* clampLevel(level + brightness) */,
      values: ["$var0.value + $var1.value"],
    })
    .endRange(0, at("clamp1.end"))
    .startRange(0, at("centered"), {
      scopeKey: "applyContrast", isStackFrame: false,
      callSite: /* applyContrast(brightened, contrastPct) */,
      values: [
        sub(at("centered"), ["$var3.value"], [at("clamp2.lt0"), "${BRIGHTENED_RECONSTRUCTED}"]),
        "$var2.value",
        sub(at("centered"), [at("scaled"), "$var3.value - 128"],
                            [at("clamp2.lt0"), "${BRIGHTENED_RECONSTRUCTED} - 128"]),
        sub(at("centered"), [at("contrastReturn"), "stack[0].value"],         // value stack!
                            [at("scaledPlus128Tee"), "stack[0].value - 128"],
                            [at("clamp2.lt0"), "$var3.value - 128"],
                            [at("clamp2.afterTee")]),                         // clobbered
      ],
    })
      .startRange(0, at("clamp2.lt0"), {
        scopeKey: "clampLevel", isStackFrame: false,   // 2nd call site, same OriginalScope
        callSite: /* clampLevel(scaled + 128) */,
        values: [sub(at("clamp2.lt0"), ["$var3.value"], [at("clamp2.afterTee")])],
      })
      .endRange(0, at("return"))
    .endRange(0, at("return"))
  .endRange(0, wasm.bodyEnd("${ADJUST_PIXEL}"))
  // ---- wasm function $${ADJUST_IMAGE} ----
  .startRange(0, wasm.bodyStart("${ADJUST_IMAGE}"), {
    scopeKey: "adjustImage",
    isStackFrame: true,
    values: [
      "${IMAGE_STRUCT_EXPR.replaceAll('"', '\\"')}",
      "$var1.value", "$var2.value",
      sub(fnStart, [at("for"), "$var5.value - $var3.value"]),  // pixelCount
      "$var6.value",                                         // checksum: i64 -> BigInt
    ],
  })
    .startRange(0, at("for"), {
      scopeKey: "for",
      values: [sub(at("for"), [at("loop"), "$var4.value - $var3.value"])],  // i (strength-reduced)
    })
      .startRange(0, at("body"), {
        scopeKey: "forBody",
        values: ["$var4.value", sub(at("body"), [at("store"), "$var7.value"])],
      })
      .endRange(0, at("increment"))
    .endRange(0, at("forEnd"))
    .startRange(0, at("divide"), {
      scopeKey: "averageLevel", isStackFrame: false,
      callSite: /* averageLevel(checksum, pixelCount) */,
      values: ["$var6.value", "$var5.value - $var3.value"],
    })
    .endRange(0, at("storeAverage"))
  .endRange(0, wasm.bodyEnd("${ADJUST_IMAGE}"))
  // ---- Emscripten-generated $${LEGALSTUB}: no authored code, hidden ----
  .startRange(0, wasm.bodyStart("${LEGALSTUB}"), { isStackFrame: true, isHidden: true })
  .endRange(0, wasm.bodyEnd("${LEGALSTUB}"))
  .endRange(0, wasm.end);`;

export function createExample08(): ExampleDefinition {
  const orig = new TextLocator(originalSource);
  const wasm = buildWasm();
  const pos = (column: number): Position => ({ line: 0, column });
  const atPx = (label: string) => pos(wasm.at(ADJUST_PIXEL, label));
  const atImg = (label: string) => pos(wasm.at(ADJUST_IMAGE, label));

  /** SubRangeBinding[] over [start, end) from (from, value?) breakpoints. */
  const sub = (
    start: Position,
    end: Position,
    ...parts: [Position, string?][]
  ): SubRangeBinding[] => {
    const result: SubRangeBinding[] = [];
    let cursor = start;
    let currentValue: string | undefined = undefined;
    for (const [from, value] of parts) {
      if (from.column > cursor.column) {
        result.push({ from: cursor, to: from, value: currentValue });
      }
      cursor = from;
      currentValue = value;
    }
    result.push({ from: cursor, to: end, value: currentValue });
    return result;
  };

  // ---- Original scope positions ----
  const origModuleEnd = orig.end();
  const clampStart = orig.at("(int32_t level) {");
  const clampEnd = orig.after("  return level;\n}");
  const contrastStart = orig.at("(int32_t level, int32_t contrastPct) {");
  const contrastEnd = orig.after("  return clampLevel(scaled + 128);\n}");
  const pixelStart = orig.at("(int32_t level, int32_t brightness, int32_t contrastPct) {");
  const pixelEnd = orig.after("  return result;\n}");
  const averageStart = orig.at("(int64_t sum, int32_t count) {");
  const averageEnd = orig.after("if count == 0!\n}");
  const imageStart = orig.at("(Image* image, int32_t brightness, int32_t contrastPct) {");
  const imageEnd = orig.after("  return checksum;\n}");
  const forStart = orig.at("(int32_t i = 0;");
  const forBodyStart = orig.at("{\n    uint8_t* pixel");
  const forEnd = orig.after("mid-image.\n  }");

  const callSiteClamp1 = orig.origAt("clampLevel(level + brightness)");
  const callSiteContrast = orig.origAt("applyContrast(brightened, contrastPct)");
  const callSiteClamp2 = orig.origAt("clampLevel(scaled + 128)");
  const callSiteAverage = orig.origAt("averageLevel(checksum, pixelCount)");

  const builder = new SafeScopeInfoBuilder();
  builder
    .startSource()
    .startScope(0, 0, {
      kind: "Module",
      key: "module",
      variables: [
        "kMaxLevel",
        "g_imagesProcessed",
        "g_lastAverage",
        "clampLevel",
        "applyContrast",
        "adjustPixel",
        "averageLevel",
        "adjustImage",
      ],
    })
    .startScope(clampStart.line, clampStart.column, {
      kind: "Function",
      name: "clampLevel",
      isStackFrame: true,
      key: "clampLevel",
      variables: ["level"],
    })
    .endScope(clampEnd.line, clampEnd.column)
    .startScope(contrastStart.line, contrastStart.column, {
      kind: "Function",
      name: "applyContrast",
      isStackFrame: true,
      key: "applyContrast",
      variables: ["level", "contrastPct", "centered", "scaled"],
    })
    .endScope(contrastEnd.line, contrastEnd.column)
    .startScope(pixelStart.line, pixelStart.column, {
      kind: "Function",
      name: "adjustPixel",
      isStackFrame: true,
      key: "adjustPixel",
      variables: ["level", "brightness", "contrastPct", "brightened", "result"],
    })
    .endScope(pixelEnd.line, pixelEnd.column)
    .startScope(averageStart.line, averageStart.column, {
      kind: "Function",
      name: "averageLevel",
      isStackFrame: true,
      key: "averageLevel",
      variables: ["sum", "count"],
    })
    .endScope(averageEnd.line, averageEnd.column)
    .startScope(imageStart.line, imageStart.column, {
      kind: "Function",
      name: "adjustImage",
      isStackFrame: true,
      key: "adjustImage",
      variables: ["image", "brightness", "contrastPct", "pixelCount", "checksum"],
    })
    .startScope(forStart.line, forStart.column, {
      kind: "Block",
      key: "for",
      variables: ["i"],
    })
    .startScope(forBodyStart.line, forBodyStart.column, {
      kind: "Block",
      key: "forBody",
      variables: ["pixel", "adjusted"],
    })
    .endScope(forEnd.line, forEnd.column)
    .endScope(forEnd.line, forEnd.column)
    .endScope(imageEnd.line, imageEnd.column)
    .endScope(origModuleEnd.line, origModuleEnd.column)
    .endSource();

  // ---- Generated ranges (line 0, column = module byte offset) ----
  const pxStart = pos(wasm.bodyStart(ADJUST_PIXEL));
  const pxEnd = pos(wasm.bodyEnd(ADJUST_PIXEL));
  const imgStart = pos(wasm.bodyStart(ADJUST_IMAGE));
  const imgEnd = pos(wasm.bodyEnd(ADJUST_IMAGE));
  const stubStart = pos(wasm.bodyStart(LEGALSTUB));
  const stubEnd = pos(wasm.bodyEnd(LEGALSTUB));

  builder
    .startRange(0, 0, {
      scopeKey: "module",
      values: [
        "255",
        memI32(G_IMAGES_PROCESSED),
        memI32(G_LAST_AVERAGE),
        null,
        null,
        `$${ADJUST_PIXEL}`,
        null,
        `$${ADJUST_IMAGE}`,
      ],
    })
    .startRange(0, pxStart.column, {
      scopeKey: "adjustPixel",
      isStackFrame: true,
      values: [
        "$var0.value",
        "$var1.value",
        "$var2.value",
        sub(
          pxStart,
          pxEnd,
          [atPx("centered"), "$var3.value"],
          [atPx("clamp2.lt0"), BRIGHTENED_RECONSTRUCTED],
        ),
        sub(pxStart, pxEnd, [atPx("return"), "stack[0].value"]),
      ],
    })
    .startRange(0, atPx("clamp1.lt0").column, {
      scopeKey: "clampLevel",
      isStackFrame: false,
      callSite: callSiteClamp1,
      values: ["$var0.value + $var1.value"],
    })
    .endRange(0, atPx("clamp1.end").column)
    .startRange(0, atPx("centered").column, {
      scopeKey: "applyContrast",
      isStackFrame: false,
      callSite: callSiteContrast,
      values: [
        sub(
          atPx("centered"),
          atPx("return"),
          [atPx("centered"), "$var3.value"],
          [atPx("clamp2.lt0"), BRIGHTENED_RECONSTRUCTED],
        ),
        "$var2.value",
        sub(
          atPx("centered"),
          atPx("return"),
          [atPx("scaled"), "$var3.value - 128"],
          [atPx("clamp2.lt0"), `${BRIGHTENED_RECONSTRUCTED} - 128`],
        ),
        sub(
          atPx("centered"),
          atPx("return"),
          [atPx("contrastReturn"), "stack[0].value"],
          [atPx("scaledPlus128Tee"), "stack[0].value - 128"],
          [atPx("clamp2.lt0"), "$var3.value - 128"],
          [atPx("clamp2.afterTee")],
        ),
      ],
    })
    .startRange(0, atPx("clamp2.lt0").column, {
      scopeKey: "clampLevel",
      isStackFrame: false,
      callSite: callSiteClamp2,
      values: [
        sub(
          atPx("clamp2.lt0"),
          atPx("return"),
          [atPx("clamp2.lt0"), "$var3.value"],
          [atPx("clamp2.afterTee")],
        ),
      ],
    })
    .endRange(0, atPx("return").column)
    .endRange(0, atPx("return").column)
    .endRange(0, pxEnd.column)
    .startRange(0, imgStart.column, {
      scopeKey: "adjustImage",
      isStackFrame: true,
      values: [
        IMAGE_STRUCT_EXPR,
        "$var1.value",
        "$var2.value",
        sub(imgStart, imgEnd, [atImg("for"), "$var5.value - $var3.value"]),
        "$var6.value",
      ],
    })
    .startRange(0, atImg("for").column, {
      scopeKey: "for",
      values: [
        sub(atImg("for"), atImg("forEnd"), [atImg("loop"), "$var4.value - $var3.value"]),
      ],
    })
    .startRange(0, atImg("body").column, {
      scopeKey: "forBody",
      values: [
        "$var4.value",
        sub(atImg("body"), atImg("increment"), [atImg("store"), "$var7.value"]),
      ],
    })
    .endRange(0, atImg("increment").column)
    .endRange(0, atImg("forEnd").column)
    .startRange(0, atImg("divide").column, {
      scopeKey: "averageLevel",
      isStackFrame: false,
      callSite: callSiteAverage,
      values: ["$var6.value", "$var5.value - $var3.value"],
    })
    .endRange(0, atImg("storeAverage").column)
    .endRange(0, imgEnd.column)
    .startRange(0, stubStart.column, {
      isStackFrame: true,
      isHidden: true,
    })
    .endRange(0, stubEnd.column)
    .endRange(0, wasm.end);

  // ---- Mappings (instruction offset -> authored position) ----
  const brightenedStmt = orig.at("int32_t brightened = clampLevel");
  const clampLt0 = orig.at("if (level < 0) return 0;");
  const clampGtMax = orig.at("if (level > kMaxLevel) return kMaxLevel;");
  const forCond = orig.at("i < pixelCount");
  const averageStmt = orig.at("g_lastAverage = averageLevel(");
  const mappings: MappingPoint[] = [
    // adjustPixel
    { gen: atPx("brightenedArg"), orig: brightenedStmt, name: "brightened" },
    { gen: atPx("clamp1.lt0"), orig: clampLt0 },
    { gen: atPx("clamp1.gtMax"), orig: clampGtMax },
    { gen: atPx("clamp1.end"), orig: brightenedStmt, name: "brightened" },
    { gen: atPx("centered"), orig: orig.at("int32_t centered = level - 128;"), name: "centered" },
    { gen: atPx("scaled"), orig: orig.at("int32_t scaled = centered"), name: "scaled" },
    { gen: atPx("contrastReturn"), orig: orig.at("return clampLevel(scaled + 128);") },
    { gen: atPx("clamp2.lt0"), orig: clampLt0 },
    { gen: atPx("clamp2.gtMax"), orig: clampGtMax },
    { gen: atPx("return"), orig: orig.at("return result;") },
    // adjustImage
    { gen: atImg("pixelCount"), orig: orig.at("const int32_t pixelCount ="), name: "pixelCount" },
    { gen: atImg("forGuard"), orig: forCond },
    { gen: atImg("forInit"), orig: orig.at("int32_t i = 0"), name: "i" },
    { gen: atImg("body"), orig: orig.at("uint8_t* pixel ="), name: "pixel" },
    { gen: atImg("adjusted"), orig: orig.at("const int32_t adjusted ="), name: "adjusted" },
    {
      gen: atImg("callAdjustPixel"),
      orig: orig.at("adjustPixel(*pixel"),
      name: "adjustPixel",
    },
    { gen: atImg("store"), orig: orig.at("*pixel = static_cast") },
    { gen: atImg("checksum"), orig: orig.at("checksum += adjusted;"), name: "checksum" },
    { gen: atImg("if"), orig: orig.at("if (i == 2)") },
    { gen: atImg("debugger"), orig: orig.at("emscripten_debugger();") },
    { gen: atImg("increment"), orig: orig.at("++i") },
    { gen: atImg("cond"), orig: forCond },
    { gen: atImg("average"), orig: averageStmt, name: "g_lastAverage" },
    { gen: atImg("divide"), orig: orig.at("return static_cast<int32_t>(sum / count);") },
    { gen: atImg("storeAverage"), orig: averageStmt, name: "g_lastAverage" },
    { gen: atImg("counter"), orig: orig.at("++g_imagesProcessed;") },
    { gen: atImg("return"), orig: orig.at("return checksum;") },
    // legalstub$adjustImage has no authored code: explicitly unmapped.
    { gen: pos(wasm.at(LEGALSTUB, "start")) },
  ];

  const l = (needle: string) => orig.lineNumber(needle);
  const lDebugger = l("emscripten_debugger();");
  const lClampGtMax = l("if (level > kMaxLevel)");
  const lBrightened = l("int32_t brightened =");
  const lAdjusted = l("const int32_t adjusted =");
  const lContrastReturn = l("return clampLevel(scaled + 128);");
  const lResult = l("int32_t result =");
  const lReturnResult = l("return result;");
  const lDivide = l("return static_cast<int32_t>(sum / count);");
  const lAverageCall = l("g_lastAverage = averageLevel(");

  return {
    id: "08-webassembly",
    number: "08",
    title: "WebAssembly: Debugging C++ via Scopes & the Wasm Debug Proxy",
    shortTitle: "WebAssembly",
    subtitle:
      "A hand-assembled wasm module with a scopes source map: inlined C++ helpers, register reuse, structs in linear memory, i64 values and a wasm trap, all shown as authored C++.",
    proposalFeatures: [
      "Wasm Source Map Positions (line 0, column = module byte offset)",
      "Binding Expressions over V8's Wasm Debug Proxy ($var0, memories[0], stack[0], $func)",
      "Struct Reconstruction from Linear Memory (DataView / Uint8Array)",
      "SubRangeBinding[] for a Reused Wasm Local ($var3 -> 4 values)",
      "3-Level Inlining + 2 Call Sites of clampLevel (callSite)",
      "Hidden Compiler Stub (legalstub$adjustImage, isHidden: true)",
      "Nested Block Scopes & Strength-Reduced Loop Index (i -> $var4 - $var3)",
    ],
    devtoolsFeatures: [
      "Virtual Call Stack over Physical Wasm Frames",
      "Scope View with Authored C++ Names Instead of $var0..$var7",
      "Conditional Breakpoints in Inlined Wasm Code",
      "Symbolized Wasm Trap Stack Traces",
    ],
    originalFileName: "image-filter.cpp",
    originalSource,
    generatedCode: glueCode,
    builderCodeSnippet,
    scopeInfo: builder.build(),
    mappings,
    wasm: {
      fileName: WASM_FILE_NAME,
      bytes: wasm.bytes,
      disassembly: wasm.disassembly,
    },
    overviewHtml: `
      <p>
        Nothing in the scopes proposal is JavaScript-specific. Source maps for WebAssembly use a single generated line (<code>0</code>) and the <strong>module byte offset</strong> as the column, and binding expressions are evaluated with <code>Debugger.evaluateOnCallFrame</code> on the <em>wasm</em> frame. There, V8 exposes a <strong>debug proxy</strong> with the wasm state: locals <code>$var0</code>&hellip; as <code>{ type, value }</code>, the linear memory <code>memories[0]</code> (or <code>$memory</code>, named after its export), functions such as <code>$_Z11adjustPixeliii</code>, and the value stack <code>stack[0]</code>&hellip;
      </p>
      <p>
        <code>image-filter.wasm</code> is a hand-assembled module whose authored source is <code>image-filter.cpp</code>. The bindings describe what an optimizing C++ compiler did: <code>clampLevel</code> and <code>applyContrast</code> are inlined into <code>adjustPixel</code>, with <code>clampLevel</code> inlined at two call sites. One wasm local (<code>$var3</code>) holds four different C++ values over time. The loop index <code>i</code> exists only as a pointer difference, and <code>Image*</code> is decoded from linear memory into an object with a live <code>Uint8Array</code> of pixels. The <code>int64_t checksum</code> shows up as a <code>BigInt</code>, and an Emscripten <code>legalstub$adjustImage</code> wrapper is hidden. The JS glue (<code>bundle.js</code>) is <em>not</em> source-mapped.
      </p>
      <p>
        <strong>This is the experimental example:</strong> it only works if DevTools applies <code>scopes</code> to wasm call frames, so expect the most rough edges here.
      </p>
    `,
    debugSteps: [
      {
        featureTag: "Call Stack",
        title: "Pause in C++ via emscripten_debugger()",
        tryPrompt:
          `Click **"Run & Pause in Debugger"**. DevTools pauses at \`debugger;\` in the JS glue (\`bundle.js\`), which implements \`emscripten_debugger()\`. Press **Step out** (\`Shift+F11\`) once.`,
        checkPoints: [
          `**Authored location:** Paused on line ${lDebugger} of \`image-filter.cpp\` (\`if (i == 2) emscripten_debugger();\`), not in the wasm disassembly.`,
          "**Call Stack:** `adjustImage` (`image-filter.cpp`) → `callAdjustImage` → `window.runExample08` (`bundle.js`). The Emscripten wrapper `legalstub$adjustImage` between them is **not** shown (hidden range).",
          "**No raw names:** No `$var…` locals and no `Expression` (value stack) scope from raw wasm debugging.",
        ],
      },
      {
        featureTag: "Scope View",
        title: "Inspect C++ Variables Reconstructed from Wasm State",
        tryPrompt:
          "Look at the **Scope** pane for the `adjustImage` frame, and expand `image` and `image.pixels`.",
        checkPoints: [
          "**Block scopes:** `pixel: 2066` (an address) and `adjusted: 255`; in the enclosing `for` block, `i: 2` (computed as `$var4 - $var3` because the compiler turned `i` into a pointer).",
          "**Function scope:** `brightness: 30`, `contrastPct: 150`, `pixelCount: 4`, `checksum: 457n` (an `int64_t` shows up as a `BigInt`).",
          "**Struct from linear memory:** `image` is `{width: 2, height: 2, pixels: Uint8Array(4) [41, 161, 255, 250]}`. The first 3 pixels are already adjusted.",
          "**Module scope:** `kMaxLevel: 255` (constant), `g_imagesProcessed: 0` and `g_lastAverage: 0` (read from linear memory; higher on later runs), `clampLevel`/`applyContrast`/`averageLevel` `<unavailable>` (always inlined), `adjustPixel`/`adjustImage` are functions.",
        ],
      },
      {
        featureTag: "Conditional Breakpoints",
        title: "Break Inside an Inlined Helper with Two Call Sites",
        tryPrompt:
          `Set a conditional breakpoint on line ${lClampGtMax} (\`if (level > kMaxLevel) ...\` in \`clampLevel\`) with condition \`level > kMaxLevel\`, then resume (\`F8\`). Resume once more after the first hit.`,
        checkPoints: [
          `**1st hit (call site 1):** Call Stack \`clampLevel\` → \`adjustPixel\` (line ${lBrightened}) → \`adjustImage\` (line ${lAdjusted}). \`level: 280\` (\`250 + 30\`).`,
          `**2nd hit (call site 2):** \`clampLevel\` → \`applyContrast\` (line ${lContrastReturn}) → \`adjustPixel\` (line ${lResult}) → \`adjustImage\`. \`level: 318\`.`,
          "**Mixed frames:** `clampLevel` and `applyContrast` are virtual (inlined) frames, while `adjustPixel` and `adjustImage` are two real wasm frames.",
        ],
      },
      {
        featureTag: "Scope View",
        title: "Register Reuse & the Wasm Value Stack",
        tryPrompt:
          "At the 2nd hit, select the `applyContrast` frame and then the `adjustPixel` frame in the Call Stack.",
        checkPoints: [
          "**`applyContrast`:** `level: 255`, `contrastPct: 150`, `centered: 127`, `scaled: 190`. The wasm local `$var3` currently holds `scaled + 128`, so `level` and `centered` are reconstructed from `$var0`/`$var1`.",
          "**`adjustPixel`:** `level: 250`, `brightness: 30`, `contrastPct: 150`, `brightened: 255` (reconstructed), `result: <unavailable>`.",
          `**Value stack binding:** Remove the breakpoints, set one on line ${lReturnResult} (\`return result;\`) and resume. \`result\` should be \`255\`, read from the wasm value stack (\`stack[0]\`).`,
        ],
      },
      {
        featureTag: "Logical Stepping",
        title: "Step Through Inlined C++ Code",
        tryPrompt:
          `Remove all breakpoints, click **Run** again, step out of the JS glue and use **Step over** (\`F10\`) until you reach line ${lAdjusted}. Then use **Step into** (\`F11\`) repeatedly.`,
        checkPoints: [
          "**Step into** enters `adjustPixel` (a real wasm call) and then the inlined `clampLevel`/`applyContrast` frames, which appear and disappear in the Call Stack.",
          "**Step over** on a line that calls an inlined helper (e.g. `int32_t brightened = ...`) does not stop inside the helper.",
          "**Step out** of an inlined frame lands back in the caller's line.",
        ],
      },
      {
        featureTag: "Error Stack Traces",
        title: "Symbolized Stack Trace for a Wasm Trap",
        tryPrompt:
          "Remove all breakpoints, resume, and click **Trap: Divide by Zero**. It runs `adjustImage` on an empty 0×0 image, so the inlined `averageLevel` divides by zero.",
        checkPoints: [
          `**Console:** \`RuntimeError: divide by zero\` with stack \`averageLevel\` (line ${lDivide}) → \`adjustImage\` (line ${lAverageCall}) → \`callAdjustImage\` → \`window.logStackExample08\` (\`bundle.js\`).`,
          "**Hidden and raw frames:** `legalstub$adjustImage` is not shown. The page readout shows the raw `err.stack` with `wasm-function[3]:0x…` frames.",
          `**Pause on exceptions:** Enable **Pause on caught exceptions** and click the button again. DevTools pauses on line ${lDivide} with \`sum: 0n\` and \`count: 0\`. In \`adjustImage\`, \`image\` is \`{width: 0, height: 0, pixels: Uint8Array(0)}\`.`,
        ],
      },
    ],
    evalExpressions: [
      {
        expression: "image.pixels[i]",
        expectedResult: "255 (adjustImage frame, first pause)",
        explanation:
          "`image` is decoded from linear memory with a live `Uint8Array` for `pixels`, and `i` is `$var4.value - $var3.value`. Close to C++'s `image->pixels[i]`.",
      },
      {
        expression: "Number(checksum) / (i + 1)",
        expectedResult: "152.33333333333334 (adjustImage frame, first pause)",
        explanation:
          "`checksum` is an `int64_t` (wasm `i64`), so its binding produces a `BigInt` (`457n`) that has to be converted before mixing it with numbers.",
      },
      {
        expression: "adjustPixel(200, brightness, contrastPct)",
        expectedResult: "255",
        explanation:
          "`adjustPixel` is bound to the wasm function `$_Z11adjustPixeliii`, so the Console calls into wasm while paused.",
      },
      {
        expression: "{ level, centered, scaled }",
        expectedResult: "{ level: 255, centered: 127, scaled: 190 } (applyContrast frame, 2nd conditional breakpoint hit)",
        explanation:
          "All three values come from different sub-range bindings: a reconstruction from `$var0`/`$var1` and arithmetic on the reused `$var3`.",
      },
    ],
    otherThingsToTry: [
      "Evaluate raw wasm names like `$var3`, `$memory`, `memories`, `locals` or `stack` in the Console. Do they still work next to the authored names?",
      "Hover `image`, `checksum` or `pixel` in `image-filter.cpp` for popovers, and check the inline value hints.",
      "Right-click the Call Stack › **Copy stack trace** while paused in the inlined `clampLevel`.",
      `Set a logpoint on line ${l("checksum += adjusted;")} logging \`i, adjusted, checksum\`.`,
      "Open `image-filter.wasm` itself in the Sources panel (disassembly) and compare the byte offsets with tab **2**.",
      "Add `image` as a Watch expression and step through the loop to watch `image.pixels` change.",
    ],
    runFunctionName: "runExample08",
    logStackFunctionName: "logStackExample08",
    logStackButtonLabel: "Trap: Divide by Zero",
  };
}
