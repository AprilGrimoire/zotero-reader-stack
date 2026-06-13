const test = require("node:test");
const assert = require("node:assert/strict");
const { TreeModel, ROOT_ID } = require("../content/tree-model.js");

function makeModel() {
  let i = 0;
  return new TreeModel({
    idFactory: () => "n" + (++i),
    now: () => "2026-01-01T00:00:00.000Z"
  });
}

test("push, pop, and forward preserve branches", () => {
  let model = makeModel();
  let store = model.createStore();
  let tree = model.ensureTree(store, 10);

  let a = model.push(tree, { location: { pageIndex: 1 } }, { label: "A" });
  let b = model.push(tree, { location: { pageIndex: 2 } }, { label: "B" });
  assert.equal(tree.currentID, b.id);

  assert.equal(model.pop(tree).id, a.id);
  let c = model.push(tree, { location: { pageIndex: 3 } }, { label: "C" });
  assert.deepEqual(tree.nodes[a.id].childIDs, [b.id, c.id]);

  assert.equal(model.pop(tree).id, a.id);
  assert.equal(model.forward(tree).id, c.id);
});

test("root is synthetic and undeletable", () => {
  let model = makeModel();
  let tree = model.ensureTree(model.createStore(), 10);
  assert.equal(model.deleteNode(tree, ROOT_ID), null);
  assert.equal(tree.currentID, ROOT_ID);
});

test("delete current node moves current to parent and undo restores it", () => {
  let model = makeModel();
  let tree = model.ensureTree(model.createStore(), 10);
  let a = model.push(tree, { location: { pageIndex: 1 } }, { label: "A" });
  let b = model.push(tree, { location: { pageIndex: 2 } }, { label: "B" });

  let tx = model.deleteNode(tree, a.id);
  assert.equal(tree.currentID, ROOT_ID);
  assert.equal(tree.nodes[a.id], undefined);
  assert.equal(tree.nodes[b.id], undefined);

  let current = model.undoDelete(tree, tx);
  assert.equal(current.id, b.id);
  assert.equal(tree.nodes[a.id].childIDs[0], b.id);
});

test("delete children stores one restore transaction", () => {
  let model = makeModel();
  let tree = model.ensureTree(model.createStore(), 10);
  let a = model.push(tree, { location: { pageIndex: 1 } }, { label: "A" });
  model.pop(tree);
  let b = model.push(tree, { location: { pageIndex: 2 } }, { label: "B" });
  model.pop(tree);

  let tx = model.deleteChildren(tree, ROOT_ID);
  assert.equal(tree.nodes[ROOT_ID].childIDs.length, 0);
  assert.equal(tree.currentID, ROOT_ID);

  model.undoDelete(tree, tx);
  assert.deepEqual(tree.nodes[ROOT_ID].childIDs, [a.id, b.id]);
});
