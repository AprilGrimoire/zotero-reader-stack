# Zotero Reader Position Stack Plugin Plan

## Target

Build a Zotero desktop plugin for Zotero 9.0.4 on Linux x86_64.

The plugin adds a persistent, per-document undo-tree for Zotero Reader positions
with explicit `push`, `pop`, branch-forward navigation, a pop-up tree selector,
manual pruning, and session-only undo for accidental deletes.

The history model is document-type independent. The tree stores reader
positions, not PDF-specific or EPUB-specific concepts.

## Core Behavior

- Maintain one undo-tree per Zotero attachment item.
- Register commands without hardcoded default shortcuts:
  - `push`: capture the active reader position as a new child of the current node.
  - `pop`: move to the parent node while preserving the popped branch.
  - `forward`: move to the last-active child branch.
  - `select`: open a pop-up tree selector.
  - `delete-node`: delete the selected or current node subtree, except root.
  - `delete-children`: delete all children of the selected or current node.
  - `undo-delete`: restore the most recent delete transaction for that document
    during the current Zotero session.
- Root is synthetic and undeletable.
- Position history is persistent, uncapped, and has no artificial expiration.
- Delete undo is not persistent. It is in-memory only, intended for misclick
  recovery.
- Do not hook automatic navigation capture in v1. Only explicit `push` creates
  nodes.

## Data Model

Persisted tree data:

- document attachment item ID
- root node ID
- current node ID
- nodes keyed by stable ID
- parent ID
- ordered child IDs
- last-active child ID
- opaque reader position payload
- display metadata such as page/section label, outline text, created time, and
  last visited time

Reader position payload:

- Store Zotero's opaque restorable reader location plus any available view state
  needed to restore the visible position.
- Do not expose PDF/page/scroll/EPUB-specific fields to the tree layer.
- The undo-tree layer must never branch on document type.

Runtime-only delete undo:

- Store a per-document most-recent delete transaction in memory.
- Include deleted subtree data, original parent and child index, and previous
  current node.
- Never serialize delete undo data to disk.

## Reader Integration

- Implement a narrow Zotero 9.0.4 reader adapter.
- Before coding the adapter, inspect Zotero 9.0.4's packaged reader internals,
  especially:
  - `chrome/content/zotero/xpcom/reader.js`
  - `resource/reader/reader.js`
- Adapter responsibilities:
  - find the active Zotero Reader instance
  - capture a document-type-independent restorable position
  - restore a stored position through Zotero's reader navigation mechanism
  - return a compact display label for the selector
  - fail gracefully without mutating history if the current reader view cannot
    provide a restorable position
- Keep all reader-internal access behind the adapter.

## UI

- Keyboard-first design with no hardcoded default shortcuts.
- Register commands so the user can bind shortcuts in Zotero.
- Add reader menu items for discoverability.
- No sidebar or toolbar buttons in v1.
- Add a pop-up tree selector:
  - shows the current document's tree as an indented list
  - highlights the current node
  - Enter navigates to the selected node
  - Escape closes
  - Delete deletes the selected node
  - Shift+Delete deletes the selected node's children
  - an `Undo Delete` action restores the latest session-only delete transaction
  - context menu exposes navigate, delete node, delete children, and undo delete

## Test Plan

- Install or run Zotero 9.0.4 Linux x86_64 in a development profile.
- Load the plugin from source using Zotero's extension proxy workflow.
- Verify push, pop, and forward across branching histories.
- Verify pushing after pop creates a sibling branch, not a replacement.
- Verify selector navigation, highlighting, keyboard controls, and context menu.
- Verify root cannot be deleted.
- Verify `delete-node` and `delete-children` update the tree and selector.
- Verify `undo-delete` restores the latest accidental delete during the same
  session.
- Verify delete undo disappears after Zotero restart.
- Verify persistent position history survives Zotero restart.
- Verify histories are isolated per attachment.
- Verify no-active-reader and unsupported-position cases show clear messages and
  do not corrupt stored trees.
- Package and install the `.xpi` into a clean Zotero 9.0.4 Linux profile.

## Assumptions

- Target is Zotero 9.0.4 Linux x86_64.
- Zotero 6 and older are out of scope.
- Zotero 7 compatibility is not required.
- The only visual UI in v1 is the pop-up selector.
