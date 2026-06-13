(function (global) {
  "use strict";

  const NS = global.Zotero.ReaderPositionStack = global.Zotero.ReaderPositionStack || {};
  const HTML_NS = "http://www.w3.org/1999/xhtml";

  class Selector {
    constructor({ model, controller }) {
      this.model = model;
      this.controller = controller;
      this.panel = null;
      this.contextMenu = null;
      this.rows = [];
      this.selectedIndex = 0;
    }

    open(win, itemID, tree) {
      this.close();
      let doc = win.document;
      let popupset = doc.getElementById("mainPopupSet")
        || doc.getElementById("zotero-reader-popupset")
        || doc.querySelector("popupset")
        || doc.documentElement;

      this.panel = doc.createXULElement("panel");
      this.panel.setAttribute("id", "reader-position-stack-selector");
      this.panel.setAttribute("type", "arrow");
      this.panel.setAttribute("noautofocus", "false");
      this.panel.addEventListener("popuphidden", () => this.close());
      popupset.append(this.panel);

      this.contextMenu = doc.createXULElement("menupopup");
      this.contextMenu.setAttribute("id", "reader-position-stack-selector-context");
      popupset.append(this.contextMenu);

      this.render(win, itemID, tree);

      let anchor = this.controller.adapter.getActiveReader(win)?._iframe || doc.activeElement || doc.documentElement;
      try {
        this.panel.openPopup(anchor, "after_start", 0, 0, false, false);
      }
      catch (e) {
        this.panel.openPopupAtScreen(win.screenX + 80, win.screenY + 120, false);
      }
      this.focusSelected();
    }

    close() {
      if (this.panel) {
        let panel = this.panel;
        this.panel = null;
        if (panel.state === "open") {
          panel.hidePopup();
        }
        panel.remove();
      }
      if (this.contextMenu) {
        this.contextMenu.remove();
        this.contextMenu = null;
      }
      this.rows = [];
    }

    render(win, itemID, tree) {
      let doc = win.document;
      this.panel.replaceChildren();

      let root = doc.createElementNS(HTML_NS, "div");
      root.className = "rps-selector";
      root.setAttribute("role", "dialog");
      root.addEventListener("keydown", (event) => this.onKeyDown(event, win, itemID, tree));

      let style = doc.createElementNS(HTML_NS, "style");
      style.textContent = `
        .rps-selector {
          min-width: 360px;
          max-width: min(640px, 80vw);
          max-height: min(640px, 80vh);
          color: -moz-dialogtext;
          background: -moz-dialog;
          font: menu;
          padding: 8px;
          box-sizing: border-box;
        }
        .rps-selector-toolbar {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
          align-items: center;
        }
        .rps-selector-title {
          font-weight: 600;
          flex: 1;
        }
        .rps-selector-button {
          font: menu;
          min-height: 24px;
        }
        .rps-selector-list {
          overflow: auto;
          max-height: min(520px, 65vh);
          border: 1px solid ThreeDShadow;
          background: Field;
        }
        .rps-selector-row {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 12px;
          min-height: 28px;
          border: 2px solid transparent;
          border-radius: 3px;
          padding-top: 3px;
          padding-bottom: 3px;
          padding-right: 8px;
          color: FieldText;
          outline: none;
          user-select: none;
          box-sizing: border-box;
        }
        .rps-selector-row:hover,
        .rps-selector-row:focus {
          background: SelectedItem;
          color: SelectedItemText;
        }
        .rps-selector-row.current {
          border-color: Highlight;
          font-weight: 600;
        }
        .rps-selector-row.current:hover,
        .rps-selector-row.current:focus {
          border-color: SelectedItemText;
        }
        .rps-selector-row.root {
          opacity: 0.82;
        }
        .rps-selector-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rps-selector-meta {
          opacity: .72;
          font-size: 0.9em;
        }
      `;
      root.append(style);

      let toolbar = doc.createElementNS(HTML_NS, "div");
      toolbar.className = "rps-selector-toolbar";
      let title = doc.createElementNS(HTML_NS, "div");
      title.className = "rps-selector-title";
      title.textContent = "Reader Position Stack";
      toolbar.append(title);
      let undo = doc.createElementNS(HTML_NS, "button");
      undo.className = "rps-selector-button";
      undo.textContent = "Undo Delete";
      undo.disabled = !this.controller.canUndoDelete(itemID);
      undo.addEventListener("click", () => this.controller.handleCommand("undo-delete", win));
      toolbar.append(undo);
      root.append(toolbar);

      let list = doc.createElementNS(HTML_NS, "div");
      list.className = "rps-selector-list";
      list.setAttribute("role", "tree");

      let rows = this.model.flatten(tree);
      this.selectedIndex = 0;
      this.rows = rows.map(({ node, depth }, index) => {
        let row = doc.createElementNS(HTML_NS, "div");
        row.className = "rps-selector-row";
        if (node.id === tree.currentID) {
          row.classList.add("current");
          this.selectedIndex = index;
        }
        if (node.id === tree.rootID) {
          row.classList.add("root");
        }
        row.tabIndex = index === this.selectedIndex ? 0 : -1;
        row.dataset.nodeID = node.id;
        row.setAttribute("role", "treeitem");
        row.style.paddingLeft = (8 + depth * 18) + "px";

        let label = doc.createElementNS(HTML_NS, "div");
        label.className = "rps-selector-label";
        label.textContent = node.meta?.label || node.id;
        row.append(label);

        let meta = doc.createElementNS(HTML_NS, "div");
        meta.className = "rps-selector-meta";
        meta.textContent = node.id === tree.rootID ? "root" : this.shortDate(node.meta?.createdAt);
        row.append(meta);

        row.addEventListener("click", () => this.selectIndex(index));
        row.addEventListener("dblclick", () => this.controller.navigateToNode(win, itemID, node.id));
        row.addEventListener("contextmenu", (event) => this.openContextMenu(event, win, itemID, node.id));
        list.append(row);
        return row;
      });
      root.append(list);
      this.panel.append(root);
    }

    onKeyDown(event, win, itemID, tree) {
      if (event.key === "Escape") {
        this.close();
        event.preventDefault();
      }
      else if (event.key === "ArrowDown") {
        this.selectIndex(Math.min(this.rows.length - 1, this.selectedIndex + 1));
        event.preventDefault();
      }
      else if (event.key === "ArrowUp") {
        this.selectIndex(Math.max(0, this.selectedIndex - 1));
        event.preventDefault();
      }
      else if (event.key === "Home") {
        this.selectIndex(0);
        event.preventDefault();
      }
      else if (event.key === "End") {
        this.selectIndex(this.rows.length - 1);
        event.preventDefault();
      }
      else if (event.key === "Enter") {
        this.controller.navigateToNode(win, itemID, this.selectedNodeID());
        event.preventDefault();
      }
      else if (event.key === "Delete") {
        this.controller.handleCommand(event.shiftKey ? "delete-children" : "delete-node", win, this.selectedNodeID());
        event.preventDefault();
      }
    }

    selectIndex(index) {
      this.selectedIndex = index;
      this.rows.forEach((row, i) => row.tabIndex = i === index ? 0 : -1);
      this.focusSelected();
    }

    focusSelected() {
      this.rows[this.selectedIndex]?.focus();
    }

    selectedNodeID() {
      return this.rows[this.selectedIndex]?.dataset.nodeID || null;
    }

    openContextMenu(event, win, itemID, nodeID) {
      event.preventDefault();
      this.contextMenu.replaceChildren();
      for (let item of [
        ["Navigate", () => this.controller.navigateToNode(win, itemID, nodeID)],
        ["Delete Node", () => this.controller.handleCommand("delete-node", win, nodeID)],
        ["Delete Children", () => this.controller.handleCommand("delete-children", win, nodeID)],
        ["Undo Delete", () => this.controller.handleCommand("undo-delete", win)]
      ]) {
        let menuitem = win.document.createXULElement("menuitem");
        menuitem.setAttribute("label", item[0]);
        menuitem.addEventListener("command", item[1]);
        this.contextMenu.append(menuitem);
      }
      this.contextMenu.openPopupAtScreen(event.screenX, event.screenY, true);
    }

    shortDate(value) {
      if (!value) {
        return "";
      }
      try {
        return new Date(value).toLocaleString();
      }
      catch (e) {
        return "";
      }
    }
  }

  NS.Selector = Selector;
})(this);
