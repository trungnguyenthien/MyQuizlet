# MyQuizlet — Technical Plan (PWA Flashcard App)

*Spec for an AI coding agent · pure HTML + CSS + vanilla JavaScript (ES6) · no backend · 12 Oct 2026*

## Part 0: Tool Overview & Context

**Problem / motivation.** Learners who keep study notes in Markdown (technical Q&A, vocabulary, interview prep) have no lightweight way to turn them into flashcards. Quizlet needs an account, is online-first, and does not render code blocks well or round-trip plain Markdown files.

**Target user.** A technically comfortable individual (developer or student) studying alone, mostly on a phone, often offline. Personal use; no accounts, no sharing, no sync.

**Core value.** MyQuizlet lets a learner turn a plain Markdown file into a swipeable flashcard deck in seconds, study it fully offline, and export it back to the same Markdown format with no lock-in.

**Primary use case (main flow).** The user opens the installed PWA → taps *Import* and picks a `.md` file (or pastes text) → sees a preview (title + number of cards + warnings) → confirms → the set appears in the library → taps the set to start studying → a random card shows its question face centered → swipe up for the next random card, swipe left/right to flip to the answer (rendered Markdown with GitHub-style highlighted code) → optionally export the set back to `.md`.

**Scope boundaries (non-goals).** No login, no cloud sync, no multi-device sharing, no spaced-repetition scheduling or scoring, no images/audio upload, no math (LaTeX) rendering, no per-card editing UI (edit by export → edit file → re-import as a new set), no server code of any kind.

**Success criteria.**
- App installs as a PWA and every feature works in airplane mode after the first load.
- Import → export of a valid file yields a semantically identical file (round-trip safe, including fenced code that contains `---` or `## `).
- A set of 1,000 cards imports in under 1 s and the study screen keeps ~60 fps while swiping.
- Data survives reload and browser restart; no data loss on storage errors (user is told and can export).
- Fenced code blocks are syntax-highlighted in a GitHub-like theme in both light and dark mode.

**Assumptions made (change if wrong).** (1) Code blocks keep left-aligned text inside a centered box, because centered code is unreadable; all other text is centered. (2) Swipe down goes back to the previously shown card (extra, optional). (3) "Hide answers" means the flip gesture is blocked for that set. (4) Delete-set exists even though it was not listed, because a library without delete is unusable. (5) UI language: Vietnamese + English labels switchable via a simple dictionary (default Vietnamese).

## Part 1: Web Interface (English)

**Design system.** Material Design 3 guidelines implemented with plain CSS custom properties: tonal surfaces, 12–28px rounded corners, elevation levels 1–3, ripple-style press feedback (CSS only), 4/8px spacing grid.

**Color palette** (light / dark, defined as CSS variables, following `prefers-color-scheme`):
- Primary `#3F51B5` / `#9FA8DA`; Accent `#FF9800` / `#FFB74D` (used only for the FAB and the active toggle).
- Background `#FAFAFA` / `#121212`; Surface (cards) `#FFFFFF` / `#1E1E1E`; On-surface text `#212121` / `#E0E0E0`.
- Semantic only: success `#2E7D32`, error `#C62828`, warning `#EF6C00`.

**Typography.** System font stack for UI (`system-ui, -apple-system, Roboto, sans-serif`) and `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` for code. Sizes in `rem`: H1 1.75, H2 1.375, body 1, caption 0.8125. Card question text is 1.5rem bold; answer body 1.125rem. Fonts are system fonts, so nothing needs caching.

**Layout.** Mobile-first. Breakpoints: `<600px` single column, full-height study card; `600–1024px` two-column set grid, card max-width 560px; `>1024px` three-column grid, card max-width 640px centered. Use `100dvh`, `env(safe-area-inset-*)`, CSS Grid/Flexbox. Hash-based routing: `#/` (library), `#/set/:id`, `#/study/:id`, `#/import`.

