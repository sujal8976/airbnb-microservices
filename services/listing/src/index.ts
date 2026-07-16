import cors from "cors";
import express from "express";
import { z } from "zod";
import { pool } from "./db.js";
import { connectRabbitMQ, publishEvent } from "./rabbitmq.js";
import { redis, LISTING_CACHE_TTL_SECONDS, listingCacheKey } from "./redis.js";
import type { AuthedRequest } from "./middleware/auth.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4002;

app.get("/health", (_req, res) => res.json({ status: "ok", service: "listing-service" }));

const listingSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  price: z.number().positive(),
  location: z.string().min(1),
  amenities: z.array(z.string()).optional().default([]),
  images: z.array(z.string()).optional().default([]),
  availableFrom: z.string(), // ISO date
  availableTo: z.string(),
});

function toListingDTO(row: any) {
  return {
    id: row.id,
    hostId: row.host_id,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    location: row.location,
    amenities: row.amenities,
    images: row.images,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---- Create listing (host only) ----
app.post("/listings", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "host" && req.user!.role !== "both") {
    return res.status(403).json({ error: "Only hosts can create listings" });
  }
  const parsed = listingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  try {
    const result = await pool.query(
      `INSERT INTO listings
        (host_id, title, description, price, location, amenities, images, available_from, available_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.user!.id, d.title, d.description, d.price, d.location, d.amenities, d.images, d.availableFrom, d.availableTo]
    );
    const listing = toListingDTO(result.rows[0]);

    await publishEvent("listing.created", listing).catch((err) =>
      console.error("Failed to publish listing.created", err)
    );

    res.status(201).json(listing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---- Get single listing (cache-aside via Redis) ----
app.get("/listings/:id", async (req, res) => {
  const { id } = req.params;
  const cacheKey = listingCacheKey(id);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(JSON.parse(cached));
    }

    const result = await pool.query("SELECT * FROM listings WHERE id = $1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Listing not found" });

    const listing = toListingDTO(result.rows[0]);
    await redis.set(cacheKey, JSON.stringify(listing), "EX", LISTING_CACHE_TTL_SECONDS);
    res.set("X-Cache", "MISS");
    res.json(listing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---- List listings for a host ----
app.get("/listings", async (req, res) => {
  const hostId = req.query.hostId as string | undefined;
  try {
    const result = hostId
      ? await pool.query("SELECT * FROM listings WHERE host_id = $1 ORDER BY created_at DESC", [hostId])
      : await pool.query("SELECT * FROM listings ORDER BY created_at DESC LIMIT 50");
    res.json(result.rows.map(toListingDTO));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---- Update listing (owner only) ----
app.put("/listings/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params as { id: string };
  const parsed = listingSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const existing = await pool.query("SELECT * FROM listings WHERE id = $1", [id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: "Listing not found" });
    if (existing.rows[0].host_id !== req.user!.id) {
      return res.status(403).json({ error: "You do not own this listing" });
    }

    const d = { ...toListingDTO(existing.rows[0]), ...parsed.data };
    const result = await pool.query(
      `UPDATE listings SET title=$1, description=$2, price=$3, location=$4,
        amenities=$5, images=$6, available_from=$7, available_to=$8, updated_at=now()
       WHERE id=$9 RETURNING *`,
      [d.title, d.description, d.price, d.location, d.amenities, d.images, d.availableFrom, d.availableTo, id]
    );
    const listing = toListingDTO(result.rows[0]);

    await redis.del(listingCacheKey(id));
    await publishEvent("listing.updated", listing).catch((err) =>
      console.error("Failed to publish listing.updated", err)
    );

    res.json(listing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---- Delete (soft-delete) listing ----
app.delete("/listings/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params as { id: string };
  try {
    const existing = await pool.query("SELECT * FROM listings WHERE id = $1", [id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: "Listing not found" });
    if (existing.rows[0].host_id !== req.user!.id) {
      return res.status(403).json({ error: "You do not own this listing" });
    }

    await pool.query("UPDATE listings SET is_active = false, updated_at = now() WHERE id = $1", [id]);
    await redis.del(listingCacheKey(id));
    await publishEvent("listing.deleted", { id }).catch((err) =>
      console.error("Failed to publish listing.deleted", err)
    );

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function main() {
  await connectRabbitMQ();
  app.listen(PORT, () => console.log(`[listing-service] listening on port ${PORT}`));
}

main().catch((err) => {
  console.error("[listing-service] Fatal startup error", err);
  process.exit(1);
});
