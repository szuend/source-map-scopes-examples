import { getAllExamples } from "../src/examples/mod.ts";
import { buildExampleSourceMap } from "../src/lib/sourcemap.ts";
import { renderExampleHtml, renderIndexHtml } from "../src/site/templates.ts";

const DIST_DIR = new URL("../dist/", import.meta.url);
const STYLES_PATH = new URL("../src/site/styles.css", import.meta.url);

export async function buildSite(): Promise<void> {
  // Clean stray root artifacts if any exist from non-slashed URL resolution
  for (const stray of ["index.html", "styles.css", ".nojekyll", "examples"]) {
    try {
      await Deno.remove(new URL(`../${stray}`, import.meta.url), {
        recursive: true,
      });
    } catch {
      // Ignore if not present
    }
  }
  await Deno.mkdir(DIST_DIR, { recursive: true });

  const stylesCss = await Deno.readTextFile(STYLES_PATH);
  await Deno.writeTextFile(new URL("./styles.css", DIST_DIR), stylesCss);
  await Deno.writeTextFile(new URL("./.nojekyll", DIST_DIR), "");

  const examples = getAllExamples();
  const builtExamples = examples.map((ex) => buildExampleSourceMap(ex));

  const indexHtml = renderIndexHtml(builtExamples);
  await Deno.writeTextFile(new URL("./index.html", DIST_DIR), indexHtml);

  for (const built of builtExamples) {
    const { example, sourceMap, decodedScopeInfo } = built;
    const exampleDir = new URL(`./examples/${example.id}/`, DIST_DIR);
    await Deno.mkdir(exampleDir, { recursive: true });

    await Deno.writeTextFile(
      new URL("./bundle.js", exampleDir),
      example.generatedCode,
    );
    await Deno.writeTextFile(
      new URL("./bundle.js.map", exampleDir),
      JSON.stringify(sourceMap, null, 2) + "\n",
    );
    await Deno.writeTextFile(
      new URL(`./${example.originalFileName}`, exampleDir),
      example.originalSource,
    );

    const exampleHtml = renderExampleHtml(built, builtExamples);
    await Deno.writeTextFile(new URL("./index.html", exampleDir), exampleHtml);

    console.log(
      `✓ Built [${example.id}] -> scopes: ${
        sourceMap.scopes?.length ?? 0
      } source(s), ranges: ${
        sourceMap.ranges?.length ?? 0
      } line(s), names: ${
        sourceMap.names?.length ?? 0
      }, hasVariableAndBindingInfo: ${decodedScopeInfo.hasVariableAndBindingInfo}`,
    );
  }

  console.log(`\nStatic GitHub Pages site generated in ./dist`);
}

if (import.meta.main) {
  await buildSite();
}
