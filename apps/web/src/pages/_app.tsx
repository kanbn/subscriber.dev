import "~/styles/globals.css";

import type { AppType } from "next/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { env } from "next-runtime-env";
import { ThemeProvider } from "next-themes";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

const MyApp: AppType = ({ Component, pageProps }) => {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    const token = env("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN");
    const host = env("NEXT_PUBLIC_POSTHOG_HOST");
    if (token && host)
      posthog.init(token, {
        api_host: host,
        cookieless_mode: "always",
        capture_pageview: "history_change",
        autocapture: false,
        disable_session_recording: true,
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <script src="/__ENV.js" />
        <main className="font-sans">
          <Component {...pageProps} />
        </main>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default MyApp;
