import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => console.error("[listing-service] Redis error", err));

export const LISTING_CACHE_TTL_SECONDS = 300; // 5 minutes
export const listingCacheKey = (id: string) => `listing:${id}`;
