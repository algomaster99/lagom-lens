// Runs the actual translation network requests. Kept out of the content
// script because Firefox subjects content-script fetch() calls to the
// host page's CSP (e.g. SVT Play's connect-src blocks api.mymemory...);
// a background script's fetches are unaffected by any page's CSP.

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

async function translateWithMyMemory(word, settings) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    word
  )}&langpair=${settings.sourceLang}|${settings.targetLang}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.responseData?.translatedText;
  if (!text) throw new Error("no translation returned");
  return { text, raw: data };
}

async function handleTranslateRequest({ word, settings }) {
  if (settings.sourceLang === settings.targetLang) {
    return { text: word, raw: null };
  }
  try {
    return await translateWithMyMemory(word, settings);
  } catch (err) {
    return { text: null, error: err.message || "lookup failed" };
  }
}

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "svs-translate") return undefined;
  handleTranslateRequest(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});
