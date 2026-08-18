export interface ParsedBounceCandidate {
  from: string;
  subject: string;
  text: string;
}

const BOUNCE_SENDER_PATTERNS = [/mailer-daemon/i, /postmaster/i];

const BOUNCE_SUBJECT_PATTERNS = [
  /mail delivery failed/i,
  /undelivered mail/i,
  /delivery status notification/i,
  /returned mail/i,
  /failure notice/i,
  /undeliverable/i,
];

export function isBounceNotification(email: ParsedBounceCandidate): boolean {
  return (
    BOUNCE_SENDER_PATTERNS.some((p) => p.test(email.from)) ||
    BOUNCE_SUBJECT_PATTERNS.some((p) => p.test(email.subject))
  );
}

export type BounceType = "hard" | "soft";

// Enhanced SMTP status codes (RFC 3463): 5.x.x = permanent, 4.x.x = transient.
// Real-world bounces aren't always RFC 3464-structured, so this also falls
// back to matching common plain-text phrasing from major mail servers.
const HARD_BOUNCE_PATTERNS = [
  /\b5\.\d\.\d{1,3}\b/,
  /\b550\b/,
  /user unknown/i,
  /no such user/i,
  /invalid (recipient|mailbox|address)/i,
  /mailbox (not found|unavailable)/i,
  /does not exist/i,
  /recipient (rejected|not found)/i,
];

const SOFT_BOUNCE_PATTERNS = [
  /\b4\.\d\.\d{1,3}\b/,
  /\b45\d\b/,
  /mailbox full/i,
  /over quota/i,
  /quota exceeded/i,
  /temporarily (unavailable|deferred)/i,
  /try again later/i,
];

export function classifyBounce(searchText: string): BounceType {
  if (HARD_BOUNCE_PATTERNS.some((p) => p.test(searchText))) return "hard";
  if (SOFT_BOUNCE_PATTERNS.some((p) => p.test(searchText))) return "soft";
  // Unclassifiable bounce: treat as hard. Safer to stop sending to an
  // address we can't confidently classify than to keep retrying against it.
  return "hard";
}

const RUN_STEP_TOKEN_PATTERN = /^bounce\+([^@]+)@/i;

export function extractRunStepToken(recipient: string): string | null {
  const match = RUN_STEP_TOKEN_PATTERN.exec(recipient);
  return match?.[1] ?? null;
}

const MAX_REASON_LENGTH = 500;

export function extractReason(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return "Unknown bounce reason";
  return trimmed.length > MAX_REASON_LENGTH
    ? `${trimmed.slice(0, MAX_REASON_LENGTH)}…`
    : trimmed;
}
