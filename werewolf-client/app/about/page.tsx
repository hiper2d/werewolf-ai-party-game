import Link from "next/link";
import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6 theme-text-primary leading-relaxed">
      <div className="flex flex-col items-center mb-12">
        <div className="relative w-32 h-32 mb-6">
          <Image
            src="/werewolf-ai-logo-2.png"
            alt="Werewolf AI Logo"
            fill
            className="object-contain"
          />
        </div>
        <h1 className="text-4xl font-extrabold mb-4">About Werewolf AI</h1>
        <p className="text-xl theme-text-secondary text-center max-w-2xl">
          An AI-native social deduction experience.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 underline decoration-btn decoration-4 underline-offset-8">What is this project?</h2>
        <p className="mb-4 text-lg">
          <span className="font-bold">Werewolf AI</span> is a modern web application that brings the classic social deduction game 
          "Werewolf" (also known as Mafia) to the era of Generative AI. 
        </p>
        <p className="mb-4 text-lg">
          While traditional Werewolf requires a group of human players, our version allows you to play with or against 
          highly sophisticated AI agents powered by the latest Large Language Models (LLMs) including GPT-4, Claude 3.5 Sonnet, 
          Gemini 1.5 Pro, and more.
        </p>
      </section>

      <section className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-6 rounded-2xl theme-bg-card theme-border border shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-blue-500 text-2xl">🤖</span> The AI Players
          </h3>
          <p className="theme-text-secondary">
            Each AI bot has its own secret role, personal history, and evolving strategy. They can lie, deduce, and form 
            alliances just like human players.
          </p>
        </div>
        <div className="p-6 rounded-2xl theme-bg-card theme-border border shadow-sm">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="text-purple-500 text-2xl">🛠️</span> Built with Modern Tech
          </h3>
          <p className="theme-text-secondary">
            Developed using Next.js 15, React 19, and Firebase. This ensures real-time updates across all players 
            without needing to refresh the page.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 underline decoration-btn decoration-4 underline-offset-8">Our Mission</h2>
        <p className="text-lg mb-4">
          The goal of this project is to explore how AI agents can interact in complex social environments that require 
          trust, deception, and logical reasoning. We believe that games provide a unique sandbox for testing the 
          capabilities of next-generation AI.
        </p>
      </section>

      <div className="pt-8 border-t theme-border flex justify-between items-center">
        <Link href="/" className="text-btn hover:underline font-bold">← Back to Home</Link>
        <p className="theme-text-secondary text-sm italic">Created by hiper2d</p>
      </div>
    </div>
  );
}
