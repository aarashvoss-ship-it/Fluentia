import { getAuthenticatedUser } from "@/lib/identity";
import type { ResourceAsset, ResourceAssetInput, ResourceAssetRow } from "@/types/resource-hub";

type ResourceAssetUpdate = Partial<ResourceAssetInput>;

const ASSETS_ENDPOINT = "/api/resource-hub/assets";

function mapResourceAsset(row: ResourceAssetRow): ResourceAsset {
  return {
    id: row.id,
    instructorId: row.instructor_id,
    title: row.title,
    description: row.description || undefined,
    mainCategory: row.main_category,
    subCategory: row.sub_category,
    url: row.url,
    isExternalLink: /^https?:\/\//i.test(row.url),
    isDownloadable: row.allow_student_download,
    cefrLevel: row.cefr_level,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requestResourceHub<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Unable to reach the Resource Hub service.");
  }

  const result = await response.json().catch(() => ({})) as { error?: unknown } & T;
  if (!response.ok) {
    const message = typeof result.error === "string" ? result.error : "The request failed.";
    throw new Error(message);
  }
  return result;
}

function getRequestErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchResourceAssets(instructorId: string): Promise<ResourceAsset[]> {
  if (!instructorId) throw new Error("An instructor ID is required to load Resource Hub assets.");

  try {
    const query = new URLSearchParams({ instructorId });
    const result = await requestResourceHub<{ assets: ResourceAssetRow[] }>(`${ASSETS_ENDPOINT}?${query}`);
    return (result.assets || []).map(mapResourceAsset);
  } catch (error) {
    throw new Error(`Unable to load Resource Hub assets: ${getRequestErrorMessage(error)}`);
  }
}

export async function fetchStudyRoomMusicTracks(): Promise<{ title: string; url: string }[]> {
  try {
    const result = await requestResourceHub<{ tracks: { title: string; url: string }[] }>("/api/resource-hub/music");
    return result.tracks || [];
  } catch (error) {
    throw new Error(`Unable to load Study Room music: ${getRequestErrorMessage(error)}`);
  }
}

export async function createResourceAsset(
  assetData: ResourceAssetInput,
  expectedInstructorId: string,
): Promise<ResourceAsset> {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("You must be signed in as an instructor to manage Resource Hub assets.");
  if (!expectedInstructorId || user.id !== expectedInstructorId) {
    throw new Error("The signed-in user does not match the active instructor. Refresh the page and try again.");
  }

  try {
    const result = await requestResourceHub<{ asset: ResourceAssetRow }>(ASSETS_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ ...assetData, instructorId: expectedInstructorId }),
    });
    return mapResourceAsset(result.asset);
  } catch (error) {
    throw new Error(`Unable to create Resource Hub asset: ${getRequestErrorMessage(error)}`);
  }
}

export async function updateResourceAsset(
  assetId: string,
  assetData: ResourceAssetUpdate,
): Promise<ResourceAsset> {
  const updates: ResourceAssetUpdate = {};
  if (assetData.title !== undefined) updates.title = assetData.title;
  if (assetData.description !== undefined) updates.description = assetData.description || "";
  if (assetData.mainCategory !== undefined) updates.mainCategory = assetData.mainCategory;
  if (assetData.subCategory !== undefined) updates.subCategory = assetData.subCategory;
  if (assetData.url !== undefined) updates.url = assetData.url;
  if (assetData.isDownloadable !== undefined) updates.isDownloadable = assetData.isDownloadable;
  if (assetData.cefrLevel !== undefined) updates.cefrLevel = assetData.cefrLevel;
  if (assetData.tags !== undefined) updates.tags = assetData.tags;
  if (!Object.keys(updates).length) throw new Error("At least one Resource Hub asset field must be updated.");

  try {
    const result = await requestResourceHub<{ asset: ResourceAssetRow }>(
      `${ASSETS_ENDPOINT}/${encodeURIComponent(assetId)}`,
      { method: "PATCH", body: JSON.stringify(updates) },
    );
    return mapResourceAsset(result.asset);
  } catch (error) {
    throw new Error(`Unable to update Resource Hub asset: ${getRequestErrorMessage(error)}`);
  }
}

export async function deleteResourceAsset(assetId: string): Promise<void> {
  try {
    await requestResourceHub<{ deleted: true }>(`${ASSETS_ENDPOINT}/${encodeURIComponent(assetId)}`, {
      method: "DELETE",
    });
  } catch (error) {
    throw new Error(`Unable to delete Resource Hub asset: ${getRequestErrorMessage(error)}`);
  }
}
