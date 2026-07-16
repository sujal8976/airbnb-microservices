import { pool } from "./db.js";
import { subscribeToEvents, publishEvent } from "./rabbitmq.js";

interface PaymentRequested {
  bookingId: string;
  guestId: string;
  amount: number;
}

// Demo rule: payments fail ~10% of the time, purely to make the async
// failure path (booking -> failed, notification -> "payment failed")
// demonstrable without a real payment gateway.
const FAILURE_RATE = 0.1;

export async function startPaymentConsumer() {
  await subscribeToEvents(
    "payment-service.booking-events",
    ["payment.requested"],
    async (_routingKey, payload: PaymentRequested) => {
      // Simulate network/processing latency of a real payment gateway.
      await new Promise((r) => setTimeout(r, 800));

      const succeeded = Math.random() > FAILURE_RATE;
      const status = succeeded ? "success" : "failed";

      const inserted = await pool.query(
        `INSERT INTO payments (booking_id, guest_id, amount, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [payload.bookingId, payload.guestId, payload.amount, status]
      );
      const paymentId = inserted.rows[0].id;

      await publishEvent(succeeded ? "payment.success" : "payment.failed", {
        bookingId: payload.bookingId,
        guestId: payload.guestId,
        paymentId,
        amount: payload.amount,
        status,
      });

      console.log(`[payment-service] Processed payment ${paymentId} for booking ${payload.bookingId}: ${status}`);
    }
  );
}
