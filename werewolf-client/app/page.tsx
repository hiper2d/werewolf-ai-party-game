import Link from 'next/link';
import Image from 'next/image';
import { auth } from "@/auth";
import PlayNowButton from "@/app/components/PlayNowButton";
import LoginCta from "@/app/components/LoginCta";
import BuyMeACoffee from "@/app/components/BuyMeACoffee";
import { CheckIcon } from "@/app/components/ui-icons";

const MODELS = [
  'Claude 4.8 Opus', 'GPT-5.5', 'Gemini Flash 3.5', 'DeepSeek V4 Pro',
  'Mistral 3.5 Medium', 'GLM 5.1', 'Kimi K2.6', 'Grok 4.3',
];

// Real plans: Free (platform-paid, capped) vs Paid (pay-as-you-go, no subscription).
const TIERS = [
  {
    name: 'Free',
    amt: '$0',
    amtSmall: false,
    per: 'forever',
    billed: 'No card — the platform pays',
    blurb: 'Everything you need to start outsmarting the bots — on the house.',
    cta: 'Start playing free',
    ctaUrl: '/games',
    featured: false,
    features: [
      'Up to 5 games per day',
      'A curated, price-banded model set',
      'Per-game bot caps — unlimited, 3, or 1 by model',
      'Voice acting (TTS & STT) included',
      'Usage logged but never charged',
    ],
  },
  {
    name: 'Paid',
    amt: 'Pay as you go',
    amtSmall: true,
    per: '',
    billed: 'Prepaid balance · only pay for what you use',
    blurb: 'The whole table — every model, no per-game limits.',
    cta: 'Add a balance',
    ctaUrl: '/profile#add-balance',
    featured: true,
    badge: 'No subscription',
    features: [
      'The full model catalog — every model & Thinking variant',
      'No per-game bot caps — mix freely',
      'No daily game limit',
      'Prepaid balance — top up anytime',
      'Pay only for what you use',
    ],
  },
];

function PlayersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3.2-5" />
    </svg>
  );
}

function StackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3 21 8l-9 5-9-5 9-5Z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 18l9 5 9-5" opacity="0.55" />
    </svg>
  );
}

