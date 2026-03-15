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
          Can LLMs truly play Werewolf at a human level?
        </p>
      </div>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 underline decoration-btn decoration-4 underline-offset-8">The Question</h2>
        <p className="mb-4 text-lg">
          This project started with a simple question: can large language models actually play a social deduction game — not just
          follow the rules, but demonstrate real strategy, deception, team coordination, and logical reasoning?
        </p>
        <p className="mb-4 text-lg">
          Werewolf (also known as Mafia) is the perfect test. It demands everything that&apos;s hard for AI: reading between the lines,
          building trust, lying convincingly, forming alliances, and adapting to rapidly changing social dynamics. A model that just
          generates plausible text isn&apos;t enough. It has to think, plan, and react.
        </p>
      </section>

      <section className="mb-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-6 rounded-2xl theme-bg-card theme-border border shadow-sm">
          <h3 className="text-xl font-bold mb-4">AI as Players</h3>
          <p className="theme-text-secondary">
            Each bot has a secret role, unique backstory, play style, and voice. They lie, deduce, and adapt —
            they don&apos;t know who else is AI. Every game plays out differently.
          </p>
        </div>
        <div className="p-6 rounded-2xl theme-bg-card theme-border border shadow-sm">
          <h3 className="text-xl font-bold mb-4">AI as a Benchmark</h3>
          <p className="theme-text-secondary">
            Werewolf is a practical test of social intelligence. How well can a model bluff, detect lies,
            and reason under uncertainty? Play a few rounds and you&apos;ll form your own opinion.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 underline decoration-btn decoration-4 underline-offset-8">The Challenge</h2>
        <p className="mb-4 text-lg">
          Even getting AI to follow the basic rules of Werewolf was harder than expected. LLMs hallucinate, lose track of context
          over long games, forget their roles, and drift away from their goals. Reducing context rot, keeping models focused on
          their assigned behavioral patterns, and preventing them from breaking character took significant engineering effort.
        </p>
        <p className="mb-4 text-lg">
          But rule-following was just the foundation. The real challenge was making the game <em>fun</em>. We needed bots that
          could combine three things at once: staying in thematic character (a pirate captain, a Hogwarts student, a submarine
          engineer), playing the Werewolf game with genuine tactics, and keeping interactions with the human player entertaining
          and unpredictable. Getting all three to work together — across multiple AI providers with different strengths and
          quirks — was the hardest part.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 underline decoration-btn decoration-4 underline-offset-8">What We Found</h2>
        <p className="mb-4 text-lg">
          The best models from OpenAI, Anthropic, Google, DeepSeek, Mistral, xAI, and Moonshot can genuinely play Werewolf.
          They form alliances, make strategic accusations, defend themselves under pressure, and sometimes pull off surprisingly
          convincing bluffs. The game is challenging for human players — and that was the goal.
        </p>
        <p className="mb-4 text-lg">
          Mixing different models in the same game makes it even more interesting. Each provider&apos;s AI has a distinct
          personality: some are more aggressive, some more cautious, some better at deduction. Watching GPT argue with
          Claude while Gemini quietly builds a case against both of them is genuinely entertaining.
        </p>
      </section>

      <div className="pt-8 border-t theme-border flex justify-between items-center">
        <Link href="/" className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2 font-bold">&larr; Back to Home</Link>
        <p className="theme-text-secondary text-sm italic">Created by hiper2d</p>
      </div>
    </div>
  );
}
