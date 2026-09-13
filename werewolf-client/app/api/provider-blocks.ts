import { SupportedAiModels, SupportedAiKeyNames } from '@/app/ai/ai-models';
import { GAME_MASTER, type Game, type ProviderBlock } from '@/app/api/game-models';

/**
 * Per-game provider blocks: once a provider's content filter refuses this game's story
 * (Gemini PROHIBITED_CONTENT / SAFETY, Qwen DataInspectionFailed, Anthropic refusal) the
 * provider is out for the rest of the game. Two reasons, both about the platform key:
 * the same prompt refuses again so a retry only burns a call, and repeated submissions of
 * content a provider has already labeled prohibited are what gets an account flagged.
 * Enforced server-side in getEffectiveModel (before every AI call) and in the model-change
 * actions; the UI hides the provider in the model picker.
 */

/** Stable id for a model's provider — its api-key name (GOOGLE_API_KEY…); undefined for unknown models. */
export function providerKeyOf(model: string | undefined | null): string | undefined {
    return model ? SupportedAiModels[model]?.apiKeyName : undefined;
}

export function providerDisplayName(providerKey: string): string {
    return (SupportedAiKeyNames as Record<string, string>)[providerKey] ?? providerKey;
}

/** Human reading of a provider label: PROHIBITED_CONTENT → "prohibited content". */
export function refusalReasonLabel(reason: string | undefined): string | undefined {
    if (!reason || reason === 'refusal') {
        return undefined;
    }
    if (reason === 'DataInspectionFailed') {
        return 'inappropriate content';
    }
    return reason.toLowerCase().replace(/_/g, ' ');
}

export function providerBlockMessage(block: ProviderBlock): string {
    const why = refusalReasonLabel(block.reason);
    return `${block.provider} is blocked in this game: its content filter refused the story on day ${block.day}${why ? ` (${why})` : ''}. Pick a model from another provider.`;
}

/**
 * Thrown before an AI call when the chosen model's provider is on the game's block list.
 * Recognized after the string round trip through `game.errorState` by isProviderBlockedError,
 * so keep the wording in providerBlockMessage and the regex in sync.
 */
export class ProviderBlockedError extends Error {
    code = 'PROVIDER_BLOCKED' as const;
    readonly providerKey: string;
    readonly block: ProviderBlock;

    constructor(providerKey: string, block: ProviderBlock) {
        super(providerBlockMessage(block));
        this.name = 'ProviderBlockedError';
        this.providerKey = providerKey;
        this.block = block;
    }
}

export function isProviderBlockedError(text: string | undefined | null): boolean {
    return !!text && /is blocked in this game/i.test(text);
}

export function blockFor(game: Pick<Game, 'providerBlocks'> | null | undefined, model: string | undefined | null): { key: string; block: ProviderBlock } | undefined {
    const key = providerKeyOf(model);
    const block = key ? game?.providerBlocks?.[key] : undefined;
    return key && block ? { key, block } : undefined;
}

/** No-op when the model's provider is not blocked for this game; throws ProviderBlockedError otherwise. */
export function assertProviderNotBlocked(game: Pick<Game, 'providerBlocks'> | null | undefined, model: string | undefined | null): void {
    const hit = blockFor(game, model);
    if (hit) {
        throw new ProviderBlockedError(hit.key, hit.block);
    }
}

/**
 * Who else in this game still runs on `providerKey` and will hit the same wall on their next
 * turn: alive bots (dead ones make no more calls) plus the Game Master. `exclude` is the actor
 * whose failure is being shown, already named in the banner.
 */
export function actorsOnProvider(game: Pick<Game, 'bots' | 'gameMasterAiType'>, providerKey: string, exclude?: string): string[] {
    const names = game.bots
        .filter(b => b.isAlive && b.name !== exclude && providerKeyOf(b.aiType) === providerKey)
        .map(b => b.name);
    if (exclude !== GAME_MASTER && providerKeyOf(game.gameMasterAiType) === providerKey) {
        names.push(GAME_MASTER);
    }
    return names;
}
