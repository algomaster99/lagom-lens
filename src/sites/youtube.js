// YouTube renders captions as DOM spans inside .ytp-caption-window-container,
// with individual lines in .caption-window > .ytp-caption-segment.
// These get destroyed and recreated frequently, so we watch broadly and
// re-process whatever segment nodes show up.

window.LagomLensSite = (() => {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  const CONTAINER_SELECTOR = ".ytp-caption-window-container";
  const SEGMENT_SELECTOR = ".ytp-caption-segment";

  function findContainer() {
    return document.querySelector(CONTAINER_SELECTOR);
  }

  function getVideoId() {
    return new URLSearchParams(location.search).get("v");
  }

  function stripTimedTextMarkup(xml) {
    return xml
      .replace(/<[^>]+>/g, " ")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Caption track URLs are signed by YouTube (pot/signature params baked in
  // by the page's own player) -- a content script can't construct a valid
  // one itself, so we ask the page for the exact URL it would use. See
  // youtube-page-bridge.js, injected into the page's JS context below.
  let bridgeInjected = false;
  function ensureBridge() {
    if (bridgeInjected) return;
    bridgeInjected = true;
    const script = document.createElement("script");
    script.src = browserAPI.runtime.getURL("src/sites/youtube-page-bridge.js");
    script.addEventListener("load", () => script.remove());
    (document.head || document.documentElement).appendChild(script);
  }

  function requestCaptionTracks(timeoutMs = 1500) {
    ensureBridge();
    return new Promise((resolve) => {
      let settled = false;
      const onTracks = (e) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("svs-caption-tracks", onTracks);
        resolve(e.detail || []);
      };
      window.addEventListener("svs-caption-tracks", onTracks);
      window.dispatchEvent(new CustomEvent("svs-request-caption-tracks"));
      setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener("svs-caption-tracks", onTracks);
        resolve([]);
      }, timeoutMs);
    });
  }

  // Grab a big chunk of this video's subtitle text up front, so language
  // detection has enough to go on before the player (and any caption DOM)
  // has even rendered (github.com/algomaster99/lagom-lens/issues/18).
  async function prefetchTranscript() {
    try {
      const [track] = await requestCaptionTracks();
      if (!track?.baseUrl) return;
      const res = await fetch(track.baseUrl);
      if (!res.ok) return;
      LagomLens.noteSubtitleText(stripTimedTextMarkup(await res.text()));
    } catch (err) {
      console.warn("[Lagom Lens] transcript prefetch failed", err);
    }
  }

  // Text nodes only, not container.textContent -- keeps the union rect
  // below tight around the glyphs instead of the caption window's box.
  function collectTextNodes(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.textContent?.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  // Shift-hover translates the whole subtitle, not just one word
  // (github.com/algomaster99/lagom-lens/issues/1). Returns joined text and
  // the union rect of every text node under `el`, or null if there's none.
  function readSubtitle(el) {
    const nodes = collectTextNodes(el);
    if (!nodes.length) return null;

    const range = document.createRange();
    const rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const parts = [];
    for (const node of nodes) {
      parts.push(node.textContent.trim());
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      rect.left = Math.min(rect.left, r.left);
      rect.top = Math.min(rect.top, r.top);
      rect.right = Math.max(rect.right, r.right);
      rect.bottom = Math.max(rect.bottom, r.bottom);
    }

    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    if (!text) return null;
    rect.width = rect.right - rect.left;
    rect.height = rect.bottom - rect.top;
    return { text, rect };
  }

  function observe(lens) {
    let containerObserver = null;
    let hideTimer = null;
    let container = null;
    let shiftHeld = false;
    let pointerTarget = null; // last mousemove target, for shift toggling

    const onSubtitleNode = (seg) => {
      LagomLens.noteSubtitleText(seg.textContent);
      if (lens.isEnabled()) LagomLens.wrapWordsIn(seg);
    };

    // Fallback/reinforcement for prefetchTranscript above: if the page
    // doesn't have a reachable transcript for this video (no captions, or
    // YouTube changes something), we still detect from whatever captions
    // actually get shown.
    let lastVideoId = null;
    function checkVideoChange() {
      const id = getVideoId();
      if (!id || id === lastVideoId) return;
      lastVideoId = id;
      LagomLens.resetDetection();
      // A beat for the player to actually load the new video -- right after
      // the URL changes on an SPA nav, getPlayerResponse() can still report
      // the previous one.
      setTimeout(prefetchTranscript, 300);
    }
    checkVideoChange();
    setInterval(checkVideoChange, 2000);

    function showWholeSubtitle() {
      if (!container?.isConnected) return lens.clearWord();
      const subtitle = readSubtitle(container);
      if (subtitle) lens.showWord(subtitle.text, subtitle.rect);
      else lens.clearWord();
    }

    // Cheap: just remembers where the pointer last was, so Shift toggling
    // (a keyboard event) knows whether it's currently over a caption.
    document.addEventListener("mousemove", (e) => {
      pointerTarget = e.target;
    });

    document.body.addEventListener("mouseover", (e) => {
      const el = e.target.closest(".svs-word");
      if (!el) return;
      clearTimeout(hideTimer);
      if (shiftHeld) return showWholeSubtitle();
      lens.showWord(el.dataset.svsWord, el.getBoundingClientRect());
    });

    document.body.addEventListener("mouseout", (e) => {
      if (!e.target.closest(".svs-word")) return;
      hideTimer = setTimeout(lens.clearWord, 150);
    });

    // Shift toggles word-level vs. whole-subtitle translation.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Shift" || shiftHeld) return;
      shiftHeld = true;
      if (container?.contains(pointerTarget)) {
        clearTimeout(hideTimer);
        showWholeSubtitle();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key !== "Shift") return;
      shiftHeld = false;
      const wordEl = pointerTarget?.closest?.(".svs-word");
      if (wordEl) lens.showWord(wordEl.dataset.svsWord, wordEl.getBoundingClientRect());
      else lens.clearWord();
    });
    // Keyup can be missed (e.g. alt-tab while holding Shift).
    window.addEventListener("blur", () => {
      shiftHeld = false;
    });

    function watchContainer(el) {
      container = el;
      if (containerObserver) containerObserver.disconnect();
      containerObserver = new MutationObserver(() => {
        container.querySelectorAll(SEGMENT_SELECTOR).forEach((seg) => {
          onSubtitleNode(seg);
        });
        // Subtitles swap while the mouse sits still -- keep the
        // shift-held translation in sync with whatever's shown now.
        if (shiftHeld) showWholeSubtitle();
      });
      containerObserver.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      // Process whatever's already there.
      container.querySelectorAll(SEGMENT_SELECTOR).forEach(onSubtitleNode);
    }

    // The caption container itself appears/disappears with the player,
    // so watch the player area for it showing up.
    const rootObserver = new MutationObserver(() => {
      const found = findContainer();
      if (found && !found.dataset.svsWatched) {
        found.dataset.svsWatched = "1";
        watchContainer(found);
      }
    });
    rootObserver.observe(document.body, { childList: true, subtree: true });

    // In case captions are already showing on init.
    const existing = findContainer();
    if (existing) {
      existing.dataset.svsWatched = "1";
      watchContainer(existing);
    }
  }

  return { findContainer, observe };
})();
