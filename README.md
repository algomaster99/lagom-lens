# <img src="icons/logo.svg" alt="Lagom Lens logo" width="32" align="left" /> Lagom Lens

<sub>🇸🇪 Svenska · 🇬🇧 English · 🇪🇸 Español · 🇩🇪 Deutsch · 🇫🇷 Français · 🇮🇹 Italiano · 🇵🇹 Português · 🇳🇱 Nederlands · 🇵🇱 Polski · 🇷🇺 Русский · 🇯🇵 日本語 · 🇨🇳 中文 · 🇮🇳 हिन्दी</sub>

[![Firefox Add-ons](https://img.shields.io/amo/v/lagom-lens.svg?label=Firefox%20Add-ons&logo=firefoxbrowser&logoColor=white&color=FF7139)](https://addons.mozilla.org/en-US/firefox/addon/lagom-lens/)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/cfoohmoihngoecbcgcgdiheeelgfopfe.svg?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4)](https://chromewebstore.google.com/detail/lagom-lens/cfoohmoihngoecbcgcgdiheeelgfopfe)

Lagom Lens is a minimal browser extension which helps you to learn a new language.
Hover a word in subtitles (YouTube or SVT Play) to see a translation in your chosen language.

> [!TIP]
> **Hold <kbd>Shift</kbd> while hovering** to translate the whole subtitle line instead of just one word.

It works by manipulating the DOM elements of the page and then querying
https://mymemory.translated.net/ for translations.

## Why?

I was tired of having to pause videos, type words into my translator, and then resume the video.
Lagom Lens lets you hover over a word and see the translation instantly.

## Screenshots

#### SVT Play

![SVT Play example](screenshots/svtplay.png)

> rösträkningen -> the vote count

#### YouTube

![YouTube example](screenshots/youtube.png)

> medborgarskapsprov -> citizenship test

#### Language Menu

![Language Menu example](screenshots/extensionUI.png)


## Install from source (Chrome/Edge/Brave)

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`lagom-lens`)
5. Open a Swedish YouTube video or an SVT Play video, turn on subtitles

## Install from source (Firefox)

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` inside this folder (not the folder itself)
4. Open a Swedish YouTube video or an SVT Play video, turn on subtitles

Note: a temporary add-on is removed when Firefox restarts — reload it from
`about:debugging` again next session.

## FAQ

1. How do I translate a whole sentence instead of one word?
    - Hold `Shift` while hovering over the subtitle.

2. I was hovering and the video moved so the subtitles changed.
    - I recommend pausing the video while you hover.
      I also assume that if you are learning Swedish, you probably don't watch the video at full speed anyway so you shouldn't have this problem too often.

3. Why Lagom Lens?
    - "Lagom" is a Swedish word that roughly translates to "just right" or
      "moderate".
      Lens is inspired from Google Lens and isn't too complex like computer vision and not too simple like a dictionary lookup.
