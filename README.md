# Word Randomizer

A mobile-first PWA that generates random English words. Open it and ten words are
already on screen — tap one to swap it, change how many you want, copy the set.

## Features

- **Instant words** — a set is generated on load, no button press needed.
- **Tap to reroll** — tapping a word replaces it with another one, as often as you like.
  Replacements never duplicate a word already on screen.
- **Adjustable count** — 1 to 50 words. Changing the count regenerates immediately and
  the choice is remembered in `localStorage`.
- **Copy** — one press puts the whole set on the clipboard, newline-separated.
- **Regenerate** — replaces every word at once.
- **Installable and offline** — web app manifest plus a service worker that precaches
  the shell and the dictionary, so it keeps working with no connection.

Randomness comes from `crypto.getRandomValues()`, with the biased tail of the 32-bit
range rejected rather than folded in with a modulo.

## Stack

Static HTML, CSS and vanilla JavaScript served by nginx. No build step, no framework,
no runtime dependencies — the whole app is a handful of files under `html/`.

```
html/
  index.html            markup
  styles.css            mobile-first styles, dark and light
  app.js                generation, swapping, copying, persistence
  sw.js                 service worker (offline cache)
  manifest.webmanifest  PWA manifest
  words.txt             the dictionary — 17386 uncommon English words
  icons/                PWA icons
nginx/default.conf      MIME types, gzip, cache headers
tools/                  scripts that regenerate words.txt and the icons
```

## Running

The container only exposes port 80 to the Docker network; publishing it is the
reverse proxy's job (Dokploy in production).

```bash
docker compose up -d
```

To reach it directly during local work, drop an untracked `docker-compose.override.yml`
next to the compose file — it is picked up automatically and is git-ignored:

```yaml
services:
  web:
    ports:
      - "8080:80"
```

## The dictionary

`html/words.txt` holds 17386 words, 4 to 14 letters each — deliberately uncommon ones,
the kind an intermediate speaker is unlikely to recognise (*exculpate*, *maenad*,
*apparatchik*, *woolgathering*).

Two sources build it. [WordNet 3.0](https://wordnet.princeton.edu/) supplies the
vocabulary: it is hand-curated, and its data files preserve canonical capitalisation, so
keeping lowercase-only entries drops proper nouns. The
[OpenSubtitles 2018 frequency list](https://github.com/hermitdave/FrequencyWords) then
supplies each word's corpus occurrence count, and only a middle band survives — words
common enough to be worth knowing, rare enough that most people don't. Both extremes go:
everyday vocabulary above the band, taxonomy and pharmacology below it. Slurs are dropped
using WordNet's own gloss labels, as are Roman numerals, redundant plurals and British
`-ise` spellings that duplicate an `-ize` entry.

Rebuild it with:

```bash
tools/build-words.sh
```

## Icons

`tools/make-icons.py` renders the PNG icons from scratch — pure Python, no image
libraries. Run it after changing the mark or the accent colour:

```bash
python3 tools/make-icons.py
```

## Deploying changes

Assets are served with a long cache lifetime, while `index.html` and `sw.js` are always
revalidated. After changing any file under `html/`, bump `CACHE` in `html/sw.js` so
installed clients pick the new version up.
