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

test("keeps explicitly linked sidebars from expanding their rows", () => {
  const placements = mapSidebarBlocksToMainBlocks(
    [{ id: "main", layoutMode: "inline-row", rowEmptyMode: "full" }],
    [{ id: "sidebar", parentMainBlockId: "main" }],
  );

  assert.equal(isFullWidthWhenSidebarEmpty(
    { id: "main", layoutMode: "inline-row", rowEmptyMode: "full" },
    placements.get("main")?.length,
  ), false);
  assert.deepEqual(placements.get("main"), [{ id: "sidebar", parentMainBlockId: "main" }]);
});

test("uses a selected sidebar instead of expanding the main block", () => {
  const mainBlock = {
    id: "main",
    layoutMode: "inline-row",
    rowEmptyMode: "full",
    sidebarBlockId: "sidebar",
  };
  const placements = mapSidebarBlocksToMainBlocks(
    [mainBlock],
    [{ id: "sidebar" }],
  );

  assert.equal(isFullWidthWhenSidebarEmpty(mainBlock, placements.get("main")?.length), false);
  assert.deepEqual(placements.get("main"), [{ id: "sidebar" }]);
});

test("treats the legacy sidebar selection as selected instead of showing an empty row", () => {
  const mainBlock = {
    id: "main",
    layoutMode: "inline-row",
    rowEmptyMode: "full",
    alignNextTo: "sidebar",
  };
  const placements = mapSidebarBlocksToMainBlocks(
    [mainBlock],
    [{ id: "sidebar" }],
  );

  assert.equal(isFullWidthWhenSidebarEmpty(mainBlock, placements.get("main")?.length), false);
  assert.deepEqual(placements.get("main"), [{ id: "sidebar" }]);
});

test("preserves positional sidebar placement for other rows", () => {
  const placements = mapSidebarBlocksToMainBlocks(
    [{ id: "main", layoutMode: "inline-row", rowEmptyMode: "empty" }],
    [{ id: "sidebar" }],
  );

  assert.deepEqual(placements.get("main"), [{ id: "sidebar" }]);
});