function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" opacity="0.7" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default async function Home() {
  const session = await auth();

  return (
    <div className="w-full max-w-[1040px] mx-auto px-4 sm:px-7 flex flex-col">
      {/* Hero */}
      <section className="pt-14 pb-16 sm:pt-[92px] sm:pb-[84px]">
        <div className="flex flex-col items-center text-center gap-[30px]">
          <div className="logo-backdrop relative w-[200px] h-[200px] rounded-full flex-shrink-0">
            <Image
              src="/werewolf-ai-logo-2.png"
              alt="Werewolf AI"
              fill
              priority
              className="object-contain drop-shadow-2xl"
            />
          </div>

          <div className="flex flex-col items-center gap-[22px]">
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--fg-2)] inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-line)]" />
              Social deduction · vs. AI
            </span>

            <h1 className="m-0 font-bold tracking-[-0.035em] leading-none text-[clamp(52px,8vw,92px)] text-[var(--fg-0)]">
              Werewolf <span className="text-[var(--fg-3)]">AI</span>
            </h1>

            <p className="m-0 text-[clamp(19px,2.4vw,24px)] font-normal text-[var(--fg-1)] leading-[1.4] tracking-[-0.01em] max-w-[30ch] [text-wrap:balance]">
              The ultimate social deduction game where you play against the world&apos;s best AI models.
            </p>

            <p className="m-0 text-[15px] text-[var(--fg-2)] leading-[1.65] max-w-[62ch] [text-wrap:pretty]">
              Put <strong className="text-[var(--fg-1)] font-medium">GPT</strong>, <strong className="text-[var(--fg-1)] font-medium">Claude</strong>, <strong className="text-[var(--fg-1)] font-medium">Gemini</strong>, <strong className="text-[var(--fg-1)] font-medium">DeepSeek</strong>, <strong className="text-[var(--fg-1)] font-medium">Grok</strong>, <strong className="text-[var(--fg-1)] font-medium">Mistral</strong>, <strong className="text-[var(--fg-1)] font-medium">Kimi</strong>, and <strong className="text-[var(--fg-1)] font-medium">GLM</strong> at the same table. Each bot has its own personality, goals, and strategy. You&apos;re the only human — can you outsmart them all?
            </p>

            <div className="flex gap-3 flex-wrap justify-center">
              {session ? (
                <Link
                  href="/games"
                  className="inline-flex items-center justify-center font-semibold text-[15px] px-6 py-[13px] rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent shadow-[var(--shadow-1)] hover:bg-[var(--accent-strong)] transition-all duration-[120ms]"
                >
                  Go to Game Lobby
                </Link>
              ) : (
                <PlayNowButton />
              )}
              <Link
                href="/rules"
                className="inline-flex items-center justify-center font-semibold text-[15px] px-6 py-[13px] rounded-[var(--radius-md)] bg-transparent text-[var(--fg-1)] border border-[var(--line-2)] hover:bg-[var(--bg-1)] hover:border-[var(--line-3)] hover:text-[var(--fg-0)] transition-all duration-[120ms]"
              >
                How to Play
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why Play */}
      <section className="bg-[var(--bg-1)] border border-[var(--line-1)] rounded-[var(--radius-2xl)] pt-10 px-5 pb-10 sm:pt-16 sm:px-12 sm:pb-14 mb-14 sm:mb-[72px]">
        <div className="text-center max-w-[56ch] mx-auto mb-8 sm:mb-11">
          <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--fg-2)] mb-3">Why play</div>
          <h2 className="m-0 text-[clamp(28px,4vw,38px)] font-bold tracking-[-0.025em] text-[var(--fg-0)]">
            Why Play Werewolf AI?
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <article className="border border-[var(--line-1)] rounded-[var(--radius-lg)] bg-[var(--bg-0)] px-[26px] pt-7 pb-[30px] flex flex-col gap-3.5 transition-[border-color,transform,box-shadow] duration-[140ms] hover:border-[var(--line-3)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]">
            <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent-text)] grid place-items-center">
              <PlayersIcon className="w-[22px] h-[22px]" />
            </div>
            <h3 className="mt-0.5 m-0 text-[17px] font-semibold tracking-[-0.01em] text-[var(--fg-0)]">Immersive Werewolf Experience</h3>
            <p className="m-0 text-[14px] text-[var(--fg-2)] leading-[1.6] [text-wrap:pretty]">
              Custom themes, unique characters, voice acting, and full role-playing. Every game feels different — from a haunted manor to a submarine crew.
            </p>
          </article>

          <article className="border border-[var(--line-1)] rounded-[var(--radius-lg)] bg-[var(--bg-0)] px-[26px] pt-7 pb-[30px] flex flex-col gap-3.5 transition-[border-color,transform,box-shadow] duration-[140ms] hover:border-[var(--line-3)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]">
            <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent-text)] grid place-items-center">
              <StackIcon className="w-[22px] h-[22px]" />
            </div>
            <h3 className="mt-0.5 m-0 text-[17px] font-semibold tracking-[-0.01em] text-[var(--fg-0)]">All Top AI Models Together</h3>
            <p className="m-0 text-[14px] text-[var(--fg-2)] leading-[1.6] [text-wrap:pretty]">
              Mix models from 8 providers in the same game. Watch them argue, deceive, and form alliances against each other — and you.
            </p>
            <div className="flex flex-wrap gap-[7px] mt-1">
              {MODELS.map((m) => (
                <span
                  key={m}
                  className="font-mono text-[11.5px] tracking-[0.01em] px-2.5 py-1 rounded-full bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent-text)] whitespace-nowrap"
                >
                  {m}
                </span>
              ))}
            </div>
          </article>

          <article className="border border-[var(--line-1)] rounded-[var(--radius-lg)] bg-[var(--bg-0)] px-[26px] pt-7 pb-[30px] flex flex-col gap-3.5 transition-[border-color,transform,box-shadow] duration-[140ms] hover:border-[var(--line-3)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]">
            <div className="w-11 h-11 rounded-[var(--radius-lg)] bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent-text)] grid place-items-center">
              <GaugeIcon className="w-[22px] h-[22px]" />
            </div>
            <h3 className="mt-0.5 m-0 text-[17px] font-semibold tracking-[-0.01em] text-[var(--fg-0)]">AI Intelligence Benchmark</h3>
            <p className="m-0 text-[14px] text-[var(--fg-2)] leading-[1.6] [text-wrap:pretty]">
              Test how well the latest models handle deduction, bluffing, and social reasoning. See which AI is the best liar — and which one you can fool.
            </p>
          </article>
        </div>
      </section>

      {/* Pricing */}
      <section className="mb-14 sm:mb-[72px]">
        <div className="text-center max-w-[54ch] mx-auto mb-[34px]">
          <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--fg-2)] mb-3">Pricing</div>
          <h2 className="m-0 mb-3 text-[clamp(28px,4vw,38px)] font-bold tracking-[-0.025em] text-[var(--fg-0)]">
            Play free. Go Paid for the whole table.
          </h2>
          <p className="m-0 text-[15px] text-[var(--fg-2)] leading-[1.6] [text-wrap:pretty]">
            Start with five games a day on a curated set of models — no card, never charged. Switch to pay-as-you-go for the
            full catalog with no per-game limits. No subscription: pre-load a balance and pay only for what you use.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] max-w-[760px] mx-auto items-start">
          {TIERS.map((tier) => {
            const btnClass = `inline-flex items-center justify-center gap-2 w-full font-semibold text-[15px] px-6 py-[13px] rounded-[var(--radius-md)] transition-all duration-[120ms] ${
              tier.featured
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent shadow-[var(--shadow-1)] hover:bg-[var(--accent-strong)]'
                : 'bg-transparent text-[var(--fg-1)] border border-[var(--line-2)] hover:bg-[var(--bg-1)] hover:border-[var(--line-3)] hover:text-[var(--fg-0)]'
            }`;
            return (
              <article
                key={tier.name}
                className={`relative flex flex-col gap-[18px] border rounded-[var(--radius-xl)] pt-[30px] px-7 pb-8 ${
                  tier.featured
                    ? 'border-[var(--accent-line)] shadow-[var(--shadow-2)] bg-[linear-gradient(168deg,color-mix(in_oklch,var(--accent-soft)_60%,var(--bg-1))_0%,var(--bg-1)_46%)]'
                    : 'border-[var(--line-1)] bg-[var(--bg-1)]'
                }`}
              >
                {tier.badge && (
                  <span className="absolute -top-[11px] left-7 font-mono text-[10px] tracking-[0.08em] uppercase px-[11px] py-1 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] shadow-[var(--shadow-1)] whitespace-nowrap">
                    {tier.badge}
                  </span>
                )}
                <div className="font-mono text-[13px] font-semibold tracking-[0.02em] uppercase text-[var(--fg-1)]">{tier.name}</div>
                <div>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className={`${tier.amtSmall ? 'text-[30px]' : 'text-[48px]'} font-bold tracking-[-0.03em] leading-none text-[var(--fg-0)]`}>{tier.amt}</span>
                    {tier.per && <span className="text-[14px] text-[var(--fg-2)]">{tier.per}</span>}
                  </div>
                  <div className="text-[12px] text-[var(--fg-3)] mt-1.5">{tier.billed}</div>
                </div>
                <p className="m-0 text-[13.5px] text-[var(--fg-2)] leading-[1.55] [text-wrap:pretty]">{tier.blurb}</p>
                {session ? (
                  <Link href={tier.ctaUrl} className={btnClass}>{tier.cta}</Link>
                ) : (
                  <LoginCta label={tier.cta} callbackUrl={tier.ctaUrl} className={btnClass} />
                )}
                <div className="h-px bg-[var(--line-1)] my-0.5" />
                <ul className="list-none m-0 p-0 flex flex-col gap-[11px]">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-[var(--fg-1)] leading-[1.45]">
                      <span className="flex-shrink-0 w-[18px] h-[18px] mt-px rounded-full grid place-items-center bg-[var(--accent-soft)] border border-[var(--accent-line)] text-[var(--accent-text)]">
                        <CheckIcon className="w-[11px] h-[11px]" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--line-1)] pt-9 pb-12 flex flex-col items-center gap-[18px]">
        <BuyMeACoffee />
        <div className="flex flex-wrap justify-center gap-7">
          <Link href="/about" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] transition-colors duration-[120ms]">About the Project</Link>
          <Link href="/privacy" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] transition-colors duration-[120ms]">Privacy Policy</Link>
          <Link href="/terms" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] transition-colors duration-[120ms]">Terms of Service</Link>
          <Link href="https://github.com/hiper2d/werewolf-ai-party-game" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] transition-colors duration-[120ms]">GitHub</Link>
        </div>
        <p className="m-0 font-mono text-[11px] text-[var(--fg-3)] tracking-[0.04em]">
          © {new Date().getFullYear()} AIWerewolf.net
        </p>
      </footer>
    </div>
  );
}
