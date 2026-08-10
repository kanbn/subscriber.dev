// orval emits relative imports (e.g. the mutator import) without file
// extensions, which Node's ESM resolver rejects under "moduleResolution":
// "node16"/"nodenext". Patch them in place after each `orval` run.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(
  new URL("../src/generated-cli.ts", import.meta.url),
);

const source = readFileSync(target, "utf-8");
const fixed = source.replace(/from '(\.[^']+)'/g, (match, specifier) =>
  specifier.endsWith(".js") ? match : `from '${specifier}.js'`,
);

if (fixed !== source) {
  writeFileSync(target, fixed);
}
