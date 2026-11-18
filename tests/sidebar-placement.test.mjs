import assert from "node:assert/strict";
import test from "node:test";
import {
  isFullWidthWhenSidebarEmpty,
  mapSidebarBlocksToMainBlocks,
} from "../lib/sidebar-placement.ts";

test("defaults an inline row with no saved empty mode to full width", () => {
  assert.equal(isFullWidthWhenSidebarEmpty({ id: "full-width", layoutMode: "inline-row" }), true);

  const placements = mapSidebarBlocksToMainBlocks(
    [
      { id: "full-width", layoutMode: "inline-row" },
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
