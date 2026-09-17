"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { resolveUserUuid } from "@/lib/identity";
import { ChatMessage } from "@/types/lesson";

interface ChatWidgetProps {
  messages: ChatMessage[];
  onSend: (message: ChatMessage) => void;
  instructorId?: string;
}

interface MessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  tab_type: "active" | "support";
  content: string;
  created_at: string;
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

function toChatMessage(row: MessageRow, currentUserId: string): ChatMessage {
  return {
    id: row.id,
    tab: row.tab_type === "support" ? "support" : "instructor",
    text: row.content,
    sender: row.sender_id === currentUserId ? "student" : "team",
    createdAt: row.created_at,
  };
}

function appendUnique(messages: ChatMessage[], message: ChatMessage) {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message];
}

export function ChatWidget({ messages, onSend, instructorId }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"instructor" | "support">("instructor");
  const [text, setText] = useState("");
  const [remoteMessages, setRemoteMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [resolvedStudentId, setResolvedStudentId] = useState("");
  const [resolvedInstructorId, setResolvedInstructorId] = useState(instructorId || "");
  const openRef = useRef(false);
  const tabRef = useRef(tab);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void resolveUserUuid().then(async (studentUuid) => {
      if (!studentUuid) return;
      setResolvedStudentId(studentUuid);
      if (instructorId) {
        setResolvedInstructorId(instructorId);
        return;
      }
      const { data } = await supabase.from("profiles").select("id").eq("role", "instructor").limit(1).maybeSingle();
      if (data?.id) setResolvedInstructorId(data.id);
    }).catch((error) => console.error("Unable to resolve chat identities:", error));
  }, [instructorId]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    const loadMessages = async () => {
      const { data, error } = await supabase.from("messages")
        .select("id, sender_id, receiver_id, tab_type, content, created_at")
        .order("created_at", { ascending: true });
      if (!cancelled && !error && data) setRemoteMessages((data as MessageRow[]).map((row) => toChatMessage(row, resolvedStudentId)));
    };
    void loadMessages();
    const channel = supabase.channel("public:messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as MessageRow;
        if (row.sender_id !== resolvedStudentId && row.receiver_id !== resolvedStudentId && row.tab_type !== "support") return;
        const message = toChatMessage(row, resolvedStudentId);
        setRemoteMessages((current) => appendUnique(current, message));
        if (row.sender_id === resolvedStudentId) return;
        triggerChime();
        if (!openRef.current || row.tab_type !== tabRef.current) setUnreadCount((count) => count + 1);
      })
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [resolvedStudentId]);

  const visible = (isSupabaseConfigured() ? remoteMessages : messages).filter((message) => message.tab === tab);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedText = text.trim();
    if (!trimmedText) return;
    if (isSupabaseConfigured()) {
      const [senderUuid, receiverUuid] = await Promise.all([
        resolveUserUuid(),
        Promise.resolve(resolvedInstructorId || null),
      ]);
      if (!senderUuid || !receiverUuid) return;
      const { data, error } = await supabase.from("messages").insert({
        sender_id: senderUuid,
        receiver_id: receiverUuid,
        tab_type: tab === "support" ? "support" : "active",
        content: trimmedText,
      }).select("id, sender_id, receiver_id, tab_type, content, created_at").single();
      if (error || !data) return;
      setRemoteMessages((current) => appendUnique(current, toChatMessage(data as MessageRow, senderUuid)));
    } else {
      onSend({ id: `${Date.now()}`, tab, text: trimmedText, sender: "student", createdAt: new Date().toISOString() });
    }
    setText("");
  }

  function openChat() {
    setOpen(true);
    openRef.current = true;
    setUnreadCount(0);
  }

  function closeChat() {
    setOpen(false);
    openRef.current = false;
  }

  return <div className="fixed bottom-6 right-6 z-40">
    <button type="button" onClick={() => open ? closeChat() : openChat()} className="relative flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-xl transition hover:bg-amber-400" aria-label={open ? "Close chat" : "Open chat"}>
      <MessageCircle className="h-5 w-5" />
      {!open && unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-slate-950 bg-red-500 px-1 text-[10px] font-bold text-white">{unreadCount}</span>}
    </button>
    {open && <section className="absolute bottom-16 right-0 flex h-[500px] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/95 shadow-2xl backdrop-blur-md" role="dialog" aria-label="Chat">
      <header className="border-b border-slate-800 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Fluentia Connect</p><h2 className="mt-1 text-sm font-semibold text-slate-100">Chat</h2></div><button type="button" onClick={closeChat} aria-label="Close chat" className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button></div><div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-slate-950 p-1"><button type="button" onClick={() => { setTab("instructor"); setUnreadCount(0); }} className={`rounded px-2 py-2 text-xs ${tab === "instructor" ? "bg-amber-500 text-slate-950" : "text-slate-400"}`}>Instructor</button><button type="button" onClick={() => { setTab("support"); setUnreadCount(0); }} className={`rounded px-2 py-2 text-xs ${tab === "support" ? "bg-amber-500 text-slate-950" : "text-slate-400"}`}>Support</button></div></header>
      <div className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-950 flex-1 space-y-3 overflow-y-auto p-4">{visible.length === 0 && <p className="text-xs leading-relaxed text-slate-500">{tab === "instructor" ? "Ask about assignments, feedback, or lesson content." : "Tell us what is not working and we will help."}</p>}{visible.map((message) => <div key={message.id} className={`max-w-[85%] rounded-lg border p-3 text-xs leading-relaxed ${message.sender === "student" ? "ml-auto border border-amber-500/30 bg-amber-500/20 text-amber-100" : "mr-auto border border-slate-700/50 bg-slate-800/80 text-slate-200"}`}>{message.text}</div>)}</div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-800 p-3"><input value={text} onChange={(event) => setText(event.target.value)} placeholder={tab === "instructor" ? "Ask your instructor..." : "Describe the issue..."} className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500" /><button type="submit" aria-label="Send message" className="rounded-md bg-amber-500 px-3 text-slate-950"><Send className="h-3.5 w-3.5" /></button></form>
    </section>}
  </div>;
}
