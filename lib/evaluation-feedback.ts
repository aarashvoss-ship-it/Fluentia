import { parseMarkdownReportTable, replaceAcademisBreakTags } from "@/lib/academis-report";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownTableToHtml(value: string, maxColumns?: number) {
  const table = parseMarkdownReportTable(value);
  if (!table || table.markdown.trim() !== value.trim()) return null;
  const headers = maxColumns === undefined ? table.headers : table.headers.slice(0, maxColumns);
  const renderCell = (cell: string) => escapeHtml(cell).replace(/\r?\n/g, "<br>");
  return [
    "<table><thead><tr>",
    ...headers.map((header) => `<th>${renderCell(header)}</th>`),
    "</tr></thead><tbody>",
    ...table.rows.map((row) => `<tr>${headers.map((_, index) => `<td>${renderCell(row[index] || "")}</td>`).join("")}</tr>`),
    "</tbody></table>",
  ].join("");
}

function renderFeedbackContent(value: string, maxColumns?: number) {
  return markdownTableToHtml(value, maxColumns) || replaceAcademisBreakTags(value);
}

function legacyFeedbackSection(label: string, value: string, maxColumns?: number) {
  const table = markdownTableToHtml(value, maxColumns);
  if (table) return `<section><p><strong>${label}:</strong></p>${table}</section>`;
  const normalized = replaceAcademisBreakTags(value);
  const content = escapeHtml(normalized).replace(/\r?\n/g, "<br>");
  return `<p><strong>${label}:</strong> ${content}</p>`;
}

export function combineTaskFeedback(comment?: string, correction?: string, maxTableColumns?: number) {
  const normalizedComment = comment?.trim() || "";
  const normalizedCorrection = correction?.trim() || "";

  if (normalizedComment && normalizedCorrection) {
    return [
      legacyFeedbackSection("Correction", normalizedCorrection, maxTableColumns),
      legacyFeedbackSection("Instructor comment", normalizedComment, maxTableColumns),
    ].join("");
  }
  if (normalizedCorrection) return legacyFeedbackSection("Correction", normalizedCorrection, maxTableColumns);
  return renderFeedbackContent(normalizedComment, maxTableColumns);
}
