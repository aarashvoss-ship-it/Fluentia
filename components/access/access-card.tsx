"use client";

import type React from "react";

interface AccessCardProps {
  title: string;
  message: string;
  children?: React.ReactNode;
}

export function AccessCard({ title, message, children }: AccessCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c1017] p-6 text-[#e8e7e4]">
      <div className="w-full max-w-xl rounded-2xl border border-[#29303c] bg-[#171d28] p-8 text-center shadow-2xl">
        <img src="/logo.png" alt="Fluentia" className="mx-auto h-16 w-16 object-contain" />
        <div className="mt-6 space-y-2 text-left">
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="font-sans text-sm leading-relaxed text-slate-400">{message}</p>
        </div>
        {children}
        <div className="mt-8 border-t border-[#29303c] pt-4 text-left">
          <p className="font-sans text-xs text-slate-500">Fluentia | 2026 Dedicated Access Protocol</p>
        </div>
      </div>
    </main>
  );
}