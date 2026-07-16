import amqplib from "amqplib";
import type { Channel, ChannelModel } from "amqplib";

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
      console.log("[booking-service] Connected to RabbitMQ");
      return channel;
    } catch (err) {
      console.warn(
        `[booking-service] RabbitMQ connection attempt ${attempt}/${retries} failed, retrying in ${delayMs}ms...`
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

/**
 * Declares a durable queue bound to one or more routing key patterns on the
 * shared topic exchange, and invokes `handler` for each message received.
 * Acks on success; nacks (without requeue) on handler failure so a bad
 * message doesn't poison-loop the queue forever.
 */
export async function subscribeToEvents(
  queueName: string,
  routingKeys: string[],
  handler: (routingKey: string, payload: any) => Promise<void>
) {
  if (!channel) throw new Error("RabbitMQ channel not initialized");
  await channel.assertQueue(queueName, { durable: true });
  for (const key of routingKeys) {
    await channel.bindQueue(queueName, EXCHANGE, key);
  }
  channel.consume(queueName, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(msg.fields.routingKey, payload);
      channel!.ack(msg);
    } catch (err) {
      console.error(`Error handling message on ${queueName}`, err);
      channel!.nack(msg, false, false);
    }
  });
  console.log(`Subscribed queue "${queueName}" to [${routingKeys.join(", ")}]`);
}
