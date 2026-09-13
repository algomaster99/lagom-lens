// Confirmed from a live SVT Play page (svtplay.se, TTML-based player):
//
//   <div data-rt="subtitles-container" class="css-17nsyyn">
//     <div class="video-player__text-tracks" ...>
//       <div id="cue_TTML_###">
//         ... deeply nested wrapper divs ...
//         <p><span><span>line one text</span></span><br>
//            <span><span>line two text</span></span></p>
//       </div>
//     </div>
//   </div>
//
// So SVT renders subtitles as custom DOM (TTML cues turned into nested
// spans), NOT as native <track> cues -- no need to intercept cuechange or
// draw our own overlay. We just need the right container.
//
// [data-rt="subtitles-container"] is the stable anchor: `data-rt` looks
// like a deliberate test/routing attribute, much less likely to change on
// a redesign than an auto-generated class like "css-17nsyyn".

window.LagomLensSite = (() => {
  const CONTAINER_SELECTOR = '[data-rt="subtitles-container"]';

  // Fallback heuristic kept in case SVT changes markup and drops data-rt.
  const OVERLAY_HINTS = ["subtitle", "captions", "cue", "text-track"];

  function findConfirmedContainer() {
    return document.querySelector(CONTAINER_SELECTOR);
  }

  function looksLikeOverlay(el) {
    if (!el || el.childElementCount > 20) return false;
    const cls = (el.className || "").toString().toLowerCase();
    return OVERLAY_HINTS.some((hint) => cls.includes(hint));
  }

  function findFallbackContainer() {
    const candidates = Array.from(document.querySelectorAll("div, span")).filter(
      looksLikeOverlay
    );
    return candidates[0] || null;
  }

  function watchContainer(container, onSubtitleNode, label) {
    const observer = new MutationObserver(() => {
      onSubtitleNode(container);
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    onSubtitleNode(container);
    console.log("[Lagom Lens] watching SVT Play subtitles via", label);
  }

  function observe(onSubtitleNode) {
    let attempts = 0;
    const maxAttempts = 20; // ~20s -- player mounts async on SPA nav

    const tryAttach = () => {
      attempts++;

      const confirmed = findConfirmedContainer();
      if (confirmed) {
        watchContainer(confirmed, onSubtitleNode, CONTAINER_SELECTOR);
        return;
      }

      const fallback = findFallbackContainer();
      if (fallback) {
        watchContainer(fallback, onSubtitleNode, "fallback match (" + fallback.className + ")");
        return;
      }

      if (attempts >= maxAttempts) {
        console.warn(
          "[Lagom Lens] couldn't find SVT Play subtitles after",
          attempts,
          "attempts."
        );
        return;
      }

      setTimeout(tryAttach, 1000);
    };

    tryAttach();

    // SVT Play is a single-page app -- the subtitles container gets torn
    // down and recreated between videos, so re-attempt on navigation.
    let lastPath = location.pathname;
    new MutationObserver(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        attempts = 0;
        setTimeout(tryAttach, 1500);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  return { observe };
})();