**Key screens / components.**
1. **App bar** — title, back button on sub-screens, overflow menu (language, about, storage usage).
2. **Library screen** — responsive grid of **Set cards**: title, card count, last-studied date, a lock icon if answers are hidden; actions via menu: Study, Rename, Toggle answers, Export, Delete. Empty state with illustration (inline SVG) and an *Import* button. FAB (+) opens the *Create / Import* sheet.
3. **Create / Import sheet (bottom sheet)** — three inputs: choose `.md` file(s) (multi-select), drag-and-drop zone (desktop), paste textarea with live card count; "New empty set" option (title only).
4. **Import preview dialog** — parsed title (editable), card count, first 3 questions, warnings list (e.g. "2 cards had empty answers"), buttons *Import* / *Cancel*.
5. **Set detail screen** — editable title (inline), toggle "Allow viewing answers", list of questions with search box (answers hidden here when toggle is off), buttons *Study*, *Export*, *Delete*.
6. **Study screen** — full-screen flashcard centered both horizontally and vertically, counter chip (`seen 12 / 48`), small buttons (Flip, Next, Back, Shuffle-reset), a subtle first-run hint overlay ("Swipe up: next · Swipe sideways: flip"). The 3D flip animation rotates around the Y axis (left swipe rotates left, right swipe rotates right).
7. **Snackbar** (feedback/undo, e.g. "Set deleted · Undo"), **Confirm dialog**, and an **Update-available** snackbar.

**Card rendering rules.** `text-align:center` on the card; content block vertically centered with flexbox; `pre` code blocks are shown as a centered box (`max-width:100%`, `overflow-x:auto`, text left-aligned, GitHub colors via highlight.js `github` / `github-dark` themes). Tables, lists, blockquotes and images are `max-width:100%`. Long content scrolls inside the card (`.card-scroll`) while the card frame stays fixed.

**Accessibility & responsiveness.** Touch targets ≥ 44px; WCAG AA contrast; visible focus rings; every gesture has a button and keyboard equivalent (Space/Enter = flip, ArrowUp/ArrowDown = next/back, ArrowLeft/ArrowRight = flip); `aria-live="polite"` region announces the card face; honor `prefers-reduced-motion` (replace 3D flip with a cross-fade).

## Part 2: Supporting Libraries

All libraries are **vendored locally** in `/vendor/` (downloaded once, committed to the repo) and precached by the service worker. Do **not** load them from a CDN at runtime, because that would break offline mode. The CDN names below are only the download sources.

| Library | Purpose | Why | Source to download |
|---|---|---|---|
| **marked** (v12+) | Markdown → HTML (GFM: tables, task lists, fenced code); `parseInline` for the one-line question | Small, fast, community standard | `https://cdn.jsdelivr.net/npm/marked/marked.min.js` |
| **highlight.js** (common bundle + extra languages: swift, kotlin, dart, java, bash, yaml, sql, json) | Syntax highlighting | Most widely used; ships official GitHub themes | `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js` + `styles/github.min.css`, `styles/github-dark.min.css` |
| **DOMPurify** | Sanitize rendered HTML (imported files are untrusted → XSS risk) | Standard sanitizer | `https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js` |
| **Material components** | Vanilla JS: **no library needed** — hand-written CSS variables, bottom sheet, dialog (`<dialog>`), snackbar, ripple | Avoids ESM/CDN dependencies that break offline | — |
| **Gestures / swipe** | Vanilla JS: **no library needed** — Pointer Events | Hammer.js is unnecessary for 2 gestures | — |
| **Routing / state / storage** | Vanilla JS: **no library needed** — hashchange + small store object + `localStorage` wrapper | — | — |
| **Icons** | Inline SVG sprite (no icon font) | Fonts would need caching and flash on load | — |
| **Unit tests** (optional) | Plain `tests.html` with `console.assert` for parser/serializer | No build step | — |

## Part 3: Action / Interaction Logic

### 3.0 Project structure

```
/index.html
/manifest.webmanifest
/sw.js
/css/app.css
/js/main.js        (bootstrap, router)
/js/store.js       (state + localStorage wrapper)
/js/parser.js      (markdown file -> set object)
/js/serializer.js  (set object -> markdown file)
/js/render.js      (marked + DOMPurify + highlight.js)
/js/study.js       (shuffle bag, history, card flow)
/js/gestures.js    (pointer-event swipe detector)
/js/ui.js          (dialogs, snackbar, sheets)
/js/i18n.js
/vendor/*  /icons/icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png
/tests.html  /samples/sample.md
```

Use ES modules (`<script type="module">`), relative paths only (the app may be hosted in a sub-path such as GitHub Pages). All code comments in English, explaining *why*.

### 3.1 Markdown file format (the contract)

```
---
# {SET TITLE}
---
## {Question 1, single line}

{Answer 1: multi-line Markdown, fenced code allowed}
---
## {Question 2}

{Answer 2}
---
```

