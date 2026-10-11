/**
 * MyQuizlet - Study Controller
 * Implements Fisher-Yates shuffle bag, non-repeating cycles, history traversal,
 * 3D flip animations, shake feedback, and keyboard/touch navigation.
 */

import { store } from './store.js';
import { renderCardFaceHTML } from './render.js';
import { attachSwipe } from './gestures.js';
import { t } from './i18n.js';

export class StudyController {
  constructor({ container, onBack, onShowSnackbar }) {
    this.container = container;
    this.onBack = onBack;
    this.onShowSnackbar = onShowSnackbar;

    this.currentSet = null;
    this.bag = [];
    this.seenCount = 0;
    this.history = []; // Array of card indices
    this.currentCardIndex = -1;
    this.face = 'q'; // 'q' or 'a'
    this.swipeCleanup = null;
    this.isAnimating = false;
    this.boundKeyHandler = this.handleKeyDown.bind(this);
  }

  /**
   * Start study session for a set
   * @param {string} setId 
   */
  start(setId) {
    const set = store.getSet(setId);
    if (!set) {
      if (this.onShowSnackbar) this.onShowSnackbar('Bộ thẻ không tồn tại / Set not found');
      if (this.onBack) this.onBack();
      return;
    }

    if (!set.cards || set.cards.length === 0) {
      if (this.onShowSnackbar) this.onShowSnackbar(t('empty_deck_cannot_study'));
      if (this.onBack) this.onBack();
      return;
    }

    this.currentSet = set;
    store.touchLastStudied(setId);

    this.history = [];
    this.seenCount = 0;
    this.face = 'q';

    this._initBag();
    this._renderStudyLayout();

    // Draw first card
    this._drawNext(false);

    // Attach keyboard listener
    window.addEventListener('keydown', this.boundKeyHandler);

    // Check first run hint
    this._checkFirstRunHint();
  }

  destroy() {
    if (this.swipeCleanup) {
      this.swipeCleanup();
      this.swipeCleanup = null;
    }
    window.removeEventListener('keydown', this.boundKeyHandler);
    this.container.innerHTML = '';
  }

  /**
   * Initialize and shuffle the index bag using Fisher-Yates algorithm
   * @param {number} [lastIndex=-1] Ensure first item of new bag is not lastIndex (if deck > 1)
   */
  _initBag(lastIndex = -1) {
    const n = this.currentSet.cards.length;
    const indices = Array.from({ length: n }, (_, i) => i);

    // Fisher-Yates shuffle
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Ensure first card of new cycle is not the same as the last card shown
    if (n > 1 && lastIndex >= 0 && indices[0] === lastIndex) {
      const swapWith = 1 + Math.floor(Math.random() * (n - 1));
      [indices[0], indices[swapWith]] = [indices[swapWith], indices[0]];
    }

    this.bag = indices;
  }

  /**
   * Draw the next card index from bag
   * @param {boolean} [animate=true]
   */
  _drawNext(animate = true) {
    if (this.isAnimating) return;

    if (this.currentSet.cards.length === 1) {
      // Single card edge case
      if (this.history.length > 0 && this.onShowSnackbar) {
        this.onShowSnackbar(t('single_card_hint'));
      }
      this.currentCardIndex = 0;
      this.face = 'q';
      this.seenCount = 1;
      this._updateCardDisplay(animate ? 'next' : 'none');
      return;
    }

    // Check if bag is empty
    if (this.bag.length === 0) {
      const last = this.currentCardIndex;
      this._initBag(last);
      this.seenCount = 0;
      if (this.onShowSnackbar) {
        this.onShowSnackbar(t('cycle_complete_msg'));
      }
    }

    const nextIndex = this.bag.shift();
    this.currentCardIndex = nextIndex;
    this.seenCount++;
    this.history.push(nextIndex);
    if (this.history.length > 50) this.history.shift();

    this.face = 'q';
    this._updateCardDisplay(animate ? 'next' : 'none');
  }

  /**
   * Go back to the previously shown card in history
   */
  goBack() {
    if (this.isAnimating) return;
    if (this.history.length <= 1) return;

    // Pop current card
    this.history.pop();
    const prevIndex = this.history[this.history.length - 1];

    // Put current card back at start of bag so it isn't skipped
    if (this.currentCardIndex >= 0) {
      this.bag.unshift(this.currentCardIndex);
      if (this.seenCount > 1) this.seenCount--;
    }

    this.currentCardIndex = prevIndex;
    this.face = 'q';
    this._updateCardDisplay('back');
  }

