import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6 theme-text-primary leading-relaxed">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>

      <p className="mb-4 font-medium opacity-70 italic">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">Introduction</h2>
        <p className="mb-4">
          Welcome to <span className="font-bold">AIWerewolf.net</span>. This policy explains how I handle
          your data.
        </p>
        <p>
          The short version: I don&apos;t use your data for anything beyond making the game work. I have no interest in
          your personal information.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">What I Collect</h2>
        <ul className="list-disc pl-6 space-y-3">
          <li>
            <span className="font-bold">Authentication:</span> I use Google and GitHub OAuth for sign-in. I store your
            public name, email address, and profile picture to identify your account and manage game progress.
          </li>
          <li>
            <span className="font-bold">Game data:</span> Your game messages, actions, and usage statistics are stored
            in Firebase Firestore to run the game and track spending.
          </li>
          <li>
            <span className="font-bold">API keys (API tier only):</span> If you choose the API tier, your AI provider
            API keys are stored in Firebase Firestore, protected by Google Cloud&apos;s security infrastructure. The keys
            are used only to make AI calls on your behalf during gameplay.
          </li>
          <li>
            <span className="font-bold">Payments (Paid tier only):</span> Payments are processed entirely by Stripe.
            I never see, store, or have access to your card numbers or payment details. I only receive confirmation
            that a payment was made and the amount.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">Third-Party Services</h2>
        <ul className="list-disc pl-6 space-y-3">
          <li>
            <span className="font-bold">Firebase (Google Cloud):</span> Stores all application data — user accounts,
            games, API keys. Protected by Google&apos;s security protocols.
          </li>
          <li>
            <span className="font-bold">Stripe:</span> Handles payment processing for the Paid tier. Stripe has its
            own <a href="https://stripe.com/privacy" className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">privacy policy</a>.
          </li>
          <li>
            <span className="font-bold">AI providers (OpenAI, Anthropic, Google, etc.):</span> Game messages are sent
            to AI providers to generate bot responses. On the API tier, your own keys are used; on Free and Paid tiers,
            platform keys are used.
          </li>
          <li>
            <span className="font-bold">BetterStack:</span> I use BetterStack for application logging with a 3-day
            log retention period. Logs may contain game activity data but are automatically deleted after 3 days.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">What I Don&apos;t Do</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>I don&apos;t sell or share your data with anyone for marketing or commercial purposes.</li>
          <li>I don&apos;t use analytics or tracking tools beyond basic application logging.</li>
          <li>I don&apos;t use your data to train AI models or for any research outside of this project.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">Cookies</h2>
        <p>
          The site uses a session cookie from NextAuth for authentication. No third-party tracking cookies are used.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">Contact</h2>
        <p>
          If you have questions about this policy or want your data removed, reach out via{' '}
          <a href="https://github.com/hiper2d" className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">GitHub</a>.
        </p>
      </section>

      <div className="pt-8 border-t theme-border">
        <Link href="/" className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2">&larr; Back to Home</Link>
      </div>
    </div>
  );
}
