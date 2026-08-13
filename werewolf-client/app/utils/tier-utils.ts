'use server'

import { ApiKeyMap, UserTier } from "@/app/api/game-models";
import { getFreeTierApiKeys } from "@/app/api/free-tier-actions";
import { getUserTier } from "@/app/api/user-actions";

/**
 * Returns the platform API keys (Firestore doc config/freeTierApiKeys).
 * All tiers run on platform keys — users never provide their own. The userId
 * param is kept so call sites and test mocks stay stable.
 */
export async function getApiKeysForUser(_userId: string): Promise<ApiKeyMap> {
    return getFreeTierApiKeys();
}

/**
 * Gets user tier and the platform API keys in one call.
 * More efficient when you need both pieces of information.
 */
export async function getUserTierAndApiKeys(userId: string): Promise<{
    tier: UserTier;
    apiKeys: ApiKeyMap;
}> {
    const [tier, apiKeys] = await Promise.all([getUserTier(userId), getFreeTierApiKeys()]);
    return { tier, apiKeys };
}
