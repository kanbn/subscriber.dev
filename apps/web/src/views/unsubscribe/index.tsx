import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";

import { useUnsubscribe } from "@subscriber.dev/api-client/hooks";

import { PageHead } from "~/components/PageHead";
import { Button } from "~/components/ui/button";

export default function UnsubscribeView() {
  const token = useSearchParams().get("token");
  const { mutate, isPending, isSuccess, isError } = useUnsubscribe();

  const handleUnsubscribe = () => {
    if (!token) return;
    mutate({ data: { token } });
  };

  return (
    <>
      <PageHead title={t`Unsubscribe | subscriber.dev`} />
      <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <Link href="/">
            <h1 className="text-foreground mb-6 text-lg font-bold tracking-tight">
              ///// subscriber.dev /////
            </h1>
          </Link>

          {!token ? (
            <p className="text-muted-foreground">
              <Trans>This unsubscribe link is invalid.</Trans>
            </p>
          ) : isSuccess ? (
            <p className="text-muted-foreground">
              <Trans>
                You've been unsubscribed. You won't receive any more emails from
                us.
              </Trans>
            </p>
          ) : isError ? (
            <p className="text-muted-foreground">
              <Trans>This unsubscribe link is invalid or has expired.</Trans>
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mb-6 max-w-[300px]">
                <Trans>
                  Click the button below to stop receiving emails from us.
                </Trans>
              </p>
              <Button onClick={handleUnsubscribe} disabled={isPending}>
                {isPending ? t`Unsubscribing...` : t`Unsubscribe`}
              </Button>
            </>
          )}
        </div>
      </main>
    </>
  );
}
