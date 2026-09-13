const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = {
  enabled: true,
  sourceLang: "sv",
  targetLang: "en",
  provider: "mymemory",
  deeplApiKey: "",
};

const enabledEl = document.getElementById("enabled");
const providerEl = document.getElementById("provider");
const deeplRowEl = document.getElementById("deeplRow");
const deeplKeyEl = document.getElementById("deeplApiKey");
const statusEl = document.getElementById("status");

function updateDeeplVisibility() {
  deeplRowEl.style.display = providerEl.value === "deepl" ? "flex" : "none";
}

function showSaved() {
  statusEl.textContent = "Saved";
  setTimeout(() => (statusEl.textContent = ""), 1000);
}

async function load() {
  const settings = await browserAPI.storage.sync.get(DEFAULTS);
  enabledEl.checked = settings.enabled;
  providerEl.value = settings.provider;
  deeplKeyEl.value = settings.deeplApiKey || "";
  updateDeeplVisibility();
}

function save() {
  browserAPI.storage.sync
    .set({
      enabled: enabledEl.checked,
      provider: providerEl.value,
      deeplApiKey: deeplKeyEl.value.trim(),
    })
    .then(showSaved);
}

enabledEl.addEventListener("change", save);
providerEl.addEventListener("change", () => {
  updateDeeplVisibility();
  save();
});
deeplKeyEl.addEventListener("change", save);

load();
