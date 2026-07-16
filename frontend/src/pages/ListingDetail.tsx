import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Listing } from "../lib/api";
import { listingApi, bookingApi } from "../lib/api";
import { useAuth } from "../lib/auth";

export function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    listingApi
      .get(id)
      .then(setListing)
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [id]);

  const nights =
    startDate && endDate
      ? Math.max(0, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))
      : 0;
  const total = listing ? nights * listing.price : 0;

  async function handleBook(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      navigate("/login");
      return;
    }
    if (!id) return;
    setBooking(true);
    setError(null);
    setBookingResult(null);
    try {
      const result = await bookingApi.create({ listingId: id, startDate, endDate });
      setBookingResult(
        `Booking created (status: ${result.status}). Payment is processing — check "My bookings" in a few seconds for confirmation.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBooking(false);
    }
  }

  if (loading) return <div className="py-10 text-center font-mono text-ink-soft">Loading listing…</div>;
  if (error && !listing)
    return (
      <div className="mx-auto max-w-[1080px] px-6">
        <div className="mt-6 rounded-md border border-stamp-red bg-[#f6e4e0] px-3.5 py-2.5 text-[0.88rem] text-stamp-red">
          {error}
        </div>
      </div>
    );
  if (!listing) return null;

  return (
    <div className="mx-auto max-w-[1080px] px-6">
      <div className="grid grid-cols-[1.6fr_1fr] gap-10 py-10 pb-20 max-md:grid-cols-1">
        <div>
          <div className="mb-6 h-[280px] rounded-card bg-gradient-to-br from-marine to-marine-deep" />
          <h1 className="mb-1 mt-0 font-display text-[2rem]">{listing.title}</h1>
          <div className="mb-5 text-ink-soft">{listing.location}</div>
          <p>{listing.description}</p>
          {listing.amenities.length > 0 && (
            <div className="my-4 flex flex-wrap gap-2">
              {listing.amenities.map((a) => (
                <span className="rounded-full border border-line-strong px-3 py-1 text-[0.82rem] text-ink-soft" key={a}>
                  {a}
                </span>
              ))}
            </div>
          )}
          <p className="text-[0.88rem] text-ink-soft">
            Available {listing.availableFrom} — {listing.availableTo}
          </p>
        </div>

        <div className="sticky top-[90px] h-fit rounded-card border border-line bg-paper-raised p-[22px] shadow-card">
          <div className="mb-4 font-mono text-[1.3rem]">
            ${listing.price.toFixed(2)} <span className="text-[0.85rem] font-normal text-ink-soft">/ night</span>
          </div>
          {error && (
            <div className="mb-4 rounded-md border border-stamp-red bg-[#f6e4e0] px-3.5 py-2.5 text-[0.88rem] text-stamp-red">
              {error}
            </div>
          )}
          {bookingResult ? (
            <div className="mb-4 rounded-md border border-marine bg-[#e3efe9] px-3.5 py-2.5 text-[0.88rem] text-marine-deep">
              {bookingResult}
            </div>
          ) : (
            <form onSubmit={handleBook}>
              <div className="mb-4 flex flex-col gap-1.5">
                <label className="text-[0.8rem] font-semibold uppercase tracking-wide text-ink-soft">Check-in</label>
                <input
                  type="date"
                  min={listing.availableFrom}
                  max={listing.availableTo}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="rounded-md border border-line-strong bg-paper-raised px-3 py-2.5 text-[0.95rem] text-ink"
                />
              </div>
              <div className="mb-4 flex flex-col gap-1.5">
                <label className="text-[0.8rem] font-semibold uppercase tracking-wide text-ink-soft">Check-out</label>
                <input
                  type="date"
                  min={startDate || listing.availableFrom}
                  max={listing.availableTo}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="rounded-md border border-line-strong bg-paper-raised px-3 py-2.5 text-[0.95rem] text-ink"
                />
              </div>
              {nights > 0 && (
                <p className="mb-4 font-mono text-[0.88rem]">
                  {nights} night{nights !== 1 ? "s" : ""} · ${total.toFixed(2)} total
                </p>
              )}
              <button
                type="submit"
                disabled={booking}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-marine px-[18px] py-2.5 font-semibold text-white transition hover:bg-marine-deep active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              >
                {booking ? "Booking…" : user ? "Book this stay" : "Log in to book"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
