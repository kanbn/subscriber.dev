import { readFile } from "node:fs/promises";
import type { Command } from "commander";

import {
  uploadImage,
  uploadVideoThumbnail,
} from "@subscriber.dev/api-client/cli";

import { ensureLoggedIn } from "../auth.js";
import { requireEnvironmentId } from "../context.js";
import { printResult } from "../output.js";
import { run } from "../run.js";

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fail(data: unknown): void {
  const message = (data as { message?: unknown } | undefined)?.message;
  console.error(typeof message === "string" ? message : "Upload failed.");
  process.exitCode = 1;
}

export function registerUploadsCommand(program: Command): void {
  const uploads = program
    .command("uploads")
    .description("Upload images and videos to use in emails");

  uploads
    .command("image <path>")
    .description(
      "Upload a PNG, JPEG, GIF or WebP image (up to 5 MB) and print its URL",
    )
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (
          path: string,
          opts: { environment?: string; json?: boolean },
        ) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const file = new Blob([await readFile(path)]);
          const response = await uploadImage(environmentId, { file });
          if (response.status !== 201) {
            fail(response.data);
            return;
          }
          if (opts.json) printResult(response.data, opts);
          else console.log(response.data.url);
        },
      ),
    );

  uploads
    .command("video <url>")
    .description(
      "Store a thumbnail with a play button for a YouTube, Vimeo or Loom link",
    )
    .option(
      "--environment <environmentId>",
      "environment public ID (defaults to the current environment)",
    )
    .option("--json", "output as JSON")
    .action(
      run(
        async (url: string, opts: { environment?: string; json?: boolean }) => {
          ensureLoggedIn();
          const environmentId = requireEnvironmentId(opts);
          const response = await uploadVideoThumbnail(environmentId, { url });
          if (response.status !== 201) {
            fail(response.data);
            return;
          }
          const { src, href, title } = response.data;
          if (opts.json) printResult(response.data, opts);
          else
            console.log(
              `<a href="${href}"><img src="${src}" alt="${escapeAttribute(title)}"></a>`,
            );
        },
      ),
    );
}
