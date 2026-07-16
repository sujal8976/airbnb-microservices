import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, token } = await authApi.login({ email, password });
      login(user, token);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto my-12 max-w-[460px] rounded-card border border-line bg-paper-raised p-7 shadow-card">
      <h1 className="mt-0 font-display text-[1.7rem]">Welcome back</h1>
      {error && (
        <div className="mb-4 rounded-md border border-stamp-red bg-[#f6e4e0] px-3.5 py-2.5 text-[0.88rem] text-stamp-red">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="mb-4 flex flex-col gap-1.5">
          <label className="text-[0.8rem] font-semibold uppercase tracking-wide text-ink-soft">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-md border border-line-strong bg-paper-raised px-3 py-2.5 text-[0.95rem] text-ink"
          />
        </div>
        <div className="mb-4 flex flex-col gap-1.5">
          <label className="text-[0.8rem] font-semibold uppercase tracking-wide text-ink-soft">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-md border border-line-strong bg-paper-raised px-3 py-2.5 text-[0.95rem] text-ink"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-marine px-[18px] py-2.5 font-semibold text-white transition hover:bg-marine-deep active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
      <div className="mt-4 text-center text-[0.88rem] text-ink-soft">
        New here? <Link to="/register">Create an account</Link>
      </div>
    </div>
  );
}
