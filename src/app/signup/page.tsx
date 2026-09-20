"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // Where the confirmation link should land: this deployment's own callback,
  // not whatever the Supabase "Site URL" happens to be set to.
  const redirectTo = () => `${window.location.origin}/auth/callback`;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function resend() {
    setResendMsg(null);
    setResendIn(30);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setResendMsg(error ? error.message : "Sent again — check your inbox and spam folder.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo() },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // If email confirmation is off in Supabase settings, there's already a session.
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center">
        <h1 className="mb-2 text-2xl font-bold text-white">Check your email</h1>
        <p className="text-sm text-zinc-400">
          We sent a confirmation link to {email}. Tap it, then come back and log in.
        </p>
        <button
          onClick={resend}
          disabled={resendIn > 0}
          className="mt-5 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 disabled:opacity-50"
        >
          {resendIn > 0 ? `Resend email (${resendIn}s)` : "Didn't get a link? Resend email"}
        </button>
        {resendMsg && <p className="mt-3 text-xs text-zinc-400">{resendMsg}</p>}
        <Link href="/login" className="mt-6 text-emerald-400">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-bold text-white">Create your account</h1>
      <p className="mb-8 text-sm text-zinc-400">Train. Track progress. Improve. Connect.</p>
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
          minLength={6}
          placeholder="Password (6+ characters)"
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
          {loading ? "Creating..." : "Sign up"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="text-emerald-400">
          Log in
        </Link>
      </p>
    </div>
  );
}
