import { render } from "ink-testing-library";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MultilineTextInput } from "../MultilineTextInput.js";

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 50));
}

function Harness({
  initialValue = "",
  onSubmit,
}: {
  initialValue?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <MultilineTextInput value={value} onChange={setValue} onSubmit={onSubmit} />
  );
}

describe("MultilineTextInput", () => {
  it("types characters and renders them", async () => {
    const { lastFrame, stdin } = render(<Harness onSubmit={vi.fn()} />);

    await tick();
    stdin.write("hello");

    await vi.waitFor(() => {
      expect(lastFrame()).toContain("hello");
    });
  });

  it("inserts a newline on Enter and keeps accepting input across lines", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(<Harness onSubmit={onSubmit} />);

    await tick();
    stdin.write("line1");
    await tick();
    stdin.write("\r");
    await tick();
    stdin.write("line2");
    await tick();
    stdin.write("\x04"); // Ctrl+D

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("line1\nline2");
    });
  });

  it("calls onSubmit with the current value on Ctrl+D", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <Harness initialValue="abc" onSubmit={onSubmit} />,
    );

    await tick();
    stdin.write("\x04");

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("abc");
    });
  });

  it("backspace removes the previous character", async () => {
    const onSubmit = vi.fn();
    const { stdin } = render(
      <Harness initialValue="abc" onSubmit={onSubmit} />,
    );

    await tick();
    stdin.write("\x7f");
    await tick();
    stdin.write("\x04");

    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("ab");
    });
  });
});
