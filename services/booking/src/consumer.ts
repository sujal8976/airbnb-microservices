import { pool } from "./db.js";
import { subscribeToEvents, publishEvent } from "./rabbitmq.js";

interface PaymentEvent {
  bookingId: string;
  paymentId: string;
  amount: number;
  status: "success" | "failed";
}

/**
 * This is the async half of the booking flow: Booking creates a booking in
 * `pending` status and fires `payment.requested`, then returns immediately.
 * Whenever Payment Service later publishes success/failure, this consumer
 * flips the booking to `confirmed` or `failed` and emits its own event so
 * Notification can tell the guest.
 */
export async function startBookingConsumer() {
  await subscribeToEvents(
    "booking-service.payment-events",
    ["payment.success", "payment.failed"],
    async (routingKey, payload: PaymentEvent) => {
      const newStatus = routingKey === "payment.success" ? "confirmed" : "failed";

      const result = await pool.query(
        `UPDATE bookings SET status = $1, updated_at = now()
         WHERE id = $2 AND status = 'pending'
         RETURNING *`,
        [newStatus, payload.bookingId]
      );

      if (result.rowCount === 0) {
        console.warn(`[booking-service] No pending booking found for ${payload.bookingId}, skipping`);
        return;
      }

      const booking = result.rows[0];
      await publishEvent(newStatus === "confirmed" ? "booking.confirmed" : "booking.failed", {
        bookingId: booking.id,
        guestId: booking.guest_id,
        hostId: booking.host_id,
        listingId: booking.listing_id,
        startDate: booking.start_date,
        endDate: booking.end_date,
        totalPrice: Number(booking.total_price),
      });

      console.log(`[booking-service] Booking ${booking.id} -> ${newStatus}`);
    }
  );
}
