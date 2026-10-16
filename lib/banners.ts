/**
 * Same-origin PostgreSQL API client for system banners.
 */

export interface BannerRow {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateBannerInput {
  title: string;
  message: string;
  is_active?: boolean;
}

export interface UpdateBannerInput {
  title?: string;
  message?: string;
  is_active?: boolean;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || `Banner request failed (${response.status}).`);
  }
  return result;
}

export async function createBanner(input: CreateBannerInput): Promise<BannerRow> {
  const result = await requestJson<{ banner: BannerRow }>("/api/banners", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.banner;
}

/**
 * Gets all banners. Inactive banners are available to instructor/admin users.
 */
export async function getBanners(): Promise<BannerRow[]> {
  const result = await requestJson<{ banners: BannerRow[] }>("/api/banners?scope=all");
  return result.banners;
}

/**
 * Gets active banners, which are readable without signing in.
 */
export async function getActiveBanners(): Promise<BannerRow[]> {
  const result = await requestJson<{ banners: BannerRow[] }>("/api/banners");
  return result.banners;
}

export async function getBannerById(id: string): Promise<BannerRow | null> {
  const response = await fetch(`/api/banners/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  const result = await response.json().catch(() => ({})) as { banner?: BannerRow; error?: string };
  if (!response.ok) throw new Error(result.error || `Banner request failed (${response.status}).`);
  return result.banner ?? null;
}

export async function updateBanner(id: string, input: UpdateBannerInput): Promise<BannerRow> {
  const result = await requestJson<{ banner: BannerRow }>(`/api/banners/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return result.banner;
}

export async function toggleBannerActive(id: string, isActive: boolean): Promise<BannerRow> {
  return updateBanner(id, { is_active: isActive });
}

export async function deleteBanner(id: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/banners/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function deleteAllBanners(): Promise<void> {
  await requestJson<{ deleted: boolean }>("/api/banners", { method: "DELETE" });
}

export async function deactivateAllBanners(): Promise<void> {
  await requestJson<{ deactivated: boolean }>("/api/banners", {
    method: "PATCH",
    body: JSON.stringify({ action: "deactivateAll" }),
  });
}
