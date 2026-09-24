// Lightweight, offline language identification for the languages Lagom Lens
// supports (see popup/popup.html). No network request, no bundled model --
// just Unicode-script checks for languages with a distinctive script, and a
// stopword/diacritic scorer for the Latin-alphabet languages where script
// alone can't tell them apart. Good enough to pick a source language out of
// a page of subtitles; not a general-purpose NLP library.

const LagomLensLangDetect = (() => {
  // Scripts that unambiguously identify a language. Checked in this order
  // since Japanese subtitles mix kana with CJK ideographs -- kana must win.
  const SCRIPT_TESTS = [
    { lang: "ru", re: /[Ѐ-ӿ]/ },
    { lang: "hi", re: /[ऀ-ॿ]/ },
    { lang: "ja", re: /[぀-ヿ]/ }, // hiragana/katakana
    { lang: "zh", re: /[一-鿿]/ }, // CJK ideographs
  ];

  // Very common short words per language, used to score plain-text Latin
  // subtitles. Kept short on purpose -- this only needs to separate a
  // handful of European languages, not do general-purpose NLP.
  const STOPWORDS = {
    sv: ["och", "att", "det", "som", "en", "på", "är", "av", "för", "med", "han", "hon", "inte", "jag", "du", "vi", "de", "den", "har", "till", "ett", "om", "så", "kan", "var", "man", "sig", "från", "vid", "här", "vad", "när", "hur"],
    en: ["the", "and", "that", "have", "for", "not", "with", "you", "this", "but", "his", "from", "they", "she", "her", "will", "would", "there", "their", "what", "about", "which", "when", "make", "like", "time", "just", "know"],
    es: ["que", "de", "la", "el", "en", "y", "los", "se", "del", "las", "por", "un", "para", "con", "no", "una", "su", "al", "es", "lo", "como", "más", "pero", "sus", "le", "ya", "este", "sí", "porque"],
    de: ["der", "die", "und", "das", "ist", "zu", "den", "nicht", "von", "sie", "mit", "des", "auf", "für", "dem", "ich", "er", "ein", "wir", "aber", "als", "auch", "es", "an", "werden", "aus", "so", "haben"],
    fr: ["le", "de", "un", "et", "à", "il", "être", "en", "avoir", "que", "pour", "dans", "ce", "son", "une", "sur", "avec", "ne", "se", "pas", "tout", "plus", "par", "je", "tu", "vous", "nous", "mais", "comme"],
    it: ["il", "di", "che", "e", "la", "per", "un", "in", "non", "è", "con", "del", "le", "si", "da", "una", "su", "come", "ma", "ha", "io", "tu", "lui", "lei", "questo", "anche", "più", "essere", "sono"],
    pt: ["que", "de", "não", "um", "para", "com", "uma", "os", "no", "se", "na", "por", "mais", "as", "dos", "como", "mas", "foi", "ao", "ele", "das", "tem", "seu", "sua", "ou", "ser", "quando", "muito", "há"],
    nl: ["de", "het", "een", "van", "en", "in", "is", "dat", "op", "te", "voor", "met", "niet", "zijn", "aan", "er", "maar", "om", "dan", "ook", "naar", "als", "bij", "hij", "zij", "wij", "jullie", "deze", "nog"],
    pl: ["i", "w", "na", "nie", "to", "się", "z", "do", "że", "jest", "jak", "co", "o", "ale", "tak", "dla", "po", "przez", "już", "tylko", "ja", "ty", "on", "ona", "my", "wy", "oni", "one", "być", "mieć"],
  };

  // Extra signal from letters/combos that are distinctive even in a single
  // word -- helps when the stopword overlap between two languages is close.
  const DIACRITIC_HINTS = [
    { lang: "sv", re: /[åäö]/gi },
    { lang: "de", re: /[üß]/gi },
    { lang: "es", re: /[ñ¿¡]/gi },
    { lang: "fr", re: /[çœ]/gi },
    { lang: "pt", re: /[ãõ]/gi },
    { lang: "pl", re: /[łżźćęąńś]/gi },
  ];

  const MIN_CHARS = 40; // don't even try on a couple of words
  const MIN_SCORE = 3; // require real signal, not one coincidental stopword

  function tokenize(text) {
    return text.toLowerCase().match(/[\p{L}\p{M}]+/gu) || [];
  }

  function scriptGuess(text) {
    for (const { lang, re } of SCRIPT_TESTS) {
      if (re.test(text)) return lang;
    }
    return null;
  }

  function latinGuess(text) {
    const words = tokenize(text);
    if (words.length < 8) return null;

    const wordSet = new Set(words);
    const scores = {};
    for (const [lang, list] of Object.entries(STOPWORDS)) {
      scores[lang] = list.reduce((n, w) => n + (wordSet.has(w) ? 1 : 0), 0);
    }
    for (const { lang, re } of DIACRITIC_HINTS) {
      const matches = text.match(re);
      if (matches) scores[lang] = (scores[lang] || 0) + matches.length * 0.5;
    }

    let best = null;
    let bestScore = 0;
    for (const [lang, score] of Object.entries(scores)) {
      if (score > bestScore) {
        best = lang;
        bestScore = score;
      }
    }
    return bestScore >= MIN_SCORE ? best : null;
  }

  // Returns a language code Lagom Lens supports, or null if there isn't
  // enough text yet or nothing scored confidently.
  function detect(text) {
    if (!text || text.trim().length < MIN_CHARS) return null;
    return scriptGuess(text) || latinGuess(text);
  }

  return { detect };
})();
