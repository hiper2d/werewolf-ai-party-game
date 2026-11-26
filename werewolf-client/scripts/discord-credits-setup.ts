/**
 * One-time Discord setup for the `/credits` slash command (app/utils/credits.ts,
 * app/api/discord/interactions/route.ts). The command belongs to the Marlow application,
 * so this needs Marlow's bot token, passed in the environment and never stored here:
 *
 *   DISCORD_MARLOW_TOKEN=… npx tsx scripts/discord-credits-setup.ts show
 *       The application's interactions URL and the commands registered in the server.
 *
 *   DISCORD_MARLOW_TOKEN=… npx tsx scripts/discord-credits-setup.ts endpoint https://aiwerewolf.net/api/discord/interactions
 *       Point the application at the game's endpoint. Discord calls the URL while saving
 *       (a ping, and a request with a bad signature that must get a 401), so the route has
 *       to be DEPLOYED there first. `endpoint none` clears it.
 *
 *   DISCORD_MARLOW_TOKEN=… npx tsx scripts/discord-credits-setup.ts register
 *       Register `/credits code:<your code>` in the server (a guild command: it shows up at
 *       once, and only there). Do this after `endpoint`, or members get "the application
 *       did not respond". `unregister` removes it.
 *
 * Order on the day credits go live: deploy, `endpoint`, `register`, then try the command.
 */
import {DISCORD_APPLICATION_ID, DISCORD_GUILD_ID} from '../app/utils/discord-interactions';
import {DISCORD_CREDITS_COMMAND} from '../app/utils/credits';

const API = 'https://discord.com/api/v10';
const token = process.env.DISCORD_MARLOW_TOKEN;

async function call(method: string, path: string, body?: unknown): Promise<any> {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: {
            Authorization: `Bot ${token}`,
            // Discord's edge refuses requests without a bot User-Agent.
            'User-Agent': 'DiscordBot (https://aiwerewolf.net, 0.1)',
            ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
        },
        ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Discord ${method} ${path} → ${response.status}: ${text.slice(0, 400)}`);
    }
    return text ? JSON.parse(text) : null;
}

const COMMANDS = `/applications/${DISCORD_APPLICATION_ID}/guilds/${DISCORD_GUILD_ID}/commands`;

const COMMAND = {
    name: DISCORD_CREDITS_COMMAND,
    type: 1, // a slash command
    description: 'Get your free AI Werewolf credits. Your code is on your profile page at aiwerewolf.net.',
    options: [{
        name: 'code',
        type: 3, // a string
        description: 'Your personal code from aiwerewolf.net/profile, like WOLF-7KQ2M9XA',
        required: true,
        min_length: 8,
        max_length: 20,
    }],
};

(async () => {
    const [command, arg] = process.argv.slice(2);
    if (!token) {
        throw new Error('Set DISCORD_MARLOW_TOKEN (the Marlow bot token) in the environment.');
    }
    if (command === 'show') {
        const app = await call('GET', '/applications/@me');
        const commands: any[] = await call('GET', COMMANDS);
        console.log(`application: ${app.name} (${app.id})`);
        console.log(`interactions endpoint: ${app.interactions_endpoint_url ?? '(none)'}`);
        console.log(`server commands: ${commands.length === 0 ? '(none)' : commands.map(c => `/${c.name} (${c.id})`).join(', ')}`);
    } else if (command === 'endpoint' && arg) {
        const url = arg === 'none' ? null : arg;
        const app = await call('PATCH', '/applications/@me', {interactions_endpoint_url: url});
        console.log(`interactions endpoint is now: ${app.interactions_endpoint_url ?? '(none)'}`);
    } else if (command === 'register') {
        const created = await call('POST', COMMANDS, COMMAND);
        console.log(`registered /${created.name} (${created.id}) in the server`);
    } else if (command === 'unregister') {
        const commands: any[] = await call('GET', COMMANDS);
        for (const existing of commands.filter(c => c.name === DISCORD_CREDITS_COMMAND)) {
            await call('DELETE', `${COMMANDS}/${existing.id}`);
            console.log(`removed /${existing.name} (${existing.id})`);
        }
    } else {
        console.log('Usage: discord-credits-setup.ts show | endpoint <url|none> | register | unregister');
        process.exit(1);
    }
})().catch(error => {
    console.error(error.message ?? error);
    process.exit(1);
});
