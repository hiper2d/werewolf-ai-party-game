import type { Metadata } from "next";
import { Inter, Roboto_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/navbar";
import React from "react";
import AuthProvider from "@/components/auth-provider";
import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { LoginDialogProvider } from "@/app/providers/LoginDialogProvider";
import LoginDialog from "@/components/login-dialog";

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
  metadataBase: new URL("https://aiwerewolf.net"),
  title: "Werewolf AI",
  description: "Play the classic Werewolf party game with top AI models from OpenAI, Anthropic, Google, Mistral, and more. Each bot has its own personality, goals, and alliances.",
  openGraph: {
    title: "Werewolf AI",
    description: "Play the classic Werewolf party game with top AI models from OpenAI, Anthropic, Google, Mistral, and more.",
    siteName: "Werewolf AI",
    url: "https://aiwerewolf.net",
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
          </head>
          <body className="font-inter m-0 p-0 min-h-full">
            <ThemeProvider>
              <AuthProvider>
                <LoginDialogProvider>
                  <div className="flex flex-col h-[100dvh]">
                    <NavBar />
                    <LoginDialog />
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
