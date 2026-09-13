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

async function translateWithDeepL(word, settings) {
  // DeepL's free API endpoint; requires the user's own API key.
  const res = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${settings.deeplApiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      text: word,
      source_lang: settings.sourceLang.toUpperCase(),
      target_lang: settings.targetLang.toUpperCase(),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.translations?.[0]?.text;
  if (!text) throw new Error("no translation returned");
  return { text, raw: data };
}

async function handleTranslateRequest({ word, settings }) {
  try {
    if (settings.provider === "deepl" && settings.deeplApiKey) {
      return await translateWithDeepL(word, settings);
    }
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
