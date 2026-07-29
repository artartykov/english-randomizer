#!/usr/bin/env bash
#
# Rebuilds html/words.txt — the dictionary shipped with the app.
#
# The goal is uncommon vocabulary: real English words that a speaker at an
# intermediate level is unlikely to recognise. That takes two sources.
#
# Sources:
#   1. WordNet 3.0 (via the nltk_data mirror) — a hand-curated lexicon. Its
#      data files preserve canonical capitalisation, so keeping lowercase-only
#      entries drops proper nouns while leaving ordinary vocabulary.
#   2. OpenSubtitles 2018 English frequency list (hermitdave/FrequencyWords) —
#      every word with its corpus occurrence count.
#
# WordNet decides what counts as a word; the frequency list decides how obscure
# it is. Keeping a middle band of counts cuts both extremes: anything common
# enough to be widely known, and anything so rare it is taxonomy, pharmacology
# or corpus noise rather than vocabulary.
#
# Usage: tools/build-words.sh
set -euo pipefail

WORDNET_URL="https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip"
FREQUENCY_URL="https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt"

# Corpus occurrence bounds. The upper bound sits around frequency rank 70,000
# and the lower bound around rank 400,000 — see the header note above.
MAX_COUNT=83
MIN_COUNT=4

MIN_LENGTH=4
MAX_LENGTH=14

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$repo_root/html/words.txt"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Downloading WordNet and the frequency list..."
curl -fsSL "$WORDNET_URL" -o "$work/wordnet.zip"
curl -fsSL "$FREQUENCY_URL" -o "$work/frequency.txt"
unzip -oq "$work/wordnet.zip" -d "$work"

data_files=(
  "$work/wordnet/data.noun"
  "$work/wordnet/data.verb"
  "$work/wordnet/data.adj"
  "$work/wordnet/data.adv"
)

# A data file line is:
#   offset lex_filenum ss_type w_cnt word lex_id [word lex_id...] ... | gloss
# with w_cnt a two-digit hex count of the words that follow. Lines starting
# with a space are the licence header.
extract_lemmas() {
  grep -v '^ ' | awk '{
    hi = index("0123456789abcdef", substr($4, 1, 1)) - 1
    lo = index("0123456789abcdef", substr($4, 2, 1)) - 1
    for (i = 0; i < hi * 16 + lo; i++) print $(5 + 2 * i)
  }'
}

# Lowercase single words only: capitalised lemmas are proper nouns, and
# multi-word lemmas are joined with underscores.
cat "${data_files[@]}" | extract_lemmas \
  | grep -xE "[a-z]{$MIN_LENGTH,$MAX_LENGTH}" | sort -u > "$work/lemmas.txt"

# Slurs and obscenities, identified by how WordNet's own glosses label them.
cat "${data_files[@]}" \
  | grep -iE '\| .*(ethnic slur|racial slur|disparaging|offensive term|term of disparagement|obscene|vulgar)' \
  | extract_lemmas | grep -xE "[a-z]{$MIN_LENGTH,$MAX_LENGTH}" | sort -u > "$work/offensive.txt"

# Attach corpus counts and keep the obscure-but-attested band.
tr -d '\r' < "$work/frequency.txt" | awk 'NF == 2 { print $1"\t"$2 }' | sort -k1,1 > "$work/counts.txt"
join -t$'\t' "$work/lemmas.txt" "$work/counts.txt" \
  | awk -F'\t' -v lo="$MIN_COUNT" -v hi="$MAX_COUNT" '$2 >= lo && $2 <= hi { print $1 }' \
  | sort -u > "$work/banded.txt"

comm -23 "$work/banded.txt" "$work/offensive.txt" > "$work/candidates.txt"

# Roman numerals ride in as WordNet adjectives (xvii, liii). The pattern is
# strict enough that no English word of four letters or more matches it.
grep -vxE 'm{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})' \
  "$work/candidates.txt" > "$work/kept.txt"

# Plurals whose singular is already present add nothing to a random draw.
awk 'length > 4 && /s$/ { print substr($0, 1, length - 1) }' "$work/kept.txt" | sort -u \
  | comm -12 - "$work/kept.txt" | sed 's/$/s/' | sort -u > "$work/redundant.txt"

# Same for British -ise spellings that duplicate an -ize entry. Rewriting the
# match back guards words like "surmise" that have no -ize twin.
grep -E 'is(e|ed|es|ing|ation)$' "$work/kept.txt" \
  | sed 's/is\(e\|ed\|es\|ing\|ation\)$/iz\1/' | sort -u \
  | comm -12 - "$work/kept.txt" \
  | sed 's/iz\(e\|ed\|es\|ing\|ation\)$/is\1/' | sort -u >> "$work/redundant.txt"

sort -u "$work/redundant.txt" -o "$work/redundant.txt"
comm -23 "$work/kept.txt" "$work/redundant.txt" > "$out"

echo "Wrote $(wc -l < "$out") words to $out"
