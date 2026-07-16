import { pool } from "./db.js";
import { subscribeToEvents } from "./rabbitmq.js";

interface ListingEvent {
  id: string;
  hostId: string;
  title: string;
  description: string;
  price: number;
  location: string;
  amenities: string[];
  images: string[];
  availableFrom: string;
  availableTo: string;
  isActive: boolean;
}

/**
 * Upserts the search-optimized copy of a listing whenever the Listing
 * Service emits a create/update event. This is the async event-driven sync
 * that keeps Search decoupled from Listing's database.
 */
async function upsertListing(listing: ListingEvent) {
  await pool.query(
    `INSERT INTO listings_search
      (id, host_id, title, description, price, location, amenities, images, available_from, available_to, is_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     ON CONFLICT (id) DO UPDATE SET
       host_id = EXCLUDED.host_id,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       price = EXCLUDED.price,
       location = EXCLUDED.location,
       amenities = EXCLUDED.amenities,
       images = EXCLUDED.images,
       available_from = EXCLUDED.available_from,
       available_to = EXCLUDED.available_to,
       is_active = EXCLUDED.is_active,
       updated_at = now()`,
    [
      listing.id,
      listing.hostId,
      listing.title,
      listing.description,
      listing.price,
      listing.location,
      listing.amenities,
      listing.images,
      listing.availableFrom,
      listing.availableTo,
      listing.isActive ?? true,
    ]
  );
}

async function removeListing(id: string) {
  // Soft-consistent with Listing Service's soft-delete: mark inactive rather
  // than hard-deleting, so historical search analytics could still use it.
  await pool.query("UPDATE listings_search SET is_active = false, updated_at = now() WHERE id = $1", [id]);
}

export async function startSearchConsumer() {
  await subscribeToEvents(
    "search-service.listing-events",
    ["listing.created", "listing.updated", "listing.deleted"],
    async (routingKey, payload) => {
      if (routingKey === "listing.deleted") {
        await removeListing(payload.id);
      } else {
        await upsertListing(payload as ListingEvent);
      }
      console.log(`[search-service] Synced listing ${payload.id} via ${routingKey}`);
    }
  );
}
