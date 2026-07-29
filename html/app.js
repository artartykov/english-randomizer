/* Word Randomizer — random English words, offline-capable. */
(function () {
  'use strict';

  var DICTIONARY_URL = 'words.txt';
  var STORAGE_KEY = 'word-randomizer:count';
  var MIN_COUNT = 1;
  var MAX_COUNT = 50;
  var DEFAULT_COUNT = 10;
  var SWAP_MS = 160; // Must match the .word transition in styles.css.

  var dom = {
    words: document.getElementById('words'),
    message: document.getElementById('message'),
    countValue: document.getElementById('count-value'),
    decrease: document.getElementById('decrease'),
    increase: document.getElementById('increase'),
    copy: document.getElementById('copy'),
    regenerate: document.getElementById('regenerate'),
    toast: document.getElementById('toast')
  };

  var dictionary = [];
  var current = [];
  var count = readStoredCount();
  var toastTimer = null;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Persistence ---------- */

  function readStoredCount() {
    try {
      var stored = parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
      if (!isNaN(stored)) {
        return clampCount(stored);
      }
    } catch (error) {
      // Storage can be unavailable (private mode, blocked cookies) — ignore.
    }
    return DEFAULT_COUNT;
  }

  function storeCount(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (error) {
      // Not being able to persist must never break generation.
    }
  }

  function clampCount(value) {
    return Math.min(MAX_COUNT, Math.max(MIN_COUNT, value));
  }

  /* ---------- Randomness ---------- */

  // Uniformly random integer in [0, max). Uses the CSPRNG when available and
  // rejects the biased tail of the 32-bit range instead of taking a modulo.
  function randomInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      var limit = Math.floor(4294967296 / max) * max;
      var buffer = new Uint32Array(1);
      var value;
      do {
        window.crypto.getRandomValues(buffer);
        value = buffer[0];
      } while (value >= limit);
      return value % max;
    }
    return Math.floor(Math.random() * max);
  }

  // Picks `size` distinct words, avoiding anything already in `taken`.
  function pickWords(size, taken) {
    var chosen = [];
    var used = new Set(taken || []);
    var wanted = Math.min(size, Math.max(0, dictionary.length - used.size));

    while (chosen.length < wanted) {
      var word = dictionary[randomInt(dictionary.length)];
      if (!used.has(word)) {
        used.add(word);
        chosen.push(word);
      }
    }
    return chosen;
  }

  /* ---------- Rendering ---------- */

  function renderSkeleton() {
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var item = document.createElement('li');
      var chip = document.createElement('span');
      chip.className = 'word word--skeleton';
      // Varied widths so the placeholder reads as words, not a grid.
      chip.style.setProperty('--skeleton-width', 70 + ((i * 37) % 60) + 'px');
      item.appendChild(chip);
      fragment.appendChild(item);
    }
    dom.words.replaceChildren(fragment);
  }

  function renderWords() {
    var fragment = document.createDocumentFragment();

    current.forEach(function (word, index) {
      var item = document.createElement('li');
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'word is-fresh';
      chip.textContent = word;
      chip.dataset.index = String(index);
      chip.setAttribute('aria-label', word + ', tap to replace');
      // Stagger the entrance, but cap it so large sets still feel instant.
      chip.style.animationDelay = Math.min(index * 18, 260) + 'ms';
      item.appendChild(chip);
      fragment.appendChild(item);
    });

    dom.words.replaceChildren(fragment);
  }

  function showMessage(text) {
    dom.message.textContent = text;
    dom.message.hidden = !text;
  }

  function showToast(text) {
    dom.toast.textContent = text;
    dom.toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      dom.toast.classList.remove('is-visible');
    }, 1600);
  }

  function buzz(pattern) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  /* ---------- Actions ---------- */

  function generate() {
    if (!dictionary.length) {
      return;
    }
    current = pickWords(count, []);
    renderWords();
    showMessage('');
  }

  function replaceWordAt(chip) {
    var index = parseInt(chip.dataset.index, 10);
    if (isNaN(index) || !dictionary.length) {
      return;
    }

    // Exclude every word on screen so a swap always brings something new.
    var replacement = pickWords(1, current)[0];
    if (!replacement) {
      return;
    }
    current[index] = replacement;
    buzz(8);

    if (reducedMotion.matches) {
      chip.textContent = replacement;
      chip.setAttribute('aria-label', replacement + ', tap to replace');
      return;
    }

    chip.classList.remove('is-fresh');
    chip.classList.add('is-swapping');
    window.clearTimeout(chip.swapTimer);
    chip.swapTimer = window.setTimeout(function () {
      chip.textContent = replacement;
      chip.setAttribute('aria-label', replacement + ', tap to replace');
      chip.classList.remove('is-swapping');
      chip.style.animationDelay = '0ms';
      // Restart the pop-in animation even if the class is already present.
      chip.classList.remove('is-fresh');
      void chip.offsetWidth;
      chip.classList.add('is-fresh');
    }, SWAP_MS);
  }

  function setCount(next) {
    var clamped = clampCount(next);
    if (clamped === count) {
      return;
    }
    count = clamped;
    storeCount(count);
    updateCounter();
    buzz(8);
    generate();
  }

  function updateCounter() {
    dom.countValue.textContent = String(count);
    dom.decrease.disabled = count <= MIN_COUNT;
    dom.increase.disabled = count >= MAX_COUNT;
  }

  function copyWords() {
    if (!current.length) {
      return;
    }
    // Trailing space before each newline: single-line targets (the browser
    // address bar) strip newlines outright, so without it the words run together.
    var text = current.join(' \n');

    writeToClipboard(text).then(function () {
      buzz(12);
      showToast('Copied ' + current.length + (current.length === 1 ? ' word' : ' words'));
    }, function () {
      showToast('Copy failed — long-press a word instead');
    });
  }

  function writeToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for plain-HTTP origins, where the async Clipboard API is absent.
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);

      var copied = false;
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        copied = false;
      }
      document.body.removeChild(area);
      copied ? resolve() : reject(new Error('execCommand copy failed'));
    });
  }

  /* ---------- Startup ---------- */

  function loadDictionary() {
    return fetch(DICTIONARY_URL)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.text();
      })
      .then(function (text) {
        dictionary = text.split('\n').filter(Boolean);
        if (!dictionary.length) {
          throw new Error('Dictionary is empty');
        }
      });
  }

  function start() {
    updateCounter();
    renderSkeleton();

    loadDictionary().then(function () {
      generate();
    }, function () {
      dom.words.replaceChildren();
      showMessage('Could not load the dictionary. Check your connection and press Regenerate to retry.');
    });
  }

  dom.words.addEventListener('click', function (event) {
    var chip = event.target.closest('.word');
    if (chip && chip.tagName === 'BUTTON') {
      replaceWordAt(chip);
    }
  });

  dom.decrease.addEventListener('click', function () {
    setCount(count - 1);
  });

  dom.increase.addEventListener('click', function () {
    setCount(count + 1);
  });

  dom.copy.addEventListener('click', copyWords);

  dom.regenerate.addEventListener('click', function () {
    if (!dictionary.length) {
      start();
      return;
    }
    buzz(10);
    generate();
  });

  start();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // Offline support is a bonus; the app works fine without it.
      });
    });
  }
})();
