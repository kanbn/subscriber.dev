import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { defineConfig } from "orval";

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"),
});

export default defineConfig({
  api: {
    input: {
      target: "../../apps/api/openapi.json",
      parserOptions: {
        validate: false,
      },
    },
    output: {
      target: "./src/generated.ts",
      client: "react-query",
      httpClient: "fetch",
      override: {
        mutator: {
          path: "./src/mutator/custom-fetch.ts",
          name: "customFetch",
        },
        requestOptions: {
          credentials: "include",
        },
      },
    },
  },
  cli: {
    input: {
      target: "../../apps/api/openapi.json",
      parserOptions: {
        validate: false,
      },
    },
    output: {
      target: "./src/generated-cli.ts",
      client: "fetch",
      httpClient: "fetch",
      override: {
        mutator: {
          path: "./src/mutator/cli-fetch.ts",
          name: "cliFetch",
        },
      },
    },
    hooks: {
      // Node's ESM resolver requires explicit extensions on relative
      // imports, but orval emits them without one. Runs after every
      // write (including `orval --watch`), so this can't be skipped
      // by invoking orval directly instead of the `generate` script.
      afterAllFilesWrite: "node scripts/fix-generated-imports.mjs",
    },
  },
});
