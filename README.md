# Zotero Reader Position Stack

Zotero Reader Position Stack is a Zotero desktop plugin that adds an explicit, persistent position tree for each reader attachment. It is useful when reading papers or books non-linearly and you want to save positions, move back to a parent position, and return to branches without relying on Zotero's normal linear navigation history.

The plugin stores Zotero reader positions as opaque restorable payloads. The tree model is independent of PDF, EPUB, or snapshot-specific details.

## Features

- Per-attachment persistent position trees.
- Explicit `Push Position`, `Pop Position`, and `Forward Branch` commands.
- A popup tree selector with keyboard navigation.
- Manual subtree deletion and session-only delete undo.
- User-configurable keyboard shortcuts.
- Reader menu entries under `Go -> Reader Position Stack`.

## Compatibility

This plugin targets Zotero desktop 9.0.4 or newer.

Zotero 6 and older are not supported. Zotero 7 compatibility has not been tested.

## Installation

Download `reader-position-stack.xpi` from the release artifacts and install it in Zotero:

1. Open Zotero.
2. Go to `Tools -> Add-ons`.
3. Choose `Install Add-on From File...`.
4. Select `reader-position-stack.xpi`.
5. Restart Zotero.

For development from this source tree, create an extension proxy file in your Zotero profile's `extensions` directory:

```text
reader-position-stack@local
```

The file contents should be the absolute path to this repository root:

```text
/path/to/zotero-reader-position-stack
```

Restart Zotero after creating or changing the proxy.

## Usage

Open a PDF, EPUB, or snapshot in Zotero Reader and use `Go -> Reader Position Stack`.

- `Push Position` stores the active reader position as a child of the current tree node.
- `Pop Position` moves to the current node's parent, preserving the popped branch.
- `Forward Branch` moves to the last-active child branch.
- `Select Position...` opens the tree selector.
- `Delete Current Node` deletes the current node subtree, except the root.
- `Delete Current Children` deletes all children of the current node.
- `Undo Delete` restores the most recent delete transaction for the active document during the current Zotero session.

Inside the tree selector:

- `Up` / `Down` changes the selected row.
- `Home` / `End` jumps to the first or last row.
- `Enter` navigates to the selected node.
- `Delete` deletes the selected node.
- `Shift+Delete` deletes the selected node's children.
- `Escape` closes the selector.

The selector updates while it is open when the active position changes.

## Keyboard Shortcuts

No shortcuts are assigned by default.

Configure shortcuts in Zotero Preferences under `Reader Position Stack`. Each field accepts strings such as:

```text
Accel+Alt+P
Ctrl+Shift+[
Shift+Delete
Alt+Left
F8
```

`Accel` maps to Ctrl on Linux and Windows and Cmd on macOS. Leave a field blank to disable that shortcut. Changes apply to open Zotero windows without restarting.

## Persistence

Tree data is stored in the Zotero profile as:

```text
reader-position-stack.json
```

Delete undo is intentionally not persisted. Only the most recent delete transaction per attachment is kept in memory for the current Zotero session.

## Development

Install dependencies if needed, then run:

```sh
npm test
npm run build
```

The packaged extension is written to:

```text
dist/reader-position-stack.xpi
```

`dist/` is ignored by git because it contains generated artifacts.

## Release Checklist

1. Update `version` in `manifest.json` and `package.json`.
2. Run `npm test`.
3. Run `npm run build`.
4. Upload `dist/reader-position-stack.xpi` to the GitHub release.
5. Install the uploaded XPI in a clean Zotero profile and smoke-test push, pop, forward, selector navigation, deletion, undo delete, and shortcut configuration.

## Project Layout

- `bootstrap.js`: Zotero plugin bootstrap and chrome registration.
- `content/controller.js`: command handling and lifecycle coordination.
- `content/reader-adapter.js`: Zotero Reader capture and restore integration.
- `content/tree-model.js`: persistent tree model.
- `content/selector.js`: popup selector UI.
- `content/keymap.js`: preference-backed shortcut parsing and binding.
- `preferences.xhtml`, `preferences.css`, `prefs.js`: shortcut preference UI and defaults.
- `tests/`: Node tests for pure logic.
