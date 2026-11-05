"use client";

import { useEffect, useState } from "react";
import { MEMBERSHIP_BADGE_LABELS, MEMBERSHIP_TIERS, type MembershipTier } from "@/types/membership";

type MembershipStudent = {
  id: string;
  fullName: string;
  email: string;
  membershipTier: MembershipTier;
  creditBalance: number;
  creditLimit: number;
  showWalletWidget: boolean;
  isScholarship: boolean;
};

type CreditMode = "set" | "top_up";

export function MembershipWalletPanel() {
  const [students, setStudents] = useState<MembershipStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [membershipTier, setMembershipTier] = useState<MembershipTier>("Associate");
  const [creditMode, setCreditMode] = useState<CreditMode>("set");
  const [creditAmount, setCreditAmount] = useState("100");
  const [isScholarship, setIsScholarship] = useState(false);
  const [showWalletWidget, setShowWalletWidget] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/instructor/membership")
      .then(async (response) => {
        const result = await response.json() as { students?: MembershipStudent[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load student memberships.");
        if (!cancelled) {
          const nextStudents = result.students || [];
          setStudents(nextStudents);
          setSelectedStudentId(nextStudents[0]?.id || "");
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load student memberships.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    setMembershipTier(selectedStudent.membershipTier);
    setCreditAmount(String(selectedStudent.creditBalance));
    setIsScholarship(selectedStudent.isScholarship);
    setShowWalletWidget(selectedStudent.showWalletWidget);
    setCreditMode("set");
  }, [selectedStudent]);

  const saveMembership = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudent) return;
    const amount = Number(creditAmount);
    if (!Number.isInteger(amount) || amount < (creditMode === "top_up" ? 1 : 0)) {
      setError(creditMode === "top_up" ? "Enter a top-up amount greater than zero." : "Enter a non-negative whole-number balance.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/instructor/membership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          membershipTier,
          creditMode,
          creditAmount: amount,
          isScholarship,
          showWalletWidget,
        }),
      });
      const result = await response.json() as { student?: Partial<MembershipStudent>; error?: string };
      if (!response.ok || !result.student) throw new Error(result.error || "Unable to save membership updates.");
      setStudents((current) => current.map((student) => student.id === selectedStudent.id
        ? { ...student, ...result.student }
        : student));
      setNotice("Membership and wallet updated.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save membership updates.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="max-w-3xl space-y-6" aria-labelledby="membership-wallet-title">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Instructor administration</p>
        <h2 id="membership-wallet-title" className="mt-1 text-xl font-semibold text-stone-100">Membership &amp; Wallet</h2>
        <p className="mt-1 text-sm text-stone-500">Manage public academic tiers and evaluation credits.</p>
      </header>

      {isLoading ? <p className="text-sm text-stone-500">Loading student accounts...</p> : students.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-stone-400">No student accounts are available.</p>
      ) : (
        <form onSubmit={saveMembership} className="space-y-5 rounded-lg border border-border bg-surface p-5">
          <label className="block space-y-1.5 text-xs font-medium text-stone-400">
            Student account
            <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-100 [color-scheme:dark]">
              {students.map((student) => <option key={student.id} value={student.id}>{student.fullName} · {student.email}</option>)}
            </select>
          </label>

          {selectedStudent && (
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-medium text-stone-400">
                Academic membership tier
                <select value={membershipTier} onChange={(event) => setMembershipTier(event.target.value as MembershipTier)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-100 [color-scheme:dark]">
                  {MEMBERSHIP_TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                </select>
                <span className="block pt-1 text-[10px] uppercase tracking-[0.12em] text-amber-400">Public badge: {MEMBERSHIP_BADGE_LABELS[membershipTier]}</span>
              </label>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-stone-400">Credit balance · {selectedStudent.creditBalance} / {selectedStudent.creditLimit}</legend>
                <div className="inline-flex rounded-md border border-border p-1" role="group" aria-label="Credit adjustment mode">
                  {([['set', 'Set balance'], ['top_up', 'Top up']] as const).map(([mode, label]) => (
                    <button key={mode} type="button" aria-pressed={creditMode === mode} onClick={() => {
                      setCreditMode(mode);
                      setCreditAmount(mode === "set" ? String(selectedStudent.creditBalance) : "10");
                    }} className={`rounded px-3 py-1.5 text-xs transition ${creditMode === mode ? "bg-amber-500/15 text-amber-300" : "text-stone-400 hover:text-stone-200"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="block space-y-1.5 text-xs text-stone-400">
                  {creditMode === "set" ? "New balance" : "Credits to add"}
                  <input type="number" min={creditMode === "set" ? 0 : 1} max={creditMode === "set" ? selectedStudent.creditLimit : selectedStudent.creditLimit - selectedStudent.creditBalance} step={1} value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-100" />
                </label>
              </fieldset>
            </div>
          )}

          <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-xs text-stone-300">
            <input type="checkbox" checked={isScholarship} onChange={(event) => setIsScholarship(event.target.checked)} className="mt-0.5 accent-amber-500" />
            <span><span className="block font-medium text-stone-200">Internal scholarship status</span><span className="mt-1 block text-[10px] text-stone-500">Staff only. This flag is never shown on the student profile or public badge.</span></span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-xs text-stone-300">
            <input type="checkbox" checked={showWalletWidget} onChange={(event) => setShowWalletWidget(event.target.checked)} className="mt-0.5 accent-amber-500" />
            <span><span className="block font-medium text-stone-200">Show wallet on student sidebar</span><span className="mt-1 block text-[10px] text-stone-500">Off by default. Enable only for student accounts selected for wallet testing.</span></span>
          </label>

          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
          {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
          <div className="flex justify-end border-t border-border pt-4">
            <button type="submit" disabled={!selectedStudent || isSaving || (creditMode === "top_up" && selectedStudent.creditBalance >= selectedStudent.creditLimit)} className="rounded-md bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? "Saving..." : "Save membership"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
