import cors from "cors";
import express from "express";
import { z } from "zod";
import { pool } from "./db.js";
import { connectRabbitMQ, publishEvent } from "./rabbitmq.js";
import { acquireLock, releaseLock } from "./redis.js";
import { getListing, getUser } from "./httpClients.js";
import { startBookingConsumer } from "./consumer.js";
import type { AuthedRequest } from "./middleware/auth.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4004;

app.get("/health", (_req, res) => res.json({ status: "ok", service: "booking-service" }));

function toBookingDTO(row: any) {
  return {
    id: row.id,
    listingId: row.listing_id,
    guestId: row.guest_id,
    hostId: row.host_id,
    startDate: row.start_date,
    endDate: row.end_date,
    totalPrice: Number(row.total_price),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nightsBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

const createBookingSchema = z.object({
  listingId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
});

app.post("/bookings", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { listingId, startDate, endDate } = parsed.data;
  const guestId = req.user!.id;

  if (new Date(endDate) <= new Date(startDate)) {
    return res.status(400).json({ error: "endDate must be after startDate" });
  }

  // --- Distributed lock: serializes all booking attempts for this listing
  // so two concurrent requests for overlapping dates can't both pass the
  // availability check before either has written its row. ---
  const lockToken = await acquireLock(listingId);
  if (!lockToken) {
    return res.status(409).json({ error: "This listing is being booked by someone else right now, try again shortly" });
  }

  try {
    // --- Sync call #1: does the listing exist, and is it available for
    // these dates? Needed immediately, so REST (not an event) is correct here. ---
    const listing = await getListing(listingId);
    if (!listing || !listing.isActive) {
      return res.status(404).json({ error: "Listing not found or inactive" });
    }
    if (new Date(startDate) < new Date(listing.availableFrom) || new Date(endDate) > new Date(listing.availableTo)) {
      return res.status(400).json({ error: "Requested dates are outside the listing's availability window" });
    }

    // --- Sync call #2: guest must be a real registered user. ---
    const guest = await getUser(guestId);
    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    // --- Overlap check against this service's own booking records (the
    // Postgres partial index on active statuses backs this query). ---
    const overlap = await pool.query(
      `SELECT id FROM bookings
       WHERE listing_id = $1
         AND status IN ('pending', 'confirmed')
         AND start_date < $3 AND end_date > $2`,
      [listingId, startDate, endDate]
    );
    if (overlap.rowCount && overlap.rowCount > 0) {
      return res.status(409).json({ error: "These dates are already booked" });
    }

    const nights = nightsBetween(startDate, endDate);
    const totalPrice = Number((listing.price * nights).toFixed(2));

    const inserted = await pool.query(
      `INSERT INTO bookings (listing_id, guest_id, host_id, start_date, end_date, total_price, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')
       RETURNING *`,
      [listingId, guestId, listing.hostId, startDate, endDate, totalPrice]
    );
    const booking = toBookingDTO(inserted.rows[0]);

    // --- Async hand-off: Payment Service will pick this up, process it,
    // and publish payment.success / payment.failed whenever it's done.
    // Booking's own consumer (consumer.ts) reacts to that and updates status. ---
    await publishEvent("payment.requested", {
      bookingId: booking.id,
      guestId,
      amount: totalPrice,
    });

    res.status(202).json({ ...booking, message: "Booking created, awaiting payment confirmation" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal server error" });
  } finally {
    await releaseLock(listingId, lockToken);
  }
});

app.get("/bookings/:id", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query("SELECT * FROM bookings WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Booking not found" });
  res.json(toBookingDTO(result.rows[0]));
});

app.get("/bookings", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query(
    "SELECT * FROM bookings WHERE guest_id = $1 OR host_id = $1 ORDER BY created_at DESC",
    [req.user!.id]
  );
  res.json(result.rows.map(toBookingDTO));
});

app.post("/bookings/:id/cancel", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query("SELECT * FROM bookings WHERE id = $1", [id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: "Booking not found" });

    const booking = existing.rows[0];
    if (booking.guest_id !== req.user!.id && booking.host_id !== req.user!.id) {
      return res.status(403).json({ error: "Not authorized to cancel this booking" });
    }
    if (booking.status === "cancelled") {
      return res.status(400).json({ error: "Booking already cancelled" });
    }

    const result = await pool.query(
      "UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *",
      [id]
    );
    const updated = toBookingDTO(result.rows[0]);

    await publishEvent("booking.cancelled", updated);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function main() {
  await connectRabbitMQ();
  await startBookingConsumer();
  app.listen(PORT, () => console.log(`[booking-service] listening on port ${PORT}`));
}

main().catch((err) => {
  console.error("[booking-service] Fatal startup error", err);
  process.exit(1);
});
