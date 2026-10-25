// Site-agnostic glue. Everything that differs between players -- how the
// caption container is found, and how a word is resolved from the pointer --
// lives in the per-site adapter (src/sites/*.js). This file owns only the
// parts that are the same everywhere: the tooltip, the hover highlight, the
// translation lookup and the enabled/disabled state.
//
// An adapter defines window.LagomLensSite with:
//   observe(lens): start watching this player. Call
//     lens.showWord(word, rect, line) when the pointer is over a word -- line
//     is the whole subtitle it's in, kept as the example sentence if the word
//     gets saved -- lens.clearWord() when it leaves, and lens.isEnabled()
//     before doing any work of its own.

(function () {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  let tooltip = null;
  let enabled = true;
  let pauseOnHover = true;
  // What the tooltip is showing: { key, word, line, rect, translation, saved }.
  // translation is the lookup's promise, so saving a word that's still
  // loading just waits for it.
  let shown = null;
  // The video we paused on hover, so we only resume what we paused ourselves.
  let pausedVideo = null;
  let resumeTimer = null;

  function pauseVideo() {
    clearTimeout(resumeTimer);
    resumeTimer = null;
    if (!pauseOnHover || pausedVideo) return;
    const video = document.querySelector("video");
    if (video && !video.paused) {
      video.pause();
      pausedVideo = video;
    }
  }

  // Delayed so moving across the gap between two words doesn't flicker
  // play/pause.
  function resumeVideo(delay = 300) {
    if (!pausedVideo || (resumeTimer && delay)) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      const video = pausedVideo;
      pausedVideo = null;
      resumeTimer = null;
      if (video?.paused) video.play().catch(() => {});
    }, delay);
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "svs-tooltip";
    tooltip.style.display = "none";
    (document.fullscreenElement || document.body).appendChild(tooltip);
    return tooltip;
  }

  function positionTooltip(rect) {
    const t = ensureTooltip();
    t.style.left = `${rect.left + rect.width / 2}px`;
    t.style.top = `${rect.top - 10}px`;
  }

  function showLoading(rect) {
    const t = ensureTooltip();
    positionTooltip(rect);
    t.textContent = "…";
    t.style.display = "block";
  }

  function showResult(rect, word, result, saved) {
    const t = ensureTooltip();
    positionTooltip(rect);
    if (result.error || !result.text) {
      t.textContent = `⚠ ${result.error || "no translation"}`;
      t.classList.add("svs-tooltip-error");
    } else {
      t.classList.remove("svs-tooltip-error");
      t.innerHTML = "";
      const original = document.createElement("div");
      original.className = "svs-tooltip-original";
      original.textContent = word;
      if (saved) {
        const star = document.createElement("span");
        star.className = "svs-tooltip-saved";
        star.textContent = "★";
        original.appendChild(star);
      }
      const translated = document.createElement("div");
      translated.className = "svs-tooltip-translated";
      translated.textContent = result.text;
      t.appendChild(original);
      t.appendChild(translated);
    }
    t.style.display = "block";
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = "none";
  }

  // Drawn over the word rather than styled on it, so it works whether or not
  // the adapter has an element for the word (SVT Play doesn't -- see there).
  const highlight = document.createElement("div");
  highlight.className = "svs-highlight";
  highlight.style.display = "none";

  // --- The adapter-facing API ---------------------------------------------

  async function showWord(word, rect, line) {
    if (!enabled) return;
    pauseVideo();

    Object.assign(highlight.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    // Keyed by position too: the same word can appear twice in one line, and
    // hovering the second one should move the tooltip.
    const key = `${word}@${Math.round(rect.left)}`;
    if (key === shown?.key) return; // already showing (or fetching) this one
    const entry = { key, word, line, rect, translation: LagomLens.translateWord(word) };
    shown = entry;

    showLoading(rect);
    const [result, saved] = await Promise.all([
      entry.translation,
      LagomLens.isSaved(word),
    ]);
    if (shown === entry) showResult(rect, word, result, saved || entry.saved);
  }

  function clearWord() {
    resumeVideo();
    if (!shown) return;
    shown = null;
    highlight.style.display = "none";
    hideTooltip();
  }

  const lens = { showWord, clearWord, isEnabled: () => enabled };

  // --- Saving words for Anki -----------------------------------------------

  async function saveShownWord() {
    const entry = shown;
    if (!entry || entry.saved) return;
    const result = await entry.translation;
    if (!result.text) return;
    // Star it now: saving also translates the line, which can take a moment.
    entry.saved = true;
    if (shown === entry) showResult(entry.rect, entry.word, result, true);
    await LagomLens.saveWord({
      word: entry.word,
      translation: result.text,
      line: entry.line,
    });
  }

  function isOnShownWord(e) {
    if (!shown || e.button !== 0) return false;
    const r = highlight.getBoundingClientRect();
    return (
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top && e.clientY <= r.bottom
    );
  }

  function swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // Clicking the shown word saves it. The whole press is swallowed, or the
  // player would also play/pause on it (and fullscreen on a double click).
  // That's done on window in the capture phase, which runs before anything
  // the page has bound -- and checks the highlight's box rather than the
  // event target, since on Netflix the word sits under the player's UI. A
  // release only counts if the press did, so a drag that started elsewhere
  // (say, the seek bar) still gets to end over a word.
  let pressedOnWord = false;

  function onPress(e) {
    pressedOnWord = isOnShownWord(e);
    if (pressedOnWord) swallow(e);
  }

  function onRelease(e) {
    if (pressedOnWord) swallow(e);
  }

  function onClick(e) {
    if (!pressedOnWord) return;
    pressedOnWord = false;
    swallow(e);
    saveShownWord();
  }

  window.addEventListener("pointerdown", onPress, true);
  window.addEventListener("mousedown", onPress, true);
  window.addEventListener("pointerup", onRelease, true);
  window.addEventListener("mouseup", onRelease, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener(
    "dblclick",
    (e) => {
      if (isOnShownWord(e)) swallow(e);
    },
    true
  );

  // So does S, swallowed the same way so a site that binds S itself (Netflix
  // skips the intro on it) doesn't act on it too. Shift+S saves a whole line.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!shown || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== "s") return;
      const t = e.target;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        return;
      }
      swallow(e);
      saveShownWord();
    },
    true
  );

  function relocateOverlays() {
    const home = document.fullscreenElement || document.body;
    if (tooltip && tooltip.parentElement !== home) home.appendChild(tooltip);
    if (highlight.parentElement !== home) home.appendChild(highlight);
  }

  document.addEventListener("fullscreenchange", relocateOverlays);

  async function init() {
    const settings = await LagomLens.getSettings();
    enabled = settings.enabled;
    pauseOnHover = settings.pauseOnHover;

    if (!window.LagomLensSite) {
      console.warn("[Lagom Lens] no site adapter loaded for this page");
      return;
    }

    document.body.appendChild(highlight);
    window.LagomLensSite.observe(lens);

    console.log("[Lagom Lens] active on", location.hostname);
  }

  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if ("enabled" in changes) {
      enabled = changes.enabled.newValue;
      if (!enabled) clearWord();
    }
    if ("pauseOnHover" in changes) {
      pauseOnHover = changes.pauseOnHover.newValue;
      if (!pauseOnHover) resumeVideo(0);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
