/**
 * A tiny WebAssembly binary assembler for hand-crafted examples.
 *
 * Source maps for WebAssembly use a single generated "line" (0) and the
 * absolute byte offset into the module as the "column". To build mappings and
 * `scopes` ranges for a wasm module we therefore need the exact module offset
 * of individual instructions. This assembler records the offset of every
 * instruction, lets callers `mark()` named labels, and renders a WAT-like
 * disassembly listing annotated with offsets (the same hex offsets Chrome
 * DevTools shows for wasm).
 *
 * Only the handful of instructions needed by the examples are supported.
 */

export type ValType = "i32" | "i64";

const VALTYPE_CODE: Record<ValType, number> = { i32: 0x7f, i64: 0x7e };

export function uleb128(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`uleb128 expects a non-negative integer, got ${value}`);
  }
  const out: number[] = [];
  do {
    let byte = value & 0x7f;
    value = Math.floor(value / 128);
    if (value !== 0) byte |= 0x80;
    out.push(byte);
  } while (value !== 0);
  return out;
}

export function sleb128(value: number | bigint): number[] {
  let v = BigInt(value);
  const out: number[] = [];
  for (;;) {
    const byte = Number(v & 0x7fn);
    v >>= 7n;
    const signBitSet = (byte & 0x40) !== 0;
    if ((v === 0n && !signBitSet) || (v === -1n && signBitSet)) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
}

function encodeName(name: string): number[] {
  const utf8 = [...new TextEncoder().encode(name)];
  return [...uleb128(utf8.length), ...utf8];
}

function section(id: number, payload: number[]): number[] {
  return [id, ...uleb128(payload.length), ...payload];
}

function vec(items: number[][]): number[] {
  return [...uleb128(items.length), ...items.flat()];
}

type Immediate = "none" | "local" | "func" | "label" | "i32" | "i64" | "mem" | "block";

const OPCODES: Record<string, { code: number; imm: Immediate; align?: number }> = {
  "unreachable": { code: 0x00, imm: "none" },
  "nop": { code: 0x01, imm: "none" },
  "block": { code: 0x02, imm: "block" },
  "loop": { code: 0x03, imm: "block" },
  "if": { code: 0x04, imm: "block" },
  "else": { code: 0x05, imm: "none" },
  "end": { code: 0x0b, imm: "none" },
  "br": { code: 0x0c, imm: "label" },
  "br_if": { code: 0x0d, imm: "label" },
  "return": { code: 0x0f, imm: "none" },
  "call": { code: 0x10, imm: "func" },
  "drop": { code: 0x1a, imm: "none" },
  "select": { code: 0x1b, imm: "none" },
  "local.get": { code: 0x20, imm: "local" },
  "local.set": { code: 0x21, imm: "local" },
  "local.tee": { code: 0x22, imm: "local" },
  "i32.load": { code: 0x28, imm: "mem", align: 2 },
  "i32.load8_u": { code: 0x2d, imm: "mem", align: 0 },
  "i32.store": { code: 0x36, imm: "mem", align: 2 },
  "i32.store8": { code: 0x3a, imm: "mem", align: 0 },
  "i64.store32": { code: 0x3e, imm: "mem", align: 2 },
  "i32.const": { code: 0x41, imm: "i32" },
  "i64.const": { code: 0x42, imm: "i64" },
  "i32.eqz": { code: 0x45, imm: "none" },
  "i32.eq": { code: 0x46, imm: "none" },
  "i32.ne": { code: 0x47, imm: "none" },
  "i32.lt_s": { code: 0x48, imm: "none" },
  "i32.lt_u": { code: 0x49, imm: "none" },
  "i32.gt_s": { code: 0x4a, imm: "none" },
  "i32.gt_u": { code: 0x4b, imm: "none" },
  "i32.le_s": { code: 0x4c, imm: "none" },
  "i32.ge_s": { code: 0x4e, imm: "none" },
  "i32.ge_u": { code: 0x4f, imm: "none" },
  "i32.add": { code: 0x6a, imm: "none" },
  "i32.sub": { code: 0x6b, imm: "none" },
  "i32.mul": { code: 0x6c, imm: "none" },
  "i32.div_s": { code: 0x6d, imm: "none" },
  "i64.add": { code: 0x7c, imm: "none" },
  "i64.div_s": { code: 0x7f, imm: "none" },
  "i64.shr_u": { code: 0x88, imm: "none" },
  "i32.wrap_i64": { code: 0xa7, imm: "none" },
  "i64.extend_i32_s": { code: 0xac, imm: "none" },
};

interface Instruction {
  /** Offset relative to the start of the function's instruction stream. */
  offset: number;
  text: string;
  depth: number;
}

/**
 * Instruction stream of a single function body (excluding the locals
 * declaration, which is emitted by `assembleModule`).
 */
export class WasmCode {
  readonly bytes: number[] = [];
  readonly instructions: Instruction[] = [];
  readonly labels = new Map<string, number>();
  readonly comments = new Map<number, string>();
  #depth = 0;

  /** Records `label` at the offset of the next emitted instruction. */
  mark(label: string): this {
    if (this.labels.has(label)) throw new Error(`Duplicate label ${label}`);
    this.labels.set(label, this.bytes.length);
    return this;
  }

  /** Adds a `;; comment` line to the disassembly before the next instruction. */
  comment(text: string): this {
    const prev = this.comments.get(this.bytes.length);
    this.comments.set(this.bytes.length, prev ? `${prev}\n${text}` : text);
    return this;
  }

  op(name: string, ...args: (number | bigint | string)[]): this {
    const def = OPCODES[name];
    if (!def) throw new Error(`Unsupported opcode ${name}`);
    if (name === "end" || name === "else") this.#depth--;

    const offset = this.bytes.length;
    const bytes = [def.code];
    let text = name;
    switch (def.imm) {
      case "none":
        break;
      case "block":
        bytes.push(0x40); // empty block type
        break;
      case "local": {
        const idx = Number(args[0]);
        bytes.push(...uleb128(idx));
        text += ` $var${idx}`;
        break;
      }
      case "func": {
        // args: [index, name]
        bytes.push(...uleb128(Number(args[0])));
        text += ` $${String(args[1] ?? args[0])}`;
        break;
      }
      case "label":
        bytes.push(...uleb128(Number(args[0])));
        text += ` ${args[0]}`;
        break;
      case "i32":
      case "i64":
        bytes.push(...sleb128(args[0] as number | bigint));
        text += ` ${args[0]}`;
        break;
      case "mem": {
        const memOffset = Number(args[0] ?? 0);
        bytes.push(...uleb128(def.align!), ...uleb128(memOffset));
        if (memOffset !== 0) text += ` offset=${memOffset}`;
        break;
      }
    }
    this.bytes.push(...bytes);
    this.instructions.push({ offset, text, depth: this.#depth });
    if (def.imm === "block" || name === "else") this.#depth++;
    return this;
  }
}

export interface WasmImportDef {
  module: string;
  field: string;
  /** Name used in the `name` section and disassembly. */
  name: string;
  params: ValType[];
  results: ValType[];
}

export interface WasmFuncDef {
  /** Name used in the `name` section (e.g. a mangled C++ name). */
  name: string;
  params: ValType[];
  results: ValType[];
  locals: ValType[];
  code: WasmCode;
}

export interface WasmModuleDef {
  imports: WasmImportDef[];
  funcs: WasmFuncDef[];
  memory: { minPages: number };
  exports: { name: string; kind: "func" | "memory"; target: string | number }[];
  sourceMappingURL?: string;
}

export interface AssembledWasm {
  bytes: Uint8Array<ArrayBuffer>;
  disassembly: string;
  /** Exclusive end offset of the module (= byte length). */
  end: number;
  /** Function index (imports first) of the function or import named `name`. */
  funcIndex(name: string): number;
  /** Absolute module offset of `label` inside function `func`. */
  at(func: string, label: string): number;
  /** Absolute module offset of the function body (its locals declaration). */
  bodyStart(func: string): number;
  /** Absolute module offset just past the function body's final `end`. */
  bodyEnd(func: string): number;
}

function hex(offset: number): string {
  return "0x" + offset.toString(16).padStart(3, "0");
}

export function assembleModule(def: WasmModuleDef): AssembledWasm {
  // ---- Types (deduplicated function signatures) ----
  const types: string[] = [];
  const typeIndex = (params: ValType[], results: ValType[]) => {
    const key = `${params.join(",")}->${results.join(",")}`;
    let idx = types.indexOf(key);
    if (idx === -1) {
      idx = types.length;
      types.push(key);
    }
    return idx;
  };
  const importTypes = def.imports.map((imp) => typeIndex(imp.params, imp.results));
  const funcTypes = def.funcs.map((f) => typeIndex(f.params, f.results));

  const allNames = [...def.imports.map((i) => i.name), ...def.funcs.map((f) => f.name)];
  const funcIndex = (name: string) => {
    const idx = allNames.indexOf(name);
    if (idx === -1) throw new Error(`Unknown function ${name}`);
    return idx;
  };

  const typeSection = section(
    1,
    vec(types.map((key) => {
      const [params, results] = key.split("->").map((s) =>
        s ? s.split(",").map((t) => VALTYPE_CODE[t as ValType]) : []
      );
      return [0x60, ...uleb128(params.length), ...params, ...uleb128(results.length), ...results];
    })),
  );

  const importSection = section(
    2,
    vec(def.imports.map((imp, i) => [
      ...encodeName(imp.module),
      ...encodeName(imp.field),
      0x00,
      ...uleb128(importTypes[i]),
    ])),
  );

  const functionSection = section(3, vec(funcTypes.map((t) => uleb128(t))));
  const memorySection = section(5, vec([[0x00, ...uleb128(def.memory.minPages)]]));
  const exportSection = section(
    7,
    vec(def.exports.map((e) => [
      ...encodeName(e.name),
      e.kind === "func" ? 0x00 : 0x02,
      ...uleb128(e.kind === "func" ? funcIndex(String(e.target)) : Number(e.target)),
    ])),
  );

  const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  const beforeCode = [
    ...header,
    ...typeSection,
    ...importSection,
    ...functionSection,
    ...memorySection,
    ...exportSection,
  ];

  // ---- Code section, tracking absolute offsets ----
  const bodies = def.funcs.map((f) => {
    // Group consecutive locals of the same type.
    const groups: [number, ValType][] = [];
    for (const t of f.locals) {
      const last = groups.at(-1);
      if (last && last[1] === t) last[0]++;
      else groups.push([1, t]);
    }
    const localsDecl = vec(groups.map(([n, t]) => [...uleb128(n), VALTYPE_CODE[t]]));
    return { localsDecl, body: [...localsDecl, ...f.code.bytes] };
  });

  const codePayloadEntries = bodies.map((b) => [...uleb128(b.body.length), ...b.body]);
  const codePayload = vec(codePayloadEntries);
  const codeSectionStart = beforeCode.length;
  const codeSection = section(10, codePayload);
  const codePayloadStart = codeSectionStart + 1 + uleb128(codePayload.length).length;

  const bodyStarts: number[] = [];
  const instrStarts: number[] = [];
  let cursor = codePayloadStart + uleb128(def.funcs.length).length;
  bodies.forEach((b) => {
    cursor += uleb128(b.body.length).length;
    bodyStarts.push(cursor);
    instrStarts.push(cursor + b.localsDecl.length);
    cursor += b.body.length;
  });

  // ---- Custom sections: name + sourceMappingURL ----
  const functionNames = vec(allNames.map((name, i) => [...uleb128(i), ...encodeName(name)]));
  const nameSection = section(0, [
    ...encodeName("name"),
    0x01,
    ...uleb128(functionNames.length),
    ...functionNames,
  ]);
  const sourceMapSection = def.sourceMappingURL
    ? section(0, [...encodeName("sourceMappingURL"), ...encodeName(def.sourceMappingURL)])
    : [];

  const bytes = new Uint8Array([...beforeCode, ...codeSection, ...nameSection, ...sourceMapSection]);

  // ---- Disassembly ----
  const pad = " ".repeat(hex(0).length);
  const lines: string[] = [];
  const sig = (params: ValType[], results: ValType[]) =>
    `${params.length ? ` (param ${params.join(" ")})` : ""}${
      results.length ? ` (result ${results.join(" ")})` : ""
    }`;
  lines.push(`${pad}  (module`);
  def.imports.forEach((imp, i) => {
    lines.push(
      `${pad}    (import "${imp.module}" "${imp.field}" (func $${imp.name} (;${i};)${sig(imp.params, imp.results)}))`,
    );
  });
  lines.push(`${pad}    (memory (;0;) ${def.memory.minPages})`);
  def.exports.forEach((e) => {
    lines.push(
      `${pad}    (export "${e.name}" (${e.kind} ${e.kind === "func" ? "$" + e.target : e.target}))`,
    );
  });
  def.funcs.forEach((f, i) => {
    const idx = def.imports.length + i;
    const params = f.params.map((t, p) => ` (param $var${p} ${t})`).join("");
    const results = f.results.length ? ` (result ${f.results.join(" ")})` : "";
    lines.push(`${pad}`);
    lines.push(`${hex(bodyStarts[i])}    (func $${f.name} (;${idx};)${params}${results}`);
    f.locals.forEach((t, l) => {
      lines.push(`${pad}      (local $var${f.params.length + l} ${t})`);
    });
    for (const ins of f.code.instructions) {
      const comment = f.code.comments.get(ins.offset);
      const indent = "  ".repeat(Math.max(0, ins.depth) + 3);
      if (comment) {
        for (const c of comment.split("\n")) lines.push(`${pad}${indent};; ${c}`);
      }
      lines.push(`${hex(instrStarts[i] + ins.offset)}${indent}${ins.text}`);
    }
  });
  lines.push(`${pad}  )`);

  const funcPos = (name: string) => {
    const i = def.funcs.findIndex((f) => f.name === name);
    if (i === -1) throw new Error(`Unknown defined function ${name}`);
    return i;
  };

  return {
    bytes,
    disassembly: lines.join("\n") + "\n",
    end: bytes.length,
    funcIndex,
    at(func, label) {
      const i = funcPos(func);
      const rel = def.funcs[i].code.labels.get(label);
      if (rel === undefined) throw new Error(`Unknown label ${label} in ${func}`);
      return instrStarts[i] + rel;
    },
    bodyStart: (func) => bodyStarts[funcPos(func)],
    bodyEnd: (func) => {
      const i = funcPos(func);
      return bodyStarts[i] + bodies[i].body.length;
    },
  };
}
