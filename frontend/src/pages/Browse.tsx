import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Listing } from "../lib/api";
import { searchApi } from "../lib/api";

export function Browse() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const results = await searchApi.search({ location, startDate, endDate, minPrice, maxPrice });
      setListings(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldClasses =
    "rounded-md border border-line-strong bg-paper-raised px-3 py-2.5 text-[0.95rem] text-ink";
  const labelClasses = "text-[0.8rem] font-semibold uppercase tracking-wide text-ink-soft";

  return (
    <>
      <div className="border-b border-line pt-14 pb-8">
        <div className="mx-auto max-w-[1080px] px-6">
          <h1 className="mt-0 mb-2 max-w-[640px] font-display text-[2.6rem] italic font-medium leading-[1.15]">
            Find a place that feels like a detour worth taking.
          </h1>
          <p className="mb-7 max-w-[520px] text-[1.05rem] text-ink-soft">
            Search real stays from real hosts — filtered by where, when, and how much.
          </p>
          <form className="flex flex-wrap gap-2.5 rounded-card border border-line bg-paper-raised p-3.5 shadow-card" onSubmit={runSearch}>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
              <label className={labelClasses}>Where</label>
              <input
                placeholder="City or region"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={fieldClasses}
              />
            </div>
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <label className={labelClasses}>Check-in</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={fieldClasses} />
            </div>
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <label className={labelClasses}>Check-out</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={fieldClasses} />
            </div>
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <label className={labelClasses}>Min $</label>
              <input
                type="number"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className={`${fieldClasses} w-20`}
              />
            </div>
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <label className={labelClasses}>Max $</label>
              <input
                type="number"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className={`${fieldClasses} w-20`}
              />
            </div>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center justify-center gap-2 self-end rounded-md border border-transparent bg-marine px-[18px] py-2.5 font-semibold text-white transition hover:bg-marine-deep active:translate-y-px"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-6">
        {error && (
          <div className="mt-6 rounded-md border border-stamp-red bg-[#f6e4e0] px-3.5 py-2.5 text-[0.88rem] text-stamp-red">
            {error}
          </div>
        )}
        {loading ? (
          <div className="py-10 text-center font-mono text-ink-soft">Loading stays…</div>
        ) : listings.length === 0 ? (
          <div className="py-16 text-center text-ink-soft">
            <h3 className="font-display text-ink">No stays match yet</h3>
            <p>Try widening your dates or clearing a filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5 py-8 pb-16">
            {listings.map((l) => (
              <Link
                to={`/listings/${l.id}`}
                key={l.id}
                className="flex flex-col overflow-hidden rounded-card border border-line bg-paper-raised text-ink no-underline transition hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="listing-card-media relative h-[140px] bg-gradient-to-br from-marine to-marine-deep" data-loc={l.location} />
                <div className="flex flex-1 flex-col gap-1.5 px-4 pt-3.5 pb-[18px]">
                  <h3 className="m-0 font-display text-[1.1rem]">{l.title}</h3>
                  <div className="text-[0.85rem] text-ink-soft">{l.location}</div>
                  <div className="mt-auto font-mono font-medium text-marine-deep">${l.price.toFixed(2)} / night</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
