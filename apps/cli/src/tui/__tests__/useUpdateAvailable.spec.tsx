import { Text } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import type * as UpdateCheck from "../../updateCheck.js";
import { useUpdateAvailable } from "../useUpdateAvailable.js";

vi.mock("../../updateCheck.js", async (importOriginal) => ({
  ...(await importOriginal<typeof UpdateCheck>()),
  fetchLatest: vi.fn().mockResolvedValue("0.1.3"),
}));

function Probe({ version }: { version: string }) {
  return <Text>{useUpdateAvailable(version) ?? "up to date"}</Text>;
}

describe("useUpdateAvailable", () => {
  it("checks npm as soon as it opens", async () => {
    const { lastFrame } = render(<Probe version="0.1.2" />);
    await vi.waitFor(() => {
      expect(lastFrame()).toBe("0.1.3");
    });
  });

  it("says nothing when already on the latest version", async () => {
    const { lastFrame } = render(<Probe version="0.1.3" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastFrame()).toBe("up to date");
  });
});
