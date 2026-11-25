import {NextRequest, NextResponse, after} from "next/server";
import {claimDiscordCredit} from "@/app/api/credits";
import {
    creditsReply, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, DISCORD_PUBLIC_KEY, FLAG_EPHEMERAL, INTERACTION_COMMAND,
    INTERACTION_PING, readCreditsCommand, RESPONSE_DEFERRED, RESPONSE_MESSAGE, RESPONSE_PONG, verifyDiscordSignature,
} from "@/app/utils/discord-interactions";
import {DISCORD_CREDITS_COMMAND} from "@/app/utils/credits";
import {logger} from "@/app/utils/logger";

/**
 * Discord's interactions endpoint for the Marlow application: the `/credits` slash command
 * (app/utils/credits.ts, the one-time Discord claim). Public, with no session: the Ed25519
 * signature is the authentication, and it proves the Discord user id in the payload, which
 * is what the once-per-Discord-user rule keys on.
 *
 * Discord allows three seconds for the first answer, and a cold start plus a transaction
 * can pass that, so the command is acknowledged at once ("thinking…", visible only to the
 * member) and the real answer replaces it after the response (`after`).
 *
 * Set up once with scripts/discord-credits-setup.ts (registers the command in the server
 * and points the application at this URL).
 */
export const runtime = 'nodejs';

async function editOriginal(token: string, content: string): Promise<void> {
    const response = await fetch(`https://discord.com/api/v10/webhooks/${DISCORD_APPLICATION_ID}/${token}/messages/@original`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://aiwerewolf.net, 0.1)'},
        body: JSON.stringify({content}),
    });
    if (!response.ok) {
        throw new Error(`Discord answered ${response.status}`);
    }
}

export async function POST(request: NextRequest) {
    const body = await request.text();
    const publicKey = process.env.DISCORD_PUBLIC_KEY || DISCORD_PUBLIC_KEY;
    if (!verifyDiscordSignature(body, request.headers.get('x-signature-ed25519'), request.headers.get('x-signature-timestamp'), publicKey)) {
        return new NextResponse('invalid request signature', {status: 401});
    }

    let interaction: any;
    try {
        interaction = JSON.parse(body);
    } catch {
        return new NextResponse('bad request', {status: 400});
    }

    if (interaction?.type === INTERACTION_PING) {
        return NextResponse.json({type: RESPONSE_PONG});
    }
    const message = (content: string) => NextResponse.json({type: RESPONSE_MESSAGE, data: {content, flags: FLAG_EPHEMERAL}});
    if (interaction?.type !== INTERACTION_COMMAND || interaction?.data?.name !== DISCORD_CREDITS_COMMAND) {
        return message('I do not know that command.');
    }

    const command = readCreditsCommand(interaction);
    // "Join the server" is the condition: the command only counts inside it.
    if (command.guildId !== DISCORD_GUILD_ID || !command.discordUserId || !command.token) {
        return message(creditsReply({ok: false, reason: 'not_in_server'}));
    }

    after(async () => {
        let reply: string;
        try {
            reply = creditsReply(await claimDiscordCredit({
                code: command.code,
                discordUserId: command.discordUserId!,
                discordUsername: command.discordUsername,
            }));
        } catch (error: any) {
            logger.error(`Discord credits claim failed: ${error?.message ?? error}`, {discordUserId: command.discordUserId});
            reply = creditsReply({ok: false, reason: 'error'});
        }
        try {
            await editOriginal(command.token!, reply);
        } catch (error: any) {
            logger.error(`Discord credits claim: could not send the answer: ${error?.message ?? error}`, {discordUserId: command.discordUserId});
        }
        await logger.flush();
    });
    return NextResponse.json({type: RESPONSE_DEFERRED, data: {flags: FLAG_EPHEMERAL}});
}
