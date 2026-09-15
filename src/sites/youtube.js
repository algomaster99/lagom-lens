// YouTube renders captions as DOM spans inside .ytp-caption-window-container,
// with individual lines in .caption-window > .ytp-caption-segment.
// These get destroyed and recreated frequently, so we watch broadly and
// re-process whatever segment nodes show up.

window.LagomLensSite = (() => {
  const CONTAINER_SELECTOR = ".ytp-caption-window-container";

  function findContainer() {
    return document.querySelector(CONTAINER_SELECTOR);
  }

  function observe(onSubtitleNode) {
    let containerObserver = null;

    function watchContainer(container) {
      if (containerObserver) containerObserver.disconnect();
      containerObserver = new MutationObserver(() => {
        onSubtitleNode(container);
      });
      containerObserver.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      // Process whatever's already there.
      onSubtitleNode(container);
    }

    // The caption container itself appears/disappears with the player,
    // so watch the player area for it showing up.
    const rootObserver = new MutationObserver(() => {
      const container = findContainer();
      if (container && !container.dataset.svsWatched) {
        container.dataset.svsWatched = "1";
        watchContainer(container);
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
