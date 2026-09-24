// Shared helpers: settings storage + translation lookups + tiny cache.
// Loaded before the site-specific script and content.js on every page.

const LagomLens = (() => {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULT_SETTINGS = {
    enabled: true,
    sourceLang: "auto",
    targetLang: "en",
  };

  let settingsCache = null;

  async function getSettings() {
    if (settingsCache) return settingsCache;
    const stored = await browserAPI.storage.sync.get(DEFAULT_SETTINGS);
    settingsCache = stored;
    return stored;
  }

  // Keep cache fresh if the popup changes settings while a video is open.
  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && settingsCache) {
      for (const key of Object.keys(changes)) {
        settingsCache[key] = changes[key].newValue;
      }
    }
  });

  // In-memory + session translation cache so re-hovering the same word
  // (very common with subtitles) doesn't refire network requests.
  const memCache = new Map();

  function cacheKey(word, source, target) {
    return `${source}:${target}:${word.toLowerCase()}`;
  }

  // "auto" source language: guess it from subtitle text instead of asking
  // MyMemory's own "detect" langpair, which doesn't give reliable results
  // (github.com/algomaster99/lagom-lens/issues/18). Site adapters feed us
  // subtitle text as it becomes available -- often before the user has
  // hovered anything -- via noteSubtitleText(); once LagomLensLangDetect is
  // confident, the guess is locked in for the rest of the video.
  let detectedLang = null;
  let detectionBuffer = "";

  function noteSubtitleText(text) {
    if (!text || detectedLang) return;
    detectionBuffer += " " + text;
    if (typeof LagomLensLangDetect === "undefined") return;
    const guess = LagomLensLangDetect.detect(detectionBuffer);
    if (guess) detectedLang = guess;
    else if (detectionBuffer.length > 4000) {
      // Keep only the tail so the buffer doesn't grow unbounded on a long
      // video that never yields a confident guess.
      detectionBuffer = detectionBuffer.slice(-2000);
    }
  }

  // Site adapters call this when the video changes (new watch page, SPA
  // navigation) so a stale guess from the previous video isn't reused.
  function resetDetection() {
    detectedLang = null;
    detectionBuffer = "";
  }

  // For sites that are always one language (e.g. SVT Play is always
  // Swedish) -- skip sampling text entirely and just declare it.
  function forceDetectedLang(lang) {
    detectedLang = lang;
  }

  function resolveSourceLang(sourceLangSetting) {
    return sourceLangSetting === "auto" ? detectedLang : sourceLangSetting;
  }

  function sendTranslateRequest(word, settings, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("timed out waiting for background script")),
        timeoutMs
      );
      browserAPI.runtime
        .sendMessage({ type: "svs-translate", word, settings })
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  async function translateWord(word) {
    const settings = await getSettings();
    const sourceLang = resolveSourceLang(settings.sourceLang);
    if (!sourceLang) {
      // "auto" and we haven't seen enough subtitle text yet to guess.
      return { text: null, pending: true, error: "detecting language…" };
    }

    const key = cacheKey(word, sourceLang, settings.targetLang);
    if (memCache.has(key)) return memCache.get(key);

    const effectiveSettings = { ...settings, sourceLang };

    // The actual fetch runs in the background script — a content script's
    // fetch() is subject to the host page's CSP in Firefox, which blocks
    // requests to the translation APIs on sites with a strict connect-src.
    let result;
    try {
      result = await sendTranslateRequest(word, effectiveSettings, 2000);
    } catch (firstErr) {
      try {
        result = await sendTranslateRequest(word, effectiveSettings, 4000);
      } catch (err) {
        result = { text: null, error: err.message || "lookup failed" };
      }
    }

    memCache.set(key, result);
    return result;
  }

  // Split a caption line into word-spans without breaking existing markup
  // structure the player relies on — operates on leaf text nodes only.
  function wrapWordsInTextNode(textNode) {
    const text = textNode.textContent;
    if (!text || !text.trim()) return;

    const frag = document.createDocumentFragment();
    // Split but keep the separators (spaces, punctuation) as plain text
    // so spacing/kerning in the subtitle renderer is unaffected.
    const parts = text.split(/(\s+)/);
    let wrappedAnyWord = false;

    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
        continue;
      }
      // Strip leading/trailing punctuation for lookup, keep it visually.
      const match = part.match(/^(["'(\u201c\u2018]*)(.*?)([.,!?;:")\u201d\u2019]*)$/);
      const [, lead = "", core = part, trail = ""] = match || [];

      if (!core) {
        frag.appendChild(document.createTextNode(part));
        continue;
      }

      if (lead) frag.appendChild(document.createTextNode(lead));

      const span = document.createElement("span");
      span.className = "svs-word";
      span.textContent = core;
      span.dataset.svsWord = core;
      frag.appendChild(span);
      wrappedAnyWord = true;

      if (trail) frag.appendChild(document.createTextNode(trail));
    }

    if (!wrappedAnyWord) return;
    textNode.parentNode.replaceChild(frag, textNode);
  }

  // Walk an element, wrapping every word in its text nodes. Marking
  // "processed" on the container itself (rather than per text node) is
  // only safe for players like YouTube that replace the whole container's
  // content on every caption change. Sites like SVT Play swap subtitle
  // lines in and out *inside* a long-lived container (e.g. new cue divs
  // appended/removed under one wrapper), so a container-level flag would
  // permanently skip every line after the first. Instead, walk raw text
  // nodes every time the observer fires and skip only nodes that already
  // sit inside a .svs-word span (cheap check, avoids double-wrapping
  // without silently ignoring genuinely new text).
  function wrapWordsIn(el) {
    if (!el) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement?.closest(".svs-word")) {
          return NodeFilter.FILTER_REJECT; // already wrapped
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach(wrapWordsInTextNode);
  }

  return {
    getSettings,
    translateWord,
    wrapWordsIn,
    noteSubtitleText,
    resetDetection,
    forceDetectedLang,
  };
})();