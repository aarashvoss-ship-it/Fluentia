import { supabase } from "@/lib/supabaseClient";
import type { ResourceAsset, ResourceAssetInput, ResourceAssetRow } from "@/types/resource-hub";
import type { SupabaseClient } from "@supabase/supabase-js";

type ResourceAssetUpdateRow = Partial<Pick<
  ResourceAssetRow,
  "title" | "description" | "main_category" | "sub_category" | "url" | "allow_student_download" | "cefr_level" | "tags"
>>;
type ResourceAssetDbRow = ResourceAssetRow & Record<string, unknown>;
type ResourceAssetDbInsert = Omit<ResourceAssetDbRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

interface ResourceHubDatabase {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: Array<{
        foreignKeyName: string;
        columns: string[];
        isOneToOne?: boolean;
        referencedRelation: string;
        referencedColumns: string[];
      }>;
    }> & {
      resource_assets: {
        Row: ResourceAssetDbRow;
        Insert: ResourceAssetDbInsert;
        Update: ResourceAssetUpdateRow & Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const resourceHubSupabase = supabase as SupabaseClient<ResourceHubDatabase>;

const RESOURCE_ASSET_COLUMNS =
  "id,instructor_id,title,description,main_category,sub_category,url,allow_student_download,cefr_level,tags,created_at,updated_at" as const;

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

async function getAuthenticatedInstructorId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to verify the signed-in instructor: ${error.message}`);
  if (!user) throw new Error("You must be signed in as an instructor to manage Resource Hub assets.");
  return user.id;
}

function toResourceAssetRow(assetData: ResourceAssetInput, instructorId: string) {
  return {
    instructor_id: instructorId,
    title: assetData.title,
    description: assetData.description || null,
    main_category: assetData.mainCategory,
    sub_category: assetData.subCategory,
    url: assetData.url,
    allow_student_download: assetData.isDownloadable,
    cefr_level: assetData.cefrLevel,
    tags: assetData.tags,
  };
}

export async function fetchResourceAssets(instructorId: string): Promise<ResourceAsset[]> {
  if (!instructorId) throw new Error("An instructor ID is required to load Resource Hub assets.");

  const { data, error } = await resourceHubSupabase
    .from("resource_assets")
    .select(RESOURCE_ASSET_COLUMNS)
    .eq("instructor_id", instructorId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to load Resource Hub assets: ${error.message}`);
  return (data || []).map(mapResourceAsset);
}

export async function fetchStudyRoomMusicTracks(): Promise<{ title: string; url: string }[]> {
  const { data, error } = await resourceHubSupabase
    .from("resource_assets")
    .select("title,url,sub_category,tags")
    .eq("main_category", "audios");

  if (error) throw new Error(`Unable to load Study Room music: ${error.message}`);
  return (data || [])
    .filter((asset) => asset.sub_category === "Study Room Music" || asset.tags.includes("study-room"))
    .map(({ title, url }) => ({ title, url }));
}

export async function createResourceAsset(assetData: ResourceAssetInput): Promise<ResourceAsset> {
  const instructorId = await getAuthenticatedInstructorId();
  const { data, error } = await resourceHubSupabase
    .from("resource_assets")
    .insert(toResourceAssetRow(assetData, instructorId))
    .select(RESOURCE_ASSET_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to create Resource Hub asset: ${error.message}`);
  return mapResourceAsset(data);
}

export async function updateResourceAsset(
  assetId: string,
  assetData: Partial<ResourceAssetInput>,
): Promise<ResourceAsset> {
  const updates: ResourceAssetUpdateRow = {};
  if (assetData.title !== undefined) updates.title = assetData.title;
  if (assetData.description !== undefined) updates.description = assetData.description || null;
  if (assetData.mainCategory !== undefined) updates.main_category = assetData.mainCategory;
  if (assetData.subCategory !== undefined) updates.sub_category = assetData.subCategory;
  if (assetData.url !== undefined) updates.url = assetData.url;
  if (assetData.isDownloadable !== undefined) updates.allow_student_download = assetData.isDownloadable;
  if (assetData.cefrLevel !== undefined) updates.cefr_level = assetData.cefrLevel;
  if (assetData.tags !== undefined) updates.tags = assetData.tags;
  if (!Object.keys(updates).length) throw new Error("At least one Resource Hub asset field must be updated.");

  const { data, error } = await resourceHubSupabase
    .from("resource_assets")
    .update(updates)
    .eq("id", assetId)
    .select(RESOURCE_ASSET_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to update Resource Hub asset: ${error.message}`);
  return mapResourceAsset(data);
}

export async function deleteResourceAsset(assetId: string): Promise<void> {
  const { data, error } = await resourceHubSupabase
    .from("resource_assets")
    .delete()
    .eq("id", assetId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Unable to delete Resource Hub asset: ${error.message}`);
  if (!data) throw new Error("Resource Hub asset was not found or you do not have permission to delete it.");
}
