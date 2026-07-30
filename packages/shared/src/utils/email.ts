import { jwtVerify, SignJWT } from "jose";

const encoder = new TextEncoder();
const UNSUBSCRIBE_TOKEN_PURPOSE = "unsubscribe";

/**
 * Creates a long‑lived unsubscribe link for a given subscriber.
 *
 * `${API_BASE_URL}/unsubscribe?token=<jwt>`
 *
 * The JWT payload only contains the subscriber's public ID and is scoped
 * to this purpose. There is no expiry on purpose – unsubscribe links
 * should remain valid indefinitely.
 */
export async function createEmailUnsubscribeLink(
  subscriberPublicId: string,
): Promise<string | null> {
  const baseUrl = process.env.API_BASE_URL;
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;

  if (!baseUrl || !secret) {
    // Environment not configured for unsubscribe links.
    return null;
  }

  const token = await new SignJWT({
    subscriberPublicId,
    purpose: UNSUBSCRIBE_TOKEN_PURPOSE,
  })
    .setProtectedHeader({ alg: "HS256" })
    // No expiration on purpose; unsubscribe links are long‑lived.
    .sign(encoder.encode(secret));

  return `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Verifies an unsubscribe token and returns the subscriber's public ID,
 * or null if the token is missing, invalid, or signed for another purpose.
 */
export async function verifyEmailUnsubscribeToken(
  token: string,
): Promise<string | null> {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret));

    if (
      payload.purpose !== UNSUBSCRIBE_TOKEN_PURPOSE ||
      typeof payload.subscriberPublicId !== "string"
    ) {
      return null;
    }

    return payload.subscriberPublicId;
  } catch {
    return null;
  }
}
