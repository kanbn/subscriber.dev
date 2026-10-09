import "~/styles/globals.css";

import type { AppType } from "next/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

const MyApp: AppType = ({ Component, pageProps }) => {
  const [queryClient] = useState(() => new QueryClient());

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
