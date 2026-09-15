"use client";

import { ShieldAlert } from "lucide-react";

interface AccessCardProps {
  title: string;
  message: string;
}

export function AccessCard({ title, message }: AccessCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c1017] p-6 text-[#e8e7e4]">
      <div className="w-full max-w-xl rounded-2xl border border-[#29303c] bg-[#171d28] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#394252] bg-[#121721] text-amber-400">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="mt-6 space-y-2 text-left">
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="font-sans text-sm leading-relaxed text-slate-400">{message}</p>
        </div>
        <div className="mt-8 border-t border-[#29303c] pt-4 text-left">
          <p className="font-sans text-xs text-slate-500">Fluentia | 2026 Dedicated Access Protocol</p>
        </div>
      </div>
    </main>
  );
}