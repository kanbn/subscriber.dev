import { jwtVerify, SignJWT } from "jose";

const encoder = new TextEncoder();
const UNSUBSCRIBE_TOKEN_PURPOSE = "unsubscribe";

export interface UnsubscribeTokenPayload {
  environmentId: number;
  subscriberPublicId: string;
}

/**
 * Creates a long‑lived unsubscribe link for a given subscriber.
 *
 * `${NEXT_PUBLIC_BASE_URL}/unsubscribe?token=<jwt>`
 *
 * The JWT payload contains the subscriber's public ID and the environment
 * it belongs to (publicId is only unique per environment, not globally, so
 * both are needed to resolve the subscriber) and is scoped to this purpose.
 * There is no expiry on purpose – unsubscribe links should remain valid
 * indefinitely.
 */
export async function createEmailUnsubscribeLink(
  environmentId: number,
  subscriberPublicId: string,
): Promise<string | null> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;

  if (!baseUrl || !secret) {
    // Environment not configured for unsubscribe links.
    return null;
  }

  const token = await new SignJWT({
    environmentId,
    subscriberPublicId,
    purpose: UNSUBSCRIBE_TOKEN_PURPOSE,
  })
    .setProtectedHeader({ alg: "HS256" })
    // No expiration on purpose; unsubscribe links are long‑lived.
    .sign(encoder.encode(secret));

  return `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Verifies an unsubscribe token and returns the environment ID and
 * subscriber's public ID, or null if the token is missing, invalid, or
 * signed for another purpose.
 */
export async function verifyEmailUnsubscribeToken(
  token: string,
): Promise<UnsubscribeTokenPayload | null> {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret));

    if (
      payload.purpose !== UNSUBSCRIBE_TOKEN_PURPOSE ||
      typeof payload.subscriberPublicId !== "string" ||
      typeof payload.environmentId !== "number"
    ) {
      return null;
    }

    return {
      environmentId: payload.environmentId,
      subscriberPublicId: payload.subscriberPublicId,
    };
  } catch {
    return null;
  }
}
