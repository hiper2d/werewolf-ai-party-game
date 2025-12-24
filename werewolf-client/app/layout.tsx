import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/navbar";
import React from "react";
import AuthProvider from "@/components/auth-provider";
import { ThemeProvider } from "@/app/providers/ThemeProvider";

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

export const metadata: Metadata = {
  title: "Werewolf AI",
  description: "Werewolf AI Game Client",
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
      <html suppressHydrationWarning lang="en" className={`${inter.variable} ${roboto_mono.variable} h-full`}>
          <head>
            <script dangerouslySetInnerHTML={{ __html: themeScript }} />
          </head>
          <body className="font-inter m-0 p-0 h-full">
            <ThemeProvider>
              <AuthProvider>
                <div className="flex flex-col h-screen">
                  <NavBar />
                  <main className="flex-1 min-h-0 flex app-shell">
                    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 flex flex-col">
                      {children}
                    </div>
                  </main>
                </div>
              </AuthProvider>
            </ThemeProvider>
          </body>
      </html>
  );
}
