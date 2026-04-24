import Link from 'next/link';
import { auth } from "@/auth";
import PlayNowButton from "@/app/components/PlayNowButton";
import CampfireSprite from "@/components/sprites/CampfireSprite";

export default async function Home() {
  const session = await auth();

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 8rem)',
        background: 'linear-gradient(180deg, #0a0a18 0%, var(--ember-bg-1) 40%, var(--ember-bg-0) 100%)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Hero Section */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 16px 64px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background stars */}
        <div className="stars" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />

        {/* Fire glow behind campfire */}
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -30%)',
            width: 400, height: 300,
            background: 'radial-gradient(circle, rgba(var(--ember-fire-glow), 0.2) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Campfire */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <CampfireSprite scale={6} />
        </div>

        <h1
          className="pixel-text"
          style={{
            fontSize: 'clamp(24px, 5vw, 42px)',
            color: 'var(--ember-fire-4)',
            textShadow: '0 0 20px rgba(var(--ember-fire-glow), 0.5), 4px 4px 0 rgba(0,0,0,0.7)',
            margin: '0 0 16px 0',
            lineHeight: 1.3,
          }}
        >
          WEREWOLF<span style={{ color: 'var(--ember-fire-5)' }}>.AI</span>
        </h1>

        <p
          className="console-text"
          style={{
            fontSize: 'clamp(18px, 3vw, 24px)',
            color: 'var(--ember-ink-1)',
            maxWidth: 600,
            margin: '0 0 8px 0',
            letterSpacing: 1,
          }}
        >
          The ultimate social deduction game where you play against the world&apos;s best AI models.
        </p>

        <p
          style={{
            fontSize: 15,
            color: 'var(--ember-ink-2)',
            maxWidth: 560,
            margin: '0 0 32px 0',
            lineHeight: 1.6,
          }}
        >
          Put GPT, Claude, Gemini, DeepSeek, and others at the same table.
          Each bot has its own personality, goals, and strategy.
          You&apos;re the only human — can you outsmart them all?
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {session ? (
            <Link href="/games" className="pbtn pbtn-primary" style={{ fontSize: 12, padding: '14px 28px', textDecoration: 'none' }}>
              ▸ GAME LOBBY
            </Link>
          ) : (
            <PlayNowButton />
          )}
          <Link href="/rules" className="pbtn pbtn-ghost" style={{ fontSize: 12, padding: '14px 28px', textDecoration: 'none' }}>
            HOW TO PLAY
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ padding: '48px 16px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        <div className="pixel-text" style={{
          fontSize: 8, letterSpacing: 3, color: 'var(--ember-fire-3)',
          textAlign: 'center', marginBottom: 8,
        }}>
          WHY PLAY
        </div>
        <h2
          className="pixel-text"
          style={{
            fontSize: 'clamp(14px, 2.5vw, 20px)',
            color: 'var(--ember-ink-0)',
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          WEREWOLF AI?
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <FeatureCard
            icon="🐺"
            title="IMMERSIVE EXPERIENCE"
            description="Custom themes, unique characters, voice acting, and full role-playing. Every game feels different — from Harry Potter to a submarine crew."
          />
          <FeatureCard
            icon="⚡"
            title="ALL TOP AI MODELS"
            description="Mix GPT, Claude, Gemini, DeepSeek, Grok, Mistral, and Kimi in the same game. Watch them argue, deceive, and form alliances."
          />
          <FeatureCard
            icon="🎯"
            title="AI BENCHMARK"
            description="Test how well the latest models handle deduction, bluffing, and social reasoning. See which AI is the best liar — and which one you can fool."
          />
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          marginTop: 'auto',
          padding: '32px 16px',
          borderTop: '2px solid var(--ember-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px 24px', marginBottom: 16 }}>
          <FooterLink href="/about">About</FooterLink>
          <FooterLink href="/privacy">Privacy</FooterLink>
          <FooterLink href="/terms">Terms</FooterLink>
          <FooterLink href="https://github.com/hiper2d/werewolf-ai-party-game">GitHub</FooterLink>
        </div>
        <p className="console-text" style={{ fontSize: 12, color: 'var(--ember-ink-3)' }}>
          {new Date().getFullYear()} AIWEREWOLF.NET
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div
      className="panel-sm"
      style={{ padding: 20 }}
    >
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      <h3 className="pixel-text" style={{ fontSize: 10, color: 'var(--ember-fire-4)', marginBottom: 8 }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, color: 'var(--ember-ink-2)', lineHeight: 1.6, margin: 0 }}>
        {description}
      </p>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="pixel-text"
      style={{ fontSize: 8, color: 'var(--ember-ink-3)', textDecoration: 'none', letterSpacing: 1 }}
    >
      {children}
    </Link>
  );
}
