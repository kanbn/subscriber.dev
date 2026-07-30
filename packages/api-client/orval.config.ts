import { defineConfig } from "orval";
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

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
      baseUrl: process.env.API_BASE_URL,
      override: {
        requestOptions: {
          credentials: "include",
        },
      },
    },
  },
});
