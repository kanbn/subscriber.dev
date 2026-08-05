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
});
