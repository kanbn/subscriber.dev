import "~/styles/globals.css";

import type { NextPage, Viewport } from "next";
import type { AppProps, AppType } from "next/app";
import type { ReactElement, ReactNode } from "react";
import { Figtree } from "next/font/google";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const MyApp: AppType = ({ Component, pageProps }: AppPropsWithLayout) => {
  const [queryClient] = useState(() => new QueryClient());
  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <QueryClientProvider client={queryClient}>
      <style jsx global>{`
        html {
          font-family: ${figtree.style.fontFamily};
        }
      `}</style>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <script src="/__ENV.js" />
        <main className="font-sans">
          {getLayout(<Component {...pageProps} />)}
        </main>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default MyApp;
