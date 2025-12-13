'use server'

import { ApiKeyMap, UserTier, USER_TIERS } from "@/app/api/game-models";
import { getFreeTierApiKeys } from "@/app/api/free-tier-actions";
import { getUserApiKeys, getUserTier } from "@/app/api/user-actions";

/**
 * Gets the appropriate API keys based on user tier
 * - For 'api' tier: Returns user's own API keys
 * - For 'free' tier: Returns global free tier API keys
 */
export async function getApiKeysForUser(userId: string): Promise<ApiKeyMap> {
    const tier = await getUserTier(userId);

    if (tier === USER_TIERS.API) {
        return await getUserApiKeys(userId);
    } else {
        return await getFreeTierApiKeys();
    }
}

/**
 * Gets user tier and appropriate API keys in one call
 * More efficient when you need both pieces of information
 */
export async function getUserTierAndApiKeys(userId: string): Promise<{
    tier: UserTier;
    apiKeys: ApiKeyMap;
}> {
    const tier = await getUserTier(userId);
    const apiKeys = tier === USER_TIERS.API
        ? await getUserApiKeys(userId)
        : await getFreeTierApiKeys();

    return { tier, apiKeys };
}
