import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => console.error("[search-service] Redis error", err));

export const SEARCH_CACHE_TTL_SECONDS = 30; // short TTL: search results churn fast

export function searchCacheKey(params: Record<string, string | undefined>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `search:${parts.join("&") || "all"}`;
}
