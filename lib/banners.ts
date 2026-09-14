/**
 * Banners Service
 * Manages system banners (announcements, alerts) in Supabase
 */

import { supabase, type BannerRow, isSupabaseConfigured } from "@/lib/supabase";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Creates a new banner
 */
export async function createBanner(input: CreateBannerInput): Promise<BannerRow> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { data, error } = await supabase
      .from("banners")
      .insert([
        {
          title: input.title,
          message: input.message,
          is_active: input.is_active ?? true,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating banner:", error);
    throw error;
  }
}

/**
 * Gets all banners
 */
export async function getBanners(): Promise<BannerRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching banners:", error);
    throw error;
  }
}

/**
 * Gets all active banners
 */
export async function getActiveBanners(): Promise<BannerRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching active banners:", error);
    throw error;
  }
}

/**
 * Gets a single banner by ID
 */
export async function getBannerById(id: string): Promise<BannerRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error(`Error fetching banner ${id}:`, error);
    throw error;
  }
}

/**
 * Updates a banner
 */
export async function updateBanner(id: string, input: UpdateBannerInput): Promise<BannerRow> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { data, error } = await supabase
      .from("banners")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error updating banner ${id}:`, error);
    throw error;
  }
}

/**
 * Toggles a banner's active status
 */
export async function toggleBannerActive(id: string, isActive: boolean): Promise<BannerRow> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { data, error } = await supabase
      .from("banners")
      .update({ is_active: isActive })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error toggling banner ${id}:`, error);
    throw error;
  }
}

/**
 * Deletes a banner
 */
export async function deleteBanner(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { error } = await supabase.from("banners").delete().eq("id", id);

    if (error) throw error;
  } catch (error) {
    console.error(`Error deleting banner ${id}:`, error);
    throw error;
  }
}

/**
 * Deletes all banners
 */
export async function deleteAllBanners(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { error } = await supabase.from("banners").delete().neq("id", "");

    if (error) throw error;
  } catch (error) {
    console.error("Error deleting all banners:", error);
    throw error;
  }
}

/**
 * Deactivates all banners
 */
export async function deactivateAllBanners(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase not configured");
  }

  try {
    const { error } = await supabase
      .from("banners")
      .update({ is_active: false })
      .neq("id", "");

    if (error) throw error;
  } catch (error) {
    console.error("Error deactivating all banners:", error);
    throw error;
  }
}
