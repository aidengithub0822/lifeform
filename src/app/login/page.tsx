"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GoogleButton, { OrDivider } from "@/components/GoogleButton";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-bold text-white">Welcome back</h1>
      <p className="mb-8 text-sm text-zinc-400">Train. Track progress. Improve.</p>
      <GoogleButton />
      <OrDivider />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-emerald-500"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-emerald-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-black disabled:opacity-60"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-400">
        No account?{" "}
        <Link href="/signup" className="text-emerald-400">
          Sign up
        </Link>
      </p>
    </div>
  );
}
