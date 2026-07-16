import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db.js";
import { connectRabbitMQ, publishEvent } from "./rabbitmq.js";
import { requireAuth } from "./middleware/auth.js";
import type { AuthedRequest } from "./middleware/auth.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4001;

app.get("/health", (_req, res) => res.json({ status: "ok", service: "user-service" }));

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["guest", "host", "both"]).default("guest"),
});

app.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, password, role } = parsed.data;

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, role]
    );
    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    // Fire-and-forget event; Notification service will send a welcome email.
    publishEvent("user.registered", {
      userId: user.id,
      name: user.name,
      email: user.email,
    }).catch((err) => console.error("[user-service] Failed to publish user.registered", err));

    res.status(201).json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  try {
    const result = await pool.query(
      "SELECT id, name, email, password_hash, role FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    delete user.password_hash;
    res.json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query(
    "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
    [req.user!.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
  res.json(result.rows[0]);
});

// Internal/public lookup, used by other services (e.g. Booking verifying a guest exists).
app.get("/users/:id", async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });
  res.json(result.rows[0]);
});

async function main() {
  await connectRabbitMQ();
  app.listen(PORT, () => console.log(`[user-service] listening on port ${PORT}`));
}

main().catch((err) => {
  console.error("[user-service] Fatal startup error", err);
  process.exit(1);
});
