"use client";

import { FormEvent, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { ChatMessage } from "@/types/lesson";

interface ChatWidgetProps { messages: ChatMessage[]; onSend: (message: ChatMessage) => void; }

export function ChatWidget({ messages, onSend }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"instructor" | "support">("instructor");
  const [text, setText] = useState("");
  function send(event: FormEvent) { event.preventDefault(); if (!text.trim()) return; onSend({ id: `${Date.now()}`, tab, text: text.trim(), sender: "student", createdAt: new Date().toISOString() }); setText(""); }
  const visible = messages.filter((message) => message.tab === tab);
  return <div className="fixed bottom-5 right-5 z-40"><button type="button" onClick={() => setOpen(!open)} className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-[#0c1017] shadow-xl transition hover:bg-amber-400" aria-label={open ? "Close chat" : "Open chat"}>{open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}</button>{open && <div className="absolute bottom-16 right-0 flex h-[430px] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-[#394252] bg-[#171d28] shadow-2xl"><div className="border-b border-[#29303c] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">Fluentia Connect</p><div className="mt-3 grid grid-cols-2 rounded-md bg-[#0c1017] p-1"><button type="button" onClick={() => setTab("instructor")} className={`rounded px-2 py-1.5 text-xs ${tab === "instructor" ? "bg-amber-500 text-[#0c1017]" : "text-stone-400"}`}>Instructor</button><button type="button" onClick={() => setTab("support")} className={`rounded px-2 py-1.5 text-xs ${tab === "support" ? "bg-amber-500 text-[#0c1017]" : "text-stone-400"}`}>Support</button></div></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{visible.length === 0 && <p className="text-xs leading-relaxed text-stone-500">{tab === "instructor" ? "Ask about assignments, feedback, or lesson content." : "Tell us what is not working and we will help."}</p>}{visible.map((message) => <div key={message.id} className="rounded-lg bg-[#0c1017] p-3 text-xs leading-relaxed text-stone-300">{message.text}</div>)}</div><form onSubmit={send} className="flex gap-2 border-t border-[#29303c] p-3"><input value={text} onChange={(event) => setText(event.target.value)} placeholder={tab === "instructor" ? "Ask your instructor..." : "Describe the issue..."} className="min-w-0 flex-1 rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2 text-xs text-stone-200 outline-none focus:border-amber-500" /><button type="submit" aria-label="Send message" className="rounded-md bg-amber-500 px-3 text-[#0c1017]"><Send className="h-3.5 w-3.5" /></button></form></div>}</div>;
}
