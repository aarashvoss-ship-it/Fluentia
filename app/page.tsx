import React from "react";
import { ShieldAlert } from "lucide-react";

export default function RootPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-xl w-full text-center space-y-6 bg-surface border border-border-subtle p-8 rounded-2xl shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-full bg-surface-elevated border border-border-strong flex items-center justify-center text-accent">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-white mb-4 text-left">
           By Invitation Only
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed font-sans mb-8 text-left">
           Access to Fluentia is currently reserved for private sessions and tailored learning environments. Please contact your instructor to receive your personal session pass.
          </p>
        </div>

        <div className="pt-4 border-t border-border-subtle text-left">
          <p className="text-xs text-text-muted">
            Fluentia | 2022 Dedicated Access Protocol
          </p>
        </div>
      </div>
    </main>
  );
}
