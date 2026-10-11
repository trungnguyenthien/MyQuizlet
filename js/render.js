/**
 * MyQuizlet - Markdown & Code Render Engine
 * Uses marked (GFM) + DOMPurify + highlight.js (GitHub theme)
 * Implements session render caching for 60fps study transitions.
 */

import { t } from './i18n.js';

// Cache rendered faces by `${card.id}:${face}:${lang}`
const renderCache = new Map();

/**
 * Configure marked options once
 */
function ensureMarkedConfigured() {
  if (typeof window !== 'undefined' && window.marked && !window.__marked_configured) {
    window.marked.use({
      gfm: true,
      breaks: false
    });
    window.__marked_configured = true;
  }
}

/**
 * Configure DOMPurify sanitize options
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'b', 'strong', 'i', 'em', 'u',
    'code', 'pre', 'span', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead',
    'tbody', 'tr', 'th', 'td', 'hr', 'br', 'img', 'details', 'summary', 'mark',
    'del', 'kbd', 'sub', 'sup', 'div', 'svg', 'path'
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height',
    'align', 'loading', 'id', 'd', 'viewBox', 'fill', 'aria-hidden'
  ],
  FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'javascript:']
};

/**
 * Clear the session render cache
 */
export function clearRenderCache() {
  renderCache.clear();
}

/**
 * Render a card face to sanitized HTML with syntax highlighted code blocks.
 * @param {{ id: string, q: string, a: string }} card 
 * @param {'q' | 'a'} face 
 * @returns {string} Sanitized HTML
 */
export function renderCardFaceHTML(card, face) {
  if (!card) return '';

  const cacheKey = `${card.id || 'temp'}:${face}`;
  if (renderCache.has(cacheKey)) {
    return renderCache.get(cacheKey);
  }

  ensureMarkedConfigured();

  let html = '';

  if (face === 'q') {
    // Question face: single-line formatted with parseInline
    const rawQuestion = (card.q || '').trim();
    if (window.marked && typeof window.marked.parseInline === 'function') {
      html = window.marked.parseInline(rawQuestion);
    } else {
      // Fallback escape
      html = rawQuestion.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  } else {
    // Answer face: multi-line Markdown
    const rawAnswer = (card.a || '').trim();
    if (!rawAnswer) {
      html = `
        <div class="empty-answer-placeholder">
          <div class="empty-answer-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>
            </svg>
          </div>
          <div class="empty-answer-title">${t('empty_answer_title')}</div>
          <div class="empty-answer-sub">${t('empty_answer_desc')}</div>
        </div>
      `;
    } else if (window.marked && typeof window.marked.parse === 'function') {
      html = window.marked.parse(rawAnswer);
    } else {
      html = `<p>${rawAnswer.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
    }
  }

  // Sanitize via DOMPurify
  if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    html = window.DOMPurify.sanitize(html, SANITIZE_CONFIG);
  }

  // Parse into temporary DOM to apply syntax highlighting, link attributes, image fallbacks
  const container = document.createElement('div');
  container.innerHTML = html;

  // 1. Process all links: ensure rel="noopener noreferrer" and target="_blank"
  const links = container.querySelectorAll('a');
  for (const a of links) {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  }

  // 2. Process all images: add lazy loading and offline error placeholder
  const images = container.querySelectorAll('img');
  for (const img of images) {
    img.setAttribute('loading', 'lazy');
    img.setAttribute('onerror', "this.classList.add('img-load-error');");
  }

  // 3. Highlight code blocks
  if (window.hljs) {
    const codeBlocks = container.querySelectorAll('pre code');
    for (const codeEl of codeBlocks) {
      // Check language class (e.g., class="language-swift")
      const langMatch = codeEl.className.match(/(?:lang|language)-([a-z0-9_-]+)/i);
      const specifiedLang = langMatch ? langMatch[1].toLowerCase() : null;

      if (specifiedLang && window.hljs.getLanguage(specifiedLang)) {
        try {
          const highlighted = window.hljs.highlight(codeEl.textContent, { language: specifiedLang });
          codeEl.innerHTML = highlighted.value;
          codeEl.classList.add('hljs');
        } catch {
          window.hljs.highlightElement(codeEl);
        }
      } else {
        // Auto-detect highlighting for common languages or highlight element
        try {
          window.hljs.highlightElement(codeEl);
        } catch {
          // If auto fails, leave as plain text
        }
      }
    }
  }

  const finalHtml = container.innerHTML;
  renderCache.set(cacheKey, finalHtml);
  return finalHtml;
}

/**
 * Render an inline question for previews and lists
 * @param {string} rawQuestion 
 * @returns {string} Sanitized HTML
 */
export function renderInlineQuestionHTML(rawQuestion) {
  if (!rawQuestion) return '';
  ensureMarkedConfigured();

  let html = '';
  if (window.marked && typeof window.marked.parseInline === 'function') {
    html = window.marked.parseInline(rawQuestion.trim());
  } else {
    html = rawQuestion.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    html = window.DOMPurify.sanitize(html, SANITIZE_CONFIG);
  }

  return html;
}
