"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  createResourceAsset as createResourceAssetRecord,
  deleteResourceAsset as deleteResourceAssetRecord,
  fetchResourceAssets,
  updateResourceAsset as updateResourceAssetRecord,
} from "@/lib/services/resource-hub-service";
import type { ResourceAsset, ResourceAssetInput } from "@/types/resource-hub";

export interface ResourceAssetsSnapshot {
  assets: ResourceAsset[];
  instructorId: string | null;
  loading: boolean;
  error: string | null;
}

const listeners = new Set<() => void>();
const initialSnapshot: ResourceAssetsSnapshot = {
  assets: [],
  instructorId: null,
  loading: true,
  error: null,
};

let snapshot = initialSnapshot;
let loadedInstructorId: string | null = null;
let inFlightInstructorId: string | null = null;
let inFlightLoad: Promise<void> | null = null;
let loadSequence = 0;

function publish(nextSnapshot: ResourceAssetsSnapshot) {
  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener());
}

export function getResourceAssetsSnapshot() {
  return snapshot;
}

export function subscribeToResourceAssets(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadResourceAssets(instructorId: string) {
  if (!instructorId) {
    publish({ assets: [], instructorId: null, loading: false, error: "An instructor ID is required to load Resource Hub assets." });
    return;
  }
  if (loadedInstructorId === instructorId && !snapshot.error) return;
  if (inFlightInstructorId === instructorId && inFlightLoad) return inFlightLoad;

  const sequence = ++loadSequence;
  inFlightInstructorId = instructorId;
  publish({ assets: snapshot.instructorId === instructorId ? snapshot.assets : [], instructorId, loading: true, error: null });
  inFlightLoad = fetchResourceAssets(instructorId)
    .then((assets) => {
      if (sequence !== loadSequence) return;
      loadedInstructorId = instructorId;
      publish({ assets, instructorId, loading: false, error: null });
    })
    .catch((error: unknown) => {
      if (sequence !== loadSequence) return;
      loadedInstructorId = null;
      publish({
        assets: [],
        instructorId,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load Resource Hub assets.",
      });
    })
    .finally(() => {
      if (sequence === loadSequence) {
        inFlightInstructorId = null;
        inFlightLoad = null;
      }
    });

  return inFlightLoad;
}

export function useResourceAssets(instructorId: string) {
  const state = useSyncExternalStore(subscribeToResourceAssets, getResourceAssetsSnapshot, () => initialSnapshot);

  useEffect(() => {
    void loadResourceAssets(instructorId);
  }, [instructorId]);

  return state;
}

export async function addResourceAsset(assetData: ResourceAssetInput) {
  const asset = await createResourceAssetRecord(assetData);
  if (snapshot.instructorId && snapshot.instructorId !== asset.instructorId) return asset;
  loadedInstructorId = asset.instructorId;
  publish({
    assets: [asset, ...snapshot.assets.filter(({ id }) => id !== asset.id)],
    instructorId: asset.instructorId,
    loading: false,
    error: null,
  });
  return asset;
}

export async function updateResourceAsset(assetId: string, assetData: Partial<ResourceAssetInput>) {
  const asset = await updateResourceAssetRecord(assetId, assetData);
  publish({
    ...snapshot,
    assets: snapshot.assets.map((current) => current.id === asset.id ? asset : current),
  });
  return asset;
}

export async function deleteResourceAsset(assetId: string) {
  await deleteResourceAssetRecord(assetId);
  publish({
    ...snapshot,
    assets: snapshot.assets.filter(({ id }) => id !== assetId),
  });
}
