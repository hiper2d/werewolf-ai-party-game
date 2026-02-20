import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6 theme-text-primary leading-relaxed">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      
      <p className="mb-4 font-medium opacity-70 italic">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">Introduction</h2>
        <p className="mb-4">
          Welcome to <span className="font-bold">AIWerewolf.net</span>. This project is a non-profit gaming experience designed for 
          AI research and social gaming. This policy explains how we handle your data.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">Data Collection</h2>
        <p className="mb-2">We only collect the minimum amount of data required for the game to function:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><span className="font-bold">Authentication:</span> We use Google/GitHub OAuth. We only store your public name and email address to manage your game progress.</li>
          <li><span className="font-bold">Game Data:</span> Your game messages and actions are stored in our Firestore database to synchronize the game for all players.</li>
          <li><span className="font-bold">No Commercial Use:</span> We do not sell or share your data with third parties for marketing purposes.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">Security</h2>
        <p>
          Your data is protected by Google Firebase's industry-standard security protocols. We take the protection of 
          your personal information seriously and implement security measures to prevent unauthorized access.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 underline decoration-btn/40 underline-offset-4">Contact</h2>
        <p>
          If you have questions about this policy or your data, please contact the developer via GitHub.
        </p>
      </section>

      <div className="pt-8 border-t theme-border">
        <Link href="/" className="text-btn hover:underline">← Back to Home</Link>
      </div>
    </div>
  );
}
