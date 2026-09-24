// Confirmed from live SVT Play pages (svtplay.se, TTML-based player):
//
//   <div data-rt="subtitles-container" class="css-17nsyyn">
//     <div class="video-player__text-tracks" ...></div>
//     <div class="css-qwoqrz">
//       <div class="css-xkje1x">
//         <div class="css-1okjmlg">
//           <span>line one text</span>
//           <span>line two text</span>
//         </div>
//       </div>
//     </div>
//   </div>
//
// This DOM shape isn't stable -- an older version had a <p><span><span>
// cue wrapped in an id="cue_TTML_###" div, this one doesn't, and wrapper
// classes are build-hashed either way. So we never anchor to "the cue
// element" -- for shift-hover we just read whatever text is in the
// container (see readSubtitle below).
//
// So SVT renders subtitles as custom DOM (TTML cues turned into spans), NOT
// as native <track> cues -- no need to intercept cuechange or draw our own
// overlay. We just need the right container.
//
// That DOM is rendered by React, though, which keeps references to the text
// nodes it created. Splitting them into word spans (our YouTube strategy)
// breaks React rendering as react tries to update the original text nodes.
// So we don't touch the DOM at all,

window.LagomLensSite = (() => {
  const CONTAINER_SELECTOR = '[data-rt="subtitles-container"]';

  // Fallback for the case this path exists to survive: SVT renaming or
  // dropping data-rt. Plain `video` as a second selector for the same reason.
  //
  // TODO: this only half works today. The JS survives a data-rt rename, but
  // src/sites/svtplay.css is keyed to [data-rt="subtitles-container"], and
  // those rules (z-index, pointer-events on the line spans) are what let the
  // mouse reach the text at all -- so in the very scenario this fallback is
  // for, we would resolve a container we cannot hover. The fix is to have
  // this file mark whichever container it resolved and key the CSS off that
  // instead:
  //
  //   el.dataset.svsSubtitles = "";   // data attribute, not a class: React
  //                                   // manages className and would fight us
  //   [data-svs-subtitles] span { pointer-events: auto !important; }
  //
  // Not done here because it moves the CSS behind our JS -- today it applies
  // straight from SVT's own markup as the page paints -- and the whole path
  // is unexercised until SVT actually changes something.
  const VIDEO_SELECTOR = '[data-rt="video-player"], video';

  function findConfirmedContainer() {
    return document.querySelector(CONTAINER_SELECTOR);
  }

  function findFallbackContainer() {
    const video = document.querySelector(VIDEO_SELECTOR);
    return video?.parentElement || null;
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

  // Text nodes only, not e.g. container.innerText: the container also holds
  // .video-player__text-tracks, an empty div CSS sizes to the whole video --
  // walking to text avoids picking up its box (see readSubtitle below).
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
    // SVT Play only serves Swedish content, so there's nothing to detect.
    LagomLens.forceDetectedLang("sv");

    let attempts = 0;
    let container = null;
    const maxAttempts = 20; // ~20s -- player mounts async on SPA nav

    let pointer = null; // last { x, y, target }
    let shiftHeld = false;

    function update() {
      if (!lens.isEnabled() || !container?.isConnected || !pointer) return;
      if (!container.contains(pointer.target)) return lens.clearWord();

      if (shiftHeld) {
        const subtitle = readSubtitle(container);
        if (subtitle) lens.showWord(subtitle.text, subtitle.rect);
        else lens.clearWord();
        return;
      }

      const hit = wordAt(pointer.x, pointer.y, container);
      if (hit) lens.showWord(hit.word, hit.rect);
      else lens.clearWord();
    }

    document.addEventListener("mousemove", (e) => {
      if (!lens.isEnabled() || !container?.isConnected) return;
      pointer = { x: e.clientX, y: e.clientY, target: e.target };
      update();
    });

    // Shift toggles word-level vs. whole-subtitle translation.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Shift" || shiftHeld) return;
      shiftHeld = true;
      update();
    });
    document.addEventListener("keyup", (e) => {
      if (e.key !== "Shift") return;
      shiftHeld = false;
      update();
    });
    // Keyup can be missed (e.g. alt-tab while holding Shift).
    window.addEventListener("blur", () => {
      shiftHeld = false;
    });

    // Refresh on DOM changes too, not just mouse/key events -- subtitles
    // swap while the mouse sits still.
    let contentObserver = null;
    function attachContainer(el) {
      container = el;
      contentObserver?.disconnect();
      contentObserver = new MutationObserver(update);
      contentObserver.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    const tryAttach = () => {
      attempts++;

      const confirmed = findConfirmedContainer();
      if (confirmed) {
        attachContainer(confirmed);
        console.log("[Lagom Lens] watching SVT Play subtitles via", CONTAINER_SELECTOR);
        return;
      }

      // Most SVT pages -- start, categories, search -- have no player at all,
      // so this finds nothing and costs one querySelector. Keep polling
      // either way: the video modal mounts without a navigation.
      const fallback = findFallbackContainer();
      if (fallback) {
        attachContainer(fallback);
        console.log("[Lagom Lens] watching SVT Play subtitles via the video's parent");
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
      contentObserver?.disconnect();
      contentObserver = null;
      lens.clearWord();
      attempts = 0;
      setTimeout(tryAttach, navigated ? 1500 : 0);
    }).observe(document.body, { childList: true, subtree: true });
  }

  return { observe };
})();