Parsing rules:
1. Normalize first: strip BOM, convert `\r\n` → `\n`.
2. A line that is exactly `---` (trailing spaces allowed) is a **separator** only when it is **outside** a fenced code block. Track fences line by line: a fence opens with ≥3 backticks or tildes and closes with the same character and at least the same length.
3. Block 0 (between the first two separators, or before the first one) must contain `# Title`. If it is missing, use the file name (without extension) as the title and add a warning.
4. Every following block is one card. The question is the first line starting with `## ` outside a fence; the answer is everything after it with leading/trailing blank lines trimmed (inner content preserved byte-for-byte).
5. A block with no `## ` line is skipped with a warning; an empty answer is allowed (the answer face shows *"(no answer)"*).
6. Inside answers, `###` and deeper headings are normal Markdown. To draw a horizontal rule inside an answer use `***` or `___` (not `---`). Document this in the app's Help dialog.
7. Duplicate questions are allowed. Maximum file size 5 MB; show an error beyond it.

### 3.2 Data model & storage

```js
// Set: stored raw (Markdown source), rendered at display time
{ id: 'uuid', title: 'string', allowAnswer: true,
  createdAt: 1696000000000, updatedAt: 1696000000000, lastStudiedAt: null,
  cards: [ { id: 'uuid', q: 'raw question', a: 'raw answer markdown' } ] }
```

- `localStorage` keys: `mq:v1:index` (array of `{id,title,count,allowAnswer,updatedAt,lastStudiedAt}` for fast library render), `mq:v1:set:{id}` (full set), `mq:v1:prefs` (`{lang, hintSeen}`).
- Put everything behind a `storage.js` interface (`getIndex, getSet, saveSet, deleteSet`) so it can be swapped for IndexedDB later without touching UI code.
- Wrap every read/write in `try/catch`: handle `QuotaExceededError` (show error + suggest exporting/deleting sets), corrupt JSON (skip that set, keep the others, show a warning), and unavailable storage (private mode → run in memory and warn data will not persist).
- On startup call `navigator.storage.persist()` (best-effort) and show usage via `navigator.storage.estimate()` in the menu.
- A `schemaVersion` field plus a `migrate()` hook for future format changes.

### 3.3 Global state model & data flow

In-memory `state = { index: [], currentSet: null, route: {}, study: { bag: [], seenCount: 0, history: [], pos: -1, face: 'q' } }`. Data flow: user action → handler mutates `state` and calls `storage` → handler calls a small `render*()` function for the affected region only (no virtual DOM) → DOM updates. The router (`hashchange`) selects the screen and loads data lazily (`getSet(id)` only on entering set/study screens).

### 3.4 Actions (every interactive element)

**A1. Import from file** — *Trigger:* choose files in `<input type="file" accept=".md,.markdown,.txt" multiple>` or drop onto the drop zone. *Function:* `handleFilesSelected(fileList)`. *Steps:* (1) check size ≤ 5 MB; (2) `await file.text()` (UTF-8); (3) `parseMarkdownSet(text, fileName)` → `{set, warnings}`; (4) open preview dialog for each file in turn (or one summary dialog for multiple files). *State:* writes nothing yet. *Edge cases:* non-text/binary file → error snackbar; zero cards → error "No cards found" with a link to the format help; very large file → error. *DOM:* preview dialog content, warning list.

**A2. Import from pasted text** — *Trigger:* `input` on the paste textarea (debounced 250 ms) and the *Preview* button. *Function:* `handlePasteInput(text)`. *Steps:* parse → update live count label ("12 cards found") → enable *Preview* only if ≥ 1 card. *Edge cases:* empty text disables the button; parse errors shown inline under the textarea.

**A3. Confirm import** — *Trigger:* click *Import* in the preview dialog. *Function:* `confirmImport(set)`. *Steps:* (1) trim the (possibly edited) title, fall back to "Untitled"; (2) assign `uuid`s via `crypto.randomUUID()` (fallback generator if missing); (3) if a set with the same title exists, ask: *Keep both* (append " (2)") or *Replace*; (4) `saveSet`, update index; (5) navigate to the library and highlight the new set. *State:* `mq:v1:set:{id}`, `mq:v1:index`. *Edge cases:* quota error → rollback and show error.

