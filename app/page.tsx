"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/identity";

type WaitlistFieldErrors = Partial<Record<"name" | "email", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RootPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<WaitlistFieldErrors>({});
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

  async function submitWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const normalizedEmail = email.trim();
    const errors: WaitlistFieldErrors = {};
    if (!trimmedName) errors.name = "Enter your name.";
    else if (trimmedName.length > 120) errors.name = "Name must be 120 characters or fewer.";
    if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
      errors.email = "Enter a valid email address.";
    }

    setFieldErrors(errors);
    setIsSubmitting(true);
    setStatus(null);
    if (Object.keys(errors).length > 0) {
      setIsSubmitting(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: trimmedName, email: normalizedEmail }),
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setStatus(result.error || "We could not save your request. Please try again.");
        return;
      }
      setName("");
      setEmail("");
      setFieldErrors({});
      setStatus(result.message || "Your waitlist request has been saved.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Joining the waitlist timed out. Please try again.");
      } else {
        console.error("Waitlist request failed:", error);
        setStatus("We could not save your request. Please try again.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  }

  if (checkingSession) return <main className="min-h-screen bg-background" />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-background px-4 py-5 text-stone-100 sm:px-6 sm:py-6 lg:h-screen lg:overflow-hidden">
      <header className="mb-4 w-full max-w-xl text-center">
        <img src="/logo.png" alt="Fluentia logo" className="mx-auto h-12 w-12 object-contain" />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Fluentia</h1>
        <p className="mx-auto mt-1 whitespace-nowrap text-[10px] leading-tight text-slate-400 sm:text-xs">
          Content &amp; Language Integrated Learning (CLIL) for Academic Mastery
        </p>
      </header>

      <section
        aria-labelledby="invitation-title"
        className="w-full max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-8"
      >
        <h2 id="invitation-title" className="text-xl font-semibold tracking-tight text-white">
          By Invitation Only
        </h2>
        <p className="mt-2 text-sm leading-5 text-slate-400">
          Access to Fluentia is currently reserved for private sessions and tailored learning
          environments. Please contact your instructor to receive your personal session pass.
        </p>

        <div className="my-5 border-t border-border" />

        <section aria-labelledby="waitlist-title">
          <h3 id="waitlist-title" className="text-lg font-semibold text-white">
            Join the access waitlist
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            Leave your email and we will let you know when new invitations open.
          </p>

          <form noValidate onSubmit={(event) => void submitWaitlist(event)} className="mt-3 space-y-3">
            <label className="block text-sm text-slate-300">
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setFieldErrors((current) => ({ ...current, name: undefined }));
                }}
                autoComplete="name"
                maxLength={120}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "waitlist-name-error" : undefined}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none transition placeholder:text-slate-600 focus:border-amber-500/60"
              />
              {fieldErrors.name && (
                <span id="waitlist-name-error" className="mt-1 block text-xs text-rose-400" role="alert">
                  {fieldErrors.name}
                </span>
              )}
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="min-w-0 flex-1 text-sm text-slate-300">
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldErrors((current) => ({ ...current, email: undefined }));
                  }}
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@example.com"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "waitlist-email-error" : undefined}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none transition placeholder:text-slate-600 focus:border-amber-500/60"
                />
                {fieldErrors.email && (
                  <span id="waitlist-email-error" className="mt-1 block text-xs text-rose-400" role="alert">
                    {fieldErrors.email}
                  </span>
                )}
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="self-end rounded-md bg-amber-500/20 px-4 py-2.5 font-medium text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-60 sm:mb-0"
              >
                {isSubmitting ? "Requesting..." : "Request Access"}
              </button>
            </div>
          </form>
        </section>

        {status && (
          <p
            className="mt-5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
            role="status"
          >
            {status}
          </p>
        )}

        <Link
          href="/login"
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-md border border-amber-500/50 px-4 py-2.5 text-center font-medium text-amber-400 transition hover:bg-amber-500/10 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          Already have access? Sign In
        </Link>

        <footer className="mt-5 border-t border-border pt-4">
          <p className="text-xs text-slate-500">Fluentia | 2026 Dedicated Access Protocol</p>
        </footer>
      </section>
    </main>
  );
}
