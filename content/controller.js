(function (global) {
  "use strict";

  const NS = global.Zotero.ReaderPositionStack = global.Zotero.ReaderPositionStack || {};
  const { TreeModel } = global.ReaderPositionStackTreeModel;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  class Controller {
    constructor() {
      this.model = new TreeModel();
      this.storage = new NS.Storage({ model: this.model });
      this.adapter = new NS.ReaderAdapter();
      this.selector = new NS.Selector({ model: this.model, controller: this });
      this.windowUI = new NS.WindowUI(this);
      this.deleteUndoByItemID = new Map();
      this.started = false;
      this.windowListener = null;
      this.preferencePaneID = null;
    }

    async startup({ id, version, rootURI }) {
      this.id = id;
      this.version = version;
      this.rootURI = rootURI;
      await this.registerPreferencePane(id, rootURI);
      await this.storage.init();
      this.started = true;
      this.installWindowListener();
      for (let win of this.getOpenWindows()) {
        this.windowUI.register(win);
      }
    }

    async shutdown() {
      this.selector.close();
      this.windowUI.shutdown();
      this.removeWindowListener();
      this.unregisterPreferencePane();
      this.deleteUndoByItemID.clear();
      if (this.started) {
        await this.storage.save();
      }
      this.started = false;
    }

    async registerPreferencePane(id, rootURI) {
      if (!Zotero.PreferencePanes?.register || this.preferencePaneID) {
        return;
      }
      try {
        this.preferencePaneID = await Zotero.PreferencePanes.register({
          pluginID: id,
          id: "reader-position-stack-preferences",
          label: "Reader Position Stack",
          src: rootURI + "preferences.xhtml",
          stylesheets: [rootURI + "preferences.css"]
        });
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    unregisterPreferencePane() {
      if (!this.preferencePaneID || !Zotero.PreferencePanes?.unregister) {
        return;
      }
      try {
        Zotero.PreferencePanes.unregister(this.preferencePaneID);
      }
      catch (e) {
        Zotero.logError(e);
      }
      this.preferencePaneID = null;
    }

    async onMainWindowLoad(win) {
      this.windowUI.register(win);
    }

    async onMainWindowUnload(win) {
      this.windowUI.unregister(win);
    }

    getOpenWindows() {
      let wins = [];
      let enumerator = Services.wm.getEnumerator(null);
      while (enumerator.hasMoreElements()) {
        let win = enumerator.getNext();
        if (win.document?.getElementById("menu_goPopup")) {
          wins.push(win);
        }
      }
      return wins;
    }

    installWindowListener() {
      if (this.windowListener) {
        return;
      }
      this.windowListener = {
        onOpenWindow: (xulWindow) => {
          let win = xulWindow.docShell.domWindow;
          win.addEventListener("load", () => {
            if (win.document?.getElementById("menu_goPopup")) {
              this.windowUI.register(win);
            }
          }, { once: true });
        },
        onCloseWindow: (xulWindow) => {
          let win = xulWindow.docShell.domWindow;
          this.windowUI.unregister(win);
        }
      };
      Services.wm.addListener(this.windowListener);
    }

    removeWindowListener() {
      if (!this.windowListener) {
        return;
      }
      Services.wm.removeListener(this.windowListener);
      this.windowListener = null;
    }

    getActiveTree(win, options = {}) {
      let reader = this.adapter.getActiveReader(win);
      if (!reader) {
        if (!options.silent) {
          this.notify(win, "No active Zotero Reader.");
        }
        return null;
      }
      return {
        itemID: reader.itemID,
        tree: this.storage.getTree(reader.itemID),
        reader
      };
    }

    async handleCommand(command, win, nodeID = null) {
      try {
        if (command === "push") {
          return await this.push(win);
        }
        if (command === "pop") {
          return await this.pop(win);
        }
        if (command === "forward") {
          return await this.forward(win);
        }
        if (command === "select") {
          return this.openSelector(win);
        }
        if (command === "delete-node") {
          return await this.deleteNode(win, nodeID);
        }
        if (command === "delete-children") {
          return await this.deleteChildren(win, nodeID);
        }
        if (command === "undo-delete") {
          return await this.undoDelete(win);
        }
      }
      catch (e) {
        Zotero.logError(e);
        this.notify(win, e.message || String(e));
      }
      finally {
        this.windowUI.update(win);
      }
    }

    async push(win) {
      let captured = await this.adapter.capture(win);
      let tree = this.storage.getTree(captured.itemID);
      let node = this.model.push(tree, captured.payload, captured.meta);
      await this.storage.save();
      this.refreshSelector(win, captured.itemID, tree);
      return node;
    }

    async pop(win) {
      let info = this.getActiveTree(win);
      if (!info) {
        return null;
      }
      let node = this.model.pop(info.tree);
      if (!node) {
        this.notify(win, "Already at the root position.");
        return null;
      }
      await this.storage.save();
      if (node.position) {
        await this.adapter.restore(win, info.itemID, node.position);
      }
      this.refreshSelector(win, info.itemID, info.tree);
      return node;
    }

    async forward(win) {
      let info = this.getActiveTree(win);
      if (!info) {
        return null;
      }
      let node = this.model.forward(info.tree);
      if (!node) {
        this.notify(win, "No forward branch from the current position.");
        return null;
      }
      await this.storage.save();
      await this.adapter.restore(win, info.itemID, node.position);
      this.refreshSelector(win, info.itemID, info.tree);
      return node;
    }

    openSelector(win) {
      let info = this.getActiveTree(win);
      if (!info) {
        return null;
      }
      this.selector.open(win, info.itemID, info.tree);
      return info.tree;
    }

    async navigateToNode(win, itemID, nodeID) {
      let tree = this.storage.getTree(itemID);
      let node = this.model.visit(tree, nodeID);
      await this.storage.save();
      if (node.position) {
        await this.adapter.restore(win, itemID, node.position);
      }
      this.refreshSelector(win, itemID, tree);
      this.windowUI.update(win);
      return node;
    }

    async deleteNode(win, nodeID = null) {
      let info = this.getActiveTree(win);
      if (!info) {
        return null;
      }
      nodeID ||= info.tree.currentID;
      let tx = this.model.deleteNode(info.tree, nodeID);
      if (!tx) {
        this.notify(win, "The root position cannot be deleted.");
        return null;
      }
      this.deleteUndoByItemID.set(String(info.itemID), clone(tx));
      await this.storage.save();
      await this.restoreCurrentIfNeeded(win, info.itemID, info.tree, tx);
      this.refreshSelector(win, info.itemID, info.tree);
      return tx;
    }

    async deleteChildren(win, nodeID = null) {
      let info = this.getActiveTree(win);
      if (!info) {
        return null;
      }
      nodeID ||= info.tree.currentID;
      let tx = this.model.deleteChildren(info.tree, nodeID);
      if (!tx) {
        this.notify(win, "This position has no child branches.");
        return null;
      }
      this.deleteUndoByItemID.set(String(info.itemID), clone(tx));
      await this.storage.save();
      await this.restoreCurrentIfNeeded(win, info.itemID, info.tree, tx);
      this.refreshSelector(win, info.itemID, info.tree);
      return tx;
    }

    async undoDelete(win) {
      let info = this.getActiveTree(win);
      if (!info) {
        return null;
      }
      let tx = this.deleteUndoByItemID.get(String(info.itemID));
      if (!tx) {
        this.notify(win, "No delete to undo for this document in the current session.");
        return null;
      }
      let node = this.model.undoDelete(info.tree, tx);
      this.deleteUndoByItemID.delete(String(info.itemID));
      await this.storage.save();
      if (node?.position) {
        await this.adapter.restore(win, info.itemID, node.position);
      }
      this.refreshSelector(win, info.itemID, info.tree);
      return node;
    }

    async restoreCurrentIfNeeded(win, itemID, tree, tx) {
      if (tx.previousCurrentID !== tx.currentIDAfterDelete) {
        let current = this.model.getCurrentNode(tree);
        if (current.position) {
          await this.adapter.restore(win, itemID, current.position);
        }
      }
    }

    refreshSelector(win, itemID, tree) {
      if (this.selector.panel) {
        this.selector.render(win, itemID, tree);
        this.selector.focusSelected();
      }
    }

    canUndoDelete(itemID) {
      return this.deleteUndoByItemID.has(String(itemID));
    }

    notify(win, message) {
      try {
        Services.prompt.alert(win || null, "Reader Position Stack", message);
      }
      catch (e) {
        Zotero.debug("Reader Position Stack: " + message);
      }
    }
  }

  let controller = new Controller();
  Object.assign(NS, {
    controller,
    startup: (data) => controller.startup(data),
    shutdown: () => controller.shutdown(),
    onMainWindowLoad: (win) => controller.onMainWindowLoad(win),
    onMainWindowUnload: (win) => controller.onMainWindowUnload(win)
  });
})(this);
