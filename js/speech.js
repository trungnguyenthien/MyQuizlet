/**
 * MyQuizlet - Speech Engine (Web Speech API)
 * High-fidelity Text-to-Speech (TTS) engine with:
 * - Natural pause handling for punctuation and quotes (parseSpeechSegments)
 * - Deep, natural male voice selection for en-US and vi-VN
 * - 3-tier fallback & 3s watchdog recovery
 * - Global active speech tracking & clean cancellation
 * - Inline speech button handler for bold English content in answers
 */

let activeUtterance = null;
let activeSessionId = 0;
let speechTimer = null;
let speechWatchdog = null;
let activeSpeakingElement = null;

// Preload speech synthesis voices on startup
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try {
    window.speechSynthesis.getVoices();
    if ("onvoiceschanged" in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        try {
          window.speechSynthesis.getVoices();
        } catch (e) {}
      };
    }
  } catch (e) {}
}

/**
 * Automatically splits text into speech segments based on:
 * - Dấu phẩy (comma `,`, `，`, `、`, ` - `): 0.1s pause (100ms)
 * - Dấu chấm / ngắt câu (period `.`, `!`, `?`, `;`, `:`, `\n`, `…`): 0.3s pause (300ms)
 * - Dấu nháy `""` (quotes `"..."`, `“...”`): 0.1s pause (100ms) before & after
 * - Protects numeric decimals (3.14), thousands (1,000), times (10:30)
 *
 * @param {string} text
 * @returns {Array<{ text: string, pauseAfter: number }>}
 */
