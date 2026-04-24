import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="page-section narrow" style={{ color: 'var(--ember-ink-0)' }}>
      <h1 className="h-title">Privacy Policy</h1>
      <p className="console-text" style={{ fontSize: 14, color: 'var(--ember-ink-3)', marginBottom: 24 }}>
        Last updated: {new Date().toLocaleDateString()}
      </p>

      <Section title="INTRODUCTION">
        <p>
          Welcome to <strong>AIWerewolf.net</strong>. This policy explains how I handle your data.
        </p>
        <p>
          The short version: I don&apos;t use your data for anything beyond making the game work.
        </p>
      </Section>

      <Section title="WHAT I COLLECT">
        <ul style={{ listStyleType: 'disc', paddingLeft: 24 }}>
          <li><strong>Authentication:</strong> Google and GitHub OAuth. I store your name, email, and profile picture.</li>
          <li><strong>Game data:</strong> Messages, actions, and usage stats in Firebase Firestore.</li>
          <li><strong>API keys (API tier):</strong> Stored in Firestore, used only for AI calls during gameplay.</li>
          <li><strong>Payments (Paid tier):</strong> Processed by Stripe. I never see your card details.</li>
        </ul>
      </Section>

      <Section title="THIRD-PARTY SERVICES">
        <ul style={{ listStyleType: 'disc', paddingLeft: 24 }}>
          <li><strong>Firebase (Google Cloud):</strong> Stores all application data.</li>
          <li><strong>Stripe:</strong> Payment processing for the Paid tier.</li>
          <li><strong>AI providers:</strong> Game messages sent to generate bot responses.</li>
          <li><strong>BetterStack:</strong> Application logging with 3-day retention.</li>
        </ul>
      </Section>

      <Section title="WHAT I DON'T DO">
        <ul style={{ listStyleType: 'disc', paddingLeft: 24 }}>
          <li>I don&apos;t sell or share your data for marketing.</li>
          <li>I don&apos;t use analytics or tracking tools beyond basic logging.</li>
          <li>I don&apos;t use your data to train AI models.</li>
        </ul>
      </Section>

      <Section title="COOKIES">
        <p>Session cookie from NextAuth for authentication. No third-party tracking cookies.</p>
      </Section>

      <Section title="CONTACT">
        <p>
          Questions? Reach out via{' '}
          <a href="https://github.com/hiper2d" style={{ color: 'var(--ember-fire-4)' }} target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
      </Section>

      <div className="hr-pixel" />
      <Link href="/" className="pixel-text" style={{ fontSize: 9, color: 'var(--ember-ink-3)', textDecoration: 'none' }}>
        ← BACK TO HOME
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div className="h-eyebrow">{title}</div>
      <div className="hr-pixel" style={{ marginTop: 4, marginBottom: 12 }} />
      <div style={{ fontSize: 15, color: 'var(--ember-ink-1)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}
