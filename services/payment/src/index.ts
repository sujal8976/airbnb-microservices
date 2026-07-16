import cors from "cors";
import express from "express";
import { pool } from "./db.js";
import { connectRabbitMQ } from "./rabbitmq.js";
import { startPaymentConsumer } from "./consumer.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4005;

app.get("/health", (_req, res) => res.json({ status: "ok", service: "payment-service" }));

// Optional REST endpoint for polling a booking's payment status directly,
// useful for the frontend or for debugging without tailing RabbitMQ.
app.get("/payments/booking/:bookingId", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1",
    [req.params.bookingId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "No payment found for this booking" });
  const row = result.rows[0];
  res.json({
    id: row.id,
    bookingId: row.booking_id,
    amount: Number(row.amount),
    status: row.status,
    createdAt: row.created_at,
  });
});

async function main() {
  await connectRabbitMQ();
  await startPaymentConsumer();
  app.listen(PORT, () => console.log(`[payment-service] listening on port ${PORT}`));
}

main().catch((err) => {
  console.error("[payment-service] Fatal startup error", err);
  process.exit(1);
});
