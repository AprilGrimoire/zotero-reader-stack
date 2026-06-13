# Zotero Reader Position Stack

Zotero Reader Position Stack is a Zotero 9.0.4 desktop plugin that adds an explicit per-attachment position tree for Zotero Reader.

It stores reader positions, not PDF- or EPUB-specific concepts. The Zotero internals needed to capture and restore exact locations are isolated in `content/reader-adapter.js`.

## Commands

The plugin adds a `Go -> Reader Position Stack` menu in reader contexts:

- `Push Position`
- `Pop Position`
- `Forward Branch`
- `Select Position...`
- `Delete Current Node`
- `Delete Current Children`
- `Undo Delete`

No default shortcuts are assigned. The plugin creates command nodes in Zotero windows so shortcuts can be bound externally without hardcoding key choices in the extension.

Shortcuts are user-configurable in Zotero Preferences under `Reader Position Stack`. Each field accepts strings such as `Accel+Alt+P`, `Ctrl+Shift+[`, `Shift+Delete`, or `F8`. Leave a field blank to disable that shortcut. Changes apply to open Zotero windows without restarting.

## Development Install

For Zotero's extension proxy workflow, create a file named after the extension ID in the Zotero profile's `extensions` directory:

```text
reader-position-stack@local
```

The file contents should be the absolute path to this source directory, for example:

```text
/home/april/CrossDistrio/april/Developments/QoL/zotero-reader-stack
```

Restart Zotero after creating or changing the proxy.

## Build And Test

```sh
npm test
npm run build
```

The packaged extension is written to `dist/reader-position-stack.xpi`.

## Persistence

Tree data is stored in the Zotero profile as `reader-position-stack.json`.

Delete undo is session-only. Only the most recent delete transaction per attachment is kept in memory and it is not serialized.
