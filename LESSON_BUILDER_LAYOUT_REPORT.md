# Lesson Builder Layout: Technical Analysis

## Current model

Main content blocks carry `layoutMode` (`global` or `inline-row`), optional
`sidebarBlockId`/`alignNextTo` references, and two empty-row settings
(`rowEmptyMode` and its legacy alias `whenEmpty`). Sidebar blocks live in a
separate per-step collection and can independently point back with
`parentMainBlockId`. The renderer must reconcile both directions, hide linked
cards from the unlinked sidebar list, and special-case questions and empty rows.

## Why it is fragile

- Layout intent is split across main-block fields and a second sidebar-block
  collection, with overlapping references and legacy aliases.
- Each block was rendered as a separate 8/4-column grid row. CSS Grid sizes each
  row to its tallest cell; putting the complete unlinked sidebar in the first
  row therefore made every following main block wait for the sidebar's height.
- Student delivery, instructor preview, and workstation preview each perform
  their own attachment resolution and layout rendering. Small behavior
  differences can make the editor preview disagree with the lesson students see.
- Special cases for questions, inactive blocks, missing attachments, and
  full-width empty rows multiply the number of possible layout combinations.

## Recommended post-release simplification

Make the default stage a single ordered stream of typed content blocks. A block
owns its content and type-specific settings; vertical order is the only layout
rule instructors need for ordinary lessons. Provide one explicit **Columns**
container for the uncommon case where content must be deliberately aligned:
instructors add blocks to its left and right lanes, and the container stacks
normally on mobile. Do not make individual blocks carry both row modes and
cross-references to a separate sidebar collection. If reusable callouts are
needed, model them as ordinary blocks that can be moved and reordered.

Use one shared stage renderer for published lessons and both instructor
previews. Migrate existing lessons by translating the legacy sidebar data and
attachment fields into ordered blocks/column containers, while retaining a
versioned compatibility reader until all stored lessons have been migrated.
Roll out in stages: define the new schema and migration, build the shared editor
and renderer, compare legacy and new previews, then remove legacy controls and
aliases after persisted content is verified.