  /**
   * Reset shuffle bag and start fresh
   */
  resetShuffle() {
    if (this.isAnimating) return;
    this.history = [];
    this.seenCount = 0;
    this._initBag(-1);
    this._drawNext(true);
  }

  /**
   * Flip current card (with direction hint: 1 for right, -1 for left)
   * @param {number} [direction=1] 
   */
  flipCard(direction = 1) {
    if (this.isAnimating) return;

    // Check allowAnswer setting
    if (this.currentSet.allowAnswer === false) {
      this._playShakeAnimation();
      if (this.onShowSnackbar) {
        this.onShowSnackbar(t('hidden_answer_shake_msg'));
      }
      return;
    }

    this.face = this.face === 'q' ? 'a' : 'q';
    const cardWrapper = this.container.querySelector('.study-card-wrapper');
    const liveRegion = this.container.querySelector('#study-live-region');

    if (liveRegion) {
      liveRegion.textContent = this.face === 'q' ? 'Mặt câu hỏi / Question' : 'Mặt đáp án / Answer';
    }

    if (cardWrapper) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        cardWrapper.classList.toggle('is-flipped', this.face === 'a');
      } else {
        // Dynamic direction-based 3D flip
        cardWrapper.style.setProperty('--flip-dir', direction < 0 ? '-1' : '1');
        cardWrapper.classList.toggle('is-flipped', this.face === 'a');
      }
    }
  }

  _playShakeAnimation() {
    const cardEl = this.container.querySelector('.study-card');
    if (cardEl) {
      cardEl.classList.remove('card-shake');
      void cardEl.offsetWidth; // Force reflow
      cardEl.classList.add('card-shake');
      setTimeout(() => {
        cardEl.classList.remove('card-shake');
      }, 450);
    }
  }

  /**
   * Keyboard shortcut navigation
   */
  handleKeyDown(e) {
    // Ignore keyboard shortcuts if an input or dialog is active
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
      return;
    }

    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        this.flipCard(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.flipCard(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.flipCard(1);
        break;
      case 'ArrowUp':
      case 'n':
      case 'N':
        e.preventDefault();
        this._drawNext(true);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.goBack();
        break;
    }
  }

  _renderStudyLayout() {
    this.container.innerHTML = `
      <div class="study-screen" id="study-screen">
        <header class="study-appbar">
          <button type="button" class="icon-btn" id="study-back-btn" aria-label="${t('back')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          
          <div class="study-title-group">
            <h1 class="study-deck-title" id="study-deck-title"></h1>
            <div class="study-chip" id="study-counter-chip">Đã xem 0 / 0</div>
          </div>

          <div class="study-actions">
            <button type="button" class="icon-btn" id="study-reset-btn" title="${t('btn_shuffle_reset')}" aria-label="${t('btn_shuffle_reset')}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            </button>
          </div>
        </header>

        <main class="study-card-viewport" id="study-card-viewport">
          <div class="study-card-wrapper" id="study-card-wrapper">
            <article class="study-card" id="study-card">
              <!-- Front Face: Question -->
              <div class="card-face card-front">
                <span class="card-face-tag">Câu hỏi · Question</span>
                <div class="card-scroll" id="card-front-scroll">
                  <div class="card-content-box" id="card-front-content"></div>
                </div>
              </div>

              <!-- Back Face: Answer -->
              <div class="card-face card-back">
                <span class="card-face-tag">Đáp án · Answer</span>
                <div class="card-scroll" id="card-back-scroll">
                  <div class="card-content-box" id="card-back-content"></div>
                </div>
              </div>
            </article>
          </div>

          <div id="study-live-region" class="sr-only" aria-live="polite"></div>
        </main>

        <footer class="study-bottom-bar">
          <button type="button" class="btn btn-tonal" id="btn-study-back" aria-label="${t('btn_back')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            <span>${t('btn_back')}</span>
          </button>

          <button type="button" class="btn btn-primary" id="btn-study-flip" aria-label="${t('btn_flip')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
            <span>${t('btn_flip')}</span>
          </button>

          <button type="button" class="btn btn-tonal" id="btn-study-next" aria-label="${t('btn_next')}">
            <span>${t('btn_next')}</span>
            <svg class="icon" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
          </button>
        </footer>

        <!-- First-Run Hint Overlay -->
        <div class="study-hint-overlay hidden" id="study-hint-overlay">
          <div class="hint-card">
            <div class="hint-icon">💡</div>
            <p class="hint-text">${t('study_hint_overlay')}</p>
            <span class="hint-sub">${t('study_hint_tap')}</span>
          </div>
        </div>
      </div>
    `;

    // Title
    const titleEl = this.container.querySelector('#study-deck-title');
    if (titleEl) titleEl.textContent = this.currentSet.title;

    // Attach button listeners
    this.container.querySelector('#study-back-btn').addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });
    this.container.querySelector('#btn-study-back').addEventListener('click', () => this.goBack());
    this.container.querySelector('#btn-study-next').addEventListener('click', () => this._drawNext(true));
    this.container.querySelector('#btn-study-flip').addEventListener('click', () => this.flipCard(1));
    this.container.querySelector('#study-reset-btn').addEventListener('click', () => this.resetShuffle());

    // Attach gestures
    const viewport = this.container.querySelector('#study-card-viewport');
    if (this.swipeCleanup) this.swipeCleanup();
    this.swipeCleanup = attachSwipe(viewport, {
      onUp: () => this._drawNext(true),
      onDown: () => this.goBack(),
      onSide: (dir) => this.flipCard(dir),
      onTap: () => this.flipCard(1)
    });
  }

  _updateCardDisplay(animationType = 'none') {
    if (this.currentCardIndex < 0 || !this.currentSet.cards[this.currentCardIndex]) return;

    const card = this.currentSet.cards[this.currentCardIndex];
    const frontContent = this.container.querySelector('#card-front-content');
    const backContent = this.container.querySelector('#card-back-content');
    const counterChip = this.container.querySelector('#study-counter-chip');
    const backBtn = this.container.querySelector('#btn-study-back');
    const cardWrapper = this.container.querySelector('#study-card-wrapper');
    const cardEl = this.container.querySelector('#study-card');

    if (counterChip) {
      counterChip.textContent = t('study_seen_chip', {
        seen: this.seenCount,
        total: this.currentSet.cards.length
      });
    }

    if (backBtn) {
      backBtn.disabled = this.history.length <= 1;
    }

    // Render HTML for front and back
    if (frontContent) frontContent.innerHTML = renderCardFaceHTML(card, 'q');
    if (backContent) backContent.innerHTML = renderCardFaceHTML(card, 'a');

    // Reset scroll positions
    const frontScroll = this.container.querySelector('#card-front-scroll');
    const backScroll = this.container.querySelector('#card-back-scroll');
    if (frontScroll) frontScroll.scrollTop = 0;
    if (backScroll) backScroll.scrollTop = 0;

    // Reset flipped state
    if (cardWrapper) {
      cardWrapper.classList.remove('is-flipped');
    }

    // Slide animation
    if (animationType === 'next' && cardEl) {
      this.isAnimating = true;
      cardEl.classList.remove('slide-in-up', 'slide-in-down');
      void cardEl.offsetWidth;
      cardEl.classList.add('slide-in-up');
      setTimeout(() => {
        cardEl.classList.remove('slide-in-up');
        this.isAnimating = false;
      }, 250);
    } else if (animationType === 'back' && cardEl) {
      this.isAnimating = true;
      cardEl.classList.remove('slide-in-up', 'slide-in-down');
      void cardEl.offsetWidth;
      cardEl.classList.add('slide-in-down');
      setTimeout(() => {
        cardEl.classList.remove('slide-in-down');
        this.isAnimating = false;
      }, 250);
    }
  }

  _checkFirstRunHint() {
    const prefs = store.getPrefs();
    if (!prefs.hintSeen) {
      const hintOverlay = this.container.querySelector('#study-hint-overlay');
      if (hintOverlay) {
        hintOverlay.classList.remove('hidden');
        hintOverlay.addEventListener('click', () => {
          hintOverlay.classList.add('hidden');
          store.savePrefs({ hintSeen: true });
        }, { once: true });
      }
    }
  }
}
