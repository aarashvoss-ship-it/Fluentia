"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AccessCard } from "@/components/access/access-card";
import { INSTRUCTOR_TOKEN } from "@/lib/lesson-store";
import { findUser } from "@/lib/users";

export default function InstructorDashboardPage() {
  const params = useParams<{ token: string }>();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <main className="min-h-screen bg-[#0c1017] text-[#e8e7e4]" />;
  }

  if (params?.token !== INSTRUCTOR_TOKEN) {
    return <AccessCard title="Access Denied" message="This instructor workstation requires a valid instructor session token." />;
  }

  const instructorName = findUser(params.token)?.name || "AVoss";

  return (
    <main className="min-h-screen bg-[#0c1017] px-6 py-10 text-[#e8e7e4]">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-[#202631] pb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">Fluentia Instructor Studio</p>
          <h1 className="mt-3 font-[var(--font-fraunces)] text-3xl font-semibold text-[#f1eee8]">Instructor Dashboard</h1>
          <p className="mt-2 text-sm text-[#8f98a8]">Manage published lessons and student workspaces.</p>
        </header>
        <section className="pt-8 text-left" aria-label="Instructor workstation">
          <h2 className="font-sans text-2xl font-semibold text-stone-100">Welcome, {instructorName}</h2>
          <Link href={`/instructor/${INSTRUCTOR_TOKEN}/lessons/habits-01`} className="mt-5 inline-flex rounded-md bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400">
            Open Workstation
          </Link>
        </section>
      </div>
    </main>
  );
}
