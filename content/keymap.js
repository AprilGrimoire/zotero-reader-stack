(function (global) {
  "use strict";

  const PREF_ROOT = "extensions.reader-position-stack.shortcuts.";

  const MODIFIER_ALIASES = {
    accel: "accel",
    accelerator: "accel",
    cmdorctrl: "accel",
    primary: "accel",
    ctrl: "control",
    control: "control",
    ctl: "control",
    cmd: "meta",
    command: "meta",
    meta: "meta",
    win: "meta",
    super: "meta",
    shift: "shift",
    alt: "alt",
    option: "alt",
    opt: "alt"
  };

  const MODIFIER_ORDER = ["accel", "control", "alt", "shift", "meta"];

  const KEYCODES = {
    backspace: "VK_BACK",
    tab: "VK_TAB",
    enter: "VK_RETURN",
    return: "VK_RETURN",
    escape: "VK_ESCAPE",
    esc: "VK_ESCAPE",
    space: "VK_SPACE",
    " ": "VK_SPACE",
    pageup: "VK_PAGE_UP",
    pgup: "VK_PAGE_UP",
    pagedown: "VK_PAGE_DOWN",
    pgdn: "VK_PAGE_DOWN",
    end: "VK_END",
    home: "VK_HOME",
    left: "VK_LEFT",
    arrowleft: "VK_LEFT",
    up: "VK_UP",
    arrowup: "VK_UP",
    right: "VK_RIGHT",
    arrowright: "VK_RIGHT",
    down: "VK_DOWN",
    arrowdown: "VK_DOWN",
    insert: "VK_INSERT",
    ins: "VK_INSERT",
    delete: "VK_DELETE",
    del: "VK_DELETE"
  };

  function normalizeToken(token) {
    return token.trim().replace(/[\s_-]/g, "").toLowerCase();
  }

  function parseKey(token) {
    let normalized = normalizeToken(token);
    let keycode = KEYCODES[normalized];
    if (keycode) {
      return { keycode };
    }

    let functionKeyMatch = /^f([1-9]|1[0-9]|2[0-4])$/.exec(normalized);
    if (functionKeyMatch) {
      return { keycode: "VK_F" + functionKeyMatch[1] };
    }

    let namedCharacters = {
      plus: "+",
      comma: ",",
      period: ".",
      dot: ".",
      slash: "/",
      backslash: "\\",
      quote: "'",
      apostrophe: "'",
      semicolon: ";",
      minus: "-",
      dash: "-",
      equals: "=",
      equal: "=",
      bracketleft: "[",
      leftbracket: "[",
      bracketright: "]",
      rightbracket: "]"
    };
    if (namedCharacters[normalized]) {
      return { key: namedCharacters[normalized] };
    }

    if (token.length === 1) {
      return { key: /[a-z]/i.test(token) ? token.toUpperCase() : token };
    }

    throw new Error("Unknown shortcut key: " + token);
  }

  function parseShortcut(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return null;
    }

    let modifiers = new Set();
    let keyToken = null;
    for (let rawToken of String(value).split("+")) {
      let token = rawToken.trim();
      if (!token) {
        continue;
      }
      let modifier = MODIFIER_ALIASES[normalizeToken(token)];
      if (modifier) {
        modifiers.add(modifier);
      }
      else if (!keyToken) {
        keyToken = token;
      }
      else {
        throw new Error("Shortcut has more than one non-modifier key: " + value);
      }
    }

    if (!keyToken) {
      throw new Error("Shortcut is missing a non-modifier key: " + value);
    }

    let parsedKey = parseKey(keyToken);
    let orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
    return {
      ...parsedKey,
      modifiers: orderedModifiers,
      shortcut: String(value).trim()
    };
  }

  class Keymap {
    constructor({ commands, commandID, preferenceRoot = PREF_ROOT } = {}) {
      this.commands = commands || [];
      this.commandID = commandID;
      this.preferenceRoot = preferenceRoot;
    }

    preferenceName(command) {
      return this.preferenceRoot + command;
    }

    preferenceNames() {
      return this.commands.map((command) => this.preferenceName(command));
    }

    keyID(command) {
      return "reader-position-stack-key-" + command;
    }

    keysetID() {
      return "reader-position-stack-keyset";
    }

    getShortcut(command) {
      try {
        return global.Zotero.Prefs.get(this.preferenceName(command), true) || "";
      }
      catch (e) {
        return "";
      }
    }

    getParsedShortcut(command) {
      let shortcut = this.getShortcut(command);
      try {
        return parseShortcut(shortcut);
      }
      catch (e) {
        global.Zotero.logError(e);
        return null;
      }
    }

    install(win) {
      let doc = win.document;
      doc.getElementById(this.keysetID())?.remove();

      let keyset = doc.createXULElement("keyset");
      keyset.setAttribute("id", this.keysetID());
      keyset.setAttribute("data-reader-position-stack", "true");

      for (let command of this.commands) {
        let shortcut = this.getParsedShortcut(command);
        if (!shortcut) {
          continue;
        }

        let key = doc.createXULElement("key");
        key.setAttribute("id", this.keyID(command));
        key.setAttribute("command", this.commandID(command));
        key.setAttribute("data-reader-position-stack", "true");
        if (shortcut.key) {
          key.setAttribute("key", shortcut.key);
        }
        else {
          key.setAttribute("keycode", shortcut.keycode);
        }
        if (shortcut.modifiers.length) {
          key.setAttribute("modifiers", shortcut.modifiers.join(" "));
        }
        keyset.append(key);
      }

      if (keyset.childElementCount) {
        doc.documentElement.append(keyset);
      }
    }

    updateMenuKeys(win) {
      let doc = win.document;
      for (let command of this.commands) {
        let menuitem = doc.getElementById("reader-position-stack-menuitem-" + command);
        if (!menuitem) {
          continue;
        }
        let key = doc.getElementById(this.keyID(command));
        if (key) {
          menuitem.setAttribute("key", key.id);
        }
        else {
          menuitem.removeAttribute("key");
        }
      }
    }
  }

  const api = { Keymap, parseShortcut, PREF_ROOT };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (global.Zotero) {
    const NS = global.Zotero.ReaderPositionStack = global.Zotero.ReaderPositionStack || {};
    Object.assign(NS, api);
  }
})(this);
