/**
 * Organization plan helpers and tier-specific restrictions.
 */

export const FREE_TIER_PLAN = 'free';
export const FREE_TIER_INDEX_CLOUD = 'aws';
export const FREE_TIER_INDEX_REGION = 'us-east-1';
export const FREE_TIER_ASSISTANT_REGION = 'us';
export const FREE_TIER_API_KEY_ROLE = 'ProjectEditor';
export const FREE_TIER_BLOCKED_RERANK_MODEL = 'cohere-rerank-3.5';

export function normalizeOrganizationPlan(plan?: string): string {
    return String(plan || '').trim().toLowerCase();
}

export function isFreeTierPlan(plan?: string): boolean {
    return normalizeOrganizationPlan(plan) === FREE_TIER_PLAN;
}
