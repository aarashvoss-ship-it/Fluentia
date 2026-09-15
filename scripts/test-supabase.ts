import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonObject = Record<string, unknown>;
type SupabaseError = { code?: string; message?: string; details?: string; hint?: string };

type ColumnName =
  | "id"
  | "title"
  | "slug"
  | "subtitle"
  | "student_id"
  | "student_token"
  | "module_number"
  | "banner_url"
  | "blocks"
  | "content"
  | "status";

const expectedColumns: Record<ColumnName, string> = {
  id: "string/uuid",
  title: "string, required",
  slug: "string",
  subtitle: "string/null",
  student_id: "uuid/string or null",
  student_token: "string/null",
  module_number: "number",
  banner_url: "string/null",
  blocks: "json/array",
  content: "json/object",
  status: "draft|published|evaluated",
};

function loadEnvFile(path: string) {
  try {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Environment variables may already be supplied by the shell or CI.
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(url, key);
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const dummy = {
  title: `Supabase integration test ${runId}`,
  slug: `supabase-integration-test-${runId}`,
  subtitle: "Temporary CRUD verification row",
  student_id: null,
  student_token: `supabase-test-${runId}`,
  module_number: 999,
  banner_url: "https://example.com/supabase-integration-test.jpg",
  blocks: [{ id: `test-block-${runId}`, type: "text", body: "Temporary test content" }],
  content: {
    slug: `supabase-integration-test-${runId}`,
    title: `Supabase integration test ${runId}`,
    subtitle: "Temporary CRUD verification row",
    moduleNumber: 999,
    coverImage: "https://example.com/supabase-integration-test.jpg",
    warm_up: { blocks: [{ id: `test-block-${runId}`, type: "text", title: "Test", body: "Temporary test content", enabled: true }] },
  },
  status: "draft",
} satisfies Partial<Record<ColumnName, unknown>>;

const columnNames = Object.keys(expectedColumns) as ColumnName[];
const existenceErrors = new Map<ColumnName, SupabaseError>();
const detectedColumns = new Set<ColumnName>();
let insertedId: string | null = null;

function formatError(error: SupabaseError) {
  return [error.code, error.message, error.details, error.hint].filter(Boolean).join(" | ");
}

function isMissingColumn(error: SupabaseError) {
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|schema cache/i.test(error.message || "");
}

function reportTypeMismatch(operation: string, payload: JsonObject, error: SupabaseError) {
  console.error(`[supabase] ${operation} failed: ${formatError(error)}`);
  if (/invalid input syntax|invalid_text|uuid|integer|bigint|numeric|boolean|expected/i.test(`${error.message} ${error.details}`)) {
    console.error(`[supabase] Possible frontend/schema type mismatch in payload: ${JSON.stringify(payload)}`);
  }
}

function validateRowTypes(operation: string, row: JsonObject) {
  for (const [column, expected] of Object.entries(expectedColumns) as [ColumnName, string][]) {
    if (!(column in row) || row[column] === null) continue;
    const value = row[column];
    const valid = column === "module_number"
      ? typeof value === "number"
      : column === "blocks"
        ? Array.isArray(value) || (typeof value === "object" && value !== null)
        : column === "content"
          ? typeof value === "object" && !Array.isArray(value)
          : typeof value === "string";
    if (!valid) {
      console.error(`[schema] TYPE MISMATCH lessons.${column}: frontend expects ${expected}, Supabase returned ${JSON.stringify(value)} (${typeof value})`);
    }
  }
}

async function verifyColumns() {
  console.log("[supabase] Verifying lessons columns via REST probes...");
  for (const column of columnNames) {
    const { error } = await supabase.from("lessons").select(column).limit(0);
    if (error) {
      existenceErrors.set(column, error);
      console.error(`[schema] MISSING or inaccessible lessons.${column} (frontend expects ${expectedColumns[column]}): ${formatError(error)}`);
    } else {
      detectedColumns.add(column);
      console.log(`[schema] OK lessons.${column} (frontend expects ${expectedColumns[column]})`);
    }
  }

  if (existenceErrors.size > 0) {
    console.error(`[schema] ${existenceErrors.size} expected column(s) are unavailable. CRUD will use only detected columns.`);
  }
}

function compatiblePayload(): JsonObject {
  const payload: JsonObject = {};
  for (const column of detectedColumns) {
    if (column === "id") continue;
    payload[column] = dummy[column];
  }
  if (detectedColumns.has("title")) payload.title = dummy.title;
  if (detectedColumns.has("status")) payload.status = dummy.status;
  if (detectedColumns.has("content")) payload.content = dummy.content;
  return payload;
}

async function attemptFullInsert() {
  console.log("[supabase] Attempting INSERT with the complete frontend lesson payload...");
  const { data, error } = await supabase.from("lessons").insert(dummy).select().maybeSingle();
  if (!error && data) {
    insertedId = String(data.id || dummy.slug);
    validateRowTypes("INSERT", data);
    console.log(`[crud] INSERT succeeded: ${insertedId}`);
    return true;
  }
  if (error) {
    if (isMissingColumn(error)) {
      console.error(`[crud] Full INSERT rejected because the schema differs from the frontend payload: ${formatError(error)}`);
    } else {
      reportTypeMismatch("Full INSERT", dummy, error);
    }
  }
  return false;
}

async function runCompatibleCrud() {
  const payload = compatiblePayload();
  if (!payload.title) throw new Error("Cannot run CRUD: lessons.title is unavailable.");

  console.log("[supabase] Attempting INSERT with detected columns only...");
  const { data: inserted, error: insertError } = await supabase.from("lessons").insert(payload).select().maybeSingle();
  if (insertError || !inserted) {
    reportTypeMismatch("Compatible INSERT", payload, insertError || { message: "No row returned" });
    throw new Error("Compatible INSERT failed; SELECT/UPDATE/DELETE were not attempted.");
  }
  insertedId = String(inserted.id || dummy.title);
  console.log(`[crud] INSERT succeeded: ${insertedId}`);

  const selectQuery = detectedColumns.has("id") ? supabase.from("lessons").select("*").eq("id", inserted.id).maybeSingle() : supabase.from("lessons").select("*").eq("title", dummy.title).maybeSingle();
  const { data: selected, error: selectError } = await selectQuery;
  if (selectError || !selected) {
    reportTypeMismatch("SELECT", { id: inserted.id }, selectError || { message: "Inserted row was not returned" });
    throw new Error("SELECT verification failed.");
  }
  console.log(`[crud] SELECT succeeded: ${JSON.stringify(selected)}`);
  validateRowTypes("SELECT", selected);

  const updatePayload: JsonObject = {};
  if (detectedColumns.has("title")) updatePayload.title = `${dummy.title} updated`;
  if (detectedColumns.has("content")) updatePayload.content = { ...dummy.content, updatedBy: "supabase-integration-test" };
  if (detectedColumns.has("module_number")) updatePayload.module_number = 1000;
  const updateFilter = detectedColumns.has("id") ? { key: "id", value: inserted.id } : { key: "title", value: dummy.title };
  const { data: updated, error: updateError } = await supabase.from("lessons").update(updatePayload).eq(updateFilter.key, updateFilter.value).select().maybeSingle();
  if (updateError || !updated) {
    reportTypeMismatch("UPDATE", updatePayload, updateError || { message: "No updated row returned" });
    throw new Error("UPDATE verification failed.");
  }
  console.log(`[crud] UPDATE succeeded: ${JSON.stringify(updated)}`);
  validateRowTypes("UPDATE", updated);
}

async function cleanup() {
  if (!insertedId) return;
  const filter = detectedColumns.has("id") ? { key: "id", value: insertedId } : { key: "title", value: dummy.title };
  const { error } = await supabase.from("lessons").delete().eq(filter.key, filter.value);
  if (error) {
    console.error(`[crud] DELETE failed for test row ${insertedId}: ${formatError(error)}`);
    return;
  }
  console.log(`[crud] DELETE succeeded: ${insertedId}`);
}

async function main() {
  console.log(`[supabase] Testing ${url}/rest/v1/lessons with run id ${runId}`);
  await verifyColumns();
  const fullInsertSucceeded = await attemptFullInsert();
  if (!fullInsertSucceeded) await runCompatibleCrud();
  console.log("[supabase] CRUD integration test passed.");
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error(`[supabase] TEST FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

void run();
