export interface SidebarPlacementMainBlock {
  id: string;
  layoutMode?: "global" | "inline-row";
  sidebarBlockId?: string;
  alignNextTo?: string;
  relatedMainBlockIds?: string[];
}

export interface SidebarPlacementBlock {
  id: string;
  parentMainBlockId?: string;
}

export function mapSidebarBlocksToMainBlocks<T extends SidebarPlacementBlock>(
  mainBlocks: readonly SidebarPlacementMainBlock[],
  sidebarBlocks: readonly T[],
): Map<string, T[]> {
  const placements = new Map(mainBlocks.map((block) => [block.id, [] as T[]]));
  const placedSidebarIds = new Set<string>();

  const findMainBlock = (mainBlockId: string) => mainBlocks.find((block) =>
    block.id === mainBlockId || block.relatedMainBlockIds?.includes(mainBlockId),
  );
  const placeSidebarBlock = (mainBlock: SidebarPlacementMainBlock, sidebarBlock: T) => {
    placements.get(mainBlock.id)?.push(sidebarBlock);
    placedSidebarIds.add(sidebarBlock.id);
  };

  for (const sidebarBlock of sidebarBlocks) {
    if (!sidebarBlock.parentMainBlockId) continue;
    const mainBlock = findMainBlock(sidebarBlock.parentMainBlockId);
    if (mainBlock) placeSidebarBlock(mainBlock, sidebarBlock);
  }

  for (const mainBlock of mainBlocks) {
    if (placements.get(mainBlock.id)?.length || mainBlock.layoutMode !== "inline-row") continue;
    const selectedSidebarId = mainBlock.sidebarBlockId || mainBlock.alignNextTo;
    const sidebarBlock = sidebarBlocks.find((candidate) => candidate.id === selectedSidebarId);
    if (sidebarBlock && !placedSidebarIds.has(sidebarBlock.id)) {
      placeSidebarBlock(mainBlock, sidebarBlock);
    }
  }

  if (mainBlocks.length === 0) return placements;

  sidebarBlocks.forEach((sidebarBlock, sidebarIndex) => {
    if (placedSidebarIds.has(sidebarBlock.id)) return;
    const positionalMainBlock = mainBlocks[Math.min(sidebarIndex, mainBlocks.length - 1)];
    placeSidebarBlock(positionalMainBlock, sidebarBlock);
  });

  const sidebarOrder = new Map(sidebarBlocks.map((block, index) => [block.id, index]));
  for (const blocks of placements.values()) {
    blocks.sort((left, right) => (sidebarOrder.get(left.id) ?? 0) - (sidebarOrder.get(right.id) ?? 0));
  }

  return placements;
}
