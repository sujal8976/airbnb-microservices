import type { Booking } from "../lib/api";

const STATUS_LABEL: Record<Booking["status"], string> = {
  pending: "Processing",
  confirmed: "Confirmed",
  failed: "Payment failed",
  cancelled: "Cancelled",
};

export function Ticket({
  booking,
  listingTitle,
  onCancel,
}: {
  booking: Booking;
  listingTitle?: string;
  onCancel?: () => void;
}) {
  const nights = Math.round(
    (new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="ticket-punch relative mb-[22px] grid grid-cols-[1fr_120px] overflow-hidden rounded-card border border-line bg-paper-raised shadow-card">
      <div className="flex flex-col gap-2.5 px-[22px] py-5">
        <div className="flex items-center gap-2.5 font-display text-[1.25rem]">
          <span>{listingTitle ?? "Stay"}</span>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-x-7 gap-y-1 font-mono text-[0.78rem] text-ink-soft">
          <div>
            CHECK-IN
            <strong className="mt-0.5 block text-[0.95rem] text-ink">{booking.startDate}</strong>
          </div>
          <div>
            CHECK-OUT
            <strong className="mt-0.5 block text-[0.95rem] text-ink">{booking.endDate}</strong>
          </div>
          <div>
            NIGHTS
            <strong className="mt-0.5 block text-[0.95rem] text-ink">{nights}</strong>
          </div>
          <div>
            TOTAL
            <strong className="mt-0.5 block text-[0.95rem] text-ink">${booking.totalPrice.toFixed(2)}</strong>
          </div>
          <div>
            BOOKING ID
            <strong className="mt-0.5 block text-[0.8rem] text-ink">{booking.id.slice(0, 8)}</strong>
          </div>
        </div>
        {onCancel && booking.status !== "cancelled" && (
          <div className="mt-2">
            <button
              onClick={onCancel}
              className="cursor-pointer rounded-md border border-stamp-red bg-transparent px-3.5 py-1.5 text-[0.82rem] font-semibold text-stamp-red transition hover:bg-stamp-red hover:text-white active:translate-y-px"
            >
              Cancel booking
            </button>
          </div>
        )}
      </div>
      <div className="ticket-stub">
        <span className={`stamp stamp-${booking.status}`}>{STATUS_LABEL[booking.status]}</span>
      </div>
    </div>
  );
}
