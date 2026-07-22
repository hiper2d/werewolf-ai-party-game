import {type ReactNode} from "react";
import {DISCORD_URL} from "@/app/config/external-links";

export interface ChangelogEntry {
    id: string;
    date: string;
    tags: string[];
    title: string;
    body: ReactNode;
    media: { label: string; youtubeId?: string } | null;
    links: { label: string; href: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
    {
        id: "gemini-3-6-flash", date: "Jul 2026", tags: ["Models"],
        title: "Gemini Flash 3.6 and Flash Lite 3.5",
        body: (<>Google&apos;s Gemini models got a refresh: <strong>Gemini 3.6 Flash</strong> takes over the Flash
            slot, and <strong>Gemini 3.5 Flash Lite</strong> replaces 3.1 in the Lite slot. Both got
            <strong> cheaper on output</strong> — Flash drops from $9 to $7.50 per 1M tokens, and Flash Lite from
            $2.50 to $1.50 (with input up a touch, from $0.25 to $0.30). Same slots, same tiers — your existing
            games pick up the new versions automatically. Pick them for any bot or the Game Master when you set up
            a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "kimi-k3", date: "Jul 2026", tags: ["Models"],
        title: "Kimi K3 replaces Kimi K2.6",
        body: (<>Moonshot&apos;s <strong>Kimi K3</strong> takes over the Kimi slot in the model picker. The separate
            &ldquo;Thinking&rdquo; variant is gone — K3 <strong>always reasons</strong> before it answers, at full
            effort — and it brings a <strong>1M-token context window</strong>, so a Kimi bot can hold the whole
            night-by-night history of a long game. It&apos;s a much pricier model than the K2.6 it replaces, so Kimi
            is now on the <strong>paid tier only</strong> — no longer available on the free tier. Games already
            running a Kimi bot have been switched over automatically. Pick it for any bot or the Game Master when
            you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "gpt-5-6", date: "Jul 2026", tags: ["Models"],
        title: "The GPT-5.6 family arrives: Sol, Terra, and Luna",
        body: (<>OpenAI&apos;s <strong>GPT-5.6</strong> family replaces GPT-5.5 and GPT-5.4-mini.
            <strong> Terra</strong> takes over the main GPT slot — and unlike GPT-5.5, it&apos;s no longer
            paid-only: free-tier players can now run one Terra bot per game. <strong>Luna</strong> replaces
            the mini slot at up to three bots per game, and <strong>Sol</strong> joins as OpenAI&apos;s new
            flagship on the <strong>paid tier</strong>. All three always reason before they answer. As a
            bonus, the free-tier rebalance also bumps <strong>Grok 4.5</strong> from one to
            <strong> three bots per game</strong>. Pick them for any bot or the Game Master when you set
            up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "grok-4-5", date: "Jul 2026", tags: ["Models"],
        title: "Grok 4.5 replaces Grok 4.3",
        body: (<>xAI&apos;s <strong>Grok 4.5</strong> takes over the Grok slot in the model picker. The separate
            &ldquo;Thinking&rdquo; variant is gone — Grok now <strong>always reasons</strong> before it answers.
            Even better, it keeps its <strong>private train of thought between turns</strong>: a Grok bot remembers
            not just what it said, but why — its suspicions, its cover story — across the whole game. Still on the
            free tier at one Grok bot per game. Pick it for any bot or the Game Master when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "fable-5-back", date: "Jul 2026", tags: ["Models"],
        title: "Claude Fable 5 is back",
        body: (<>Anthropic has brought <strong>Claude Fable 5</strong> back, and it&apos;s returned to the model
            picker for bots and the Game Master. It&apos;s Anthropic&apos;s most capable model — it always reasons
            before it answers, which really shows when a bot has to hold a story and a bluff across a long game.
            Fable is <strong>expensive</strong>, so it&apos;s available on the <strong>paid tier only</strong> — not
            on the free tier. Pick it for any bot or the Game Master when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "sonnet-5", date: "Jun 2026", tags: ["Models"],
        title: "Claude Sonnet 5 replaces Claude 4.6 Sonnet",
        body: (<>Anthropic&apos;s <strong>Claude Sonnet 5</strong> takes over the Sonnet slot in the model picker,
            with or without Thinking. It&apos;s a clear step up for staying in character and reading the table over
            a long game — and it&apos;s the <strong>same price</strong> as the 4.6 Sonnet it replaces. Pick it for
            any bot or the Game Master when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "discord-server", date: "Jun 2026", tags: ["Community"],
        title: "We're on Discord",
        body: (<>Werewolf AI now has a <strong>Discord server</strong> — a place to share stories from your best
            games, swap strategies, send feedback and bug reports, and follow the news as the project grows.
            You&apos;ll find a <strong>Join the Discord</strong> link on the home page and pinned in the sidebar of
            every game. Come meet the other humans at the table.</>),
        media: null,
        links: [{label: "Join the Discord", href: DISCORD_URL}],
    },
    {
        id: "sakana-fugu", date: "Jun 2026", tags: ["Models"],
        title: "Sakana Fugu — a new model family",
        body: (<><strong>Sakana AI</strong> joins the table with two new models. <strong>Fugu</strong> is the
            lighter, everyday option — light enough to play on the free tier — and <strong>Fugu Ultra</strong> is
            the heavyweight. Both reason before they answer, which helps when a bot has to hold a story and a
            bluff at the same time. Pick either for any bot or the Game Master when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "glm-5-2", date: "Jun 2026", tags: ["Models"],
        title: "GLM-5.2 replaces GLM-5.1",
        body: (<>Z.AI&apos;s <strong>GLM-5.2</strong> takes over the GLM slot in the model picker, with or
            without Thinking. Same price as before — just a newer, sharper model behind the same option. Pick it
            for any bot or the Game Master when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "fable-5-shutdown", date: "Jun 2026", tags: ["Models"],
        title: "Claude Fable 5 has been shut down",
        body: (<>Anthropic has shut down <strong>Claude Fable 5</strong> for good, so it&apos;s gone from the
            model picker for bots and the Game Master. Every other model is unaffected — pick any of them when
            you set up a lobby.</>),
        media: null,
        links: [{label: "Anthropic's announcement", href: "https://www.anthropic.com/news/fable-mythos-access"}],
    },
    {
        id: "fable-5", date: "Jun 2026", tags: ["Models"],
        title: "Claude Fable 5 joins the table",
        body: (<>Anthropic&apos;s newest model, <strong>Claude Fable 5</strong>, is now selectable for any bot
            or the Game Master. It&apos;s especially strong at staying in character across a long game — useful
            when a bot has to hold both a story and a bluff for several nights running. Add it from the model
            picker when you set up a lobby.</>),
        media: null,
        links: [{label: "Create a game", href: "/games"}],
    },
    {
        id: "create-a-game-video", date: "Jun 2026", tags: ["Guides"],
        title: "New video: how to create a game",
        body: (<>A short walkthrough of the full setup flow — pick a theme, set the player and werewolf count,
            choose special roles, generate a preview, and tweak any character before you start.</>),
        media: {label: "youtube · how to create a game", youtubeId: "nwHEuNbRXXQ"},
        links: [{label: "Read the rules", href: "/rules"}],
    },
    {
        id: "rules-rewrite", date: "Jun 2026", tags: ["Guides"],
        title: "Rewritten rules page",
        body: (<>The rules page got a clearer rewrite — each role, the night order, and the win conditions are
            easier to scan, now with embedded video tutorials.</>),
        media: null,
        links: [{label: "Read the rules", href: "/rules"}],
    },
    {
        id: "ui-refresh", date: "Jun 2026", tags: ["Design"],
        title: "Restyled pages, a News feed, and a coffee badge",
        body: (<>Several pages got a visual cleanup, this News page is new, and there&apos;s now a
            &ldquo;Buy me a coffee&rdquo; badge. Every game burns real AI tokens, so a coffee goes straight
            toward the API bills.</>),
        media: null,
        links: [{label: "About the project", href: "/about"}],
    },
    {
        id: "deepseek-stability", date: "Jun 2026", tags: ["Fixes"],
        title: "Steadier DeepSeek V4 reasoning",
        body: (<>Fixed a bug where the <strong>DeepSeek V4</strong> reasoning model would occasionally crash
            mid-game — its thinking output sometimes came back as malformed JSON. It&apos;s stable now.</>),
        media: null,
        links: [],
    },
];
