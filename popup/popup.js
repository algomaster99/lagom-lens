const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = {
  enabled: true,
  pauseOnHover: true,
  sourceLang: "sv",
  targetLang: "en",
};

const enabledEl = document.getElementById("enabled");
const pauseOnHoverEl = document.getElementById("pauseOnHover");
const sourceLangEl = document.getElementById("sourceLang");
const targetLangEl = document.getElementById("targetLang");
const swapLangsEl = document.getElementById("swapLangs");
const statusEl = document.getElementById("status");
const savedCountEl = document.getElementById("savedCount");
const exportAnkiEl = document.getElementById("exportAnki");
const savedListEl = document.getElementById("savedList");
const deleteAllEl = document.getElementById("deleteAll");
const confirmDeleteAllEl = document.getElementById("confirmDeleteAll");
const confirmDeleteEl = document.getElementById("confirmDelete");
const cancelDeleteEl = document.getElementById("cancelDelete");

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
}

async function load() {
  const settings = await browserAPI.storage.sync.get(DEFAULTS);
  enabledEl.checked = settings.enabled;
  pauseOnHoverEl.checked = settings.pauseOnHover;
  sourceLangEl.value = settings.sourceLang;
  targetLangEl.value = settings.targetLang;
  syncLangOptions();
}

function save() {
  browserAPI.storage.sync
    .set({
      enabled: enabledEl.checked,
      pauseOnHover: pauseOnHoverEl.checked,
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
  const source = sourceLangEl.value;
  const target = targetLangEl.value;
  sourceLangEl.value = target;
  targetLangEl.value = source;
  prevSourceLang = sourceLangEl.value;
  prevTargetLang = targetLangEl.value;
  syncLangOptions();
  save();
}

// --- Saved words ------------------------------------------------------------

// Each saved word is its own storage.local entry, keyed "saved:..." (see
// saveWord in src/common.js). Returns [key, word] pairs, oldest first.
async function getSavedWords() {
  const stored = await browserAPI.storage.local.get(null);
  return Object.entries(stored)
    .filter(([key]) => key.startsWith("saved:"))
    .sort(([, a], [, b]) => a.savedAt - b.savedAt);
}

async function renderSaved() {
  const saved = await getSavedWords();
  savedCountEl.textContent = saved.length ? `(${saved.length})` : "";
  exportAnkiEl.disabled = !saved.length;
  deleteAllEl.disabled = !saved.length;
  if (!saved.length) showDeleteConfirm(false);

  // Newest first -- most likely the one you're looking for.
  savedListEl.replaceChildren(
    ...saved.reverse().map(([key, w]) => {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.className = "saved-word";
      text.title = w.line || w.word;
      text.textContent = w.word;
      const translation = document.createElement("span");
      translation.className = "saved-translation";
      translation.textContent = ` — ${w.translation}`;
      text.appendChild(translation);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-btn";
      remove.title = "Remove";
      remove.setAttribute("aria-label", `Remove ${w.word}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => browserAPI.storage.local.remove(key));

      li.append(text, remove);
      return li;
    })
  );
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The sentence as HTML, with each occurrence of the word in bold.
function boldWord(line, word) {
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`,
    "giu"
  );
  let html = "";
  let last = 0;
  for (const match of line.matchAll(re)) {
    html += `${escapeHtml(line.slice(last, match.index))}<b>${escapeHtml(match[0])}</b>`;
    last = match.index + match[0].length;
  }
  return html + escapeHtml(line.slice(last));
}

// "Word" and "Sentence" in each language on offer. A card's front is labelled
// in the language being learned and its back in the one it's translated to.
const LABELS = {
  sv: { word: "Ord", sentence: "Mening" },
  en: { word: "Word", sentence: "Sentence" },
  es: { word: "Palabra", sentence: "Frase" },
  de: { word: "Wort", sentence: "Satz" },
  fr: { word: "Mot", sentence: "Phrase" },
  it: { word: "Parola", sentence: "Frase" },
  pt: { word: "Palavra", sentence: "Frase" },
  nl: { word: "Woord", sentence: "Zin" },
  pl: { word: "Słowo", sentence: "Zdanie" },
  ru: { word: "Слово", sentence: "Предложение" },
  ja: { word: "単語", sentence: "文" },
  zh: { word: "单词", sentence: "句子" },
  hi: { word: "शब्द", sentence: "वाक्य" },
};

// Always quoted: Anki reads the file as CSV, where a line starting with # is
// a comment and an unquoted " would start a quoted field.
function tsvField(text) {
  return `"${text.replace(/"/g, '""')}"`;
}

// One Basic note per word: the word and its sentence on the front, their
// meanings on the back. The header lines set up Anki's import dialog; a deck
// column rather than a #deck header because only a column creates the deck if
// it's missing.
//
// Every export holds every saved word, so importing again is the normal case.
// Anki matches a row to an existing note by its first field, and "keep
// current" leaves that note as it is: only new words are added, and anything
// the user changed in Anki survives. The flip side is that a note whose front
// no longer matches -- because the user edited it, or because this file
// renders fronts differently -- gets imported again as a second card.
function toAnkiTsv(saved) {
  const rows = [
    "#separator:tab",
    "#html:true",
    "#notetype:Basic",
    "#columns:Front\tBack\tDeck\tTags",
    "#deck column:3",
    "#tags column:4",
    "#if matches:keep current",
  ];
  for (const [, w] of saved) {
    const from = LABELS[w.sourceLang] || LABELS.en;
    const to = LABELS[w.targetLang] || LABELS.en;
    // A line saved with Shift is a sentence. Words never contain spaces --
    // every site adapter splits on them.
    const kind = /\s/.test(w.word) ? "sentence" : "word";
    let front = `${from[kind]}: <b>${escapeHtml(w.word)}</b>`;
    let back = `${to[kind]}: ${escapeHtml(w.translation)}`;
    if (w.line) {
      front += `<br><br>${from.sentence}: <i>${boldWord(w.line, w.word)}</i>`;
      if (w.lineTranslation) {
        back += `<br><br>${to.sentence}: <i>${escapeHtml(w.lineTranslation)}</i>`;
      }
    }
    const tags = `lagom-lens ${w.sourceLang} ${w.site}`;
    rows.push([front, back, "Lagom Lens", tags].map(tsvField).join("\t"));
  }
  return rows.join("\n") + "\n";
}

async function exportAnki() {
  const tsv = toAnkiTsv(await getSavedWords());
  const url = URL.createObjectURL(new Blob([tsv], { type: "text/tab-separated-values" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "lagom-lens-anki.tsv";
  // In the document, not detached: Firefox ignores click() otherwise.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Not revoked right away: the download may still be reading it.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Two steps, since there's no undo. Separate from exporting on purpose: an
// export can fail or be cancelled, and the words shouldn't go with it.
function showDeleteConfirm(show) {
  deleteAllEl.hidden = show;
  confirmDeleteAllEl.hidden = !show;
}

async function deleteAll() {
  const saved = await getSavedWords();
  await browserAPI.storage.local.remove(saved.map(([key]) => key));
  showDeleteConfirm(false);
}

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === "local") renderSaved();
});

let prevSourceLang = sourceLangEl.value;
let prevTargetLang = targetLangEl.value;

enabledEl.addEventListener("change", save);
pauseOnHoverEl.addEventListener("change", save);
sourceLangEl.addEventListener("change", onSourceLangChange);
targetLangEl.addEventListener("change", onTargetLangChange);
swapLangsEl.addEventListener("click", onSwapLangs);
exportAnkiEl.addEventListener("click", exportAnki);
deleteAllEl.addEventListener("click", () => showDeleteConfirm(true));
cancelDeleteEl.addEventListener("click", () => showDeleteConfirm(false));
confirmDeleteEl.addEventListener("click", deleteAll);

load().then(() => {
  prevSourceLang = sourceLangEl.value;
  prevTargetLang = targetLangEl.value;
});
renderSaved();
