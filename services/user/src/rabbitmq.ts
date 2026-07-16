import type { Channel, ChannelModel } from "amqplib";
import amqplib from "amqplib";

const EXCHANGE = "airbnb.events";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

/**
 * Connects to RabbitMQ with basic retry, since the broker container may
 * still be starting up when this service boots.
 */
export async function connectRabbitMQ(retries = 10, delayMs = 3000): Promise<Channel> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      connection = await amqplib.connect(process.env.RABBITMQ_URL as string);
      channel = await connection.createChannel();
      await channel.assertExchange(EXCHANGE, "topic", { durable: true });
      console.log("[user-service] Connected to RabbitMQ");
      return channel;
    } catch (err) {
      console.warn(
        `[user-service] RabbitMQ connection attempt ${attempt}/${retries} failed, retrying in ${delayMs}ms...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Could not connect to RabbitMQ after multiple attempts");
}

/**
 * Publishes a domain event to the shared topic exchange.
 * routingKey examples: "user.registered"
 */
export async function publishEvent(routingKey: string, payload: unknown) {
  if (!channel) throw new Error("RabbitMQ channel not initialized");
  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
    contentType: "application/json",
    persistent: true,
  });
}
