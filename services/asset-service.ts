export async function uploadAsset(file: File | Blob, name?: string, folderName = "assets"): Promise<string> {
  const params = new URLSearchParams({
    fileName: name || (file instanceof File ? file.name : "uploaded-file"),
    folder: folderName,
  });
  const response = await fetch(`/api/assets?${params.toString()}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Size": String(file.size),
    },
    body: file,
  });
  const result = await response.json().catch(() => ({})) as { error?: string; url?: string };
  if (!response.ok || !result.url) {
    throw new Error(result.error || "Unable to upload the file.");
  }
  return result.url;
}

export async function deleteAsset(url: string): Promise<void> {
  const match = url.match(/\/api\/assets\/([0-9a-f-]{36})(?:$|[?#])/i);
  if (!match) {
    let pathname: string;
    try {
      pathname = new URL(url, window.location.origin).pathname;
    } catch {
      return;
    }
    if (!/\/(?:banners|avatars|assets|audio|lesson-media|images|videos|resources|resource-hub)\//.test(pathname)) return;
  }
  const response = await fetch("/api/assets", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(match ? { id: match[1] } : { url }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok && response.status !== 404) {
    throw new Error(result.error || "Unable to delete the uploaded file.");
  }
}
