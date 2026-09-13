// Site-agnostic glue: expects window.LagomLensSite to be defined by the
// per-site script (src/sites/youtube.js or svtplay.js) with:
//   { findContainer(): Element|null, observe(onSubtitleNode): void }

(function () {
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;

  let tooltip = null;
  let hideTimer = null;
  let enabled = true;

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "svs-tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    const t = ensureTooltip();
    t.style.left = `${rect.left + rect.width / 2}px`;
    t.style.top = `${rect.top - 10}px`;
  }

  function showLoading(target) {
    const t = ensureTooltip();
    positionTooltip(target);
    t.textContent = "…";
    t.style.display = "block";
  }

  function showResult(target, word, result) {
    const t = ensureTooltip();
    positionTooltip(target);
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

  async function handleWordHover(e) {
    if (!enabled) return;
    const el = e.target.closest(".svs-word");
    if (!el) return;

    clearTimeout(hideTimer);
    const word = el.dataset.svsWord;
    showLoading(el);
    const result = await LagomLens.translateWord(word);
    // Guard against the user having moved off before the lookup resolved.
    if (el.matches(":hover")) {
      showResult(el, word, result);
    }
  }

  function handleWordLeave(e) {
    const el = e.target.closest(".svs-word");
    if (!el) return;
    hideTimer = setTimeout(hideTooltip, 150);
  }

  function attachHoverListeners(root) {
    // Event delegation on the root so newly-added .svs-word spans
    // (from ongoing MutationObserver activity) work automatically.
    root.addEventListener("mouseover", handleWordHover);
    root.addEventListener("mouseout", handleWordLeave);
  }

  function onSubtitleNode(node) {
    if (!enabled || !node) return;
    LagomLens.wrapWordsIn(node);
  }

  async function init() {
    const settings = await LagomLens.getSettings();
    enabled = settings.enabled;

    if (!window.LagomLensSite) {
      console.warn("[Lagom Lens] no site adapter loaded for this page");
      return;
    }

    attachHoverListeners(document.body);
    window.LagomLensSite.observe(onSubtitleNode);

    console.log("[Lagom Lens] active on", location.hostname);
  }

  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && "enabled" in changes) {
      enabled = changes.enabled.newValue;
      if (!enabled) hideTooltip();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
