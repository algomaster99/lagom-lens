const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = {
  enabled: true,
  sourceLang: "auto",
  targetLang: "en",
};

const enabledEl = document.getElementById("enabled");
const sourceLangEl = document.getElementById("sourceLang");
const targetLangEl = document.getElementById("targetLang");
const swapLangsEl = document.getElementById("swapLangs");
const statusEl = document.getElementById("status");

function showSaved() {
  statusEl.textContent = "Saved";
  setTimeout(() => (statusEl.textContent = ""), 1000);
}

function syncLangOptions() {
  for (const option of sourceLangEl.options) {
    option.disabled = option.value === targetLangEl.value;
  }
  for (const option of targetLangEl.options) {
    option.disabled = option.value === sourceLangEl.value;
  }
  // Nothing concrete to swap into "From" when it's auto-detecting.
  swapLangsEl.disabled = sourceLangEl.value === "auto";
}

async function load() {
  const settings = await browserAPI.storage.sync.get(DEFAULTS);
  enabledEl.checked = settings.enabled;
  sourceLangEl.value = settings.sourceLang;
  targetLangEl.value = settings.targetLang;
  syncLangOptions();
}

function save() {
  browserAPI.storage.sync
    .set({
      enabled: enabledEl.checked,
      sourceLang: sourceLangEl.value,
      targetLang: targetLangEl.value,
    })
    .then(showSaved);
}

function onSourceLangChange() {
  if (sourceLangEl.value === targetLangEl.value) {
    // Swap so the two selections stay distinct.
    targetLangEl.value = prevSourceLang;
  }
  prevSourceLang = sourceLangEl.value;
  syncLangOptions();
  save();
}

function onTargetLangChange() {
  if (targetLangEl.value === sourceLangEl.value) {
    // Swap so the two selections stay distinct.
    sourceLangEl.value = prevTargetLang;
  }
  prevTargetLang = targetLangEl.value;
  syncLangOptions();
  save();
}

function onSwapLangs() {
  if (sourceLangEl.value === "auto") return; // nothing concrete to swap
  const source = sourceLangEl.value;
  const target = targetLangEl.value;
  sourceLangEl.value = target;
  targetLangEl.value = source;
  prevSourceLang = sourceLangEl.value;
  prevTargetLang = targetLangEl.value;
  syncLangOptions();
  save();
}

let prevSourceLang = sourceLangEl.value;
let prevTargetLang = targetLangEl.value;

enabledEl.addEventListener("change", save);
sourceLangEl.addEventListener("change", onSourceLangChange);
targetLangEl.addEventListener("change", onTargetLangChange);
swapLangsEl.addEventListener("click", onSwapLangs);

load().then(() => {
  prevSourceLang = sourceLangEl.value;
  prevTargetLang = targetLangEl.value;
});
