import Link from 'next/link';
import Image from 'next/image';
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();

  // If already logged in, show a simple landing page with a "Go to Games" button
  // instead of a hard redirect, or just let them see the landing page.
  // For now, let's keep the landing page accessible to everyone to satisfy Google.

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center py-12 px-4 text-center sm:py-20 lg:py-32">
        <div className="mb-8 relative w-32 h-32 sm:w-48 sm:h-48">
          <Image
            src="/werewolf-ai-logo-2.png"
            alt="Werewolf AI Logo"
            fill
            className="object-contain drop-shadow-2xl"
            priority
          />
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight theme-text-primary mb-6">
          Werewolf <span className="text-btn">AI</span>
        </h1>
        <p className="text-xl sm:text-2xl theme-text-secondary max-w-2xl mb-10 leading-relaxed">
          The classic social deduction game, reimagined for the age of Intelligence. 
          Challenge advanced AI agents in a battle of strategy, deception, and logic.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {session ? (
            <Link
              href="/games"
              className="px-8 py-4 bg-btn text-btn-text rounded-lg font-bold text-xl hover:bg-btn-hover transition-all transform hover:scale-105 shadow-lg"
            >
              Go to Game Lobby
            </Link>
          ) : (
            <Link
              href="/api/auth/signin"
              className="px-8 py-4 bg-btn text-btn-text rounded-lg font-bold text-xl hover:bg-btn-hover transition-all transform hover:scale-105 shadow-lg"
            >
              Play Now (Sign In)
            </Link>
          )}
          <Link
            href="/rules"
            className="px-8 py-4 bg-transparent border-2 border-btn text-btn rounded-lg font-bold text-xl hover:bg-btn/10 transition-all shadow-md"
          >
            How to Play
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-black/5 dark:bg-white/5 rounded-3xl mb-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center theme-text-primary mb-12">Powered by the World's Best Models</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6 rounded-xl theme-bg-card theme-border border shadow-sm">
              <div className="w-12 h-12 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3 className="text-xl font-bold theme-text-primary mb-2">Multimodal Agents</h3>
              <p className="theme-text-secondary">Play against Gemini, GPT-4, and Claude. Each has its own personality and strategy.</p>
            </div>
            <div className="p-6 rounded-xl theme-bg-card theme-border border shadow-sm">
              <div className="w-12 h-12 bg-purple-500/20 text-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
              </div>
              <h3 className="text-xl font-bold theme-text-primary mb-2">Smart Conversations</h3>
              <p className="theme-text-secondary">Engage in complex debates. AI players remember what you said and use it against you.</p>
            </div>
            <div className="p-6 rounded-xl theme-bg-card theme-border border shadow-sm">
              <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3 className="text-xl font-bold theme-text-primary mb-2">Real-time Logic</h3>
              <p className="theme-text-secondary">Fully automated game management with Firestore. Smooth, responsive gameplay.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Footer (to satisfy Google Scanners) */}
      <footer className="mt-auto py-12 border-t theme-border flex flex-col items-center">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-8">
          <Link href="/about" className="theme-text-secondary hover:theme-text-primary text-sm transition-colors">About the Project</Link>
          <Link href="/privacy" className="theme-text-secondary hover:theme-text-primary text-sm transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="theme-text-secondary hover:theme-text-primary text-sm transition-colors">Terms of Service</Link>
          <Link href="https://github.com/hiper2d" className="theme-text-secondary hover:theme-text-primary text-sm transition-colors">Developer</Link>
        </div>
        <p className="theme-text-secondary opacity-60 text-xs">
          © {new Date().getFullYear()} AIWerewolf.net. This is a non-profit AI research and gaming project.
        </p>
      </footer>
    </div>
  );
}