**A4. Create empty set** — *Trigger:* "New empty set" in the sheet. *Function:* `createEmptySet(title)`. *Steps:* validate non-empty title ≤ 120 chars → create a set with `cards: []` → open Set detail, which shows *"Paste or import cards to get started"*. Study is disabled while `cards.length === 0`.

**A5. Browse library** — *Trigger:* route `#/`. *Function:* `renderLibrary()`. *Steps:* read the index → sort by `lastStudiedAt` desc then `updatedAt` desc → render set cards (title escaped via `textContent`) → show the empty state when none. A search field appears when > 8 sets (filters by title).

**A6. Open set detail & search questions** — *Trigger:* tap a set card → `#/set/:id`. *Function:* `renderSetDetail(id)`; search input `input` → `filterQuestions(term)`. Questions are rendered with `marked.parseInline` + sanitize; answers are never shown here when `allowAnswer` is false.

**A7. Rename set (edit title)** — *Trigger:* pencil icon / tap on the title → inline text field; Enter or blur saves, Esc cancels. *Function:* `renameSet(id, newTitle)`. *Steps:* trim → validate (1–120 chars, non-empty) → `saveSet` + update index + `updatedAt`. *Edge cases:* empty → revert and show inline error; duplicate title allowed.

**A8. Toggle "Allow viewing answers"** — *Trigger:* switch in Set detail and in the study overflow menu. *Function:* `setAllowAnswer(id, bool)`. *Steps:* persist the flag → if currently on the answer face while turning off, flip back to the question → update the lock icon. *Behavior when off:* flip gestures/keys/buttons are disabled; an attempted flip plays a small "shake" animation and shows a snackbar *"Answers are hidden for this set"*; export still includes the answers.

**A9. Start studying** — *Trigger:* *Study* button → `#/study/:id`. *Function:* `startStudy(id)`. *Steps:* load the set → build the shuffle bag (Fisher–Yates over card indices) → draw the first card with the **question face** up → set `lastStudiedAt`. *Edge cases:* 0 cards → block with a message; 1 card → "Next" shows the same card again with a short "Only one card" hint.

**A10. Swipe up → next random card** — *Trigger:* pointer drag with `dy < −60px` (or velocity > 0.5 px/ms) and `|dy| > |dx|`. *Function:* `goNextCard()`. *Steps:* (1) animate the current card up and out (200 ms); (2) draw the next index from the bag; if the bag is empty, reshuffle and make sure the first card is not the one just shown; (3) push the shown card onto `history` (cap 50); (4) reset `face = 'q'` (always the question first, no flip animation); (5) render the new card sliding in from the bottom; (6) update `seen n / total` (seen counter resets with the bag). Also bound to the *Next* button and ArrowUp/`N`.

**A11. Swipe left/right → flip** — *Trigger:* pointer drag with `|dx| > 50px` and `|dx| > |dy|`. *Function:* `flipCard(direction)`. *Steps:* if `allowAnswer` is false → shake + snackbar and stop; otherwise toggle `face` between `q` and `a`, apply a 180° `rotateY` in the swipe direction (`transform-style: preserve-3d`, `backface-visibility: hidden`, 350 ms), announce the new face to the live region. Swiping sideways on the answer face flips back to the question. Also bound to click/tap on the card (when no drag occurred), Space/Enter, ArrowLeft/ArrowRight, and the *Flip* button.

**A12. Swipe down → previous card (optional)** — *Function:* `goPreviousCard()`. Pops `history`, shows the question face of that card. Disabled when the history is empty.

**A13. Gesture engine** — *Function:* `attachSwipe(element, {onUp, onDown, onSide})` in `gestures.js`. Use Pointer Events (`pointerdown/move/up/cancel`) with `setPointerCapture`; decide the axis after 10 px of movement and lock it; follow the finger with a `transform` during the drag (using `requestAnimationFrame`) and snap back if the threshold is not reached. **Conflict with scrolling:** when the card content overflows, vertical drags must scroll the inner `.card-scroll` (use `touch-action: pan-y` on it only in that case); "next" is then triggered only when the user is at the bottom of the content and keeps pulling up (overscroll), and the *Next* button is always available as a fallback. Ignore gestures that start on text selection, links, or the horizontal scrollbar of a code block (`pre`), so code can be scrolled sideways without flipping the card.

