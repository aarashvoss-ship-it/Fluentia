export type MainCategory = "documents" | "videos" | "audios" | "visuals" | "others";

export type SubCategory =
  | "eBooks"
  | "PDFs"
  | "Texts"
  | "Lyrics"
  | "YouTube"
  | "Movies"
  | "TV Shows"
  | "Other Videos"
  | "Audiobooks"
  | "Podcasts"
  | "Songs"
  | "Instrumental"
  | "Study Room Music"
  | "Infographics"
  | "Images"
  | "Diagrams"
  | "Flashcards"
  | "General";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "All Levels";

export interface ResourceAsset {
  id: string;
  instructorId: string;
  title: string;
  description?: string;
  mainCategory: MainCategory;
  subCategory: SubCategory;
  url: string;
  isExternalLink: boolean;
  isDownloadable: boolean;
  cefrLevel: CEFRLevel;
  tags: string[];
  resourceType?: string;
  content?: Record<string, unknown>;
  originalFilename?: string | null;
  mediaType?: string | null;
  storagePath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceAssetInput {
  title: string;
  description?: string;
  mainCategory: MainCategory;
  subCategory: SubCategory;
  url: string;
  isDownloadable: boolean;
  cefrLevel: CEFRLevel;
  tags: string[];
  resourceType?: string;
  content?: Record<string, unknown>;
  originalFilename?: string | null;
  mediaType?: string | null;
  storagePath?: string | null;
}

export interface ResourceAssetRow {
  id: string;
  instructor_id: string;
  title: string;
  description: string | null;
  main_category: MainCategory;
  sub_category: SubCategory;
  url: string;
  allow_student_download: boolean;
  cefr_level: CEFRLevel;
  tags: string[];
  resource_type: string;
  content: Record<string, unknown>;
  original_filename: string | null;
  media_type: string | null;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
}
