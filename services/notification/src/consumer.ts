import { pool } from "./db.js";
import { subscribeToEvents } from "./rabbitmq.js";

async function sendMockNotification(userId: string | null, type: string, message: string) {
  // "Sending" is mocked: in a real system this would call an email/SMS/push
  // provider. The point architecturally is that nothing calls *into* this
  // service directly — it only reacts to events, so it can be added, removed,
  // or crashed without any other service noticing or needing to change.
  console.log(`[notification-service] >> ${type} to user ${userId ?? "unknown"}: ${message}`);
  await pool.query(
    `INSERT INTO notifications (user_id, type, message, status) VALUES ($1, $2, $3, 'sent')`,
    [userId, type, message]
  );
}

export async function startNotificationConsumer() {
  await subscribeToEvents(
    "notification-service.all-events",
    [
      "user.registered",
      "booking.confirmed",
      "booking.failed",
      "booking.cancelled",
      "payment.success",
      "payment.failed",
    ],
    async (routingKey, payload) => {
      switch (routingKey) {
        case "user.registered":
          await sendMockNotification(payload.userId, "welcome_email", `Welcome to Airbnb-clone, ${payload.name}!`);
          break;
        case "booking.confirmed":
          await sendMockNotification(
            payload.guestId,
            "booking_confirmed",
            `Your booking ${payload.bookingId} for ${payload.startDate} - ${payload.endDate} is confirmed. Total: $${payload.totalPrice}`
          );
          await sendMockNotification(
            payload.hostId,
            "booking_confirmed_host",
            `You have a new confirmed booking (${payload.bookingId}) for listing ${payload.listingId}`
          );
          break;
        case "booking.failed":
          await sendMockNotification(
            payload.guestId,
            "booking_failed",
            `Payment for booking ${payload.bookingId} failed. Your reservation was not completed.`
          );
          break;
        case "booking.cancelled":
          await sendMockNotification(
            payload.guestId,
            "booking_cancelled",
            `Booking ${payload.id ?? payload.bookingId} has been cancelled.`
          );
          break;
        case "payment.success":
          await sendMockNotification(
            payload.guestId ?? null,
            "payment_receipt",
            `Payment of $${payload.amount} received for booking ${payload.bookingId}.`
          );
          break;
        case "payment.failed":
          await sendMockNotification(
            payload.guestId ?? null,
            "payment_failed",
            `Payment of $${payload.amount} for booking ${payload.bookingId} failed.`
          );
          break;
        default:
          console.warn(`[notification-service] Unhandled routing key: ${routingKey}`);
      }
    }
  );
}
