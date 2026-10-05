"use client";

import { useEffect, useState } from "react";
import { Copy, FileDown } from "lucide-react";
import { MarkdownContent } from "@/components/study-room/markdown-content";

type MarkdownTable = { headers: string[]; rows: string[][] };

function isRichTextHtml(value: string) {
  return /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|a|strong|em|s|span|hr|br)\b/i.test(value);
}

function splitMarkdownTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function extractMarkdownTables(content: string): MarkdownTable[] {
  if (isRichTextHtml(content)) {
    const parsed = new DOMParser().parseFromString(content, "text/html");
    return Array.from(parsed.querySelectorAll("table")).map((table) => {
      const rows = Array.from(table.rows);
      const headerRow = rows.find((row) => row.querySelector("th"));
      return {
        headers: Array.from(headerRow?.cells || []).map((cell) => cell.textContent?.trim() || ""),
        rows: rows.filter((row) => row !== headerRow).map((row) => Array.from(row.cells).map((cell) => cell.textContent?.trim() || "")),
      };
    }).filter((table) => table.headers.length > 0);
  }

  const lines = content.split(/\r?\n/);
  const tables: MarkdownTable[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index].trim();
    if (!headerLine.includes("|") || !/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1].trim())) continue;
    const headers = splitMarkdownTableRow(headerLine);
    const rows: string[][] = [];
    index += 2;
    while (index < lines.length && lines[index].includes("|")) {
      const row = splitMarkdownTableRow(lines[index]);
      if (row.some(Boolean)) rows.push(row);
      index += 1;
    }
    tables.push({ headers, rows });
    index -= 1;
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

function printMarkdownTables(title: string, tables: MarkdownTable[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  const tableMarkup = tables.map(({ headers, rows }) => `
    <table>
      <thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`).join("");
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm; }
    body { color: #1f2937; font: 11pt/1.45 Arial, sans-serif; }
    h1 { font-size: 18pt; margin: 0 0 18pt; }
    table { border-collapse: collapse; margin: 0 0 18pt; width: 100%; break-inside: avoid; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #fef3c7; color: #b45309; font-weight: 700; }
    tbody tr:nth-child(even) { background: #f8fafc; }
  </style></head><body><h1>${escapeHtml(title)}</h1>${tableMarkup}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener("load", () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  return true;
}

export function StudyHubMarkdownResource({ title, value, className = "" }: { title: string; value: string; className?: string }) {
  const [exportStatus, setExportStatus] = useState("");
  const [tables, setTables] = useState<MarkdownTable[]>([]);

  useEffect(() => {
    setTables(extractMarkdownTables(value));
  }, [value]);

  const copyOrDownloadText = async () => {
    const plainText = isRichTextHtml(value)
      ? new DOMParser().parseFromString(value, "text/html").body.textContent || ""
      : value;
    try {
      await navigator.clipboard.writeText(plainText);
      setExportStatus("Table text copied.");
    } catch {
      const url = URL.createObjectURL(new Blob([plainText], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${title.replace(/[^a-z0-9-_]+/gi, "-") || "resource"}.txt`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus("Text file downloaded.");
    }
  };

  return (
    <div className="min-w-0">
      {tables.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { if (!printMarkdownTables(title, tables)) setExportStatus("Allow pop-ups to print this table as PDF."); }} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1.5 text-[11px] text-amber-400 transition hover:bg-amber-500/20">
          <FileDown className="h-3.5 w-3.5" /> Download PDF
        </button>
        <button type="button" onClick={() => void copyOrDownloadText()} className="inline-flex items-center gap-1.5 rounded-md border border-[#394252] px-2.5 py-1.5 text-[11px] text-stone-300 transition hover:border-amber-500/40 hover:text-amber-400">
          <Copy className="h-3.5 w-3.5" /> Copy / Export Text
        </button>
        {exportStatus && <span className="text-[10px] text-stone-500" role="status">{exportStatus}</span>}
      </div>}
      <MarkdownContent value={value} className={className} dataTables />
    </div>
  );
}
