import cors from "cors";
import express from "express";
import { pool } from "./db.js";
import { connectRabbitMQ } from "./rabbitmq.js";
import { redis, SEARCH_CACHE_TTL_SECONDS, searchCacheKey } from "./redis.js";
import { startSearchConsumer } from "./consumer.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4003;

app.get("/health", (_req, res) => res.json({ status: "ok", service: "search-service" }));

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
  };
}

// GET /search?location=paris&startDate=2026-08-01&endDate=2026-08-10&minPrice=50&maxPrice=300
app.get("/search", async (req, res) => {
  const location = req.query.location as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const minPrice = req.query.minPrice as string | undefined;
  const maxPrice = req.query.maxPrice as string | undefined;

  const cacheKey = searchCacheKey({ location, startDate, endDate, minPrice, maxPrice });

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.set("X-Cache", "HIT");
      return res.json(JSON.parse(cached));
    }

    const conditions: string[] = ["is_active = true"];
    const values: any[] = [];

    if (location) {
      values.push(`%${location.toLowerCase()}%`);
      conditions.push(`lower(location) LIKE $${values.length}`);
    }
    if (startDate && endDate) {
      values.push(startDate, endDate);
      conditions.push(`available_from <= $${values.length - 1} AND available_to >= $${values.length}`);
    }
    if (minPrice) {
      values.push(Number(minPrice));
      conditions.push(`price >= $${values.length}`);
    }
    if (maxPrice) {
      values.push(Number(maxPrice));
      conditions.push(`price <= $${values.length}`);
    }

    const query = `SELECT * FROM listings_search WHERE ${conditions.join(" AND ")} ORDER BY price ASC LIMIT 50`;
    const result = await pool.query(query, values);
    const listings = result.rows.map(toListingDTO);

    await redis.set(cacheKey, JSON.stringify(listings), "EX", SEARCH_CACHE_TTL_SECONDS);
    res.set("X-Cache", "MISS");
    res.json(listings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function main() {
  await connectRabbitMQ();
  await startSearchConsumer();
  app.listen(PORT, () => console.log(`[search-service] listening on port ${PORT}`));
}

main().catch((err) => {
  console.error("[search-service] Fatal startup error", err);
  process.exit(1);
});
