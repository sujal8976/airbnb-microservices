import cors from "cors";
import express from "express";
import { pool } from "./db.js";
import { connectRabbitMQ } from "./rabbitmq.js";
import { startNotificationConsumer } from "./consumer.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4006;

app.get("/health", (_req, res) => res.json({ status: "ok", service: "notification-service" }));

// Optional: lets the frontend show a notification history / activity feed.
// Nothing else in the system depends on this endpoint existing.
app.get("/notifications/:userId", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [req.params.userId]
  );
  res.json(result.rows);
});

async function main() {
  await connectRabbitMQ();
  await startNotificationConsumer();
  app.listen(PORT, () => console.log(`[notification-service] listening on port ${PORT}`));
}

main().catch((err) => {
  console.error("[notification-service] Fatal startup error", err);
  process.exit(1);
});
