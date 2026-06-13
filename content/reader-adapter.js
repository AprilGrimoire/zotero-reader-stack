(function (global) {
  "use strict";

  const NS = global.Zotero.ReaderPositionStack = global.Zotero.ReaderPositionStack || {};

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function cloneIntoWindow(value, targetWindow) {
    let copy = clone(value);
    if (targetWindow && typeof Components !== "undefined" && Components.utils?.cloneInto) {
      return Components.utils.cloneInto(copy, targetWindow);
    }
    return copy;
  }

  function lengthenCFI(cfi) {
    if (!cfi || cfi === "_start" || cfi.startsWith("epubcfi(")) {
      return cfi;
    }
    return "epubcfi(" + cfi + ")";
  }

  class ReaderAdapter {
    getActiveReader(win) {
      if (win?.reader?.itemID) {
        return win.reader;
      }

      let mainWindow = win || Zotero.getMainWindow?.();
      let selectedTabID = mainWindow?.Zotero_Tabs?.selectedID;
      if (selectedTabID && Zotero.Reader?.getByTabID) {
        let reader = Zotero.Reader.getByTabID(selectedTabID);
        if (reader?.itemID) {
          return reader;
        }
      }

      let active = Zotero.Reader?._readers?.find((reader) => reader?.itemID && reader?._window === mainWindow);
      if (active) {
        return active;
      }
      return null;
    }

    async capture(win) {
      let reader = this.getActiveReader(win);
      if (!reader) {
        throw new Error("No active Zotero Reader.");
      }
      await this.waitForReader(reader);

      let itemID = reader.itemID;
      let internal = reader._internalReader;
      let state = clone(internal?._state?.primaryViewState);
      if (!state || typeof state !== "object") {
        state = clone(internal?._primaryView?._viewState);
      }
      if (!state || typeof state !== "object") {
        throw new Error("The active reader view does not expose a restorable position yet.");
      }
      state = this.freshenViewState(reader, state);

      let location = this.locationFromViewState(state);
      if (!location) {
        throw new Error("The active reader position is not restorable.");
      }

      return {
        itemID,
        payload: {
          location,
          viewState: state
        },
        meta: this.displayMeta(reader, state)
      };
    }

    async restore(win, itemID, position) {
      if (!position) {
        return false;
      }
      let reader = this.getActiveReader(win);
      if (!reader || reader.itemID !== itemID) {
        reader = await Zotero.Reader.open(itemID, position.location || null, {});
      }
      if (!reader) {
        reader = Zotero.Reader?._readers?.find((candidate) => candidate.itemID === itemID);
      }
      if (!reader) {
        throw new Error("Unable to open reader for attachment " + itemID + ".");
      }
      await this.waitForReader(reader);

      if (await this.applyViewState(reader, position.viewState)) {
        return true;
      }
      if (position.location) {
        await reader.navigate(position.location);
        return true;
      }
      return false;
    }

    async waitForReader(reader) {
      if (reader?._initPromise) {
        await reader._initPromise;
      }
    }

    locationFromViewState(state) {
      if (Number.isInteger(state.pageIndex)) {
        return { pageIndex: state.pageIndex };
      }
      if (typeof state.cfi === "string") {
        if (state.cfi === "_start") {
          return { first: true };
        }
        return {
          pageNumber: lengthenCFI(state.cfi),
          offsetBlock: state.cfiElementOffset
        };
      }
      if (typeof state.scrollYPercent === "number") {
        return { scrollYPercent: state.scrollYPercent };
      }
      return null;
    }

    async applyViewState(reader, state) {
      if (!state || typeof state !== "object") {
        return false;
      }
      let internal = reader._internalReader;
      let view = internal?._lastView || internal?._primaryView;
      let targetWindow = view?._iframeWindow;

      if (Number.isInteger(state.pageIndex) && typeof view?._setState === "function") {
        await view._setState(cloneIntoWindow(state, targetWindow), false);
        return true;
      }

      if (typeof state.cfi === "string") {
        if (state.cfi === "_start" && typeof internal?.navigateToFirstPage === "function") {
          internal.navigateToFirstPage();
          return true;
        }
        if (typeof view?.navigate === "function") {
          await view.navigate(cloneIntoWindow({
            pageNumber: lengthenCFI(state.cfi),
            offsetBlock: state.cfiElementOffset
          }, targetWindow), cloneIntoWindow({
            behavior: "instant",
            skipHistory: true
          }, targetWindow));
          return true;
        }
      }

      if (typeof state.scrollYPercent === "number") {
        let iframeWindow = view?._iframeWindow;
        let iframeDocument = view?._iframeDocument;
        if (iframeWindow && iframeDocument) {
          let maxY = iframeDocument.body.scrollHeight - iframeDocument.documentElement.clientHeight;
          iframeWindow.scrollTo({
            top: state.scrollYPercent / 100 * maxY,
            behavior: "instant"
          });
          return true;
        }
      }

      return false;
    }

    freshenViewState(reader, state) {
      let internal = reader._internalReader;
      let view = internal?._lastView || internal?._primaryView;
      let next = clone(state);

      let pdfViewer = view?._iframeWindow?.PDFViewerApplication?.pdfViewer;
      let pdfLocation = pdfViewer?._location;
      if (pdfLocation?.pageNumber) {
        next.pageIndex = pdfLocation.pageNumber - 1;
        if (pdfLocation.top !== undefined) {
          next.top = pdfLocation.top;
        }
        if (pdfLocation.left !== undefined) {
          next.left = pdfLocation.left;
        }
        if (pdfLocation.scale !== undefined) {
          next.scale = pdfLocation.scale;
        }
        if (Number.isInteger(pdfViewer.scrollMode)) {
          next.scrollMode = pdfViewer.scrollMode;
        }
        if (Number.isInteger(pdfViewer.spreadMode)) {
          next.spreadMode = pdfViewer.spreadMode;
        }
        return next;
      }

      let cfi = view?.flow?.startCFI?.toString?.(true);
      if (cfi) {
        next.cfi = cfi.replace(/^epubcfi\((.+)\)$/, "$1");
        next.cfiElementOffset = view.flow.startCFIOffset ?? undefined;
        return next;
      }

      if (typeof next.scrollYPercent === "number" && view?._iframeWindow && view?._iframeDocument) {
        let maxY = view._iframeDocument.body.scrollHeight - view._iframeDocument.documentElement.clientHeight;
        next.scrollYPercent = maxY > 0 ? Math.max(0, Math.min(100, view._iframeWindow.scrollY / maxY * 100)) : 0;
        next.scrollYPercent = Math.round(next.scrollYPercent * 10) / 10;
      }
      return next;
    }

    displayMeta(reader, state) {
      let label;
      if (state.pageLabel) {
        label = "Page " + state.pageLabel;
      }
      else if (Number.isInteger(state.pageIndex)) {
        label = "Page " + (state.pageIndex + 1);
      }
      else if (typeof state.cfi === "string") {
        label = state.cfi === "_start" ? "EPUB start" : "EPUB location";
      }
      else if (typeof state.scrollYPercent === "number") {
        label = "Scroll " + Math.round(state.scrollYPercent) + "%";
      }
      else {
        label = "Reader position";
      }

      return {
        label,
        outlineText: state.outlinePath?.map((x) => x.title || x).filter(Boolean).join(" / ") || "",
        pageLabel: state.pageLabel || null,
        readerType: reader.type || reader._type || null
      };
    }
  }

  NS.ReaderAdapter = ReaderAdapter;
})(this);
