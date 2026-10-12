import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { authClient } from "@subscriber.dev/auth/client";

import { Comment, MarketingLayout, Ok, Prompt } from "~/components/Marketing";

const button =
  "border-border hover:bg-background-50 border px-3 py-2 disabled:opacity-50";

export default function ConsentPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const clientId =
    typeof router.query.client_id === "string" ? router.query.client_id : null;
  const [clientName, setClientName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !session) return;
    void authClient.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then(({ data }) => setClientName(data?.client_name ?? null));
  }, [clientId, session]);

  const respond = async (accept: boolean) => {
    setPending(true);
    setError(null);
    const { data, error } = await authClient.oauth2.consent({ accept });
    if (data?.url) {
      if (!accept) setDenied(true);
      window.location.href = data.url;
      return;
    }
    setPending(false);
    setError(
      (error as { error_description?: string } | null)?.error_description ??
        error?.message ??
        "Something went wrong. Start again from your agent.",
    );
  };

  const app = clientName ?? "an AI agent";

  return (
    <MarketingLayout
      title="Connect your agent · subscriber.dev"
      description="Allow an AI agent to use your subscriber.dev account."
    >
      <section className="px-4 py-12 sm:px-8">
        <h1 className="mb-6 font-semibold">
          <Prompt />
          connect agent
        </h1>
        <div className="max-w-[48ch]">
          {isPending || !router.isReady ? null : !session || !clientId ? (
            <p>✕ this link has expired. start again from your agent.</p>
          ) : denied ? (
            <p>✕ cancelled. nothing was connected.</p>
          ) : (
            <>
              <p className="mb-4">
                <span className="font-semibold">{app}</span> wants to use
                subscriber.dev as{" "}
                <span className="font-semibold">{session.user.email}</span>.
              </p>
              <p className="mb-2">
                <Comment># it will be able to</Comment>
              </p>
              <ul className="text-muted-foreground mb-6">
                <li>
                  <Ok>✓ </Ok>manage your workspaces, subscribers and workflows
                </li>
                <li>
                  <Ok>✓ </Ok>connect integrations and send emails
                </li>
                <li>
                  <Ok>✓ </Ok>see your analytics and billing
                </li>
              </ul>
              <p className="text-muted-foreground mb-6">
                only allow agents you trust.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void respond(true)}
                  className={`${button} font-semibold`}
                >
                  allow
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void respond(false)}
                  className={button}
                >
                  cancel
                </button>
              </div>
            </>
          )}
          {error && (
            <p className="mt-3 text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
