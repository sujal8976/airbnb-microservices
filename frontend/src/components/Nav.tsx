import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-paper-raised">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-baseline gap-2 font-display text-2xl font-semibold italic tracking-wide text-ink no-underline">
          Waypost{" "}
          <span className="-translate-y-0.5 rounded-full border border-ink px-2 py-0.5 font-mono text-[0.7rem] not-italic">
            stays
          </span>
        </Link>
        <div className="flex items-center gap-5 text-[0.92rem]">
          <Link to="/" className="py-1.5 text-ink-soft no-underline hover:text-marine-deep">
            Browse
          </Link>
          {user && (user.role === "host" || user.role === "both") && (
            <Link to="/host/listings" className="py-1.5 text-ink-soft no-underline hover:text-marine-deep">
              My listings
            </Link>
          )}
          {user && (
            <Link to="/bookings" className="py-1.5 text-ink-soft no-underline hover:text-marine-deep">
              My bookings
            </Link>
          )}
          {user ? (
            <>
              <span className="text-ink-soft">{user.name}</span>
              <button
                onClick={handleLogout}
                className="cursor-pointer border-none bg-transparent py-1.5 text-[0.92rem] text-ink-soft hover:text-marine-deep"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="py-1.5 text-ink-soft no-underline hover:text-marine-deep">
                Log in
              </Link>
              <Link to="/register" className="no-underline">
                <button className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-marine px-4 py-2 text-[0.92rem] font-semibold text-white transition hover:bg-marine-deep active:translate-y-px">
                  Sign up
                </button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
