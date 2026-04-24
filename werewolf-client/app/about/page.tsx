import Link from "next/link";
import CampfireSprite from "@/components/sprites/CampfireSprite";

export default function AboutPage() {
  return (
    <div className="page-section narrow" style={{ color: 'var(--ember-ink-0)' }}>
      <div className="flex flex-col items-center mb-12">
        <div style={{ marginBottom: 16 }}>
          <CampfireSprite scale={4} />
        </div>
        <h1 className="h-title" style={{ textAlign: 'center' }}>About Werewolf AI</h1>
        <p className="h-sub" style={{ textAlign: 'center', maxWidth: 500 }}>
          Can LLMs truly play Werewolf at a human level?
        </p>
      </div>

      <section className="mb-12">
        <div className="h-eyebrow">THE QUESTION</div>
        <div className="hr-pixel" style={{ marginTop: 4, marginBottom: 16 }} />
        <p style={{ fontSize: 15, color: 'var(--ember-ink-1)', lineHeight: 1.7, marginBottom: 12 }}>
          This project started with a simple question: can large language models actually play a social deduction game — not just
          follow the rules, but demonstrate real strategy, deception, team coordination, and logical reasoning?
        </p>
        <p style={{ fontSize: 15, color: 'var(--ember-ink-1)', lineHeight: 1.7 }}>
          Werewolf (also known as Mafia) is the perfect test. It demands everything that&apos;s hard for AI: reading between the lines,
          building trust, lying convincingly, forming alliances, and adapting to rapidly changing social dynamics.
        </p>
      </section>

      <section className="mb-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <div className="panel-sm" style={{ padding: 20 }}>
          <h3 className="pixel-text" style={{ fontSize: 10, color: 'var(--ember-fire-4)', marginBottom: 8 }}>AI AS PLAYERS</h3>
          <p style={{ fontSize: 14, color: 'var(--ember-ink-2)', lineHeight: 1.6, margin: 0 }}>
            Each bot has a secret role, unique backstory, play style, and voice. They lie, deduce, and adapt —
            they don&apos;t know who else is AI. Every game plays out differently.
          </p>
        </div>
        <div className="panel-sm" style={{ padding: 20 }}>
          <h3 className="pixel-text" style={{ fontSize: 10, color: 'var(--ember-moon-2)', marginBottom: 8 }}>AI AS BENCHMARK</h3>
          <p style={{ fontSize: 14, color: 'var(--ember-ink-2)', lineHeight: 1.6, margin: 0 }}>
            Werewolf is a practical test of social intelligence. How well can a model bluff, detect lies,
            and reason under uncertainty?
          </p>
        </div>
      </section>

      <section className="mb-12">
        <div className="h-eyebrow">THE CHALLENGE</div>
        <div className="hr-pixel" style={{ marginTop: 4, marginBottom: 16 }} />
        <p style={{ fontSize: 15, color: 'var(--ember-ink-1)', lineHeight: 1.7, marginBottom: 12 }}>
          Even getting AI to follow the basic rules of Werewolf was harder than expected. LLMs hallucinate, lose track of context
          over long games, forget their roles, and drift away from their goals.
        </p>
        <p style={{ fontSize: 15, color: 'var(--ember-ink-1)', lineHeight: 1.7 }}>
          The real challenge was making the game <em>fun</em>. We needed bots that
          could stay in thematic character, play with genuine tactics, and keep interactions entertaining
          and unpredictable — across multiple AI providers with different strengths and quirks.
        </p>
      </section>

      <section className="mb-12">
        <div className="h-eyebrow">WHAT WE FOUND</div>
        <div className="hr-pixel" style={{ marginTop: 4, marginBottom: 16 }} />
        <p style={{ fontSize: 15, color: 'var(--ember-ink-1)', lineHeight: 1.7, marginBottom: 12 }}>
          The best models from OpenAI, Anthropic, Google, DeepSeek, Mistral, xAI, and Moonshot can genuinely play Werewolf.
          They form alliances, make strategic accusations, defend themselves under pressure, and sometimes pull off surprisingly
          convincing bluffs.
        </p>
        <p style={{ fontSize: 15, color: 'var(--ember-ink-1)', lineHeight: 1.7 }}>
          Mixing different models in the same game makes it even more interesting. Watching GPT argue with
          Claude while Gemini quietly builds a case against both of them is genuinely entertaining.
        </p>
      </section>

      <div className="hr-pixel" />
      <div className="flex justify-between items-center" style={{ paddingTop: 16 }}>
        <Link href="/" className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-3)', textDecoration: 'none' }}>
          ← BACK TO HOME
        </Link>
        <span className="console-text" style={{ fontSize: 12, color: 'var(--ember-ink-3)' }}>Created by hiper2d</span>
      </div>
    </div>
  );
}
