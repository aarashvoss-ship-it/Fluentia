import type { ResourceAsset } from "@/types/resource-hub";

const listeners = new Set<() => void>();

let assets: ResourceAsset[] = [
  {
    id: "mock-youtube-video",
    title: "Everyday English: Ordering at a Cafe",
    description: "A short dialogue for practicing polite requests and ordering food.",
    mainCategory: "videos",
    subCategory: "YouTube",
    url: "https://www.youtube.com/watch?v=example",
    isExternalLink: true,
    isDownloadable: false,
    cefrLevel: "A2",
    tags: ["speaking", "food", "dialogue"],
    createdAt: "2026-10-06T10:00:00.000Z",
  },
  {
    id: "mock-pdf-ebook",
    title: "English Grammar Quick Reference",
    description: "A printable reference sheet for common grammar structures.",
    mainCategory: "documents",
    subCategory: "PDFs",
    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    isExternalLink: true,
    isDownloadable: true,
    cefrLevel: "B1",
    tags: ["grammar", "reference", "printable"],
    createdAt: "2026-10-05T10:00:00.000Z",
  },
  {
    id: "mock-infographic",
    title: "The Water Cycle",
    description: "A visual guide to the stages of the water cycle.",
    mainCategory: "visuals",
    subCategory: "Infographics",
    url: "https://commons.wikimedia.org/wiki/File:Water_cycle.png",
    isExternalLink: true,
    isDownloadable: false,
    cefrLevel: "A1",
    tags: ["science", "vocabulary", "visual"],
    createdAt: "2026-10-04T10:00:00.000Z",
  },
  {
    id: "mock-podcast",
    title: "A Week in London",
    description: "A beginner-friendly listening activity about daily routines.",
    mainCategory: "audios",
    subCategory: "Podcasts",
    url: "https://www.bbc.co.uk/learningenglish/",
    isExternalLink: true,
    isDownloadable: false,
    cefrLevel: "A2",
    tags: ["listening", "travel", "daily life"],
    createdAt: "2026-10-03T10:00:00.000Z",
  },
  {
    id: "mock-flashcards",
    title: "Travel Vocabulary Cards",
    description: "A set of visual prompts for essential travel vocabulary.",
    mainCategory: "visuals",
    subCategory: "Flashcards",
    url: "https://en.wiktionary.org/wiki/travel",
    isExternalLink: true,
    isDownloadable: true,
    cefrLevel: "All Levels",
    tags: ["travel", "vocabulary"],
    createdAt: "2026-10-02T10:00:00.000Z",
  },
];

export function getResourceAssets() {
  return assets;
}

export function subscribeToResourceAssets(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addResourceAsset(asset: ResourceAsset) {
  assets = [asset, ...assets];
  listeners.forEach((listener) => listener());
}

export function deleteResourceAsset(assetId: string) {
  assets = assets.filter(({ id }) => id !== assetId);
  listeners.forEach((listener) => listener());
}
