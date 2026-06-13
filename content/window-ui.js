(function (global) {
  "use strict";

  const NS = global.Zotero.ReaderPositionStack = global.Zotero.ReaderPositionStack || {};

  const COMMANDS = [
    ["push", "Push Position"],
    ["pop", "Pop Position"],
    ["forward", "Forward Branch"],
    ["select", "Select Position..."],
    ["delete-node", "Delete Current Node"],
    ["delete-children", "Delete Current Children"],
    ["undo-delete", "Undo Delete"]
  ];

  class WindowUI {
    constructor(controller) {
      this.controller = controller;
      this.windows = new Set();
      this.keymap = new NS.Keymap({
        commands: COMMANDS.map(([command]) => command),
        commandID: (command) => this.commandID(command)
      });
      this.shortcutObserverIDs = [];
      this.observeShortcutPrefs();
    }

    register(win) {
      if (!win?.document || this.windows.has(win)) {
        return;
      }
      this.windows.add(win);
      this.installCommands(win);
      this.installMenu(win);
      this.installKeys(win);
    }

    unregister(win) {
      this.windows.delete(win);
      if (!win?.document) {
        return;
      }
      win.document.querySelectorAll("[data-reader-position-stack]").forEach((node) => node.remove());
    }

    unregisterAll() {
      for (let win of [...this.windows]) {
        this.unregister(win);
      }
    }

    shutdown() {
      this.unregisterAll();
      this.unobserveShortcutPrefs();
    }

    installCommands(win) {
      let doc = win.document;
      let commandSet = doc.getElementById("mainCommandSet") || doc.documentElement;
      for (let [command] of COMMANDS) {
        let id = this.commandID(command);
        if (doc.getElementById(id)) {
          continue;
        }
        let node = doc.createXULElement("command");
        node.setAttribute("id", id);
        node.setAttribute("data-reader-position-stack", "true");
        node.addEventListener("command", () => this.controller.handleCommand(command, win));
        commandSet.append(node);
      }
    }

    installKeys(win) {
      this.keymap.install(win);
      this.keymap.updateMenuKeys(win);
    }

    refreshKeys() {
      for (let win of this.windows) {
        this.installKeys(win);
      }
    }

    observeShortcutPrefs() {
      if (this.shortcutObserverIDs.length || !global.Zotero?.Prefs) {
        return;
      }
      for (let pref of this.keymap.preferenceNames()) {
        this.shortcutObserverIDs.push(
          global.Zotero.Prefs.registerObserver(pref, () => this.refreshKeys(), true)
        );
      }
    }

    unobserveShortcutPrefs() {
      for (let id of this.shortcutObserverIDs) {
        try {
          global.Zotero.Prefs.unregisterObserver(id);
        }
        catch (e) {
          global.Zotero.logError(e);
        }
      }
      this.shortcutObserverIDs = [];
    }

    installMenu(win) {
      let doc = win.document;
      let goPopup = doc.getElementById("menu_goPopup");
      if (!goPopup || doc.getElementById("reader-position-stack-menu")) {
        return;
      }

      let separator = doc.createXULElement("menuseparator");
      separator.setAttribute("class", "menu-type-reader");
      separator.setAttribute("data-reader-position-stack", "true");
      goPopup.append(separator);

      let menu = doc.createXULElement("menu");
      menu.setAttribute("id", "reader-position-stack-menu");
      menu.setAttribute("label", "Reader Position Stack");
      menu.setAttribute("class", "menu-type-reader");
      menu.setAttribute("data-reader-position-stack", "true");
      let popup = doc.createXULElement("menupopup");
      popup.addEventListener("popupshowing", () => this.update(win));
      menu.append(popup);

      for (let [command, label] of COMMANDS) {
        let item = doc.createXULElement("menuitem");
        item.setAttribute("id", "reader-position-stack-menuitem-" + command);
        item.setAttribute("label", label);
        item.setAttribute("command", this.commandID(command));
        item.setAttribute("data-reader-position-stack", "true");
        popup.append(item);
        if (command === "select" || command === "delete-children") {
          popup.append(doc.createXULElement("menuseparator"));
        }
      }
      goPopup.append(menu);
      this.update(win);
      this.keymap.updateMenuKeys(win);
    }

    update(win) {
      let doc = win.document;
      let active = !!this.controller.adapter.getActiveReader(win);
      let treeInfo = active ? this.controller.getActiveTree(win, { silent: true }) : null;
      let current = treeInfo?.tree ? this.controller.model.getCurrentNode(treeInfo.tree) : null;
      let canPop = !!current && current.id !== treeInfo.tree.rootID;
      let canForward = !!current?.childIDs?.length;
      let canDeleteCurrent = canPop;
      let canDeleteChildren = !!current?.childIDs?.length;
      let canUndo = !!treeInfo && this.controller.canUndoDelete(treeInfo.itemID);

      let states = {
        "push": active,
        "pop": active && canPop,
        "forward": active && canForward,
        "select": active,
        "delete-node": active && canDeleteCurrent,
        "delete-children": active && canDeleteChildren,
        "undo-delete": active && canUndo
      };
      for (let [command] of COMMANDS) {
        let commandNode = doc.getElementById(this.commandID(command));
        if (commandNode) {
          commandNode.setAttribute("disabled", states[command] ? "false" : "true");
          if (states[command]) {
            commandNode.removeAttribute("disabled");
          }
        }
      }
    }

    commandID(command) {
      return "reader-position-stack-command-" + command;
    }
  }

  NS.WindowUI = WindowUI;
})(this);
