"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Search, Send, X } from "lucide-react";
import { fetchChatMessages, saveChatMessage } from "@/services/storage-service";
import type { ChatMessage } from "@/types/lesson";
import { deduplicateStudents, type StudentUser } from "@/lib/users";

type ChatTab = "active" | "all" | "support";

interface InstructorChatWidgetProps {
  activeStudent: StudentUser | null;
  students: StudentUser[];
  instructorId: string;
  lessonContext?: string;
}

interface MessageRow {
  id: string;
  student_id: string | null;
  instructor_id: string;
  sender_id: string;
  receiver_id: string;
  tab_type: "active" | "support";
  content: string;
  created_at: string;
}

function studentKey(student: StudentUser) {
  return student.token || student.id;
}

function threadKeyForId(identifier: string, students: StudentUser[]) {
  const student = students.find((entry) => entry.id === identifier || entry.token === identifier);
  return student ? studentKey(student) : identifier;
}

function toChatMessage(row: MessageRow, currentUserId: string): ChatMessage {
  return {
    id: row.id,
    tab: row.tab_type === "support" ? "support" : "instructor",
    text: row.content,
    sender: row.sender_id === currentUserId ? "team" : "student",
    createdAt: row.created_at,
  };
}

function appendUnique(messages: ChatMessage[], message: ChatMessage) {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message];
}

const triggerChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (error) {
    console.warn("Audio play blocked or unsupported:", error);
  }
};

