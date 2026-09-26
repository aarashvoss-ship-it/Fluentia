"use client";

import { useState } from "react";
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

function parseTables(markdown: string): ParsedTable[] {
  const lines = markdown.split(/\r?\n/);
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

function printTables(title: string, tables: ParsedTable[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  const tableMarkup = tables.map(({ headers, rows }) => `<table><thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${escapeHtml(row[cellIndex] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("");
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{color:#1f2937;font:11pt/1.45 Arial,sans-serif}h1{font-size:18pt;margin:0 0 18pt}table{border-collapse:collapse;margin:0 0 18pt;width:100%;break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#fef3c7;color:#b45309;font-weight:700}tbody tr:nth-child(even){background:#f8fafc}</style></head><body><h1>${escapeHtml(title)}</h1>${tableMarkup || `<pre>${escapeHtml(markdownTextFallback(tables))}</pre>`}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener("load", () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  return true;
}

function markdownTextFallback(tables: ParsedTable[]) {
  return tables.map((table) => [table.headers.join(" | "), ...table.rows.map((row) => row.join(" | "))].join("\n")).join("\n\n");
}

export function DataTableResource({ title, markdown }: { title: string; markdown: string }) {
  const [status, setStatus] = useState("");
  const tables = parseTables(markdown);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("Markdown copied.");
    } catch {
      const fileUrl = URL.createObjectURL(new Blob([markdown], { type: "text/plain;charset=utf-8" }));
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { if (!printTables(title, tables)) setStatus("Allow pop-ups to print this table as PDF."); }} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/10">
          <FileDown className="h-3.5 w-3.5" /> Download PDF
        </button>
        <button type="button" onClick={() => void copyText()} className="inline-flex items-center gap-1.5 rounded-md border border-[#394252] px-2.5 py-1.5 text-[11px] font-semibold text-stone-300 transition hover:border-amber-500/40 hover:text-amber-300">
          <Copy className="h-3.5 w-3.5" /> Copy / Export Text
        </button>
        {status && <span role="status" className="text-[10px] text-stone-500">{status}</span>}
      </div>
      <MarkdownContent value={markdown} className="text-sm leading-relaxed text-stone-300" dataTables />
    </div>
  );
}
