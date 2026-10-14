"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessCard } from "@/components/access/access-card";
import { getAuthenticatedUser } from "@/lib/identity";

export default function RootPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getAuthenticatedUser().then((user) => {
      if (cancelled) return;
      if (user?.role === "instructor" || user?.role === "admin") {
        router.replace("/instructor");
      } else if (user?.role === "student") {
        router.replace("/dashboard");
      } else {
        setCheckingSession(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { error?: string; message?: string };

      if (!response.ok) {
        setStatus(result.error || "We could not save your request. Please try again.");
        return;
      }

      setEmail("");
      setStatus(result.message || "Your request has been submitted. We will contact you soon.");
    } catch (error) {
      console.error("Waitlist request failed:", error);
      setStatus("We could not save your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checkingSession) return <main className="min-h-screen bg-background" />;

  return (
    <AccessCard
      title="By Invitation Only"
      message="Access to Fluentia is currently reserved for private sessions and tailored learning environments. Please contact your instructor to receive your personal session pass."
    >
      <div className="mt-8 border-t border-border pt-6 text-left">
        <h2 className="text-sm font-semibold text-white">Join the access waitlist</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Leave your email and we will let you know when new invitations open.
        </p>
        <form onSubmit={(event) => void requestAccess(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="waitlist-email">Email address</label>
          <input
            id="waitlist-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            maxLength={254}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-slate-600 focus:border-amber-500/40"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-amber-500/20 px-4 py-2.5 text-sm text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? "Requesting..." : "Request Access"}
          </button>
        </form>
        {status && <p className="mt-3 text-xs leading-relaxed text-amber-400" role="status">{status}</p>}
      </div>
      <Link
        href="/login"
        className="mt-6 flex items-center justify-center rounded-md border border-amber-500/40 px-4 py-2.5 text-sm font-normal text-amber-400 transition hover:bg-amber-500/20 hover:text-amber-400"
      >
        Already have access? Sign In
      </Link>
    </AccessCard>
  );
}
