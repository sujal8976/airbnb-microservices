import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { listingApi } from "../lib/api";
import { useAuth } from "../lib/auth";

export function CreateListing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [amenities, setAmenities] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableTo, setAvailableTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fieldClasses =
    "rounded-md border border-line-strong bg-paper-raised px-3 py-2.5 text-[0.95rem] text-ink";
  const labelClasses = "text-[0.8rem] font-semibold uppercase tracking-wide text-ink-soft";

  if (!user || (user.role !== "host" && user.role !== "both")) {
    return (
      <div className="mx-auto max-w-[1080px] px-6">
        <div className="py-16 text-center text-ink-soft">
          <h3 className="font-display text-ink">Hosts only</h3>
          <p>Sign up as a host to list a place.</p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const listing = await listingApi.create({
        title,
        description,
        price: Number(price),
        location,
        amenities: amenities
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        availableFrom,
        availableTo,
      });
      navigate(`/listings/${listing.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1080px] px-6">
      <div className="pt-10 pb-2">
        <h1 className="mb-1 font-display text-2xl italic">List a new place</h1>
        <p className="mt-0 text-ink-soft">Give travelers the details that make your place worth a detour.</p>
      </div>
      <div className="mx-auto my-12 max-w-[560px] rounded-card border border-line bg-paper-raised p-7 shadow-card">
        {error && (
          <div className="mb-4 rounded-md border border-stamp-red bg-[#f6e4e0] px-3.5 py-2.5 text-[0.88rem] text-stamp-red">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4 flex flex-col gap-1.5">
            <label className={labelClasses}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={fieldClasses} />
          </div>
          <div className="mb-4 flex flex-col gap-1.5">
            <label className={labelClasses}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${fieldClasses} min-h-[90px] resize-y`}
            />
          </div>
          <div className="flex gap-3">
            <div className="mb-4 flex flex-1 flex-col gap-1.5">
              <label className={labelClasses}>Price / night ($)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className={fieldClasses}
              />
            </div>
            <div className="mb-4 flex flex-1 flex-col gap-1.5">
              <label className={labelClasses}>Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} required className={fieldClasses} />
            </div>
          </div>
          <div className="mb-4 flex flex-col gap-1.5">
            <label className={labelClasses}>Amenities (comma-separated)</label>
            <input
              placeholder="Wifi, Kitchen, Parking"
              value={amenities}
              onChange={(e) => setAmenities(e.target.value)}
              className={fieldClasses}
            />
          </div>
          <div className="flex gap-3">
            <div className="mb-4 flex flex-1 flex-col gap-1.5">
              <label className={labelClasses}>Available from</label>
              <input
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                required
                className={fieldClasses}
              />
            </div>
            <div className="mb-4 flex flex-1 flex-col gap-1.5">
              <label className={labelClasses}>Available to</label>
              <input
                type="date"
                value={availableTo}
                onChange={(e) => setAvailableTo(e.target.value)}
                required
                className={fieldClasses}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-marine px-[18px] py-2.5 font-semibold text-white transition hover:bg-marine-deep active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Publishing…" : "Publish listing"}
          </button>
        </form>
      </div>
    </div>
  );
}
