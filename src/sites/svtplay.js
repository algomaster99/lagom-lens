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
// That DOM is rendered by React, though, which keeps references to the text
// nodes it created. Splitting them into word spans (our YouTube strategy)
// breaks React rendering as react tries to update the original text nodes.
// So we don't touch the DOM at all,

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

  // Anything that isn't whitespace or punctuation counts as part of a word.
  const WORD_CHAR = /[^\s.,!?;:"'“”‘’()]/;

  // "Which text position is under this pixel?" Two APIs answer that and no
  // browser has both, so normalise them to { node, offset }.
  function caretAt(x, y) {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y); // Firefox, Chrome 128+
      return pos && { node: pos.offsetNode, offset: pos.offset };
    }
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y); // older Chrome
      return range && { node: range.startContainer, offset: range.startOffset };
    }
    return null;
  }

  // Expand that caret out to word boundaries and measure it. A Range gives us
  // the rect the overlay needs without modifying a single node.
  function wordAt(x, y, container) {
    const caret = caretAt(x, y);
    if (caret?.node?.nodeType !== Node.TEXT_NODE) return null;
    if (!container.contains(caret.node)) return null;

    const text = caret.node.textContent;
    let start = caret.offset;
    let end = caret.offset;
    while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
    while (end < text.length && WORD_CHAR.test(text[end])) end++;
    if (start === end) return null;

    const range = document.createRange();
    range.setStart(caret.node, start);
    range.setEnd(caret.node, end);
    const rect = range.getBoundingClientRect();
    // The caret snaps to the nearest character, so a pointer in the margin
    // past the end of a line still resolves a word. Require a real hit.
    if (x < rect.left || x > rect.right) return null;
    return { word: text.slice(start, end), rect };
  }

  function observe(lens) {
    let attempts = 0;
    let container = null;
    const maxAttempts = 20; // ~20s -- player mounts async on SPA nav

    document.addEventListener("mousemove", (e) => {
      if (!lens.isEnabled() || !container?.isConnected) return;
      // Cheap reject first: caret hit-testing every mousemove is wasteful.
      if (!container.contains(e.target)) return lens.clearWord();

      const hit = wordAt(e.clientX, e.clientY, container);
      if (hit) lens.showWord(hit.word, hit.rect);
      else lens.clearWord();
    });

    const tryAttach = () => {
      attempts++;

      const confirmed = findConfirmedContainer();
      if (confirmed) {
        container = confirmed;
        console.log("[Lagom Lens] watching SVT Play subtitles via", CONTAINER_SELECTOR);
        return;
      }

      const fallback = findFallbackContainer();
      if (fallback) {
        container = fallback;
        console.log("[Lagom Lens] watching SVT Play subtitles via fallback match", fallback.className);
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
    // down and recreated between videos, so re-resolve it on navigation or
    // if the one we hold leaves the document.
    let lastPath = location.pathname;
    new MutationObserver(() => {
      const navigated = location.pathname !== lastPath;
      if (!navigated && container?.isConnected !== false) return;
      lastPath = location.pathname;
      container = null;
      lens.clearWord();
      attempts = 0;
      setTimeout(tryAttach, navigated ? 1500 : 0);
    }).observe(document.body, { childList: true, subtree: true });
  }

  return { observe };
})();