import { differenceInDays, formatDistanceStrict } from "date-fns";

export function formatRelativeTime(
  value: string | number | Date,
  now: Date = new Date(),
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (differenceInDays(now, date) >= 30) {
    return date.toISOString().slice(0, 10);
  }

  return formatDistanceStrict(date, now, {
    addSuffix: true,
    roundingMethod: "floor",
  });
}
