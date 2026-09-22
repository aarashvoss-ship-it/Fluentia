/**
 * Zustand store for lesson editor state management
 * Handles local state mutations and syncs with Supabase
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { StrictStepContent, ContentBlock } from "@/types/lesson";
import {
  getLatestLessonVersion,
  getLessonBaseById,
  updateLesson,
  type LessonWithVersion,
} from "@/lib/lessons";

// ============================================================================
// Types
// ============================================================================

export interface LessonEditorState {
  // Lesson Data
  lesson: LessonWithVersion | null;
  routeLessonId: string | null;
  content: StrictStepContent;
  bannerUrl: string;

  // Loading & Error States
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveError: string | null;

  // Actions - Data Fetching
  hydrateLessonFromDatabase: (lessonId: string) => Promise<void>;

  // Actions - Content Updates (Local & Sync)
  addBlock: (stepId: keyof StrictStepContent, block: ContentBlock) => Promise<void>;
  updateBlock: (
    stepId: keyof StrictStepContent,
    blockId: string,
    updates: Partial<ContentBlock>
  ) => Promise<void>;
  deleteBlock: (stepId: keyof StrictStepContent, blockId: string) => Promise<void>;
  toggleBlock: (stepId: keyof StrictStepContent, blockId: string) => Promise<void>;
  reorderBlocks: (
    stepId: keyof StrictStepContent,
    fromIndex: number,
    toIndex: number
  ) => Promise<void>;

  // Actions - Metadata Updates
  updateBanner: (url: string) => Promise<void>;
  updateLessonMetadata: (title?: string, subject?: string) => Promise<void>;

  // Actions - Publishing
  publishLesson: () => Promise<void>;

  // Actions - State Reset
  reset: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useLessonEditorStore = create<LessonEditorState>()(
  immer((set, get) => ({
    // Initial State
    lesson: null,
    routeLessonId: null,
    content: {},
    bannerUrl: "",
    isLoading: false,
    isSaving: false,
    error: null,
    saveError: null,

    // ========================================================================
    // Data Fetching & Hydration
    // ========================================================================

    hydrateLessonFromDatabase: async (lessonId: string) => {
      set({ routeLessonId: lessonId });
      set({ isLoading: true, error: null });
      try {
        const lesson = await getLessonBaseById(lessonId);

        if (!lesson) {
          throw new Error(`Lesson ${lessonId} not found`);
        }

        set((state) => {
          state.lesson = lesson;
          state.content = lesson.content || {};
          state.bannerUrl = lesson.content?.coverImage || lesson.content?.bannerUrl || lesson.banner_url || "";
          state.isLoading = false;
        });

        void getLatestLessonVersion(lesson.id).then((version) => {
          if (!version) return;
          set((state) => {
            if (state.lesson?.id !== lesson.id) return;
            state.lesson.current_version = version;
            state.lesson.content = version.content;
            state.content = version.content as StrictStepContent;
          });
        }).catch((versionError) => {
          console.warn(`Background version load failed for ${lesson.id}:`, versionError);
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to load lesson";
        set({ error: errorMessage, isLoading: false });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    // ========================================================================
    // Block Operations with Supabase Sync
    // ========================================================================

    addBlock: async (stepId, block) => {
      const state = get();

      // Optimistic update
      set((draft) => {
        const stepContent = (draft.content[stepId] as any) || {};
        if (!stepContent.blocks) {
          stepContent.blocks = [];
        }
        stepContent.blocks.push(block);
        draft.content[stepId] = stepContent;
      });

      // Persist to Supabase
      if (state.lesson) {
        set({ isSaving: true, saveError: null });
        try {
          const currentState = get();
          if (!currentState.lesson || currentState.lesson.id !== currentState.routeLessonId) {
            throw new Error("Cannot save lesson content: active route lesson changed");
          }
          await updateLesson(currentState.routeLessonId, {
            content: currentState.content,
            changes_summary: `Added block to ${stepId}: ${block.title}`,
          });
          set({ isSaving: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to save block";
          set({ isSaving: false, saveError: errorMessage });
          throw error;
        }
      }
    },

    updateBlock: async (stepId, blockId, updates) => {
      const state = get();

      // Optimistic update
      set((draft) => {
        const stepContent = (draft.content[stepId] as any) || {};
        const blocks = stepContent.blocks || [];
        const blockIndex = blocks.findIndex((b: ContentBlock) => b.id === blockId);

        if (blockIndex !== -1) {
          blocks[blockIndex] = { ...blocks[blockIndex], ...updates };
        }
      });

      // Persist to Supabase
      if (state.lesson) {
        set({ isSaving: true, saveError: null });
        try {
          const currentState = get();
          if (!currentState.lesson || currentState.lesson.id !== currentState.routeLessonId) {
            throw new Error("Cannot save lesson content: active route lesson changed");
          }
          await updateLesson(currentState.routeLessonId, {
            content: currentState.content,
            changes_summary: `Updated block ${blockId} in ${stepId}`,
          });
          set({ isSaving: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to update block";
          set({ isSaving: false, saveError: errorMessage });
          throw error;
        }
      }
    },

    deleteBlock: async (stepId, blockId) => {
      const state = get();

      // Optimistic update
      set((draft) => {
        const stepContent = (draft.content[stepId] as any) || {};
        const blocks = stepContent.blocks || [];
        stepContent.blocks = blocks.filter((b: ContentBlock) => b.id !== blockId);
        draft.content[stepId] = stepContent;
      });

      // Persist to Supabase
      if (state.lesson) {
        set({ isSaving: true, saveError: null });
        try {
          const currentState = get();
          if (!currentState.lesson || currentState.lesson.id !== currentState.routeLessonId) {
            throw new Error("Cannot save lesson content: active route lesson changed");
          }
          await updateLesson(currentState.routeLessonId, {
            content: currentState.content,
            changes_summary: `Deleted block ${blockId} from ${stepId}`,
          });
          set({ isSaving: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to delete block";
          set({ isSaving: false, saveError: errorMessage });
          throw error;
        }
      }
    },

    toggleBlock: async (stepId, blockId) => {
      const state = get();

      // Optimistic update
      set((draft) => {
        const stepContent = (draft.content[stepId] as any) || {};
        const blocks = stepContent.blocks || [];
        const blockIndex = blocks.findIndex((b: ContentBlock) => b.id === blockId);

        if (blockIndex !== -1) {
          blocks[blockIndex].enabled = !blocks[blockIndex].enabled;
        }
      });

      // Persist to Supabase
      if (state.lesson) {
        set({ isSaving: true, saveError: null });
        try {
          const currentState = get();
          if (!currentState.lesson || currentState.lesson.id !== currentState.routeLessonId) {
            throw new Error("Cannot save lesson content: active route lesson changed");
          }
          await updateLesson(currentState.routeLessonId, {
            content: currentState.content,
            changes_summary: `Toggled block ${blockId} in ${stepId}`,
          });
          set({ isSaving: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to toggle block";
          set({ isSaving: false, saveError: errorMessage });
          throw error;
        }
      }
    },

    reorderBlocks: async (stepId, fromIndex, toIndex) => {
      const state = get();

      // Optimistic update
      set((draft) => {
        const stepContent = (draft.content[stepId] as any) || {};
        const blocks = stepContent.blocks || [];

        if (fromIndex >= 0 && fromIndex < blocks.length && toIndex >= 0 && toIndex < blocks.length) {
          const [movedBlock] = blocks.splice(fromIndex, 1);
          blocks.splice(toIndex, 0, movedBlock);
        }

        stepContent.blocks = blocks;
        draft.content[stepId] = stepContent;
      });

      // Persist to Supabase
      if (state.lesson) {
        set({ isSaving: true, saveError: null });
        try {
          const currentState = get();
          if (!currentState.lesson || currentState.lesson.id !== currentState.routeLessonId) {
            throw new Error("Cannot save lesson content: active route lesson changed");
          }
          await updateLesson(currentState.routeLessonId, {
            content: currentState.content,
            changes_summary: `Reordered blocks in ${stepId}`,
          });
          set({ isSaving: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to reorder blocks";
          set({ isSaving: false, saveError: errorMessage });
          throw error;
        }
      }
    },

    // ========================================================================
    // Metadata Updates
    // ========================================================================

    updateBanner: async (url: string) => {
      const state = get();

      // Optimistic update
      set({ bannerUrl: url });

      // Persist to Supabase
      if (state.lesson) {
        set({ isSaving: true, saveError: null });
        try {
          const currentState = get();
          if (!currentState.lesson || currentState.lesson.id !== currentState.routeLessonId) {
            throw new Error("Cannot save lesson content: active route lesson changed");
          }
          await updateLesson(currentState.routeLessonId, {
            banner_url: url,
            content: {
              ...currentState.content,
              bannerUrl: url,
            },
            changes_summary: "Updated lesson banner",
          });
          set({ isSaving: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to update banner";
          set({ isSaving: false, saveError: errorMessage });
          throw error;
        }
      }
    },

    updateLessonMetadata: async (title, subject) => {
      const state = get();

      // Optimistic update - note: metadata is on lesson row, not content
      if (state.lesson && title) {
        set((draft) => {
          if (draft.lesson) {
            draft.lesson.title = title;
          }
        });
      }

      // Persist to Supabase
      if (state.lesson) {
        set({ isSaving: true, saveError: null });
        try {
          const currentState = get();
          if (!currentState.lesson || currentState.lesson.id !== currentState.routeLessonId) {
            throw new Error("Cannot save lesson content: active route lesson changed");
          }
          await updateLesson(currentState.routeLessonId, {
            title: title || currentState.lesson.title,
            subject: subject || currentState.lesson.subject || undefined,
            changes_summary: "Updated lesson metadata",
          });
          set({ isSaving: false });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to update metadata";
          set({ isSaving: false, saveError: errorMessage });
          throw error;
        }
      }
    },

    // ========================================================================
    // Publishing
    // ========================================================================

    publishLesson: async () => {
      const state = get();

      if (!state.lesson) {
        throw new Error("No lesson loaded");
      }

      set({ isSaving: true, saveError: null });
      try {
        const currentState = get();
        if (!currentState.lesson || currentState.lesson.id !== currentState.routeLessonId) {
          throw new Error("Cannot save lesson content: active route lesson changed");
        }
        const updated = await updateLesson(currentState.routeLessonId, {
          status: "published",
          changes_summary: "Lesson published",
        });

        set((draft) => {
          draft.lesson = updated;
          draft.isSaving = false;
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to publish lesson";
        set({ isSaving: false, saveError: errorMessage });
        throw error;
      }
    },

    // ========================================================================
    // Reset
    // ========================================================================

    reset: () => {
      set({
        lesson: null,
        routeLessonId: null,
        content: {},
        bannerUrl: "",
        isLoading: false,
        isSaving: false,
        error: null,
        saveError: null,
      });
    },
  }))
);
