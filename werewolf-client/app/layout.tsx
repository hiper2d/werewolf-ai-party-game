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
      <html lang="en" className={`${inter.variable} ${roboto_mono.variable} h-full`}>
        <body className="font-inter m-0 p-0 h-screen">
          <AuthProvider>
            <div className="flex flex-col m-0 p-0 h-full">
              <NavBar></NavBar>
              <main className="flex-1 min-h-0 flex items-start justify-center overflow-auto bg-gradient-to-t from-black to-gray-800">
                <div className="w-full max-w-4xl p-4 sm:p-6">
                  {children}
                </div>
              </main>
            </div>
          </AuthProvider>
        </body>
      </html>
  );
}