**A14. Render a card face** — *Function:* `renderFace(card, face)`. *Steps:* take the raw Markdown → `marked.parse` (GFM on, `breaks: false`; use `parseInline` for the question) → `DOMPurify.sanitize` (allow `class` on `code/pre/span` for highlight.js; forbid `script`, `iframe`, inline event handlers) → insert into the face element → run `hljs.highlightElement` on every `pre code` (respect the language from the fence, else `highlightAuto` limited to common languages) → set `rel="noopener noreferrer" target="_blank"` on links. Remote images are not guaranteed offline; render them with a lazy `alt` fallback and mention it in Help. Cache rendered HTML per card id during the session.

**A15. Export set** — *Trigger:* *Export* in the set menu/detail. *Function:* `exportSet(id)` → `serializeSet(set)`. *Steps:* build text: `---\n# Title\n---\n`, then for each card `## question\n\n{answer}\n---\n`; use `\n` newlines; keep answers byte-for-byte as stored (the answer already contains its own fences, which stay intact). Create a `Blob` (`text/markdown;charset=utf-8`) → trigger download with `<a download="{slug}.md">`; on iOS/Android where download is awkward, prefer `navigator.share({files:[file]})` if `navigator.canShare` allows it, else fall back to the download link. Revoke the object URL afterwards. *Edge cases:* the title contains characters illegal in file names → slugify (keep Unicode letters); empty set → export only the title block. *Acceptance test:* `parse(serialize(parse(x)))` deep-equals `parse(x)`.

**A16. Delete set** — *Trigger:* menu → *Delete* → confirm dialog. *Function:* `deleteSet(id)`. *Steps:* remove from the index and storage, show a snackbar *Undo* for 6 s (keep the deleted set in memory; commit on timeout), then navigate to the library. *Edge cases:* the app is closed during the undo window → deletion is already persisted (undo only restores while the page is open).

**A17. Language / theme / help** — language switch via `i18n.t(key)` dictionary (vi/en) stored in `prefs`; theme follows the system (no manual toggle in v1); *Help* dialog explains the file format and shows a copyable sample.

### 3.5 PWA & offline requirements

- **Manifest:** `name`, `short_name: "MyQuizlet"`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `orientation: "portrait"` (do not lock on tablets), `theme_color`, `background_color`, icons 192/512 plus a maskable 512.
- **iOS meta tags:** `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`; `viewport-fit=cover`; set `overscroll-behavior: none` on the study screen to prevent pull-to-refresh interfering with swipe-up.
- **Service worker (`sw.js`):** versioned cache name (`mq-static-v1`); precache the app shell and all `/vendor/*`, icons, CSS, JS on `install`; delete old caches on `activate`; **cache-first** for same-origin GET requests with a network-update fallback for `index.html` (stale-while-revalidate); navigation requests fall back to the cached `index.html`. Detect a waiting worker and show the *Update available · Reload* snackbar (`skipWaiting` only after the user taps Reload).
- **Hosting:** must be served over HTTPS (or `localhost`) for service workers; opening `index.html` through `file://` still works as a normal page but without offline installability. Provide a README line for hosting on GitHub Pages / any static host.
- Offline indicator is **not** needed because nothing requires the network after the first load.

### 3.6 Edge cases & non-functional checklist

- XSS: never use `innerHTML` with unsanitized content; set titles via `textContent`.
- Performance: parse and render lazily (render only the current card); large sets stored as a single JSON string (≤ ~1 MB per set recommended; warn above 2 MB).
- Privacy: no network requests, no analytics, no third-party fonts.
- Browser support: latest Safari iOS 15+, Chrome/Edge/Firefox desktop & Android; test `100dvh`, Pointer Events, `crypto.randomUUID` fallback.
- Provide `/samples/sample.md` containing: plain text answer, bullet list, table, blockquote, an answer with a ```` ```swift ```` block, an answer whose code block contains a line `---` and a line `## not a question`, and a card with an empty answer — and use it as the manual acceptance test.

### 3.7 Acceptance tests (must pass)

1. Import `sample.md` → correct number of cards, title, and 1 warning for the empty answer.
2. A `---` or `## ` line inside a fenced code block does not split or retitle a card.
3. Export then re-import → identical set content.
4. Airplane mode after first load: library, study, import, and export still work; app launches from the home-screen icon.
5. Swipe up always shows a question face first; no card repeats until the whole bag is exhausted.
6. With *Allow viewing answers* off, no gesture, key, or button reveals an answer.
7. Rename set persists across reload; invalid (empty) title is rejected.
8. Lighthouse PWA checks pass (installable, offline start URL, maskable icon).
