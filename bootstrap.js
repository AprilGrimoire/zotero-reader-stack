var chromeHandle;
var pluginContext;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  let aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  let manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "readerpositionstack", rootURI + "content/"]
  ]);

  pluginContext = {
    ChromeUtils,
    Components,
    Services,
    Zotero,
    rootURI
  };
  if (typeof IOUtils !== "undefined") {
    pluginContext.IOUtils = IOUtils;
  }
  if (typeof PathUtils !== "undefined") {
    pluginContext.PathUtils = PathUtils;
  }

  for (let script of [
    "tree-model.js",
    "storage.js",
    "reader-adapter.js",
    "selector.js",
    "keymap.js",
    "window-ui.js",
    "controller.js"
  ]) {
    Services.scriptloader.loadSubScript(rootURI + "content/" + script, pluginContext);
  }

  await Zotero.ReaderPositionStack.startup({ id, version, rootURI });
}

async function onMainWindowLoad({ window }, reason) {
  await Zotero.ReaderPositionStack?.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  await Zotero.ReaderPositionStack?.onMainWindowUnload(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  await Zotero.ReaderPositionStack?.shutdown();
  delete Zotero.ReaderPositionStack;

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
  pluginContext = null;
}

function uninstall(data, reason) {}
