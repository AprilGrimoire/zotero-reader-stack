(function (global) {
  "use strict";

  const ROOT_ID = "root";

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function defaultIDFactory() {
    return "n-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  class TreeModel {
    constructor(options = {}) {
      this.idFactory = options.idFactory || defaultIDFactory;
      this.now = options.now || (() => new Date().toISOString());
    }

    createStore() {
      return {
        version: 1,
        documents: {}
      };
    }

    ensureStore(store) {
      if (!store || typeof store !== "object") {
        return this.createStore();
      }
      store.version ||= 1;
      store.documents ||= {};
      return store;
    }

    ensureTree(store, itemID) {
      this.ensureStore(store);
      let key = String(itemID);
      if (!store.documents[key]) {
        let createdAt = this.now();
        store.documents[key] = {
          itemID,
          rootID: ROOT_ID,
          currentID: ROOT_ID,
          nodes: {
            [ROOT_ID]: {
              id: ROOT_ID,
              parentID: null,
              childIDs: [],
              lastActiveChildID: null,
              position: null,
              meta: {
                label: "Root",
                createdAt,
                lastVisitedAt: createdAt
              }
            }
          }
        };
      }
      this.repairTree(store.documents[key]);
      return store.documents[key];
    }

    repairTree(tree) {
      tree.rootID ||= ROOT_ID;
      tree.nodes ||= {};
      if (!tree.nodes[tree.rootID]) {
        tree.nodes[tree.rootID] = {
          id: tree.rootID,
          parentID: null,
          childIDs: [],
          lastActiveChildID: null,
          position: null,
          meta: { label: "Root", createdAt: this.now(), lastVisitedAt: this.now() }
        };
      }
      for (let node of Object.values(tree.nodes)) {
        node.childIDs ||= [];
        node.childIDs = node.childIDs.filter((id) => tree.nodes[id] && tree.nodes[id].parentID === node.id);
        if (node.lastActiveChildID && !node.childIDs.includes(node.lastActiveChildID)) {
          node.lastActiveChildID = node.childIDs.at(-1) || null;
        }
        node.meta ||= {};
      }
      if (!tree.nodes[tree.currentID]) {
        tree.currentID = tree.rootID;
      }
      tree.nodes[tree.rootID].parentID = null;
      return tree;
    }

    getCurrentNode(tree) {
      this.repairTree(tree);
      return tree.nodes[tree.currentID] || tree.nodes[tree.rootID];
    }

    push(tree, position, meta = {}) {
      this.repairTree(tree);
      let parent = this.getCurrentNode(tree);
      let id = this.idFactory();
      let createdAt = this.now();
      let node = {
        id,
        parentID: parent.id,
        childIDs: [],
        lastActiveChildID: null,
        position: clone(position),
        meta: {
          ...clone(meta),
          createdAt,
          lastVisitedAt: createdAt
        }
      };
      tree.nodes[id] = node;
      parent.childIDs.push(id);
      parent.lastActiveChildID = id;
      tree.currentID = id;
      return node;
    }

    pop(tree) {
      this.repairTree(tree);
      let current = this.getCurrentNode(tree);
      if (current.id === tree.rootID || !current.parentID) {
        return null;
      }
      let parent = tree.nodes[current.parentID] || tree.nodes[tree.rootID];
      parent.lastActiveChildID = current.id;
      tree.currentID = parent.id;
      this.touch(parent);
      return parent;
    }

    forward(tree) {
      this.repairTree(tree);
      let current = this.getCurrentNode(tree);
      let childID = current.lastActiveChildID;
      if (!childID || !current.childIDs.includes(childID)) {
        childID = current.childIDs.at(-1);
      }
      if (!childID || !tree.nodes[childID]) {
        return null;
      }
      tree.currentID = childID;
      let child = tree.nodes[childID];
      this.touch(child);
      return child;
    }

    visit(tree, nodeID) {
      this.repairTree(tree);
      let node = tree.nodes[nodeID];
      if (!node) {
        throw new Error("Unknown tree node: " + nodeID);
      }
      tree.currentID = node.id;
      this.markPathActive(tree, node.id);
      this.touch(node);
      return node;
    }

    markPathActive(tree, nodeID) {
      let childID = nodeID;
      let node = tree.nodes[childID];
      while (node && node.parentID) {
        let parent = tree.nodes[node.parentID];
        if (!parent) {
          break;
        }
        if (parent.childIDs.includes(childID)) {
          parent.lastActiveChildID = childID;
        }
        childID = parent.id;
        node = parent;
      }
    }

    deleteNode(tree, nodeID) {
      this.repairTree(tree);
      let node = tree.nodes[nodeID];
      if (!node || node.id === tree.rootID) {
        return null;
      }
      let parent = tree.nodes[node.parentID];
      if (!parent) {
        return null;
      }
      let index = parent.childIDs.indexOf(node.id);
      let deletedIDs = this.collectSubtreeIDs(tree, node.id);
      let deletedNodes = {};
      for (let id of deletedIDs) {
        deletedNodes[id] = clone(tree.nodes[id]);
      }
      parent.childIDs.splice(index, 1);
      if (parent.lastActiveChildID === node.id || !parent.childIDs.includes(parent.lastActiveChildID)) {
        parent.lastActiveChildID = parent.childIDs[Math.max(0, index - 1)] || parent.childIDs[index] || null;
      }
      for (let id of deletedIDs) {
        delete tree.nodes[id];
      }
      let previousCurrentID = tree.currentID;
      if (deletedIDs.includes(tree.currentID)) {
        tree.currentID = parent.id;
        this.touch(parent);
      }
      return {
        type: "delete-node",
        entries: [{
          rootID: node.id,
          parentID: parent.id,
          index,
          parentLastActiveChildID: parent.lastActiveChildID
        }],
        deletedNodes,
        previousCurrentID,
        currentIDAfterDelete: tree.currentID
      };
    }

    deleteChildren(tree, nodeID) {
      this.repairTree(tree);
      let node = tree.nodes[nodeID];
      if (!node || !node.childIDs.length) {
        return null;
      }
      let entries = [];
      let deletedIDs = [];
      node.childIDs.forEach((childID, index) => {
        entries.push({
          rootID: childID,
          parentID: node.id,
          index,
          parentLastActiveChildID: node.lastActiveChildID
        });
        deletedIDs.push(...this.collectSubtreeIDs(tree, childID));
      });
      let deletedNodes = {};
      for (let id of deletedIDs) {
        deletedNodes[id] = clone(tree.nodes[id]);
      }
      node.childIDs = [];
      node.lastActiveChildID = null;
      for (let id of deletedIDs) {
        delete tree.nodes[id];
      }
      let previousCurrentID = tree.currentID;
      if (deletedIDs.includes(tree.currentID)) {
        tree.currentID = node.id;
        this.touch(node);
      }
      return {
        type: "delete-children",
        entries,
        deletedNodes,
        previousCurrentID,
        currentIDAfterDelete: tree.currentID
      };
    }

    undoDelete(tree, transaction) {
      this.repairTree(tree);
      if (!transaction || !transaction.deletedNodes || !transaction.entries?.length) {
        return null;
      }
      for (let [id, node] of Object.entries(transaction.deletedNodes)) {
        tree.nodes[id] = clone(node);
      }
      for (let entry of [...transaction.entries].sort((a, b) => a.index - b.index)) {
        let parent = tree.nodes[entry.parentID];
        if (!parent) {
          continue;
        }
        parent.childIDs ||= [];
        let withoutDuplicate = parent.childIDs.filter((id) => id !== entry.rootID);
        withoutDuplicate.splice(Math.min(entry.index, withoutDuplicate.length), 0, entry.rootID);
        parent.childIDs = withoutDuplicate;
        parent.lastActiveChildID = entry.parentLastActiveChildID || parent.lastActiveChildID || entry.rootID;
      }
      if (tree.nodes[transaction.previousCurrentID]) {
        tree.currentID = transaction.previousCurrentID;
      }
      this.repairTree(tree);
      return this.getCurrentNode(tree);
    }

    collectSubtreeIDs(tree, nodeID) {
      let result = [];
      let stack = [nodeID];
      while (stack.length) {
        let id = stack.pop();
        let node = tree.nodes[id];
        if (!node) {
          continue;
        }
        result.push(id);
        for (let childID of node.childIDs || []) {
          stack.push(childID);
        }
      }
      return result;
    }

    flatten(tree) {
      this.repairTree(tree);
      let rows = [];
      let walk = (id, depth) => {
        let node = tree.nodes[id];
        if (!node) {
          return;
        }
        rows.push({ node, depth });
        for (let childID of node.childIDs || []) {
          walk(childID, depth + 1);
        }
      };
      walk(tree.rootID, 0);
      return rows;
    }

    touch(node) {
      node.meta ||= {};
      node.meta.lastVisitedAt = this.now();
    }
  }

  const api = { ROOT_ID, TreeModel };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ReaderPositionStackTreeModel = api;
})(this);
