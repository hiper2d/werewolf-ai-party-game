import DocFooter from "@/app/components/DocFooter";

export default function PrivacyPolicy() {
  return (
    <article className="content-doc">
      <span className="doc-kicker"><span className="pip" />Legal · Privacy</span>
      <h1 className="doc-title">Privacy Policy</h1>
      <p className="doc-meta">Last updated: {new Date().toLocaleDateString()}</p>

      <h2>Introduction</h2>
      <p>
        Welcome to <strong>AIWerewolf.net</strong>. This policy explains how I handle your data.
      </p>
      <p>
        The short version: I don&apos;t use your data for anything beyond making the game work. I have no
        interest in your personal information.
      </p>

      <h2>What I Collect</h2>
      <ul className="doc-list">
        <li><b>Authentication:</b> I use Google and GitHub OAuth for sign-in. I store your public name,
          email address, and profile picture to identify your account and manage game progress.</li>
        <li><b>Game data:</b> Your game messages, actions, and usage statistics are stored in Firebase
          Firestore to run the game and track spending.</li>
        <li><b>API keys (API tier only):</b> If you choose the API tier, your AI provider API keys are
          stored in Firebase Firestore, protected by Google Cloud&apos;s security infrastructure. The keys are
          used only to make AI calls on your behalf during gameplay.</li>
        <li><b>Payments (Paid tier only):</b> Payments are processed entirely by Stripe. I never see,
          store, or have access to your card numbers or payment details. I only receive confirmation that
          a payment was made and the amount.</li>
      </ul>

      <h2>Third-Party Services</h2>
      <ul className="doc-list">
        <li><b>Firebase (Google Cloud):</b> Stores all application data — user accounts, games, API keys.
          Protected by Google&apos;s security protocols.</li>
        <li><b>Stripe:</b> Handles payment processing for the Paid tier. Stripe has its own{" "}
          <a className="link" href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.</li>
        <li><b>AI providers (OpenAI, Anthropic, Google, etc.):</b> Game messages are sent to AI providers
          to generate bot responses. On the API tier, your own keys are used; on Free and Paid tiers,
          platform keys are used.</li>
        <li><b>BetterStack:</b> I use BetterStack for application logging with a 3-day log retention
          period. Logs may contain game activity data but are automatically deleted after 3 days.</li>
      </ul>

      <h2>What I Don&apos;t Do</h2>
      <ul className="doc-list">
        <li>I don&apos;t sell or share your data with anyone for marketing or commercial purposes.</li>
        <li>I don&apos;t use analytics or tracking tools beyond basic application logging.</li>
        <li>I don&apos;t use your data to train AI models or for any research outside of this project.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        The site uses a session cookie from NextAuth for authentication. No third-party tracking cookies
        are used.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this policy or want your data removed, reach out via{" "}
        <a className="link" href="https://github.com/hiper2d" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>

      <DocFooter />
    </article>
  );
}
