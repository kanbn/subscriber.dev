import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { env } from "next-runtime-env";
import { useState } from "react";

import { authClient } from "@subscriber.dev/auth/client";

import { Auth } from "~/components/AuthForm";
import { PageHead } from "~/components/PageHead";

export default function SignUpPage() {
  const router = useRouter();
  const isSignUpDisabled = env("NEXT_PUBLIC_DISABLE_SIGN_UP") === "true";
  const [isMagicLinkSent, setIsMagicLinkSent] = useState<boolean>(false);
  const [magicLinkRecipient, setMagicLinkRecipient] = useState<string>("");

  const redirect = useSearchParams().get("next");

  const { data } = authClient.useSession();

  if (data?.user.id) router.push("/");

  const handleMagicLinkSent = (value: boolean, recipient: string) => {
    setIsMagicLinkSent(value);
    setMagicLinkRecipient(recipient);
  };

  if (isSignUpDisabled) {
    return (
      <>
        <PageHead title={t`Sign up | kan.bn`} />
        <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
          <div className="flex w-full flex-col items-center">
            <Link href="/">
              <h1 className="text-foreground mb-6 text-lg font-bold tracking-tight">
                subscriber.dev
              </h1>
            </Link>
            <p className="text-foreground mb-4 text-3xl font-bold tracking-tight">
              {t`Sign up disabled`}
            </p>
            <p className="text-muted-foreground text-center">
              {t`Sign up is currently disabled. Please try again later.`}
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHead title={t`Sign up | kan.bn`} />
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
            <Auth setIsMagicLinkSent={handleMagicLinkSent} isSignUp />
          )}
          {!isMagicLinkSent && (
            <p className="text-muted-foreground mt-6 text-sm">
              <Trans>
                Already have an account?{" "}
                <Link
                  href={redirect ? `/login?next=${redirect}` : "/login"}
                  className="text-foreground hover:text-primary underline underline-offset-4"
                >
                  Sign in
                </Link>
              </Trans>
            </p>
          )}
        </div>
      </main>
    </>
  );
}