export function parseSpeechSegments(text) {
  if (!text) return [];

  // Remove markdown images: ![alt](url) -> ""
  let s = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");
  // Markdown links: [text](url) -> text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Clean markdown list bullets and numbering at start of lines
  s = s.replace(/^[\s*+-]+\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");

  // Normalize quotes: curly double quotes, guillemets -> "
  s = s.replace(/[\u201C\u201D\u00AB\u00BB\u201E\u201F]/g, '"');

  // Protect numbers, decimals, times from being split by punctuation
  s = s.replace(/(\d+)\.([0-9]+)/g, "$1___DOT___$2");
  s = s.replace(/(\d+),([0-9]+)/g, "$1___COMMA___$2");
  s = s.replace(/(\d+):([0-9]+)/g, "$1___COLON___$2");

  // Regex to split tokens by quote boundaries, periods/sentence-enders, and commas
  const pattern = /(")|([.!?;\n\u2026:]+)|([,，、]+)|(\s+-\s+)/g;
  let lastIndex = 0;
  let inQuote = false;
  const segments = [];
  let currentBuffer = "";

  function flushBuffer(pauseAfter = 0) {
    let clean = currentBuffer
      .replace(/___DOT___/g, ".")
      .replace(/___COMMA___/g, ",")
      .replace(/___COLON___/g, ":")
      .replace(/["“”]/g, "")
      .replace(/[`#*_~>]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (clean) {
      segments.push({ text: clean, pauseAfter });
      currentBuffer = "";
      return true;
    }
    currentBuffer = "";
    return false;
  }

  let match;
  while ((match = pattern.exec(s)) !== null) {
    const textChunk = s.substring(lastIndex, match.index);
    currentBuffer += textChunk;
    lastIndex = pattern.lastIndex;

    const [sep, quote, period, comma, dash] = match;

    if (quote) {
      if (!inQuote) {
        // Opening quote: flush preceding buffer with 0.1s pause (100ms)
        flushBuffer(100);
        inQuote = true;
      } else {
        // Closing quote: flush inside quote buffer with 0.1s pause (100ms)
        inQuote = false;
        flushBuffer(100);
      }
    } else if (period) {
      // Period/sentence-end: 0.3s pause (300ms)
      const flushed = flushBuffer(300);
      // If buffer was empty (e.g. right after a closing quote: "quote". Next sentence), upgrade previous pause
      if (!flushed && segments.length > 0) {
        segments[segments.length - 1].pauseAfter = Math.max(
          segments[segments.length - 1].pauseAfter,
          300,
        );
      }
    } else if (comma || dash) {
      // Comma or dash: 0.1s pause (100ms)
      flushBuffer(100);
    }
  }

  const remaining = s.substring(lastIndex);
  currentBuffer += remaining;
  flushBuffer(300);

  return segments;
}

/**
 * Score and find the best male voice (deep baritone / neural / enhanced)
 * @param {string} langCode
 * @param {boolean} [localOnly=false]
 * @returns {SpeechSynthesisVoice|null}
 */
export function findBestVoice(langCode, localOnly = false) {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return null;
  try {
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices || voices.length === 0) return null;

    const langPrefix = (langCode || "en").split("-")[0].toLowerCase();
    const isEnglish = langPrefix === "en";
    const candidates = voices.filter(
      (v) => !localOnly || v.localService === true,
    );
    let bestVoice = null;
    let bestScore = -1000;

    for (const v of candidates) {
      const name = ((v.name || "") + " " + (v.voiceURI || "")).toLowerCase();
      const normLang = (v.lang || "").toLowerCase().replace(/_/g, "-");

      // 1. Must match target language family
      if (!normLang.startsWith(langPrefix)) continue;

      // 2. Reject cartoon/novelty/high-pitched/child voices
      if (
        /\b(bad news|bahh|bells|boing|bubbles|cellos|wobble|jester|junior|organ|superstar|trinoids|whisper|zarvox|albert|eddy|flo|grandpa)\b/i.test(
          name,
        )
      ) {
        continue;
      }

      let score = 0;
      if (normLang === langCode.toLowerCase()) score += 100;
      else score += 50;

      // High priority: Premium / Natural / Neural / Enhanced studio voices
      if (/\b(natural|neural|online|enhanced|premium)\b/i.test(name))
        score += 300;

      if (isEnglish) {
        // For English: prioritize clear, articulate, pleasant standard voices
        // E.g. Google US English, Samantha, Daniel, Ava, Guy, Jenny, Oliver, Tom, Alex
        if (
          /\b(google us english|samantha|daniel|ava|guy|jenny|oliver|tom|alex|reed|arthur)\b/i.test(
            name,
          )
        ) {
          score += 400;
        }
      } else {
        // For Vietnamese: reject obvious female voices for deep male voice preference
        if (/\b(female|woman|girl|linh|samantha|kathy|zira)\b/i.test(name)) {
          continue;
        }
        if (
          /\b(daniel|guy|ryan|christopher|george|david|oliver|james|alex|reed|arthur|nam|minh|an|quang|vic)\b/i.test(
            name,
          )
        ) {
          score += 500;
        }
        if (/\b(male|man|deep|bass)\b/i.test(name)) score += 250;
      }

      if (v.localService === true) score += 20;

      if (score > bestScore) {
        bestScore = score;
        bestVoice = v;
      }
    }

    if (bestVoice && bestScore > 0) return bestVoice;

    // Fallback pool
    const fallbackPool = candidates.filter((v) => {
      const normLang = (v.lang || "").toLowerCase().replace(/_/g, "-");
      return normLang.startsWith(langPrefix);
    });

    if (isEnglish) {
      return fallbackPool[0] || null;
    }

    const nonFemale = fallbackPool.find(
      (v) => !/\b(female|woman|girl|linh|samantha|kathy|zira)\b/i.test(v.name),
    );
    return nonFemale || fallbackPool[0] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Stop any ongoing speech synthesis across the application
 */
export function stopSpeech() {
  activeSessionId++;

  if (speechTimer) {
    clearTimeout(speechTimer);
    speechTimer = null;
  }
  if (speechWatchdog) {
    clearTimeout(speechWatchdog);
    speechWatchdog = null;
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) {
        synth.cancel();
      }
    } catch (e) {}
  }

  if (typeof window !== "undefined") {
    window._mqActiveUtterance = null;
  }
  activeUtterance = null;

  if (activeSpeakingElement) {
    activeSpeakingElement.classList.remove("is-speaking");
    activeSpeakingElement = null;
  }

  if (typeof document !== "undefined") {
    document
      .querySelectorAll(".is-speaking")
      .forEach((el) => el.classList.remove("is-speaking"));
  }
}

/**
 * Check if speech synthesis is currently active
 * @returns {boolean}
 */
export function isSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return false;
  return Boolean(
    window.speechSynthesis.speaking ||
    window.speechSynthesis.pending ||
    activeSpeakingElement,
  );
}

/**
 * Play text using Web Speech API with sentence chunking, natural pauses, and retry watchdog
 * @param {string} text
 * @param {Object} [options]
 */
export function speakText(
  text,
  {
    lang = "en-US",
    rate = null,
    pitch = null,
    onStart = null,
    onEnd = null,
    onError = null,
    onStatus = null,
    speakingElement = null,
  } = {},
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    if (onError) onError(new Error("SPEECH_NOT_SUPPORTED"));
    return;
  }

  stopSpeech();

  if (!text || !text.trim()) {
    if (onStatus) onStatus("Không có nội dung để phát âm.", true);
    if (onError) onError(new Error("EMPTY_TEXT"));
    return;
  }

  const segments = parseSpeechSegments(text);
  if (segments.length === 0) {
    if (onStatus) onStatus("Không có nội dung để phát âm.", true);
    if (onError) onError(new Error("NO_SEGMENTS"));
    return;
  }

  const thisSession = ++activeSessionId;
  activeSpeakingElement = speakingElement;
  if (activeSpeakingElement) {
    activeSpeakingElement.classList.add("is-speaking");
  }

  const isEn = (lang || "").toLowerCase().startsWith("en");
  const actualRate =
    rate !== null && rate !== undefined ? rate : isEn ? 0.95 : 0.88;
  const actualPitch =
    pitch !== null && pitch !== undefined ? pitch : isEn ? 1.0 : 0.75;

  let currentIndex = 0;
  let reportedError = false;

  const fail = (code) => {
    if (reportedError) return;
    reportedError = true;
    stopSpeech();
    if (onStatus)
      onStatus(`Không thể phát âm thanh: ${code || "unknown"}`, true);
    if (onError) onError(new Error(code || "SPEECH_FAILED"));
  };

  const playSegment = (item, attempt) => {
    if (thisSession !== activeSessionId) return;

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}

    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.rate = actualRate;
    utterance.pitch = actualPitch;

    if (attempt === 0) {
      const voice = findBestVoice(lang, true) || findBestVoice(lang, false);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = lang;
      }
    } else if (attempt === 1) {
      utterance.lang = lang;
    }

    activeUtterance = utterance;
    window._mqActiveUtterance = utterance;

    let started = false;
    let settled = false;

    const clearWatchdog = () => {
      if (speechWatchdog) {
        clearTimeout(speechWatchdog);
        speechWatchdog = null;
      }
    };

    const retryOrFail = (code) => {
      if (settled) return;
      settled = true;
      clearWatchdog();
      if (thisSession !== activeSessionId) return;
      if (attempt < 2) {
        if (onStatus)
          onStatus(`Thử lại (cách ${attempt + 2}/3) do: ${code || "unknown"}`);
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
        speechTimer = setTimeout(() => playSegment(item, attempt + 1), 80);
      } else {
        fail(code);
      }
    };

    utterance.onstart = () => {
      started = true;
      clearWatchdog();
      if (onStart) onStart();
      if (onStatus) onStatus("Đang phát…");
    };

    utterance.onend = () => {
      if (settled) return;
      if (thisSession !== activeSessionId) return;
      if (!started) {
        retryOrFail("ended-without-audio");
        return;
      }
      settled = true;
      clearWatchdog();

      currentIndex++;
      if (currentIndex >= segments.length) {
        stopSpeech();
        if (onEnd) onEnd();
        if (onStatus) onStatus("Đã đọc xong.");
        return;
      }

      const pause = item.pauseAfter || 0;
      if (pause > 0) {
        speechTimer = setTimeout(playCurrent, pause);
      } else {
        playCurrent();
      }
    };

    utterance.onerror = (e) => {
      if (thisSession !== activeSessionId) return;
      const code = e && e.error;
      if (code === "canceled" || code === "interrupted") {
        if (!started && !settled) retryOrFail(code);
        return;
      }
      retryOrFail(code);
    };

    clearWatchdog();
    speechWatchdog = setTimeout(() => {
      if (!started) retryOrFail("no-audio-start");
    }, 3000);

    window.speechSynthesis.speak(utterance);
  };

  const playCurrent = () => {
    if (thisSession !== activeSessionId) return;
    if (currentIndex >= segments.length) {
      stopSpeech();
      if (onEnd) onEnd();
      return;
    }
    playSegment(segments[currentIndex], 0);
  };

  playCurrent();
}

/**
 * Handle speech for an inline speech button attached to bold content
 * @param {HTMLElement} btn
 * @param {string} text
 */
export function playInlineSpeech(btn, text) {
  if (!btn || !text) return;

  // Toggle off if currently speaking this exact button
  if (activeSpeakingElement === btn) {
    stopSpeech();
    return;
  }

  // Detect language: if contains Vietnamese diacritics, use vi-VN; else en-US
  const hasVietnamese =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
      text,
    );
  const lang = hasVietnamese ? "vi-VN" : "en-US";
  const rate = hasVietnamese ? 0.88 : 0.95; // English: moderate, natural pace
  const pitch = hasVietnamese ? 0.75 : 1.0; // English: natural, clear pitch

  speakText(text, {
    lang,
    rate,
    pitch,
    speakingElement: btn,
    onStart: () => {
      btn.classList.add("is-speaking");
    },
    onEnd: () => {
      btn.classList.remove("is-speaking");
    },
    onError: () => {
      btn.classList.remove("is-speaking");
    },
  });
}

/**
 * Global click delegation for all inline speech buttons
 */
export function initSpeechListener() {
  if (typeof document === "undefined") return;
  if (document._mqSpeechListenerAttached) return;
  document._mqSpeechListenerAttached = true;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".inline-speech-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const text = btn.dataset.speechText || btn.textContent || "";
    if (text) {
      playInlineSpeech(btn, text);
    }
  });
}
