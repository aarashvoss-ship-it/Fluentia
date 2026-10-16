export async function uploadAsset(file: File | Blob, name?: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, name || (file instanceof File ? file.name : "uploaded-file"));
  const response = await fetch("/api/assets", {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  const result = await response.json().catch(() => ({})) as { error?: string; url?: string };
  if (!response.ok || !result.url) {
    throw new Error(result.error || "Unable to upload the file.");
  }
  return result.url;
}

export async function deleteAsset(url: string): Promise<void> {
  const match = url.match(/\/api\/assets\/([0-9a-f-]{36})(?:$|[?#])/i);
  if (!match) return;
  const response = await fetch("/api/assets", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: match[1] }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok && response.status !== 404) {
    throw new Error(result.error || "Unable to delete the uploaded file.");
  }
}
