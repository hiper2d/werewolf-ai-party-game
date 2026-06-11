import Image from "next/image";
import DocFooter from "@/app/components/DocFooter";

const PROVIDERS = ["OpenAI", "Anthropic", "Google", "DeepSeek", "Mistral", "xAI", "Moonshot", "Z.AI"];

function PlayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3.2-5" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" opacity="0.7" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <article className="content-doc">
      <header className="about-hero">
        <div className="logo-backdrop relative w-[132px] h-[132px] rounded-full mx-auto mb-[30px]">
          <Image
            src="/werewolf-ai-logo-2.png"
            alt="Werewolf AI"
            fill
            priority
            className="object-contain drop-shadow-2xl"
          />
        </div>
        <span className="doc-kicker"><span className="pip" />About the project</span>
        <h1 className="doc-title">About Werewolf AI</h1>
        <p className="about-sub">Can LLMs truly play Werewolf at a human level?</p>
      </header>

      <h2>The Question</h2>
      <p>
        This project started with a simple question: can large language models actually play a social
        deduction game — not just follow the rules, but demonstrate real strategy, deception, team
        coordination, and logical reasoning?
      </p>
      <p>
        Werewolf (also known as Mafia) is the perfect test. It demands everything that&apos;s hard for AI:
        reading between the lines, building trust, lying convincingly, forming alliances, and adapting to
        rapidly changing social dynamics. A model that just generates plausible text isn&apos;t enough. It has
        to <strong>think, plan, and react</strong>.
      </p>

      <div className="info-grid">
        <div className="info-card">
          <div className="ico"><PlayersIcon /></div>
          <h3>AI as Players</h3>
          <p>
            Each bot has a secret role, unique backstory, play style, and voice. They lie, deduce, and
            adapt — they don&apos;t know who else is AI. Every game plays out differently.
          </p>
        </div>
        <div className="info-card">
          <div className="ico"><GaugeIcon /></div>
          <h3>AI as a Benchmark</h3>
          <p>
            Werewolf is a practical test of social intelligence. How well can a model bluff, detect lies,
            and reason under uncertainty? Play a few rounds and you&apos;ll form your own opinion.
          </p>
        </div>
      </div>

      <h2>The Challenge</h2>
      <p>
        Even getting AI to follow the basic rules of Werewolf was harder than expected. LLMs hallucinate,
        lose track of context over long games, forget their roles, and drift away from their goals.
        Reducing context rot, keeping models focused on their assigned behavioral patterns, and preventing
        them from breaking character took significant engineering effort.
      </p>
      <p>
        But rule-following was just the foundation. The real challenge was making the game <em>fun</em>. We
        needed bots that could combine three things at once: staying in thematic character (a pirate
        captain, a wandering sorcerer, a submarine engineer), playing the Werewolf game with genuine
        tactics, and keeping interactions with the human player entertaining and unpredictable. Getting all
        three to work together — across multiple AI providers with different strengths and quirks — was the
        hardest part.
      </p>

      <h2>What We Found</h2>
      <p>
        The best models from these providers can genuinely play Werewolf. They form alliances, make
        strategic accusations, defend themselves under pressure, and sometimes pull off surprisingly
        convincing bluffs. The game is challenging for human players — and that was the goal.
      </p>
      <div className="provider-chips">
        {PROVIDERS.map((p) => <span className="provider-chip" key={p}>{p}</span>)}
      </div>
      <p>
        Mixing different models in the same game makes it even more interesting. Each provider&apos;s AI has a
        distinct personality: some are more aggressive, some more cautious, some better at deduction.
        Watching GPT argue with Claude while Gemini quietly builds a case against both of them is genuinely
        entertaining.
      </p>

      <DocFooter credit />
    </article>
  );
}
