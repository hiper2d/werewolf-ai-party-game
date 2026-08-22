import type { Metadata } from "next";
import { Inter, Roboto_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/navbar";
import React from "react";
import AuthProvider from "@/components/auth-provider";
import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { LoginDialogProvider } from "@/app/providers/LoginDialogProvider";
import LoginDialog from "@/components/login-dialog";
import WhatsNewPopup from "@/app/news/WhatsNewPopup";
import { DISCORD_URL, SITE_URL } from "@/app/config/external-links";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const roboto_mono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto-mono',
})

const jetbrains_mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Werewolf AI",
  description: "Play the classic Werewolf party game with top AI models from OpenAI, Anthropic, Google, Mistral, and more. Each bot has its own personality, goals, and alliances.",
  openGraph: {
    title: "Werewolf AI",
    description: "Play the classic Werewolf party game with top AI models from OpenAI, Anthropic, Google, Mistral, and more.",
    siteName: "Werewolf AI",
    url: SITE_URL,
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "AI models sitting around a Werewolf game table",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Werewolf AI",
    description: "Play the classic Werewolf party game with top AI models from OpenAI, Anthropic, Google, Mistral, and more.",
    images: ["/og-image.jpg"],
  },
};

// Search engines composite result thumbnails onto a white card, where the
// transparent hero logo washes out. logo-512.png is the same artwork baked onto
// the brand background so it reads on any surface.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Werewolf AI",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo-512.png`,
        width: 512,
        height: 512,
      },
      image: `${SITE_URL}/logo-512.png`,
      sameAs: [DISCORD_URL],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Werewolf AI",
      url: SITE_URL,
      description:
        "Play the classic Werewolf party game with top AI models from OpenAI, Anthropic, Google, Mistral, and more.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

// Inline script to prevent flash of wrong theme
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('theme');
      if (!theme) {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
  })();
`;

export default function RootLayout(
    { children }: Readonly<{ children: React.ReactNode; }>
) {
  return (
      <html suppressHydrationWarning lang="en" className={`${inter.variable} ${roboto_mono.variable} ${jetbrains_mono.variable} min-h-full`}>
          <head>
            <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
          </head>
          {/* suppressHydrationWarning: browser extensions (Grammarly et al.)
              inject attributes into <body> before React hydrates; this only
              silences attribute mismatches on this one element. */}
          <body suppressHydrationWarning className="font-inter m-0 p-0 min-h-full">
            <ThemeProvider>
              <AuthProvider>
                <LoginDialogProvider>
                  <div className="flex flex-col h-[100dvh]">
                    <NavBar />
                    <LoginDialog />
                    <WhatsNewPopup />
                    <main className="flex-1 flex app-shell min-h-0 overflow-auto">
                      <div className="w-full max-w-7xl mx-auto p-2 sm:p-4 lg:p-6">
                        {children}
                      </div>
                    </main>
                  </div>
                </LoginDialogProvider>
              </AuthProvider>
            </ThemeProvider>
          </body>
      </html>
  );
}
