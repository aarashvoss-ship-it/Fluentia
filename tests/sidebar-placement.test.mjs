import assert from "node:assert/strict";
import test from "node:test";
import { mapSidebarBlocksToMainBlocks } from "../lib/sidebar-placement.ts";

test("does not positionally attach an unlinked sidebar to a full-width empty row", () => {
  const placements = mapSidebarBlocksToMainBlocks(
    [
      { id: "full-width", layoutMode: "inline-row", rowEmptyMode: "full" },
      { id: "regular" },
    ],
    [{ id: "sidebar" }],
  );

  assert.deepEqual(placements.get("full-width"), []);
  assert.deepEqual(placements.get("regular"), [{ id: "sidebar" }]);
});

test("keeps explicitly linked sidebars on full-width-configured rows", () => {
  const placements = mapSidebarBlocksToMainBlocks(
    [{ id: "main", layoutMode: "inline-row", rowEmptyMode: "full" }],
    [{ id: "sidebar", parentMainBlockId: "main" }],
  );

  assert.deepEqual(placements.get("main"), [{ id: "sidebar", parentMainBlockId: "main" }]);
});

test("preserves positional sidebar placement for other rows", () => {
  const placements = mapSidebarBlocksToMainBlocks(
    [{ id: "main", layoutMode: "inline-row", rowEmptyMode: "empty" }],
    [{ id: "sidebar" }],
  );

  assert.deepEqual(placements.get("main"), [{ id: "sidebar" }]);
});
