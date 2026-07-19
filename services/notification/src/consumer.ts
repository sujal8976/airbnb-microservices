import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { pool } from "./db.js";
import { subscribeToEvents } from "./rabbitmq.js";

const sesRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
const sesFromEmail = process.env.SES_FROM_EMAIL;

const sesClient = sesRegion ? new SESClient({ region: sesRegion }) : null;

async function sendMail(to: string, subject: string, textBody: string, htmlBody?: string) {
  if (!sesClient || !sesFromEmail) {
    throw new Error("SES is not configured. Set AWS_REGION and SES_FROM_EMAIL.");
  }

  await sesClient.send(
    new SendEmailCommand({
      Source: sesFromEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: textBody, Charset: "UTF-8" },
          ...(htmlBody ? { Html: { Data: htmlBody, Charset: "UTF-8" } } : {}),
        },
      },
    })
  );
}

async function sendMailNotification(
  userId: string,
  email: string | null | undefined,
  type: string,
  subject: string,
  message: string
) {
  if (!email) {
    console.warn(`[notification-service] Skipping ${type}: no recipient email provided`);
    return;
  }

  await sendMail(email, subject, message, `<p>${message}</p>`);

  await pool.query(
    `INSERT INTO notifications (user_id, type, subject, message, status) VALUES ($1, $2, $3, $4, 'sent')`,
    [userId, type, subject, message]
  );

  console.log(`[notification-service] >> ${type} to ${email}: ${subject}`);
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
          await sendMailNotification(
            payload.userId,
            payload.email,
            "welcome_email",
            "Welcome to Airbnb-clone",
            `Welcome to Airbnb-clone, ${payload.name}!`
          );
          break;
        case "booking.confirmed":
          await sendMailNotification(
            payload.guestId,
            payload.guestEmail,
            "booking_confirmed",
            `Booking ${payload.bookingId} confirmed`,
            `Your booking ${payload.bookingId} for ${payload.startDate} - ${payload.endDate} is confirmed. Total: $${payload.totalPrice}`
          );
          await sendMailNotification(
            payload.hostId,
            payload.hostEmail,
            "booking_confirmed_host",
            `New booking for listing ${payload.listingId}`,
            `You have a new confirmed booking (${payload.bookingId}) for listing ${payload.listingId}`
          );
          break;
        case "booking.failed":
          await sendMailNotification(
            payload.guestId,
            payload.guestEmail,
            "booking_failed",
            `Booking ${payload.bookingId} failed`,
            `Payment for booking ${payload.bookingId} failed. Your reservation was not completed.`
          );
          break;
        case "booking.cancelled":
          await sendMailNotification(
            payload.guestId,
            payload.guestEmail,
            "booking_cancelled",
            "Booking cancelled",
            `Booking ${payload.id ?? payload.bookingId} has been cancelled.`
          );
          break;
        case "payment.success":
          await sendMailNotification(
            payload.guestId,
            payload.guestEmail,
            "payment_receipt",
            `Payment receipt for booking ${payload.bookingId}`,
            `Payment of $${payload.amount} received for booking ${payload.bookingId}.`
          );
          break;
        case "payment.failed":
          await sendMailNotification(
            payload.guestId,
            payload.guestEmail,
            "payment_failed",
            `Payment failed for booking ${payload.bookingId}`,
            `Payment of $${payload.amount} for booking ${payload.bookingId} failed.`
          );
          break;
        default:
          console.warn(`[notification-service] Unhandled routing key: ${routingKey}`);
      }
    }
  );
}
