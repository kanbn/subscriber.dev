import type { FormEvent } from "react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { authClient } from "@subscriber.dev/auth/client";

import { Comment, MarketingLayout, Ok, Prompt } from "~/components/Marketing";

// Where the CLI (`subscriber login`, via ?user_code=) and MCP clients (via a
// signed OAuth query) send people to sign in. Signing in creates the account.

const input =
  "border-border bg-background focus:border-foreground w-full border px-3 py-2 outline-hidden";
const button =
  "border-border hover:bg-background-50 border px-3 py-2 disabled:opacity-50";

// Only same-site paths, so ?next= can't bounce people to another site.
const safeNext = (next: unknown) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : null;

export default function AuthPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const userCode =
    typeof router.query.user_code === "string"
      ? router.query.user_code.replace(/^(\w{4})(\w{4})$/, "$1-$2")
      : "";
  const next = safeNext(router.query.next);
  const oauth = typeof router.query.sig === "string";

  if (!session) {
    return (
      <Shell>
        <SignIn userCode={userCode} />
      </Shell>
    );
  }
  if (oauth) {
    return (
      <Shell>
        <ContinueOAuth />
      </Shell>
    );
  }
  if (next) {
    void router.replace(next);
    return <Shell>{null}</Shell>;
  }
  return (
    <Shell>
      <Approve email={session.user.email} initialCode={userCode} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <MarketingLayout
      title="Sign in · subscriber.dev"
      description="Sign in to subscriber.dev from your terminal or AI agent."
    >
      <section className="px-4 py-12 sm:px-8">
        <h1 className="mb-6 font-semibold">
          <Prompt />
          subscriber login
        </h1>
        <div className="max-w-[48ch]">{children}</div>
      </section>
    </MarketingLayout>
  );
}

function ContinueOAuth() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["sig", "exp", "ba_iat", "ba_pl", "ba_param"])
      params.delete(key);
    const prompt = params
      .get("prompt")
      ?.split(" ")
      .filter((value) => value !== "login")
      .join(" ");
    if (prompt) params.set("prompt", prompt);
    else params.delete("prompt");
    window.location.replace(`/api/auth/oauth2/authorize?${params}`);
  }, []);

  return <p className="text-muted-foreground">connecting…</p>;
}

function SignIn({ userCode }: { userCode: string }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Come back here, code and all, once signed in.
  const callbackURL =
    typeof window === "undefined" ? "/auth" : window.location.href;

  const sendLink = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    await authClient.signIn.magicLink(
      { email, callbackURL },
      {
        onSuccess: () => setSentTo(email),
        onError: ({ error }) => setError(error.message),
      },
    );
    setPending(false);
  };

  const withGithub = async () => {
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL,
    });
    if (error)
      setError(
        error.code === "PROVIDER_NOT_FOUND"
          ? "GitHub sign-in isn't set up on this server. Use an email link instead."
          : "Couldn't sign in with GitHub. Try again.",
      );
  };

  if (sentTo) {
    return (
      <p>
        <Ok>✓ </Ok>
        check your inbox. we sent a sign-in link to{" "}
        <span className="font-semibold">{sentTo}</span>
        {userCode && ", then you'll approve the code from your terminal"}.
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground mb-6">
        {userCode ? (
          <>
            sign in to connect your terminal. code{" "}
            <span className="text-foreground font-semibold whitespace-nowrap">
              {userCode}
            </span>
          </>
        ) : (
          "sign in or create an account. no password needed."
        )}
      </p>

      <button
        type="button"
        onClick={() => void withGithub()}
        className={`${button} mb-6 w-full`}
      >
        continue with github
      </button>

      <form onSubmit={(e) => void sendLink(e)} className="flex flex-col gap-2">
        <label htmlFor="email">
          <Comment># email</Comment>
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={input}
        />
        <button type="submit" disabled={pending} className={button}>
          {pending ? "sending…" : "email me a sign-in link"}
        </button>
      </form>
      {error && <p className="mt-3 text-red-600 dark:text-red-400">{error}</p>}
    </>
  );
}

function Approve({
  email,
  initialCode,
}: {
  email: string;
  initialCode: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<"approved" | "denied" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (approve: boolean) => {
    setPending(true);
    setError(null);
    const userCode = code.trim().toUpperCase();
    const claimed = await authClient.device({
      query: { user_code: userCode },
    });
    if (claimed.error) {
      setPending(false);
      setError(claimed.error.error_description);
      return;
    }
    const { error } = approve
      ? await authClient.device.approve({ userCode })
      : await authClient.device.deny({ userCode });
    setPending(false);
    if (error) setError(error.error_description);
    else setResult(approve ? "approved" : "denied");
  };

  if (result === "approved") {
    return (
      <p>
        <Ok>✓ </Ok>
        terminal connected. you can close this tab and go back to it.
      </p>
    );
  }
  if (result === "denied") {
    return <p>✕ request denied. nothing was connected.</p>;
  }

  return (
    <>
      <p className="text-muted-foreground mb-6">
        signed in as <span className="text-foreground">{email}</span>.{" "}
        {initialCode
          ? "check this matches the code in your terminal, then approve."
          : "enter the code shown in your terminal."}{" "}
        <button
          type="button"
          onClick={() => void authClient.signOut()}
          className="hover:text-foreground underline underline-offset-4"
        >
          not you?
        </button>
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="code">
          <Comment># code</Comment>
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          spellCheck={false}
          className={`${input} text-lg tracking-widest uppercase`}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || !code.trim()}
            onClick={() => void respond(true)}
            className={`${button} flex-1 font-semibold`}
          >
            approve
          </button>
          <button
            type="button"
            disabled={pending || !code.trim()}
            onClick={() => void respond(false)}
            className={button}
          >
            deny
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-red-600 dark:text-red-400">{error}</p>}
    </>
  );
}
