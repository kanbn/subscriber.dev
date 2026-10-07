import Link from "next/link";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import { useUnsubscribe } from "@subscriber.dev/api-client/hooks";

import { monoStack } from "~/components/Marketing";
import { PageHead } from "~/components/PageHead";

export default function UnsubscribeView() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const token =
    typeof router.query.token === "string" ? router.query.token : null;
  const { mutate, isPending, isSuccess, isError } = useUnsubscribe();

  const handleUnsubscribe = () => {
    if (!token) return;
    mutate({ data: { token } });
  };

  return (
    <>
      <PageHead title={t`Unsubscribe | subscriber.dev`} />
      <main
        style={{ fontFamily: monoStack }}
        className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center px-4 text-[13px] leading-relaxed"
      >
        <div className="border-border bg-background-50 w-full max-w-md border">
          <div className="border-border text-muted-foreground border-b px-4 py-2">
            <span className="text-emerald-600 dark:text-emerald-400">$ </span>
            unsubscribe
          </div>

          <div className="px-4 py-6">
            {!mounted || !router.isReady ? (
              <p className="text-muted-foreground">…</p>
            ) : !token ? (
              <p>
                <span className="text-amber-600 dark:text-amber-400">✕ </span>
                <Trans>This unsubscribe link is invalid.</Trans>
              </p>
            ) : isSuccess ? (
              <p>
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓{" "}
                </span>
                <Trans>
                  You've been unsubscribed. You won't receive any more emails
                  from us.
                </Trans>
              </p>
            ) : isError ? (
              <p>
                <span className="text-amber-600 dark:text-amber-400">✕ </span>
                <Trans>This unsubscribe link is invalid or has expired.</Trans>
              </p>
            ) : (
              <>
                <p className="text-muted-foreground mb-6">
                  <Trans>
                    Click the button below to stop receiving emails from us.
                  </Trans>
                </p>
                <button
                  type="button"
                  onClick={handleUnsubscribe}
                  disabled={isPending}
                  className="border-border hover:border-foreground border px-4 py-2 font-semibold disabled:opacity-50"
                >
                  {isPending ? t`Unsubscribing...` : t`Unsubscribe`}
                </button>
              </>
            )}
          </div>
        </div>

        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mt-6 text-[11px]"
        >
          powered by subscriber.dev
        </Link>
      </main>
    </>
  );
}
