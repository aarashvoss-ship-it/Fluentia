"use client";

import { useEffect, useState } from "react";
import { Copy, FileDown } from "lucide-react";
import { MarkdownContent } from "@/components/study-room/markdown-content";

export const DATA_TABLE_RESOURCE_TITLE_PREFIX = "[Data Table] ";

export function isDataTableResourceTitle(title: string) {
  return title.startsWith(DATA_TABLE_RESOURCE_TITLE_PREFIX);
}

export function getDataTableResourceTitle(title: string) {
  return isDataTableResourceTitle(title) ? title.slice(DATA_TABLE_RESOURCE_TITLE_PREFIX.length) : title;
}

type ParsedTable = { headers: string[]; rows: string[][] };

function splitRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isRichTextHtml(value: string) {
  return /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|a|strong|em|s|span|hr|br)\b/i.test(value);
}

function parseTables(content: string): ParsedTable[] {
  if (isRichTextHtml(content)) {
    const parsed = new DOMParser().parseFromString(content, "text/html");
    return Array.from(parsed.querySelectorAll("table")).map((table) => {
      const rows = Array.from(table.rows);
      const headerRow = rows.find((row) => row.querySelector("th"));
      const headers = Array.from(headerRow?.cells || []).map((cell) => cell.textContent?.trim() || "");
      const bodyRows = rows.filter((row) => row !== headerRow);
      return {
        headers,
        rows: bodyRows.map((row) => Array.from(row.cells).map((cell) => cell.textContent?.trim() || "")),
      };
    }).filter((table) => table.headers.length > 0);
  }

  const lines = content.split(/\r?\n/);
  const tables: ParsedTable[] = [];
  for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex += 1) {
    if (!lines[lineIndex].includes("|") || !lines[lineIndex + 1].includes("|")) continue;
    const headers = splitRow(lines[lineIndex]);
    const separator = splitRow(lines[lineIndex + 1]);
    if (!separator.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell)) || separator.length !== headers.length) continue;
    const rows: string[][] = [];
    lineIndex += 2;
    while (lineIndex < lines.length && lines[lineIndex].includes("|")) {
      const row = splitRow(lines[lineIndex]);
      if (row.some(Boolean)) rows.push(row);
      lineIndex += 1;
    }
    tables.push({ headers, rows });
    lineIndex -= 1;
  }
  return tables;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function printTables(title: string, tables: ParsedTable[], fallbackText: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  const logoUrl = new URL("/logo.png", window.location.origin).href;
  const tableMarkup = tables.map(({ headers, rows }) => `<table><thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${escapeHtml(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("");
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{color:#1f2937;font:11pt/1.45 Arial,sans-serif}.report-header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #cbd5e1;margin:0 0 18pt;padding:0 0 12pt}.report-header h1{font-size:18pt;margin:0}.report-header img{display:block;height:36px;width:auto;max-width:160px;object-fit:contain;print-color-adjust:exact;-webkit-print-color-adjust:exact}table{border-collapse:collapse;margin:0 0 18pt;width:100%;break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#fef3c7;color:#b45309;font-weight:700}tbody tr:nth-child(even){background:#f8fafc}pre{white-space:pre-wrap}</style></head><body><header class="report-header"><h1>${escapeHtml(title)}</h1><img src="${escapeHtml(logoUrl)}" alt="Fluentia"></header>${tableMarkup || `<pre>${escapeHtml(fallbackText)}</pre>`}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener("load", () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  return true;
}

export function DataTableResource({ title, markdown, html, sourceUrl }: { title: string; markdown: string; html?: string; sourceUrl?: string | null }) {
  const [status, setStatus] = useState("");
  const content = html ?? markdown;
  const [tables, setTables] = useState<ParsedTable[]>([]);

  useEffect(() => {
    setTables(parseTables(content));
  }, [content]);

  const getPlainText = () => isRichTextHtml(content)
    ? new DOMParser().parseFromString(content, "text/html").body.textContent || ""
    : content;

  const copyText = async () => {
    const plainText = getPlainText();
    try {
      await navigator.clipboard.writeText(plainText);
      setStatus("Text copied.");
    } catch {
      const fileUrl = URL.createObjectURL(new Blob([plainText], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = `${title.trim().replace(/[^a-z0-9-_]+/gi, "-") || "data-table"}.txt`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
      setStatus("Text file downloaded.");
    }
  };

  return (
    <div className="min-w-0">
      <header className="mb-4 flex items-center justify-between gap-4 border-b border-border pb-3">
        <h3 className="min-w-0 flex-1 break-words text-sm font-semibold text-stone-100">{title}</h3>
        <img src="/logo.png" alt="Fluentia" className="h-9 w-auto max-w-24 shrink-0 object-contain" />
      </header>
      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mb-3 inline-flex max-w-full items-center gap-1.5 break-all text-xs text-amber-300 hover:text-amber-200">
          Source link <span className="truncate">{sourceUrl}</span>
        </a>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { if (!printTables(title, tables, getPlainText())) setStatus("Allow pop-ups to print this table as PDF."); }} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[11px]  text-amber-400 transition hover:bg-amber-500/20">
          <FileDown className="h-3.5 w-3.5" /> Download PDF
        </button>
        <button type="button" onClick={() => void copyText()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px]  text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400">
          <Copy className="h-3.5 w-3.5" /> Copy / Export Text
        </button>
        {status && <span role="status" className="text-[10px] text-stone-500">{status}</span>}
      </div>
      <MarkdownContent value={content} className="text-sm leading-relaxed text-stone-300" dataTables />
    </div>
  );
}
