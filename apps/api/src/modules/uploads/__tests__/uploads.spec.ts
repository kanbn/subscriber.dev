import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { detectImage } from "../storage.js";
import { resolveVideo, thumbnailWithPlayButton } from "../video.js";

const image = (format: "png" | "jpeg" | "gif" | "webp") =>
  sharp({
    create: { width: 2, height: 2, channels: 3, background: "#000" },
  })
    .toFormat(format)
    .toBuffer();
const text = (value: string) => new TextEncoder().encode(value);

describe("detectImage", () => {
  it("recognises real images by decoding them", async () => {
    expect((await detectImage(await image("png")))?.ext).toBe("png");
    expect((await detectImage(await image("jpeg")))?.ext).toBe("jpg");
    expect((await detectImage(await image("gif")))?.ext).toBe("gif");
    expect((await detectImage(await image("webp")))?.ext).toBe("webp");
  });

  it("rejects anything else, whatever it's called", async () => {
    expect(await detectImage(text('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(await detectImage(text("<html>"))).toBeNull();
    expect(await detectImage(text("\x89PNG\r\n but not really"))).toBeNull();
  });
});

describe("resolveVideo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns YouTube links into a thumbnail and a watch link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ title: "Product tour" }),
      }),
    );
    for (const link of [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      await expect(resolveVideo(link)).resolves.toEqual({
        href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        thumbnailUrl:
          "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        title: "Product tour",
      });
    }
  });

  it("rejects links that aren't YouTube, Vimeo or Loom", async () => {
    await expect(resolveVideo("https://example.com/video.mp4")).rejects.toThrow(
      "YouTube, Vimeo or Loom",
    );
    await expect(resolveVideo("not a link")).rejects.toThrow();
  });

  it("only downloads thumbnails from the video providers", async () => {
    await expect(
      thumbnailWithPlayButton("https://169.254.169.254/latest/meta-data"),
    ).rejects.toThrow("supported host");
  });
});
