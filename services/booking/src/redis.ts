import { Redis } from "ioredis";
import { randomUUID } from "crypto";

export const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => console.error("[booking-service] Redis error", err));

const LOCK_TTL_MS = 10_000; // auto-expire so a crashed holder can't wedge the lock forever

/**
 * Distributed lock keyed on the listing (simplified: one lock per listing
 * rather than per date-range, which is stricter than necessary but simple
 * and correct — prevents any two bookings for the same listing from racing
 * through the check-then-write section concurrently).
 *
 * Uses SET NX PX for atomic acquire, and a Lua script for safe release
 * (only the holder who set the token can release it).
 */
export async function acquireLock(listingId: string): Promise<string | null> {
  const token = randomUUID();
  const key = `lock:listing:${listingId}`;
  const result = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
  return result === "OK" ? token : null;
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export async function releaseLock(listingId: string, token: string): Promise<void> {
  const key = `lock:listing:${listingId}`;
  await redis.eval(RELEASE_SCRIPT, 1, key, token);
}
