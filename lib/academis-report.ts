export interface AcademisMarkdownReportTable {
  headers: string[];
  rows: string[][];
  markdown: string;
}

export interface AcademisReportTableContent {
  format: "markdown_table";
  headers: string[];
  rows: string[][];
  markdown?: string;
}

export interface PreparedAcademisReport {
  reportData: Record<string, unknown>;
  publishedContent: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function splitMarkdownRow(line: string) {
  const cells: string[] = [];
  let cell = "";
  const value = line.trim();
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  if (value.startsWith("|")) cells.shift();
  if (value.endsWith("|")) cells.pop();
  return cells;
}

function isMarkdownSeparator(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function parseMarkdownReportTable(value: string): AcademisMarkdownReportTable | null {
  const lines = value.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes("|") || !lines[index + 1].includes("|")) continue;
    const headers = splitMarkdownRow(lines[index]);
    const separator = splitMarkdownRow(lines[index + 1]);
    if (!headers.length || headers.length !== separator.length || !isMarkdownSeparator(separator)) continue;

    const rows: string[][] = [];
    let end = index + 2;
    while (end < lines.length && lines[end].trim() && lines[end].includes("|")) {
      rows.push(splitMarkdownRow(lines[end]));
      end += 1;
    }
    return {
      headers,
      rows,
      markdown: lines.slice(index, end).join("\n"),
    };
  }
  return null;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (isRecord(value)) return Object.values(value).flatMap(collectStrings);
  return [];
}

function formatMarkdownTable(headers: string[], rows: string[][]) {
  const normalizedRows = rows.map((row) =>
    Array.from({ length: headers.length }, (_, index) => row[index] || ""));
  return [
    `| ${headers.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...normalizedRows.map((row) =>
      `| ${row.map((cell) => cell.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")).join(" | ")} |`),
  ].join("\n");
}

function normalizeTableRows(headers: string[], rows: string[][]) {
  return rows.map((row) =>
    Array.from({ length: headers.length }, (_, index) => row[index] || ""));
}

function findStudentFacingText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value.map(findStudentFacingText).filter((entry): entry is string => entry !== null);
    return text.length ? text.join("\n") : null;
  }
  if (!isRecord(value)) return null;

  const entries = Object.entries(value).filter(([key]) =>
    !/(?:instructor|teacher|lesson.?builder|internal|private|hidden)/i.test(key));
  const preferredKeys = /^(?:student(?:_facing)?(?:_feedback|_summary)?|feedback|diagnostic_table|preview|text|content)$/i;
  for (const [key, entry] of entries) {
    if (preferredKeys.test(key)) {
      const text = findStudentFacingText(entry);
      if (text !== null) return text;
    }
  }
  for (const [, entry] of entries) {
    if (typeof entry === "string") continue;
    const text = findStudentFacingText(entry);
    if (text !== null) return text;
  }
  return null;
}

function findReportTable(content: string, parsedOutput: unknown) {
  for (const candidate of [content, ...collectStrings(parsedOutput)]) {
    const table = parseMarkdownReportTable(candidate);
    if (table) return table;
  }
  return null;
}

export function prepareAcademisReport(content: string): PreparedAcademisReport {
  const trimmedContent = content.trim();
  const unfencedContent = trimmedContent
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsedOutput: unknown = content;
  let isJson = false;
  try {
    parsedOutput = JSON.parse(unfencedContent);
    isJson = true;
  } catch {
    parsedOutput = content;
  }

  const table = findReportTable(content, parsedOutput);
  const tableRows = table ? normalizeTableRows(table.headers, table.rows) : [];
  const studentColumnCount = table ? Math.min(table.headers.length, 3) : 0;
  const studentHeaders = table?.headers.slice(0, studentColumnCount) || [];
  const studentRows = tableRows.map((row) => row.slice(0, studentColumnCount));
  const instructorHeaders = table ? [table.headers[0], ...table.headers.slice(3)] : [];
  const instructorRows = tableRows.map((row) => [row[0] || "", ...row.slice(3)]);
  const reportData: Record<string, unknown> = {
    format: table ? "markdown_table" : isJson ? "json" : "text",
    raw_output: content,
    parsed_output: isJson
      ? parsedOutput
      : table
        ? { headers: table.headers, rows: tableRows }
        : { text: content },
    ...(table ? {
      markdown_table: { headers: table.headers, rows: tableRows },
      student_facing_table: { headers: studentHeaders, rows: studentRows },
      ...(instructorHeaders.length
        ? { instructor_only_table: { headers: instructorHeaders, rows: instructorRows } }
        : {}),
    } : {}),
  };

  if (table) {
    return {
      reportData,
      publishedContent: {
        format: "markdown_table",
        headers: studentHeaders,
        rows: studentRows,
        markdown: formatMarkdownTable(studentHeaders, studentRows),
      },
    };
  }

  if (!isJson) {
    return {
      reportData,
      publishedContent: { format: "text", content },
    };
  }

  const studentText = findStudentFacingText(parsedOutput);
  if (studentText !== null) {
    return {
      reportData,
      publishedContent: { format: "text", content: studentText },
    };
  }

  return {
    reportData,
    publishedContent: {
      format: "structured",
      content: null,
    },
  };
}

export function getAcademisPublishedPreviewText(value: unknown) {
  if (!isRecord(value)) return "";
  if (value.format === "markdown_table" && typeof value.markdown === "string") return value.markdown;
  if (value.format === "text" && typeof value.content === "string") return value.content;
  return findStudentFacingText(value.content) || "";
}
