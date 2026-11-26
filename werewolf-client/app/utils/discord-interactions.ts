import {createPublicKey, verify} from "crypto";

/**
 * Discord interactions over HTTP: Discord POSTs a slash command to our endpoint, signed
 * with the application's Ed25519 key. This is how a member of the Discord server asks the
 * Marlow bot for the one-time free credits (`/credits code:WOLF-…`, app/utils/credits.ts):
 * no bot process, no gateway, the answer comes back in the same second.
 *
 * Server only (Node crypto). No Firestore here: the route does the claim.
 */

/** The Marlow application (the bot the server already has). Public values, not secrets. */
export const DISCORD_APPLICATION_ID = '1520835258553995364';
export const DISCORD_GUILD_ID = '1519821471978098739';
/** The application's `verify_key`. `DISCORD_PUBLIC_KEY` in the environment overrides it (a rotated key). */
export const DISCORD_PUBLIC_KEY = '77518a45f80217c3e3299fe89dc74226d9fa7c112c21578ede83d61e50c17a45';

/** DER prefix that turns 32 raw Ed25519 public-key bytes into an SPKI key Node can load. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

const HEX_RE = /^[0-9a-f]+$/i;

/**
 * True when `signatureHex` is the application's signature over `timestamp + body`. Discord
 * requires the endpoint to answer 401 otherwise, and probes it with bad signatures.
 */
export function verifyDiscordSignature(body: string, signatureHex: string | null, timestamp: string | null, publicKeyHex: string): boolean {
    if (!signatureHex || !timestamp || !HEX_RE.test(signatureHex) || signatureHex.length !== 128) return false;
    if (!HEX_RE.test(publicKeyHex) || publicKeyHex.length !== 64) return false;
    try {
        const key = createPublicKey({key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]), format: 'der', type: 'spki'});
        return verify(null, Buffer.from(timestamp + body, 'utf8'), key, Buffer.from(signatureHex, 'hex'));
    } catch {
        return false;
    }
}

export const INTERACTION_PING = 1;
export const INTERACTION_COMMAND = 2;
export const RESPONSE_PONG = 1;
export const RESPONSE_MESSAGE = 4;
export const RESPONSE_DEFERRED = 5;
/** Only the member who typed the command sees the answer: a claim code is personal. */
export const FLAG_EPHEMERAL = 64;

/** What the route needs from a slash-command interaction. */
export interface CreditsCommand {
    code: string | undefined;
    discordUserId: string | undefined;
    discordUsername: string | undefined;
    guildId: string | undefined;
    token: string | undefined;
}

export function readCreditsCommand(interaction: any): CreditsCommand {
    const options: any[] = Array.isArray(interaction?.data?.options) ? interaction.data.options : [];
    const code = options.find(o => o?.name === 'code')?.value;
    // In a server the invoker is `member.user`; in a direct message it is `user`.
    const user = interaction?.member?.user ?? interaction?.user;
    return {
        code: typeof code === 'string' ? code : undefined,
        discordUserId: typeof user?.id === 'string' ? user.id : undefined,
        discordUsername: typeof user?.username === 'string' ? user.username : undefined,
        guildId: typeof interaction?.guild_id === 'string' ? interaction.guild_id : undefined,
        token: typeof interaction?.token === 'string' ? interaction.token : undefined,
    };
}

function usd(amount: number): string {
    return `$${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}`;
}

/** The bot's answer for each outcome of a claim. Plain text, no em-dashes (a public server). */
export function creditsReply(result: {ok: true; amountUSD: number; credits: number} | {ok: false; reason: string}): string {
    if (result.ok) {
        return `Done - ${usd(result.amountUSD)} of free credits added to your AI Werewolf account. You now have $${result.credits.toFixed(2)}. Reload the game page and keep playing.`;
    }
    switch (result.reason) {
        case 'account_claimed':
            return 'That AI Werewolf account already got its Discord credits. They are given once per account. To keep playing, add funds on your profile page: https://aiwerewolf.net/profile';
        case 'discord_claimed':
            return 'This Discord account already claimed credits for an AI Werewolf account. They are given once per Discord account.';
        case 'not_in_server':
            return 'Use this command inside the server, not in a direct message.';
        case 'off':
            return 'Free credits through Discord are switched off right now.';
        case 'error':
            return 'Something went wrong on our side and nothing was changed. Please try again in a minute.';
        default:
            return 'I could not find that code. Open https://aiwerewolf.net/profile, copy your code (it looks like WOLF-7KQ2M9XA) and send it again: /credits code:WOLF-...';
    }
}
