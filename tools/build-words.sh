#!/usr/bin/env bash
#
# Rebuilds html/words.txt — the dictionary shipped with the app.
#
# Sources:
#   1. google-10000-english (USA, no swears) — the 10k most frequent English
#      words, already lowercase and ordered by frequency.
#   2. dwyl/english-words words.txt — a large mixed-case English dictionary.
#
# The two are intersected on an exact lowercase match. Because source 2 keeps
# proper nouns capitalised (Idaho, Stewart, Helen), matching lowercase-only
# entries drops names, places and web jargon (faq, inc, html) while keeping
# ordinary vocabulary. Words are then limited to 3-12 characters and sorted.
#
# Usage: tools/build-words.sh
set -euo pipefail

FREQUENT_URL="https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt"
DICTIONARY_URL="https://raw.githubusercontent.com/dwyl/english-words/master/words.txt"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$repo_root/html/words.txt"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Downloading source word lists..."
curl -fsSL "$FREQUENT_URL" -o "$work/frequent.txt"
curl -fsSL "$DICTIONARY_URL" -o "$work/dictionary.txt"

# Frequent words, de-duplicated, 3-12 letters.
tr -d '\r' < "$work/frequent.txt" | grep -xE '[a-z]{3,12}' | sort -u > "$work/a.txt"

# Dictionary entries that are lowercase in the source, i.e. not proper nouns.
tr -d '\r' < "$work/dictionary.txt" | grep -xE '[a-z]{3,12}' | sort -u > "$work/b.txt"

# Keep the intersection, minus apostrophe-less contractions that survive it.
comm -12 "$work/a.txt" "$work/b.txt" | grep -vxE 'dont|thats' > "$out"

echo "Wrote $(wc -l < "$out") words to $out"
