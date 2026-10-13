import sharp from "sharp";

const THUMBNAIL_HOSTS = new Set([
  "img.youtube.com",
  "i.ytimg.com",
  "i.vimeocdn.com",
  "cdn.loom.com",
]);

export const VIDEO_WIDTH = 1104;

export interface ResolvedVideo {
  href: string;
  thumbnailUrl: string;
  title: string;
}

function youtubeId(url: URL): string | null {
  if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
  if (!url.hostname.endsWith("youtube.com")) return null;
  const fromQuery = url.searchParams.get("v");
  if (fromQuery) return fromQuery;
  const match = /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(url.pathname);
  return match?.[1] ?? null;
}

async function fetchJson(endpoint: string): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("That video couldn't be found");
  return (await response.json()) as Record<string, unknown>;
}

export async function resolveVideo(input: string): Promise<ResolvedVideo> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Paste a YouTube, Vimeo or Loom link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Paste a YouTube, Vimeo or Loom link");
  }

  const id = youtubeId(url);
  if (id && /^[\w-]{6,20}$/.test(id)) {
    const data = await fetchJson(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    );
    return {
      href: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      title: typeof data.title === "string" ? data.title : "Watch the video",
    };
  }

  const provider = url.hostname.endsWith("vimeo.com")
    ? `https://vimeo.com/api/oembed.json?width=${VIDEO_WIDTH}&url=`
    : url.hostname.endsWith("loom.com")
      ? "https://www.loom.com/v1/oembed?url="
      : null;
  if (!provider) throw new Error("Paste a YouTube, Vimeo or Loom link");

  const data = await fetchJson(
    `${provider}${encodeURIComponent(url.toString())}`,
  );
  if (typeof data.thumbnail_url !== "string") {
    throw new Error("That video doesn't have a thumbnail");
  }
  return {
    href: url.toString(),
    thumbnailUrl: data.thumbnail_url,
    title: typeof data.title === "string" ? data.title : "Watch the video",
  };
}

const PLAY_BUTTON = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <circle cx="80" cy="80" r="76" fill="rgba(0,0,0,0.6)"/>
    <path d="M64 50 L114 80 L64 110 Z" fill="#fff"/>
  </svg>`,
);

export async function thumbnailWithPlayButton(thumbnailUrl: string) {
  const url = new URL(thumbnailUrl);
  if (url.protocol !== "https:" || !THUMBNAIL_HOSTS.has(url.hostname)) {
    throw new Error("That video's thumbnail isn't on a supported host");
  }
  let response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok && url.pathname.endsWith("/maxresdefault.jpg")) {
    url.pathname = url.pathname.replace("maxresdefault", "hqdefault");
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  }
  if (!response.ok) throw new Error("Couldn't download the video thumbnail");
  const image = Buffer.from(await response.arrayBuffer());
  return await sharp(image)
    .resize({
      width: VIDEO_WIDTH,
      height: Math.round((VIDEO_WIDTH * 9) / 16),
      fit: "cover",
    })
    .composite([{ input: PLAY_BUTTON, gravity: "center" }])
    .jpeg({ quality: 82 })
    .toBuffer();
}
