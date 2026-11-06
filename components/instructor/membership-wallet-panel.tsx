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
type LedgerTransaction = {
  id: string;
  type: "credit" | "debit";
  amount: number;
  balanceAfter: number;
  description: string;
  instructorNote: string;
  createdAt: string;
};
type CreditRuleSettings = {
  automationMode: "manual" | "automated";
  dailyDeductionEnabled: boolean;
  dailyDeductionRate: 2 | 3;
};

const DEFAULT_CREDIT_RULES: CreditRuleSettings = {
  automationMode: "manual",
  dailyDeductionEnabled: false,
  dailyDeductionRate: 2,
};

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
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [transactionType, setTransactionType] = useState<"credit" | "debit">("credit");
  const [transactionAmount, setTransactionAmount] = useState("10");
  const [transactionDescription, setTransactionDescription] = useState("");
  const [transactionNote, setTransactionNote] = useState("");
  const [creditRules, setCreditRules] = useState<CreditRuleSettings>(DEFAULT_CREDIT_RULES);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [ledgerRefresh, setLedgerRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerNotice, setLedgerNotice] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedStudentId) {
      setTransactions([]);
      setCreditRules(DEFAULT_CREDIT_RULES);
      return;
    }

    let cancelled = false;
    setIsLedgerLoading(true);
    setLedgerError(null);
    void fetch(`/api/instructor/membership/ledger?studentId=${encodeURIComponent(selectedStudentId)}`)
      .then(async (response) => {
        const result = await response.json() as {
          transactions?: LedgerTransaction[];
          rules?: CreditRuleSettings;
          error?: string;
        };
        if (!response.ok || !result.transactions || !result.rules) {
          throw new Error(result.error || "Unable to load the student credit ledger.");
        }
        if (!cancelled) {
          setTransactions(result.transactions);
          setCreditRules(result.rules);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setLedgerError(loadError instanceof Error ? loadError.message : "Unable to load the student credit ledger.");
      })
      .finally(() => {
        if (!cancelled) setIsLedgerLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedStudentId, ledgerRefresh]);

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
      setLedgerRefresh((current) => current + 1);
      setNotice("Membership and wallet updated.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save membership updates.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveTransaction = async () => {
    if (!selectedStudent) return;
    const amount = Number(transactionAmount);
    if (!Number.isInteger(amount) || amount < 1 || !transactionDescription.trim()) {
      setLedgerError("Enter a whole-number amount and transaction description.");
      return;
    }

    setIsSavingTransaction(true);
    setLedgerError(null);
    setLedgerNotice(null);
    try {
      const response = await fetch("/api/instructor/membership/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          type: transactionType,
          amount,
          description: transactionDescription.trim(),
          instructorNote: transactionNote.trim(),
        }),
      });
      const result = await response.json() as {
        transaction?: LedgerTransaction;
        creditBalance?: number;
        error?: string;
      };
      const transaction = result.transaction;
      const creditBalance = result.creditBalance;
      if (!response.ok || !transaction || typeof creditBalance !== "number") {
        throw new Error(result.error || "Unable to save the credit transaction.");
      }
      setLedgerRefresh((current) => current + 1);
      setStudents((current) => current.map((student) => student.id === selectedStudent.id
        ? { ...student, creditBalance }
        : student));
      setTransactionAmount("10");
      setTransactionDescription("");
      setTransactionNote("");
      setLedgerNotice("Transaction recorded.");
    } catch (saveError: unknown) {
      setLedgerError(saveError instanceof Error ? saveError.message : "Unable to save the credit transaction.");
    } finally {
      setIsSavingTransaction(false);
    }
  };

  const saveCreditRules = async () => {
    if (!selectedStudent) return;
    setIsSavingRules(true);
    setLedgerError(null);
    setLedgerNotice(null);
    try {
      const response = await fetch("/api/instructor/membership/ledger", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selectedStudent.id, ...creditRules }),
      });
      const result = await response.json() as { rules?: CreditRuleSettings; error?: string };
      if (!response.ok || !result.rules) throw new Error(result.error || "Unable to save credit rule settings.");
      setCreditRules(result.rules);
      setLedgerNotice("Credit rule settings saved. Automated deductions remain inactive.");
    } catch (saveError: unknown) {
      setLedgerError(saveError instanceof Error ? saveError.message : "Unable to save credit rule settings.");
    } finally {
      setIsSavingRules(false);
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
        <div className="space-y-5">
        <form onSubmit={saveMembership} className="space-y-5 rounded-lg border border-border bg-surface p-5">
          <label className="block space-y-1.5 text-xs font-medium text-stone-400">
            Student account
            <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} disabled={isSaving || isSavingTransaction || isSavingRules} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-100 [color-scheme:dark] disabled:opacity-60">
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
        {selectedStudent && (
          <>
            <section className="space-y-4 rounded-lg border border-border bg-surface p-5" aria-labelledby="student-credit-ledger-title">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Account history</p>
                <h3 id="student-credit-ledger-title" className="mt-1 text-base font-semibold text-stone-100">Credit ledger</h3>
                <p className="mt-1 text-xs text-stone-500">Transactions adjust the selected student’s available balance immediately.</p>
              </div>

              <div className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-stone-400">
                  Transaction type
                  <select value={transactionType} onChange={(event) => setTransactionType(event.target.value as "credit" | "debit")} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-stone-100 [color-scheme:dark]">
                    <option value="credit">Credit / top-up</option>
                    <option value="debit">Debit / adjustment</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-stone-400">
                  Amount
                  <input type="number" min={1} max={1000} step={1} value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-stone-100" />
                </label>
                <label className="space-y-1 text-xs text-stone-400 sm:col-span-2">
                  Description
                  <input maxLength={200} value={transactionDescription} onChange={(event) => setTransactionDescription(event.target.value)} placeholder="e.g. Evaluation credit top-up" className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-stone-100 placeholder:text-stone-600" />
                </label>
                <label className="space-y-1 text-xs text-stone-400 sm:col-span-2">
                  Instructor note
                  <textarea maxLength={500} rows={2} value={transactionNote} onChange={(event) => setTransactionNote(event.target.value)} placeholder="Internal note for this transaction" className="w-full rounded-md border border-border bg-surface px-2 py-2 text-sm text-stone-100 placeholder:text-stone-600" />
                </label>
                <div className="flex items-center justify-between gap-3 sm:col-span-2">
                  <span className="text-[10px] text-stone-500">Balance: {selectedStudent.creditBalance} / {selectedStudent.creditLimit}</span>
                  <button type="button" onClick={() => void saveTransaction()} disabled={isSavingTransaction || isLedgerLoading} className="rounded-md bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50">
                    {isSavingTransaction ? "Recording..." : "Record transaction"}
                  </button>
                </div>
              </div>

              {ledgerError && <p role="alert" className="text-xs text-red-300">{ledgerError}</p>}
              {ledgerNotice && <p role="status" className="text-xs text-emerald-300">{ledgerNotice}</p>}

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-background text-[10px] uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Date / Time</th>
                      <th className="px-3 py-2.5 font-medium">Type</th>
                      <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-3 py-2.5 text-right font-medium">Running balance</th>
                      <th className="px-3 py-2.5 font-medium">Description</th>
                      <th className="px-3 py-2.5 font-medium">Instructor note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLedgerLoading ? (
                      <tr><td colSpan={6} className="px-3 py-5 text-center text-stone-500">Loading ledger...</td></tr>
                    ) : transactions.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-5 text-center text-stone-500">No transactions recorded yet.</td></tr>
                    ) : transactions.map((transaction) => (
                      <tr key={transaction.id} className="text-stone-300">
                        <td className="whitespace-nowrap px-3 py-2.5 text-stone-400">{new Date(transaction.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2.5">
                          <span className={transaction.type === "credit" ? "text-emerald-300" : "text-amber-300"}>
                            {transaction.type === "credit" ? "Credit" : "Debit"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{transaction.type === "credit" ? "+" : "−"}{transaction.amount}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-stone-100">{transaction.balanceAfter}</td>
                        <td className="px-3 py-2.5">{transaction.description}</td>
                        <td className="max-w-48 px-3 py-2.5 text-stone-400">{transaction.instructorNote || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border bg-surface p-5" aria-labelledby="credit-rules-title">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Configuration</p>
                <h3 id="credit-rules-title" className="mt-1 text-base font-semibold text-stone-100">Flexible credit rules</h3>
                <p className="mt-1 text-xs text-stone-500">These settings are saved for this student. Automated deductions are not active.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-stone-400">
                  Automation mode
                  <select value={creditRules.automationMode} onChange={(event) => setCreditRules((current) => ({ ...current, automationMode: event.target.value as CreditRuleSettings["automationMode"] }))} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-stone-100 [color-scheme:dark]">
                    <option value="manual">Manual</option>
                    <option value="automated">Automated (inactive)</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-stone-400">
                  Daily deduction rate
                  <select value={creditRules.dailyDeductionRate} onChange={(event) => setCreditRules((current) => ({ ...current, dailyDeductionRate: Number(event.target.value) as 2 | 3 }))} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-stone-100 [color-scheme:dark]">
                    <option value={2}>2 credits per day</option>
                    <option value={3}>3 credits per day</option>
                  </select>
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-xs text-stone-300">
                <input type="checkbox" checked={creditRules.dailyDeductionEnabled} onChange={(event) => setCreditRules((current) => ({ ...current, dailyDeductionEnabled: event.target.checked }))} className="mt-0.5 accent-amber-500" />
                <span><span className="block font-medium text-stone-200">Enable daily deduction rule</span><span className="mt-1 block text-[10px] text-stone-500">Configuration only. No credits will be deducted automatically.</span></span>
              </label>
              <div className="flex justify-end border-t border-border pt-3">
                <button type="button" onClick={() => void saveCreditRules()} disabled={isSavingRules || isLedgerLoading} className="rounded-md bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50">
                  {isSavingRules ? "Saving..." : "Save credit rules"}
                </button>
              </div>
            </section>
          </>
        )}
        </div>
      )}
    </section>
  );
}
