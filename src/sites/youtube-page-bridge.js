// Runs in the *page's* own JS context, not the content script's isolated
// world -- injected via a <script src> tag (see youtube.js). That's the
// only place the current video's caption track URLs are reachable: modern
// YouTube signs the timedtext endpoint (a `pot`/`signature` pair baked into
// each track's baseUrl by the page's own player, not something a content
// script can construct itself -- github.com/algomaster99/lagom-lens/issues/18).
// getPlayerResponse() reflects the currently loaded video even after an SPA
// navigation; window.ytInitialPlayerResponse only covers the very first
// page load, so it's used only as a fallback.
(function () {
  function currentCaptionTracks() {
    try {
      const player = document.getElementById("movie_player");
      const response =
        (player &&
          typeof player.getPlayerResponse === "function" &&
          player.getPlayerResponse()) ||
        window.ytInitialPlayerResponse;
      const tracks =
        response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      return tracks.map((t) => ({ baseUrl: t.baseUrl, languageCode: t.languageCode }));
    } catch (err) {
      return [];
    }
  }

  window.addEventListener("svs-request-caption-tracks", () => {
    window.dispatchEvent(
      new CustomEvent("svs-caption-tracks", { detail: currentCaptionTracks() })
    );
  });
})();
