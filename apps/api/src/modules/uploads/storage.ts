import { AwsClient } from "aws4fetch";
import sharp from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_FORMATS: Record<string, { type: string; ext: string }> = {
  png: { type: "image/png", ext: "png" },
  jpeg: { type: "image/jpeg", ext: "jpg" },
  gif: { type: "image/gif", ext: "gif" },
  webp: { type: "image/webp", ext: "webp" },
};

export async function detectImage(bytes: Uint8Array) {
  try {
    const { format } = await sharp(bytes).metadata();
    return IMAGE_FORMATS[format] ?? null;
  } catch {
    return null;
  }
}

function config() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.ASSETS_BUCKET;
  const publicUrl = process.env.ASSETS_URL;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }
  const region = process.env.S3_REGION ?? "us-east-1";
  return { endpoint, accessKeyId, secretAccessKey, bucket, publicUrl, region };
}

export function storageConfigured() {
  return config() !== null;
}

export async function putPublicObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  const settings = config();
  if (!settings) throw new Error("File storage isn't configured");
  const client = new AwsClient({
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
    service: "s3",
    region: settings.region,
  });
  const response = await client.fetch(
    `${settings.endpoint.replace(/\/$/, "")}/${settings.bucket}/${key}`,
    {
      method: "PUT",
      body: new Uint8Array(body),
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }
  return `${settings.publicUrl.replace(/\/$/, "")}/${key}`;
}
