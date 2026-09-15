const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = {
  enabled: true,
  sourceLang: "sv",
  targetLang: "en",
};

const enabledEl = document.getElementById("enabled");
const targetLangEl = document.getElementById("targetLang");
const statusEl = document.getElementById("status");

function showSaved() {
  statusEl.textContent = "Saved";
  setTimeout(() => (statusEl.textContent = ""), 1000);
}

async function load() {
  const settings = await browserAPI.storage.sync.get(DEFAULTS);
  enabledEl.checked = settings.enabled;
  targetLangEl.value = settings.targetLang;
}

function save() {
  browserAPI.storage.sync
    .set({
      enabled: enabledEl.checked,
      targetLang: targetLangEl.value,
    })
    .then(showSaved);
}

enabledEl.addEventListener("change", save);
targetLangEl.addEventListener("change", save);

load();
