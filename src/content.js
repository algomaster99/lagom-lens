// Site-agnostic glue. Everything that differs between players -- how the
// caption container is found, and how a word is resolved from the pointer --
// lives in the per-site adapter (src/sites/*.js). This file owns only the
// parts that are the same everywhere: the tooltip, the hover highlight, the
// translation lookup and the enabled/disabled state.
//
// An adapter defines window.LagomLensSite with:
//   observe(lens): start watching this player. Call lens.showWord(word, rect)
//     when the pointer is over a word, lens.clearWord() when it leaves, and
//     lens.isEnabled() before doing any work of its own.

(function () {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  let tooltip = null;
  let enabled = true;
  let shownWord = null;

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "svs-tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
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

  function showResult(rect, word, result) {
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

  async function showWord(word, rect) {
    if (!enabled) return;

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
    if (key === shownWord) return; // already showing (or fetching) this one
    shownWord = key;

    showLoading(rect);
    const result = await LagomLens.translateWord(word);
    if (shownWord === key) showResult(rect, word, result);
  }

  function clearWord() {
    if (!shownWord) return;
    shownWord = null;
    highlight.style.display = "none";
    hideTooltip();
  }

  const lens = { showWord, clearWord, isEnabled: () => enabled };

  // -----------------------------------------------------------------------

  async function init() {
    const settings = await LagomLens.getSettings();
    enabled = settings.enabled;

    if (!window.LagomLensSite) {
      console.warn("[Lagom Lens] no site adapter loaded for this page");
      return;
    }

    document.body.appendChild(highlight);
    window.LagomLensSite.observe(lens);

    console.log("[Lagom Lens] active on", location.hostname);
  }

  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && "enabled" in changes) {
      enabled = changes.enabled.newValue;
      if (!enabled) clearWord();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
