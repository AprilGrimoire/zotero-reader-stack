const test = require("node:test");
const assert = require("node:assert/strict");
const { parseShortcut } = require("../content/keymap.js");

test("blank shortcuts are disabled", () => {
  assert.equal(parseShortcut(""), null);
  assert.equal(parseShortcut("   "), null);
});

test("modifier shortcuts parse to XUL key attributes", () => {
  assert.deepEqual(parseShortcut("Accel+Alt+P"), {
    key: "P",
    modifiers: ["accel", "alt"],
    shortcut: "Accel+Alt+P"
  });

  assert.deepEqual(parseShortcut("Ctrl+Shift+["), {
    key: "[",
    modifiers: ["control", "shift"],
    shortcut: "Ctrl+Shift+["
  });
});

test("named keys parse to XUL keycodes", () => {
  assert.deepEqual(parseShortcut("Shift+Delete"), {
    keycode: "VK_DELETE",
    modifiers: ["shift"],
    shortcut: "Shift+Delete"
  });

  assert.deepEqual(parseShortcut("Alt+Left"), {
    keycode: "VK_LEFT",
    modifiers: ["alt"],
    shortcut: "Alt+Left"
  });
});

test("invalid shortcuts fail clearly", () => {
  assert.throws(() => parseShortcut("Ctrl+Shift"), /missing/);
  assert.throws(() => parseShortcut("Ctrl+A+B"), /more than one/);
});