export function InstructorChatWidget({ activeStudent, students, instructorId, lessonContext }: InstructorChatWidgetProps) {
  const uniqueStudents = useMemo(() => deduplicateStudents(students), [students]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ChatTab>("active");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [threadMessages, setThreadMessages] = useState<Record<string, ChatMessage[]>>({});
  const [supportMessages, setSupportMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByStudent, setUnreadByStudent] = useState<Record<string, number>>({});
  const [fallbackMode, setFallbackMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<ChatTab>("active");
  const openRef = useRef(false);
  const seenMessageIds = useRef(new Set<string>());
  const hasLoadedMessages = useRef(false);

  useEffect(() => setSelectedConversationId(null), [activeStudent?.id]);

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) closeChat();
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const loadMessages = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch("/api/chat", { cache: "no-store", credentials: "same-origin" });
        if (response.status === 401) {
          setFallbackMode(true);
          return;
        }
        if (!response.ok) return;
        const result = await response.json() as { messages: MessageRow[]; currentUserId: string };
        if (cancelled) return;
        const rows = Array.isArray(result.messages) ? result.messages : [];
        const nextThreads: Record<string, ChatMessage[]> = {};
        rows.filter((row) => row.tab_type === "active").forEach((row) => {
          const id = row.student_id || (row.sender_id === result.currentUserId ? row.receiver_id : row.sender_id);
          const key = threadKeyForId(id, uniqueStudents);
          nextThreads[key] = [...(nextThreads[key] || []), toChatMessage(row, result.currentUserId)];
        });
        const nextSupport = rows.filter((row) => row.tab_type === "support");
        if (hasLoadedMessages.current) {
          const incoming = rows.filter((row) => row.sender_id !== result.currentUserId && !seenMessageIds.current.has(row.id));
          if (incoming.length) {
            incoming.forEach(() => triggerChime());
            const unread = incoming.filter((row) => !openRef.current || row.tab_type !== tabRef.current);
            if (unread.length) setUnreadCount((count) => count + unread.length);
            const increments: Record<string, number> = {};
            unread.forEach((row) => {
              const id = row.student_id || row.sender_id;
              const key = threadKeyForId(id, uniqueStudents);
              increments[key] = (increments[key] || 0) + 1;
            });
            setUnreadByStudent((current) => {
              const next = { ...current };
              Object.entries(increments).forEach(([key, count]) => { next[key] = (next[key] || 0) + count; });
              return next;
            });
          }
        } else {
          setUnreadCount(0);
          setUnreadByStudent({});
        }
        rows.forEach((row) => seenMessageIds.current.add(row.id));
        hasLoadedMessages.current = true;
        setThreadMessages(nextThreads);
        setSupportMessages(nextSupport.map((row) => toChatMessage(row, result.currentUserId)));
      } catch (error) {
        if (!cancelled) console.error("Unable to load chat messages:", error);
      } finally {
        loading = false;
      }
    };
    void loadMessages();
    const pollTimer = window.setInterval(() => { void loadMessages(); }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [uniqueStudents, instructorId]);

  useEffect(() => {
    if (!fallbackMode) return;
    let cancelled = false;
    const loadLocalMessages = async () => {
      const entries = await Promise.all(uniqueStudents.map(async (student) => [studentKey(student), await fetchChatMessages(studentKey(student))] as const));
      if (cancelled) return;
      setThreadMessages(Object.fromEntries(entries));
      setSupportMessages((await fetchChatMessages("instructor-support")).filter((message) => message.tab === "support"));
    };
    void loadLocalMessages();
    return () => { cancelled = true; };
  }, [fallbackMode, uniqueStudents]);

  const filteredStudents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return normalizedSearch ? uniqueStudents.filter((student) => student.name.toLowerCase().includes(normalizedSearch)) : uniqueStudents;
  }, [search, uniqueStudents]);
  const conversationStudent = selectedConversationId ? uniqueStudents.find((student) => student.id === selectedConversationId) || activeStudent : activeStudent;
  const activeMessages = conversationStudent ? threadMessages[studentKey(conversationStudent)] || [] : [];
  const visibleMessages = tab === "support" ? supportMessages : activeMessages;
  const currentLabel = tab === "support" ? "Fluentia Support" : conversationStudent?.name || "No student selected";

  useEffect(() => {
    tabRef.current = tab;
  }, [tab, conversationStudent]);

  function openChat() {
    setOpen(true);
    openRef.current = true;
    setUnreadCount(0);
    setUnreadByStudent({});
  }

  function closeChat() {
    setOpen(false);
    openRef.current = false;
  }

  function viewStudentThread(studentId: string) {
    setSelectedConversationId(studentId);
    setTab("active");
    tabRef.current = "active";
    const selectedStudent = uniqueStudents.find((student) => student.id === studentId);
    const key = selectedStudent ? studentKey(selectedStudent) : studentId;
    const count = unreadByStudent[key] || 0;
    if (count > 0) {
      setUnreadCount((current) => Math.max(0, current - count));
      setUnreadByStudent((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedText = text.trim();
    const studentId = conversationStudent ? studentKey(conversationStudent) : null;
    if (!trimmedText || (tab !== "support" && !studentId)) return;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, content: trimmedText, studentId }),
      });
      if (response.status === 401) {
        setFallbackMode(true);
        const message: ChatMessage = { id: `${Date.now()}`, tab: tab === "support" ? "support" : "instructor", text: trimmedText, sender: "team", createdAt: new Date().toISOString() };
        const storageKey = tab === "support" ? "instructor-support" : studentId!;
        try {
          const nextMessages = await saveChatMessage(storageKey, message);
          if (tab === "support") setSupportMessages(nextMessages.filter((item) => item.tab === "support"));
          else setThreadMessages((current) => ({ ...current, [storageKey]: nextMessages.filter((item) => item.tab === "instructor") }));
        } catch (error) {
          console.warn("Local chat fallback is unavailable:", error);
          return;
        }
      } else if (!response.ok) {
        return;
      } else {
        const result = await response.json() as { message: MessageRow; currentUserId: string };
        const message = toChatMessage(result.message, result.currentUserId);
        seenMessageIds.current.add(result.message.id);
        if (tab === "support") setSupportMessages((current) => appendUnique(current, message));
        else setThreadMessages((current) => ({ ...current, [studentId!]: appendUnique(current[studentId!] || [], message) }));
      }
    } catch (error) {
      console.error("Unable to send chat message:", error);
      const message: ChatMessage = { id: `${Date.now()}`, tab: tab === "support" ? "support" : "instructor", text: trimmedText, sender: "team", createdAt: new Date().toISOString() };
      const storageKey = tab === "support" ? "instructor-support" : studentId!;
      try {
        const nextMessages = await saveChatMessage(storageKey, message);
        if (tab === "support") setSupportMessages(nextMessages.filter((item) => item.tab === "support"));
        else setThreadMessages((current) => ({ ...current, [storageKey]: nextMessages.filter((item) => item.tab === "instructor") }));
      } catch (fallbackError) {
        console.warn("Local chat fallback is unavailable:", fallbackError);
        return;
      }
    }
    setText("");
  }

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-40">
      <button type="button" onClick={() => open ? closeChat() : openChat()} aria-label={open ? "Close instructor chat" : "Open instructor chat"} className="relative flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 shadow-xl transition hover:bg-amber-500/20">
        <MessageCircle className="h-5 w-5" />
        {!open && unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[10px]  text-white">{unreadCount}</span>}
      </button>
      {open && <section className="absolute bottom-16 right-0 flex h-[500px] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/95 shadow-2xl backdrop-blur-md" role="dialog" aria-label="Instructor chat">
        <header className="border-b border-slate-800 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Fluentia Connect</p><h2 className="mt-1 text-sm font-semibold text-slate-100">Instructor messages</h2></div><button type="button" onClick={closeChat} aria-label="Close chat" className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button></div><div className="mt-4 grid grid-cols-3 gap-1 rounded-md bg-slate-950 p-1">{(["active", "all", "support"] as const).map((item) => <button key={item} type="button" onClick={() => { setTab(item); tabRef.current = item; setUnreadCount(0); setUnreadByStudent({}); if (item === "active") setSelectedConversationId(null); }} className={`rounded px-2 py-2 text-[11px]  transition ${tab === item ? "bg-amber-500/20 text-amber-400" : "text-slate-400 hover:text-slate-100"}`}>{item === "active" ? "Active Student" : item === "all" ? "All Students" : "Support"}</button>)}</div></header>
        {tab === "all" && <div className="border-b border-slate-800 p-3"><label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-400"><Search className="h-3.5 w-3.5" /><span className="sr-only">Search students</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students..." className="min-w-0 flex-1 bg-transparent text-slate-200 outline-none placeholder:text-slate-600" /></label></div>}
        {tab === "all" ? <div className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-950 min-h-0 flex-1 overflow-y-auto p-3"><div className="space-y-2">{filteredStudents.map((student) => { const messages = threadMessages[studentKey(student)] || []; return <button key={student.id} type="button" onClick={() => viewStudentThread(student.id)} className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition ${conversationStudent?.id === student.id ? "border-amber-500/40 bg-amber-500/20" : "border-slate-800 bg-slate-950/60 hover:border-slate-600"}`}><span className="min-w-0"><span className="block truncate text-xs  text-slate-200">{student.name}</span><span className="block truncate text-[10px] text-slate-500">{messages[messages.length - 1]?.text || "No messages yet"}</span></span>{(unreadByStudent[studentKey(student)] || messages.some((message) => message.sender === "student")) && <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-amber-500/20" />}</button>; })}{filteredStudents.length === 0 && <p className="p-4 text-center text-xs text-slate-500">No students match that search.</p>}</div></div> : <><div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><p className="text-xs font-semibold text-slate-100">{currentLabel}</p><p className="mt-0.5 text-[10px] text-slate-500">{tab === "support" ? "Platform support team" : lessonContext ? `Lesson: ${lessonContext}` : "Current workstation context"}</p></div>{tab === "active" && <span className="rounded-full border border-amber-500/40 px-2 py-1 text-[10px] text-amber-400">Locked context</span>}</div><div className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-950 min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{visibleMessages.length === 0 && <p className="text-xs leading-relaxed text-slate-500">{tab === "support" ? "Tell the Fluentia support team what you need help with." : conversationStudent ? `Start a conversation about ${conversationStudent.name}'s work.` : "Select a student to start a conversation."}</p>}{visibleMessages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-lg border p-3 text-xs leading-relaxed ${message.sender === "team" ? "ml-auto border-amber-500/40 bg-amber-500/20 text-amber-400" : "mr-auto border-slate-700/50 bg-slate-800/80 text-slate-200"}`}>{message.text}<time className="mt-1 block text-[9px] text-slate-500">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>)}</div><form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-800 p-3"><input value={text} onChange={(event) => setText(event.target.value)} placeholder={tab === "support" ? "Message support..." : "Message student..."} disabled={tab !== "support" && !conversationStudent} className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-amber-500/40 disabled:cursor-not-allowed disabled:opacity-50" /><button type="submit" aria-label="Send message" disabled={tab !== "support" && !conversationStudent} className="rounded-md bg-amber-500/20 px-3 text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button></form></>}
      </section>}
    </div>
  );
}
