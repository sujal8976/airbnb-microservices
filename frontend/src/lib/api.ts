const USER_API = import.meta.env.VITE_USER_API || "/api/user";
const LISTING_API = import.meta.env.VITE_LISTING_API || "/api/listing";
const SEARCH_API = import.meta.env.VITE_SEARCH_API || "/api/search";
const BOOKING_API = import.meta.env.VITE_BOOKING_API || "/api/booking";
const PAYMENT_API = import.meta.env.VITE_PAYMENT_API || "/api/payment";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "guest" | "host" | "both";
  created_at?: string;
}

export interface Listing {
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
  isActive?: boolean;
}

export interface Booking {
  id: string;
  listingId: string;
  guestId: string;
  hostId: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: "pending" | "confirmed" | "failed" | "cancelled";
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  status: "success" | "failed";
  createdAt: string;
}

function getToken(): string | null {
  return localStorage.getItem("waypost_token");
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = body?.error
      ? typeof body.error === "string"
        ? body.error
        : JSON.stringify(body.error)
      : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const authApi = {
  register: (data: { name: string; email: string; password: string; role: string }) =>
    request<{ user: User; token: string }>(`${USER_API}/auth/register`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<{ user: User; token: string }>(`${USER_API}/auth/login`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  me: () => request<User>(`${USER_API}/me`),
};

export const listingApi = {
  create: (data: Partial<Listing>) =>
    request<Listing>(`${LISTING_API}/listings`, { method: "POST", body: JSON.stringify(data) }),
  get: (id: string) => request<Listing>(`${LISTING_API}/listings/${id}`),
  byHost: (hostId: string) => request<Listing[]>(`${LISTING_API}/listings?hostId=${hostId}`),
  update: (id: string, data: Partial<Listing>) =>
    request<Listing>(`${LISTING_API}/listings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: string) => request<void>(`${LISTING_API}/listings/${id}`, { method: "DELETE" }),
};

export const searchApi = {
  search: (params: { location?: string; startDate?: string; endDate?: string; minPrice?: string; maxPrice?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v) as [string, string][]);
    return request<Listing[]>(`${SEARCH_API}/search?${qs.toString()}`);
  },
};

export const bookingApi = {
  create: (data: { listingId: string; startDate: string; endDate: string }) =>
    request<Booking & { message: string }>(`${BOOKING_API}/bookings`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  mine: () => request<Booking[]>(`${BOOKING_API}/bookings`),
  get: (id: string) => request<Booking>(`${BOOKING_API}/bookings/${id}`),
  cancel: (id: string) => request<Booking>(`${BOOKING_API}/bookings/${id}/cancel`, { method: "POST" }),
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBookingPayment(bookingId: string): Promise<Payment | null> {
  const res = await fetch(`${PAYMENT_API}/payments/booking/${bookingId}`);

  if (res.status === 404) return null;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = body?.error ? (typeof body.error === "string" ? body.error : JSON.stringify(body.error)) : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as Payment;
}

export const paymentApi = {
  getBookingPayment: (bookingId: string) => fetchBookingPayment(bookingId),
  pollBookingPayment: async (
    bookingId: string,
    options: { intervalMs?: number; timeoutMs?: number } = {}
  ): Promise<Payment> => {
    const intervalMs = options.intervalMs ?? 2000;
    const timeoutMs = options.timeoutMs ?? 30000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const payment = await fetchBookingPayment(bookingId);
      if (payment && (payment.status === "success" || payment.status === "failed")) {
        return payment;
      }

      await sleep(intervalMs);
    }

    throw new Error("Timed out waiting for payment confirmation");
  },
};

export function saveSession(user: User, token: string) {
  localStorage.setItem("waypost_token", token);
  localStorage.setItem("waypost_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("waypost_token");
  localStorage.removeItem("waypost_user");
}

export function getSessionUser(): User | null {
  const raw = localStorage.getItem("waypost_user");
  return raw ? JSON.parse(raw) : null;
}
