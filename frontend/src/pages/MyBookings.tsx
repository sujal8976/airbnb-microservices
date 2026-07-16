import { useEffect, useState, useCallback } from "react";
import type { Booking, Listing } from "../lib/api";
import { bookingApi, listingApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Ticket } from "../components/Ticket";

export function MyBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [listingTitles, setListingTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"guest" | "host">("guest");

  const load = useCallback(async () => {
    try {
      const result = await bookingApi.mine();
      setBookings(result);

      const missing = Array.from(new Set(result.map((b) => b.listingId))).filter((id) => !(id in listingTitles));
      if (missing.length > 0) {
        const fetched = await Promise.all(
          missing.map((id) => listingApi.get(id).then((l: Listing) => [id, l.title] as const).catch(() => [id, "Stay"] as const))
        );
        setListingTitles((prev) => ({ ...prev, ...Object.fromEntries(fetched) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any booking is still pending, since payment confirmation
  // arrives asynchronously via RabbitMQ on the backend.
  useEffect(() => {
    const hasPending = bookings.some((b) => b.status === "pending");
    if (!hasPending) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [bookings, load]);

  async function handleCancel(id: string) {
    try {
      await bookingApi.cancel(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-[1080px] px-6">
        <div className="py-16 text-center text-ink-soft">
          <h3 className="font-display text-ink">Log in to see your bookings</h3>
        </div>
      </div>
    );
  }

  const filtered = bookings.filter((b) => (tab === "guest" ? b.guestId === user.id : b.hostId === user.id));

  return (
    <div className="mx-auto max-w-[1080px] px-6">
      <div className="pt-10 pb-2">
        <h1 className="mb-1 font-display text-2xl italic">Your bookings</h1>
        <p className="mt-0 text-ink-soft">Tickets for every stay you've booked or hosted.</p>
      </div>
      <div className="mb-5 flex gap-1 border-b border-line">
        <button
          className={`cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-4 py-2.5 text-[0.9rem] ${
            tab === "guest" ? "border-marine font-semibold text-ink" : "border-transparent text-ink-soft"
          }`}
          onClick={() => setTab("guest")}
        >
          As guest
        </button>
        <button
          className={`cursor-pointer border-x-0 border-t-0 border-b-2 bg-transparent px-4 py-2.5 text-[0.9rem] ${
            tab === "host" ? "border-marine font-semibold text-ink" : "border-transparent text-ink-soft"
          }`}
          onClick={() => setTab("host")}
        >
          As host
        </button>
      </div>
      <div className="pb-16">
        {error && (
          <div className="mb-4 rounded-md border border-stamp-red bg-[#f6e4e0] px-3.5 py-2.5 text-[0.88rem] text-stamp-red">
            {error}
          </div>
        )}
        {loading ? (
          <div className="py-10 text-center font-mono text-ink-soft">Loading tickets…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-ink-soft">
            <h3 className="font-display text-ink">No bookings here yet</h3>
            <p>{tab === "guest" ? "Book a stay to see it appear here." : "Bookings on your listings will show up here."}</p>
          </div>
        ) : (
          filtered.map((b) => (
            <Ticket
              key={b.id}
              booking={b}
              listingTitle={listingTitles[b.listingId]}
              onCancel={tab === "guest" ? () => handleCancel(b.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
