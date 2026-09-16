"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { AccessCard } from "@/components/access/access-card";
import { STUDENT_USERS } from "@/lib/users";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true } },
);

export default function RootPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) {
        setCheckingSession(false);
        return;
      }
      const userEmail = data.user.email?.trim().toLowerCase() || "";
      if (userEmail === "aarashvoss@gmail.com") {
        router.replace("/instructor/avoss-9042");
      } else if (STUDENT_USERS.some((student) => student.email?.toLowerCase() === userEmail)) {
        router.replace("/dashboard");
      } else {
        await supabase.auth.signOut();
        if (!cancelled) setCheckingSession(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setIsSubmitting(true);
    setStatus(null);
    const { error } = await supabase.from("waitlist").insert({ email: normalizedEmail });
    if (error) {
      console.error("Waitlist request failed:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      setStatus(error.code === "23505" ? "That email is already on the waitlist." : "We could not save your request. Please try again.");
    } else {
      setEmail("");
      setStatus("Request received. We will contact you when access becomes available.");
    }
    setIsSubmitting(false);
  }

  if (checkingSession) return <main className="min-h-screen bg-[#0c1017]" />;

  return <AccessCard title="By Invitation Only" message="Access to Fluentia is currently reserved for private sessions and tailored learning environments. Please contact your instructor to receive your personal session pass.">
    <div className="mt-8 border-t border-[#29303c] pt-6 text-left">
      <h2 className="text-sm font-semibold text-white">Join the access waitlist</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">Leave your email and we will let you know when new invitations open.</p>
      <form onSubmit={(event) => void requestAccess(event)} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="waitlist-email">Email address</label>
        <input id="waitlist-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required autoComplete="email" className="min-w-0 flex-1 rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-slate-600 focus:border-amber-500" />
        <button type="submit" disabled={isSubmitting} className="rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-[#0c1017] transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">{isSubmitting ? "Requesting..." : "Request Access"}</button>
      </form>
      {status && <p className="mt-3 text-xs leading-relaxed text-amber-300" role="status">{status}</p>}
    </div>
    <Link href="/login" className="mt-6 flex items-center justify-center rounded-md border border-amber-500/60 px-4 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500 hover:text-[#0c1017]">Already have access? Sign In</Link>
  </AccessCard>;
}
