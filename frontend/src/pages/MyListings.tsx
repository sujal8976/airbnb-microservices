import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Listing } from "../lib/api";
import { listingApi } from "../lib/api";
import { useAuth } from "../lib/auth";

export function MyListings() {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listingApi
      .byHost(user.id)
      .then(setListings)
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [user]);

  async function handleDelete(id: string) {
    if (!confirm("Remove this listing?")) return;
    try {
      await listingApi.remove(id);
      setListings((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-[1080px] px-6">
        <div className="py-16 text-center text-ink-soft">
          <h3 className="font-display text-ink">Log in to manage listings</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1080px] px-6">
      <div className="flex items-end justify-between pt-10 pb-2">
        <div>
          <h1 className="mb-1 font-display text-2xl italic">Your listings</h1>
          <p className="mt-0 text-ink-soft">Manage the places you host.</p>
        </div>
        <Link to="/host/listings/new">
          <button className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-marine px-[18px] py-2.5 font-semibold text-white transition hover:bg-marine-deep active:translate-y-px">
            + New listing
          </button>
        </Link>
      </div>
      <div className="py-6 pb-16">
        {error && (
          <div className="mb-4 rounded-md border border-stamp-red bg-[#f6e4e0] px-3.5 py-2.5 text-[0.88rem] text-stamp-red">
            {error}
          </div>
        )}
        {loading ? (
          <div className="py-10 text-center font-mono text-ink-soft">Loading…</div>
        ) : listings.length === 0 ? (
          <div className="py-16 text-center text-ink-soft">
            <h3 className="font-display text-ink">No listings yet</h3>
            <p>Publish your first place to start hosting.</p>
          </div>
        ) : (
          listings.map((l) => (
            <div
              className="mb-3 flex items-center justify-between rounded-lg border border-line bg-paper-raised px-[18px] py-3.5"
              key={l.id}
            >
              <div className="flex flex-col">
                <strong className="font-display text-[1.05rem]">{l.title}</strong>
                <span className="text-[0.85rem] text-ink-soft">
                  {l.location} · ${l.price.toFixed(2)}/night
                </span>
              </div>
              <div className="flex gap-2">
                <Link to={`/listings/${l.id}`}>
                  <button className="cursor-pointer rounded-md border border-ink bg-transparent px-[18px] py-2.5 font-semibold text-ink transition hover:bg-ink hover:text-paper active:translate-y-px">
                    View
                  </button>
                </Link>
                <button
                  onClick={() => handleDelete(l.id)}
                  className="cursor-pointer rounded-md border border-stamp-red bg-transparent px-[18px] py-2.5 font-semibold text-stamp-red transition hover:bg-stamp-red hover:text-white active:translate-y-px"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
