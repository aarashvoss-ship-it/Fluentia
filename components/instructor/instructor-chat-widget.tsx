"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Search, Send, X } from "lucide-react";
import { fetchChatMessages, saveChatMessage } from "@/services/storage-service";
import type { ChatMessage } from "@/types/lesson";
import type { StudentUser } from "@/lib/users";

type ChatTab = "active" | "all" | "support";

interface InstructorChatWidgetProps {
  activeStudent: StudentUser | null;
  students: StudentUser[];
  lessonContext?: string;
}

function studentKey(student: StudentUser) {
  return student.token || student.id;
}

export function InstructorChatWidget({ activeStudent, students, lessonContext }: InstructorChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ChatTab>("active");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [threadMessages, setThreadMessages] = useState<Record<string, ChatMessage[]>>({});
  const [supportMessages, setSupportMessages] = useState<ChatMessage[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedConversationId(null);
  }, [activeStudent?.id]);

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadThreads = async () => {
      const entries = await Promise.all(students.map(async (student) => [studentKey(student), await fetchChatMessages(studentKey(student))] as const));
      if (cancelled) return;
      setThreadMessages(Object.fromEntries(entries));
      setSupportMessages((await fetchChatMessages("instructor-support")).filter((message) => message.tab === "support"));
    };
    void loadThreads();
    return () => { cancelled = true; };
  }, [open, students]);

  const filteredStudents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return students;
    return students.filter((student) => student.name.toLowerCase().includes(normalizedSearch));
  }, [search, students]);

  const conversationStudent = selectedConversationId
    ? students.find((student) => student.id === selectedConversationId) || activeStudent
    : activeStudent;
  const activeMessages = conversationStudent ? threadMessages[studentKey(conversationStudent)] || [] : [];
  const unreadCount = Object.values(threadMessages).flat().filter((message) => message.sender === "student").length;
  const visibleMessages = tab === "support" ? supportMessages : activeMessages;
  const currentLabel = tab === "support" ? "Fluentia Support" : conversationStudent?.name || "No student selected";

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const message: ChatMessage = {
      id: `${Date.now()}`,
      tab: tab === "support" ? "support" : "instructor",
      text: trimmedText,
      sender: "team",
      createdAt: new Date().toISOString(),
    };
    const storageKey = tab === "support" ? "instructor-support" : conversationStudent ? studentKey(conversationStudent) : undefined;
    if (!storageKey) return;
    const nextMessages = await saveChatMessage(storageKey, message);
    if (tab === "support") setSupportMessages(nextMessages.filter((item) => item.tab === "support"));
    else setThreadMessages((current) => ({ ...current, [storageKey]: nextMessages.filter((item) => item.tab === "instructor") }));
    setText("");
  }

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-40">
      <button type="button" onClick={() => setOpen((current) => !current)} aria-label={open ? "Close instructor chat" : "Open instructor chat"} className="relative flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-xl transition hover:bg-amber-400">
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        {!open && unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#0c1017] bg-red-500 px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <section className="absolute bottom-16 right-0 flex h-[500px] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/95 shadow-2xl" role="dialog" aria-label="Instructor chat">
          <header className="border-b border-slate-800 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Fluentia Connect</p>
                <h2 className="mt-1 text-sm font-semibold text-slate-100">Instructor messages</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1 rounded-md bg-slate-950 p-1">
              {(["active", "all", "support"] as const).map((item) => <button key={item} type="button" onClick={() => { setTab(item); if (item === "active") setSelectedConversationId(null); }} className={`rounded px-2 py-2 text-[11px] font-semibold transition ${tab === item ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-100"}`}>{item === "active" ? "Active Student" : item === "all" ? "All Students" : "Support"}</button>)}
            </div>
          </header>

          {tab === "all" && <div className="border-b border-slate-800 p-3"><label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-400"><Search className="h-3.5 w-3.5" /><span className="sr-only">Search students</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students..." className="min-w-0 flex-1 bg-transparent text-slate-200 outline-none placeholder:text-slate-600" /></label></div>}

          {tab === "all" ? <div className="min-h-0 flex-1 overflow-y-auto p-3"><div className="space-y-2">{filteredStudents.map((student) => { const messages = threadMessages[studentKey(student)] || []; return <button key={student.id} type="button" onClick={() => { setSelectedConversationId(student.id); setTab("active"); }} className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition ${conversationStudent?.id === student.id ? "border-amber-500/50 bg-amber-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-600"}`}><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-200">{student.name}</span><span className="block truncate text-[10px] text-slate-500">{messages[messages.length - 1]?.text || "No messages yet"}</span></span>{messages.some((message) => message.sender === "student") && <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-amber-400" />}</button>; })}{filteredStudents.length === 0 && <p className="p-4 text-center text-xs text-slate-500">No students match that search.</p>}</div></div> : <><div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><p className="text-xs font-semibold text-slate-100">{currentLabel}</p><p className="mt-0.5 text-[10px] text-slate-500">{tab === "support" ? "Platform support team" : lessonContext ? `Lesson: ${lessonContext}` : "Current workstation context"}</p></div>{tab === "active" && <span className="rounded-full border border-amber-500/30 px-2 py-1 text-[10px] text-amber-300">Locked context</span>}</div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{visibleMessages.length === 0 && <p className="text-xs leading-relaxed text-slate-500">{tab === "support" ? "Tell the Fluentia support team what you need help with." : conversationStudent ? `Start a conversation about ${conversationStudent.name}'s work.` : "Select a student to start a conversation."}</p>}{visibleMessages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-lg p-3 text-xs leading-relaxed ${message.sender === "team" ? "ml-auto bg-amber-500/15 text-amber-100" : "bg-slate-950 text-slate-300"}`}>{message.text}<time className="mt-1 block text-[9px] text-slate-500">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>)}</div><form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-800 p-3"><input value={text} onChange={(event) => setText(event.target.value)} placeholder={tab === "support" ? "Message support..." : "Message student..."} disabled={tab !== "support" && !conversationStudent} className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50" /><button type="submit" aria-label="Send message" disabled={tab !== "support" && !conversationStudent} className="rounded-md bg-amber-500 px-3 text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button></form></>}
        </section>
      )}
    </div>
  );
}
