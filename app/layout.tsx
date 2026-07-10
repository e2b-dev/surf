import "@/styles/globals.css";

import { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "../components/providers";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ChatProvider } from "@/lib/chat-context";
import { Analytics } from "@vercel/analytics/react";
import { GoogleTagManager } from "@next/third-parties/google";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "Surf - E2B Computer Use Agent",
  description:
    "AI agent that interacts with a virtual desktop environment through natural language instructions",
  keywords: [
    "AI",
    "desktop",
    "automation",
    "E2B",
    "OpenAI",
    "virtual desktop",
    "sandbox",
  ],
  authors: [{ name: "E2B", url: "https://e2b.dev" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {process.env.NEXT_PUBLIC_GTM_ID && (
        <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GTM_ID} />
      )}
      <body
        className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
        suppressHydrationWarning
      >
        <Providers>
          <ChatProvider>
            <Toaster position="top-center" richColors />
            {children}
            <Analytics />
          </ChatProvider>
        </Providers>
      </body>
    </html>
  );
}
