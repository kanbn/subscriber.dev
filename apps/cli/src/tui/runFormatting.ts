interface RunSubscriber {
  publicId: string;
  email: string | null;
  name: string | null;
  externalId: string | null;
}

interface RunStep {
  status: string;
}

export function subscriberLabel(subscriber: RunSubscriber): string {
  return (
    subscriber.email ??
    subscriber.name ??
    subscriber.externalId ??
    subscriber.publicId
  );
}

export function stepSummary(steps: RunStep[]): string {
  const sent = steps.filter((s) => s.status === "sent").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const suffix = failed > 0 ? `, ${failed} failed` : "";
  return `${sent}/${steps.length} sent${suffix}`;
}

export function stepColor(status: string): string | undefined {
  if (status === "sent") return "green";
  if (status === "failed") return "red";
  return undefined;
}
