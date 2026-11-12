"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_WALLET_CREDIT_AMOUNT,
  MEMBERSHIP_BADGE_LABELS,
  MEMBERSHIP_TIERS,
  MIN_WALLET_CREDIT_AMOUNT,
  type MembershipTier,
} from "@/types/membership";

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
  dailyDeductionEnabled: boolean;
  dailyDeductionRate: number;
};

const DEFAULT_CREDIT_RULES: CreditRuleSettings = {
  dailyDeductionEnabled: false,
  dailyDeductionRate: 3,
};

const numberInputClassName = "[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function formatCredits(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function MembershipWalletPanel() {
  const [students, setStudents] = useState<MembershipStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [membershipTier, setMembershipTier] = useState<MembershipTier>("Associate");
  const [creditMode, setCreditMode] = useState<CreditMode>("set");
  const [creditAmount, setCreditAmount] = useState("");
  const creditAmountDirty = useRef(false);
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
  const [creditRules, setCreditRules] = useState<CreditRuleSettings>(DEFAULT_CREDIT_RULES);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [ledgerRefresh, setLedgerRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [ledgerNotice, setLedgerNotice] = useState<string | null>(null);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null;

  useEffect(() => {
    if (selectedStudent && creditMode === "set" && !creditAmountDirty.current) {
      setCreditAmount(String(selectedStudent.creditBalance));
    }
  }, [selectedStudent?.id, selectedStudent?.creditBalance, creditMode]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/instructor/membership")
      .then(async (response) => {
        const result = await response.json() as { students?: MembershipStudent[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load student memberships.");
        if (!cancelled) {
          const nextStudents = result.students || [];
          const firstStudent = nextStudents[0];
          setStudents(nextStudents);
          setSelectedStudentId(firstStudent?.id || "");
          if (firstStudent) {
            setMembershipTier(firstStudent.membershipTier);
            setCreditAmount(String(firstStudent.creditBalance));
            creditAmountDirty.current = false;
            setIsScholarship(firstStudent.isScholarship);
            setShowWalletWidget(firstStudent.showWalletWidget);
          }
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
          creditBalance?: number;
          error?: string;
        };
        if (!response.ok || !result.transactions || !result.rules || typeof result.creditBalance !== "number") {
          throw new Error(result.error || "Unable to load the student credit ledger.");
        }
        if (!cancelled) {
          const creditBalance = result.creditBalance;
          setTransactions(result.transactions);
          setCreditRules(result.rules);
          setStudents((current) => current.map((student) => student.id === selectedStudentId
            ? { ...student, creditBalance }
            : student));
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
    const availableTopUp = selectedStudent.creditLimit - selectedStudent.creditBalance;
    const maximumAmount = creditMode === "set"
      ? MAX_WALLET_CREDIT_AMOUNT
      : Math.min(MAX_WALLET_CREDIT_AMOUNT, availableTopUp);
    if (!Number.isInteger(amount) || amount < MIN_WALLET_CREDIT_AMOUNT || amount > maximumAmount) {
      setError(creditMode === "top_up"
        ? `Enter a whole-number top-up from ${MIN_WALLET_CREDIT_AMOUNT} to ${maximumAmount}.`
        : `Enter a whole-number balance from ${MIN_WALLET_CREDIT_AMOUNT} to ${MAX_WALLET_CREDIT_AMOUNT}.`);
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
      if (creditMode === "set" && typeof result.student.creditBalance === "number") {
        setCreditAmount(String(result.student.creditBalance));
      }
      creditAmountDirty.current = false;
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
    if (!Number.isFinite(amount) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8
      || amount < 0.01 || !transactionDescription.trim()) {
      setLedgerError("Enter a valid credit amount (up to two decimal places) and transaction description.");
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
          instructorNote: transactionDescription.trim(),
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
      const result = await response.json() as { rules?: CreditRuleSettings; creditBalance?: number; error?: string };
      if (!response.ok || !result.rules) throw new Error(result.error || "Unable to save credit rule settings.");
      setCreditRules(result.rules);
      setLedgerRefresh((current) => current + 1);
      if (typeof result.creditBalance === "number") {
        const creditBalance = result.creditBalance;
        setStudents((current) => current.map((student) => student.id === selectedStudent.id
          ? { ...student, creditBalance }
          : student));
      }
      setLedgerNotice("Daily credit rule saved. Charges are processed once per UTC day.");
    } catch (saveError: unknown) {
      setLedgerError(saveError instanceof Error ? saveError.message : "Unable to save credit rule settings.");
    } finally {
      setIsSavingRules(false);
    }
  };

  return (
    <section className="w-full min-w-0 space-y-6" aria-labelledby="membership-wallet-title">
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
            <select value={selectedStudentId} onChange={(event) => {
              const nextStudent = students.find((student) => student.id === event.target.value);
              setSelectedStudentId(event.target.value);
              if (nextStudent) {
                setMembershipTier(nextStudent.membershipTier);
                setCreditAmount(String(nextStudent.creditBalance));
                creditAmountDirty.current = false;
                setIsScholarship(nextStudent.isScholarship);
                setShowWalletWidget(nextStudent.showWalletWidget);
                setCreditMode("set");
              }
            }} disabled={isSaving || isSavingTransaction || isSavingRules} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-100 [color-scheme:dark] disabled:opacity-60">
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
                      creditAmountDirty.current = false;
                    }} className={`rounded px-3 py-1.5 text-xs transition ${creditMode === mode ? "bg-amber-500/15 text-amber-300" : "text-stone-400 hover:text-stone-200"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="block space-y-1.5 text-xs text-stone-400">
                  {creditMode === "set" ? "New balance" : "Credits to add"}
                  <input type="number" min={MIN_WALLET_CREDIT_AMOUNT} max={creditMode === "set" ? MAX_WALLET_CREDIT_AMOUNT : Math.min(MAX_WALLET_CREDIT_AMOUNT, selectedStudent.creditLimit - selectedStudent.creditBalance)} step={1} value={creditAmount} onChange={(event) => {
                    creditAmountDirty.current = true;
                    setCreditAmount(event.target.value);
                  }} className={`h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-stone-100 ${numberInputClassName}`} />
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
                <p className="mt-1 text-xs text-stone-500">Instructor-only transaction history. Changes update the student’s live wallet balance.</p>
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
                  <input type="number" min={0.01} max={1000} step={0.01} value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} className={`h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-stone-100 ${numberInputClassName}`} />
                </label>
                <label className="space-y-1 text-xs text-stone-400 sm:col-span-2">
                  Instructor description / note · private
                  <input maxLength={200} value={transactionDescription} onChange={(event) => setTransactionDescription(event.target.value)} placeholder="e.g. 50-minute online session" className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-stone-100 placeholder:text-stone-600" />
                </label>
                <div className="flex items-center justify-between gap-3 sm:col-span-2">
                  <span className="text-[10px] text-stone-500">Balance: {formatCredits(selectedStudent.creditBalance)} / {selectedStudent.creditLimit}</span>
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
                      <th className="px-3 py-2.5 font-medium">Row (#)</th>
                      <th className="px-3 py-2.5 font-medium">Date / Time</th>
                      <th className="px-3 py-2.5 font-medium">Description · private</th>
                      <th className="px-3 py-2.5 text-right font-medium">Credit (+)</th>
                      <th className="px-3 py-2.5 text-right font-medium">Debit (−)</th>
                      <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLedgerLoading ? (
                      <tr><td colSpan={6} className="px-3 py-5 text-center text-stone-500">Loading ledger...</td></tr>
                    ) : transactions.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-5 text-center text-stone-500">No transactions recorded yet.</td></tr>
                    ) : transactions.map((transaction, index) => (
                      <tr key={transaction.id} className="text-stone-300">
                        <td className="px-3 py-2.5 text-stone-400">{index + 1}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-stone-400">{new Date(transaction.createdAt).toLocaleString()}</td>
                        <td className="max-w-64 px-3 py-2.5 text-stone-300">{transaction.instructorNote || transaction.description}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{transaction.type === "credit" ? `+${formatCredits(transaction.amount)}` : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-300">{transaction.type === "debit" ? `−${formatCredits(transaction.amount)}` : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-stone-100">{formatCredits(transaction.balanceAfter)}</td>
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
                <p className="mt-1 text-xs text-stone-500">Set the student’s daily charge from their monthly subscription plan.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-stone-400">
                  Daily subscription rate · credits per day
                  <input type="number" min={0.01} max={1000} step={0.01} value={creditRules.dailyDeductionRate} onChange={(event) => setCreditRules((current) => ({ ...current, dailyDeductionRate: Number(event.target.value) }))} className={`h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-stone-100 ${numberInputClassName}`} />
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-xs text-stone-300">
                <input type="checkbox" checked={creditRules.dailyDeductionEnabled} onChange={(event) => setCreditRules((current) => ({ ...current, dailyDeductionEnabled: event.target.checked }))} className="mt-0.5 accent-amber-500" />
                <span><span className="block font-medium text-stone-200">Enable automatic daily deduction</span><span className="mt-1 block text-[10px] text-stone-500">Applied once per UTC calendar day. Missed dates are caught up when the student’s wallet is accessed.</span></span>
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
