// Confirmed from a live Netflix /watch page:
//
//   <div data-uia="video-canvas">
//     <div>
//       <div id="81752899">              <- the video id
//         <video src="blob:..."></video>
//         <div class="player-timedtext" style="position: absolute; inset: 0px 373px">
//           <div class="player-timedtext-text-container" style="position: absolute; bottom: 10%">
//             <span style="display: inline-block">
//               <span style="font-size: 27px; ...">[sorl och skratt]</span>
//             </span>
//           </div>
//         </div>
//       </div>
//     </div>
//   </div>
//
// Nearly every class in the player is build-hashed; player-timedtext is a
// plain one, so that's what we anchor to.
//
// Like SVT Play, we don't split the text into word spans -- those nodes belong
// to Netflix's player, not us -- and use Ranges to measure words instead.
//
// Unlike SVT Play, we don't hit-test at the pointer (caretPositionFromPoint).
// That only finds the text if it's the topmost thing under the mouse, and here
// it sits inside the video canvas with Netflix's player UI layered over it.
// Rather than fight the player's stacking with CSS, we measure every word
// ourselves and test the pointer against those boxes. A subtitle is a line or
// two, so that's cheap, and it leaves where clicks land untouched -- which is
// also why this site has no stylesheet.

window.LagomLensSite = (() => {
  const CONTAINER_SELECTOR = ".player-timedtext";

  // Letters, marks and digits, keeping inner hyphens and apostrophes
  // ("e-post", "it's"). Leaves out dialogue dashes and the brackets around
  // sound descriptions like "[sorl och skratt]".
  const WORD = /[\p{L}\p{M}\p{N}]+(?:[-'’][\p{L}\p{M}\p{N}]+)*/gu;

  function findContainer() {
    return document.querySelector(CONTAINER_SELECTOR);
  }

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

  function isInside(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function wordAt(x, y, container) {
    const range = document.createRange();
    for (const node of collectTextNodes(container)) {
      for (const match of node.textContent.matchAll(WORD)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getBoundingClientRect();
        if (isInside(rect, x, y)) return { word: match[0], rect };
      }
    }
    return null;
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
    let container = null;
    let contentObserver = null;
    let pointer = null; // last { x, y }
    let shiftHeld = false;

    // Netflix is a single-page app that only mounts the player on /watch and
    // tears it down when you leave, so resolve the container lazily, and again
    // whenever the one we hold has left the document.
    function resolveContainer() {
      if (container?.isConnected) return container;
      contentObserver?.disconnect();
      contentObserver = null;
      container = findContainer();
      if (container) {
        // Refresh on DOM changes too, not just mouse/key events --
        // subtitles swap while the mouse sits still.
        contentObserver = new MutationObserver(update);
        contentObserver.observe(container, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
      return container;
    }

    function update() {
      if (!lens.isEnabled() || !pointer) return;
      const el = resolveContainer();
      if (!el) return lens.clearWord();

      if (shiftHeld) {
        const subtitle = readSubtitle(el);
        if (subtitle && isInside(subtitle.rect, pointer.x, pointer.y)) {
          lens.showWord(subtitle.text, subtitle.rect);
        } else {
          lens.clearWord();
        }
        return;
      }

      const hit = wordAt(pointer.x, pointer.y, el);
      if (hit) lens.showWord(hit.word, hit.rect, readSubtitle(el)?.text);
      else lens.clearWord();
    }

    // Capture phase: we only read these events, and this way the player's own
    // handlers can't stop them from reaching us.
    document.addEventListener(
      "mousemove",
      (e) => {
        if (!lens.isEnabled()) return;
        pointer = { x: e.clientX, y: e.clientY };
        update();
      },
      true
    );

    // Shift toggles word-level vs. whole-subtitle translation.
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Shift" || shiftHeld) return;
        shiftHeld = true;
        update();
      },
      true
    );
    document.addEventListener(
      "keyup",
      (e) => {
        if (e.key !== "Shift") return;
        shiftHeld = false;
        update();
      },
      true
    );
    // Keyup can be missed (e.g. alt-tab while holding Shift).
    window.addEventListener("blur", () => {
      shiftHeld = false;
    });
  }

  return { observe };
})();
