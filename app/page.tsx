"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/identity";

type ModalMode = "waitlist" | "signin";
type WaitlistFieldErrors = Partial<Record<"name" | "email", string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Authorized users configuration with unique custom passwords
const CORE_USERS: Record<string, { name: string; role: string; pass: string }> = {
  "aarashvoss@gmail.com": {
    name: "AVoss",
    role: "instructor",
    pass: "AvossFluentiaPass14!", // Custom password for AVoss
  },
  "aarashvossoughi@gmail.com": {
    name: "Arash Vossoughi",
    role: "student",
    pass: "ArashFluentiaTempPass14!", // Custom password for Arash Vossoughi
  },
  "f.soheilikia.lastqueen2002@gmail.com": {
    name: "Fateme Soheilikia",
    role: "student",
    pass: "FluentiaTempPassFateme2026!", // Custom password for Fateme Soheilikia
  },
};

export default function RootPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ModalMode>("waitlist");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    if (!trimmedName) {
      errors.name = "Enter your name.";
    } else if (trimmedName.length > 120) {
      errors.name = "Name must be 120 characters or fewer.";
    }
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

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: trimmedName, email: normalizedEmail }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        setStatus(result.error || "We could not save your request. Please try again.");
        return;
      }
      setName("");
      setEmail("");
      setFieldErrors({});
      setStatus(result.message || "Your waitlist request has been saved.");
    } catch (error) {
      console.error("Waitlist request failed:", error);
      setStatus("We could not save your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    const normalizedEmail = email.trim().toLowerCase();
    const coreUser = CORE_USERS[normalizedEmail];

    // Verify password if email matches one of the core users
    if (coreUser && password !== coreUser.pass) {
      setStatus("Invalid email or password.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: normalizedEmail,
          password: password,
          name: coreUser ? coreUser.name : undefined,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        user?: { role: string };
      };

      if (!response.ok || !result.user) {
        setStatus(result.error || "Sign-in failed. Check your email and password.");
        return;
      }

      router.replace(
        result.user.role === "instructor" || result.user.role === "admin"
          ? "/instructor"
          : "/dashboard"
      );
    } catch (error) {
      console.error("Landing page sign-in failed:", error);
      setStatus("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checkingSession) return <main className="min-h-screen bg-background" />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-stone-100">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <section
        aria-labelledby="welcome-title"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">Fluentia</p>
        <h1 id="welcome-title" className="mt-3 text-2xl font-semibold">
          {mode === "waitlist" ? "Welcome to Fluentia" : "Already have access?"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-400">
          {mode === "waitlist"
            ? "Join the waitlist for tailored language learning and instructor-led sessions."
            : "Sign in to continue to your learning workspace."}
        </p>

        {mode === "waitlist" ? (
          <form noValidate onSubmit={(event) => void submitWaitlist(event)} className="mt-6 space-y-4">
            <label className="block text-sm text-stone-300">
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
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none focus:border-amber-500/40"
              />
              {fieldErrors.name && (
                <span id="waitlist-name-error" className="mt-1 block text-xs text-rose-400" role="alert">
                  {fieldErrors.name}
                </span>
              )}
            </label>
            <label className="block text-sm text-stone-300">
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
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "waitlist-email-error" : undefined}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none focus:border-amber-500/40"
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
              className="w-full rounded-md bg-amber-500/20 px-4 py-2.5 text-sm text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? "Joining..." : "Join the waitlist"}
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void signIn(event)} className="mt-6 space-y-4">
            <label className="block text-sm text-stone-300">
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                maxLength={254}
                placeholder="Enter your email"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none focus:border-amber-500/40"
              />
            </label>
            <label className="block text-sm text-stone-300">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                maxLength={72}
                placeholder="Enter password"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none focus:border-amber-500/40"
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-amber-500/20 px-4 py-2.5 text-sm text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        {status && (
          <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300" role="status">
            {status}
          </p>
        )}

        <div className="mt-6 border-t border-border pt-5 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "waitlist" ? "signin" : "waitlist");
              setStatus(null);
              setPassword("");
            }}
            className="text-sm text-amber-400 transition hover:text-amber-300"
          >
            {mode === "waitlist" ? "Already have access?" : "Back to the waitlist"}
          </button>
        </div>
      </section>
    </main>
  );
}

