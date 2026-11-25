import {generateKeyPairSync, sign} from 'crypto';
import {creditsReply, readCreditsCommand, verifyDiscordSignature} from './discord-interactions';

// A throwaway key pair standing in for the Discord application's.
const {publicKey, privateKey} = generateKeyPairSync('ed25519');
const PUBLIC_HEX = publicKey.export({format: 'der', type: 'spki'}).subarray(-32).toString('hex');
const signed = (timestamp: string, body: string) => sign(null, Buffer.from(timestamp + body, 'utf8'), privateKey).toString('hex');

describe('verifyDiscordSignature', () => {
    const body = JSON.stringify({type: 1});
    const timestamp = '1795500000';

    it('accepts the application signature over timestamp + body', () => {
        expect(verifyDiscordSignature(body, signed(timestamp, body), timestamp, PUBLIC_HEX)).toBe(true);
    });

    it('rejects a changed body, a changed timestamp and another key', () => {
        const signature = signed(timestamp, body);
        expect(verifyDiscordSignature(body + ' ', signature, timestamp, PUBLIC_HEX)).toBe(false);
        expect(verifyDiscordSignature(body, signature, '1795500001', PUBLIC_HEX)).toBe(false);
        const other = generateKeyPairSync('ed25519').publicKey.export({format: 'der', type: 'spki'}).subarray(-32).toString('hex');
        expect(verifyDiscordSignature(body, signature, timestamp, other)).toBe(false);
    });

    it('rejects missing or malformed headers without throwing', () => {
        expect(verifyDiscordSignature(body, null, timestamp, PUBLIC_HEX)).toBe(false);
        expect(verifyDiscordSignature(body, signed(timestamp, body), null, PUBLIC_HEX)).toBe(false);
        expect(verifyDiscordSignature(body, 'zz', timestamp, PUBLIC_HEX)).toBe(false);
        expect(verifyDiscordSignature(body, '00'.repeat(64), timestamp, PUBLIC_HEX)).toBe(false);
        expect(verifyDiscordSignature(body, signed(timestamp, body), timestamp, 'not-a-key')).toBe(false);
    });
});

describe('readCreditsCommand', () => {
    it('reads the code and the member who typed it', () => {
        const command = readCreditsCommand({
            type: 2, token: 'tok', guild_id: 'g1',
            member: {user: {id: '123456789', username: 'wolfie'}},
            data: {name: 'credits', options: [{name: 'code', type: 3, value: 'WOLF-7KQ2M9XA'}]},
        });
        expect(command).toEqual({code: 'WOLF-7KQ2M9XA', discordUserId: '123456789', discordUsername: 'wolfie', guildId: 'g1', token: 'tok'});
    });

    it('survives a payload with nothing in it', () => {
        expect(readCreditsCommand({})).toEqual({code: undefined, discordUserId: undefined, discordUsername: undefined, guildId: undefined, token: undefined});
        expect(readCreditsCommand({user: {id: '9'}, data: {options: [{name: 'code', value: 7}]}}).code).toBeUndefined();
    });
});

describe('creditsReply', () => {
    it('says what was added and what the account has now', () => {
        expect(creditsReply({ok: true, amountUSD: 5, credits: 5.5})).toContain('$5 of free credits added');
        expect(creditsReply({ok: true, amountUSD: 5, credits: 5.5})).toContain('You now have $5.50');
    });

    it('has a different answer for each refusal, none with an em-dash', () => {
        const reasons = ['bad_code', 'account_claimed', 'discord_claimed', 'not_in_server', 'off', 'error'];
        const replies = reasons.map(reason => creditsReply({ok: false, reason}));
        expect(new Set(replies).size).toBe(reasons.length);
        for (const reply of [...replies, creditsReply({ok: true, amountUSD: 5, credits: 5})]) {
            expect(reply).not.toMatch(/—/);
        }
    });
});
