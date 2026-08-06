import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { env } from "next-runtime-env";
import { useState } from "react";

import { authClient } from "@subscriber.dev/auth/client";

import { Auth } from "~/components/AuthForm";
import { PageHead } from "~/components/PageHead";

export default function LoginPage() {
  const router = useRouter();
  const isSignUpDisabled = env("NEXT_PUBLIC_DISABLE_SIGN_UP") === "true";
  const [isMagicLinkSent, setIsMagicLinkSent] = useState<boolean>(false);
  const [magicLinkRecipient, setMagicLinkRecipient] = useState<string>("");

  const redirect = useSearchParams().get("next");

  const handleMagicLinkSent = (value: boolean, recipient: string) => {
    setIsMagicLinkSent(value);
    setMagicLinkRecipient(recipient);
  };

  const { data } = authClient.useSession();

  if (data?.user.id) router.push("/");

  return (
    <>
      <PageHead title={t`Login | kan.bn`} />
      <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
        <div className="flex w-full flex-col items-center">
          <Link href="/">
            <h1 className="text-foreground mb-6 text-lg font-bold tracking-tight">
              subscriber.dev
            </h1>
          </Link>
          {isMagicLinkSent ? (
            <div className="w-full max-w-md text-center">
              <p className="text-foreground mb-4 text-3xl font-bold tracking-tight">
                {t`Check your inbox`}
              </p>
              <p className="text-muted-foreground">
                <Trans>
                  Click on the link we've sent to {magicLinkRecipient} to sign
                  in.
                </Trans>
              </p>
            </div>
          ) : (
            <Auth setIsMagicLinkSent={handleMagicLinkSent} />
          )}
          {!isSignUpDisabled && !isMagicLinkSent && (
            <p className="text-muted-foreground mt-6 text-sm">
              <Trans>
                Don't have an account?{" "}
                <Link
                  href={redirect ? `/signup?next=${redirect}` : "/signup"}
                  className="text-foreground hover:text-primary underline underline-offset-4"
                >
                  Sign up
                </Link>
              </Trans>
            </p>
          )}
        </div>
      </main>
    </>
  );
}
