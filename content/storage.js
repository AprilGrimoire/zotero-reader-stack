(function (global) {
  "use strict";

  const NS = global.Zotero.ReaderPositionStack = global.Zotero.ReaderPositionStack || {};

  class Storage {
    constructor({ model, fileName = "reader-position-stack.json" }) {
      this.model = model;
      this.fileName = fileName;
      this.store = null;
      this.path = null;
    }

    async init() {
      this.path = PathUtils.join(Zotero.Profile.dir, this.fileName);
      try {
        if (await IOUtils.exists(this.path)) {
          this.store = this.model.ensureStore(await IOUtils.readJSON(this.path));
        }
      }
      catch (e) {
        Zotero.logError(e);
      }
      this.store ||= this.model.createStore();
      return this.store;
    }

    getStore() {
      if (!this.store) {
        this.store = this.model.createStore();
      }
      return this.store;
    }

    getTree(itemID) {
      return this.model.ensureTree(this.getStore(), itemID);
    }

    async save() {
      if (!this.path) {
        await this.init();
      }
      await IOUtils.writeJSON(this.path, this.model.ensureStore(this.store));
    }
  }

  NS.Storage = Storage;
})(this);
