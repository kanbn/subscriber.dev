import { describe, expect, it, vi } from "vitest";

import { run } from "../run.js";

describe("run", () => {
  it("passes arguments through and resolves normally on success", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await -- async required to match run()'s signature
    const fn = vi.fn(async (a: number, b: string) => {
      expect(a).toBe(1);
      expect(b).toBe("two");
    });

    await run(fn)(1, "two");

    expect(fn).toHaveBeenCalledWith(1, "two");
    expect(process.exitCode).toBeUndefined();
  });

  it("catches a thrown Error, logs its message, and sets exitCode", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    // eslint-disable-next-line @typescript-eslint/require-await -- async required to match run()'s signature
    await run(async () => {
      throw new Error("boom");
    })();

    expect(errorSpy).toHaveBeenCalledWith("Error: boom");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });

  it("stringifies a non-Error thrown value", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.exitCode = undefined;

    // eslint-disable-next-line @typescript-eslint/require-await -- async required to match run()'s signature
    await run(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "plain string failure";
    })();

    expect(errorSpy).toHaveBeenCalledWith("Error: plain string failure");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
  });
});
