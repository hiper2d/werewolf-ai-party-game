import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import {AuthProvider} from "@/components/auth-provider";
import NavBar from "@/components/navbar";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="en" className={`${inter.variable} ${roboto_mono.variable}`}>
        <body className="font-inter">
          <AuthProvider>
            <main className="bg-gradient-to-r from-black to-gray-700">
              <NavBar></NavBar>
              {children}
            </main>
          </AuthProvider>
        </body>
      </html>
  );
}
