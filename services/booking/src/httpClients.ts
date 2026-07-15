import axios from "axios";

const listingClient = axios.create({
  baseURL: process.env.LISTING_SERVICE_URL,
  timeout: 5000,
});

const userClient = axios.create({
  baseURL: process.env.USER_SERVICE_URL,
  timeout: 5000,
});

export interface ListingSnapshot {
  id: string;
  hostId: string;
  title: string;
  price: number;
  availableFrom: string;
  availableTo: string;
  isActive: boolean;
}

export interface UserSnapshot {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Sync REST call: Booking needs the listing's price + availability window
 * *right now* to decide whether to accept the booking, so this can't be async. */
export async function getListing(listingId: string): Promise<ListingSnapshot | null> {
  try {
    const res = await listingClient.get(`/listings/${listingId}`);
    return res.data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw new Error(`Listing service unavailable: ${err.message}`);
  }
}

/** Sync REST call: Booking needs to confirm the guest is a real, existing
 * user before creating a reservation on their behalf. */
export async function getUser(userId: string): Promise<UserSnapshot | null> {
  try {
    const res = await userClient.get(`/users/${userId}`);
    return res.data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw new Error(`User service unavailable: ${err.message}`);
  }
}
