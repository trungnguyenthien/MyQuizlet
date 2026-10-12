/**
 * MyQuizlet - Study Controller
 * Generates an upfront randomized question list for every study session,
 * supports seamless next/prev navigation along this pre-shuffled list,
 * 3D flip animations, horizontal swipe navigation, unhindered vertical scrolling,
 * and dedicated card flipping buttons.
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
    this.cardOrder = []; // Pre-randomized array of card indices: e.g. [3, 0, 4, 1, 2]
    this.currentIndex = 0; // Current position in the randomized list (0 .. cardOrder.length - 1)
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

    // 1. Generate randomized question order list upfront
    this._initRandomOrder(-1);
    this.currentIndex = 0;
    this.face = 'q';

    // 2. Render layout
    this._renderStudyLayout();

    // 3. Display first random card
    this._updateCardDisplay('none');

    // 4. Attach keyboard listener
    window.addEventListener('keydown', this.boundKeyHandler);

    // 5. Check first run hint
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
   * Initialize a fresh randomized order of all card indices using Fisher-Yates
   * @param {number} [lastIndex=-1] Ensure the first card of a new cycle is not identical to lastIndex
   */
  _initRandomOrder(lastIndex = -1) {
    const n = this.currentSet.cards.length;
    const indices = Array.from({ length: n }, (_, i) => i);

    // Fisher-Yates shuffle
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Ensure first card of new cycle is not the same as the last card shown (when deck > 1)
    if (n > 1 && lastIndex >= 0 && indices[0] === lastIndex) {
      const swapWith = 1 + Math.floor(Math.random() * (n - 1));
      [indices[0], indices[swapWith]] = [indices[swapWith], indices[0]];
    }

    this.cardOrder = indices;
  }

  /**
   * Advance to the next card along the randomized list
   * @param {boolean} [animate=true]
   */
  _drawNext(animate = true) {
    if (this.isAnimating) return;

    const total = this.cardOrder.length;
    if (total <= 1) {
      if (this.onShowSnackbar) this.onShowSnackbar(t('single_card_hint'));
      return;
    }

    if (this.currentIndex < total - 1) {
      // Advance to next card in randomized list
      this.currentIndex++;
      this._updateCardDisplay(animate ? 'next' : 'none');
    } else {
      // Completed full cycle across all cards!
      const lastShown = this.cardOrder[this.currentIndex];
      this._initRandomOrder(lastShown);
      this.currentIndex = 0;
      if (this.onShowSnackbar) {
        this.onShowSnackbar(t('cycle_complete_msg'));
      }
      this._updateCardDisplay(animate ? 'next' : 'none');
    }
  }

  /**
   * Go back to the previous card along the randomized list
   */
  goBack() {
    if (this.isAnimating) return;
    if (this.currentIndex <= 0) return;

    // Move backward in randomized list
    this.currentIndex--;
    this._updateCardDisplay('back');
  }

  /**
   * Reset and generate a new random list of questions
   */
  resetShuffle() {
    if (this.isAnimating) return;
    const last = this.cardOrder.length > 0 ? this.cardOrder[this.currentIndex] : -1;
    this._initRandomOrder(last);
    this.currentIndex = 0;
    if (this.onShowSnackbar) {
      this.onShowSnackbar(t('toast_reshuffled'));
    }
    this._updateCardDisplay('next');
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
    const flipBtn = this.container.querySelector('#btn-study-flip');

    if (liveRegion) {
      liveRegion.textContent = this.face === 'q' ? 'Mặt câu hỏi / Question' : 'Mặt đáp án / Answer';
    }

    if (flipBtn) {
      flipBtn.setAttribute('aria-label', this.face === 'q' ? t('btn_flip_to_answer') : t('btn_flip_to_question'));
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
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        this.flipCard(1);
        break;
      case 'ArrowLeft':
      case 'b':
      case 'B':
        e.preventDefault();
        this.goBack();
        break;
      case 'ArrowRight':
      case 'n':
      case 'N':
        e.preventDefault();
        this._drawNext(true);
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
          </div>

          <div class="study-actions">
            <button type="button" class="icon-btn" id="study-reset-btn" title="${t('btn_shuffle_reset')}" aria-label="${t('btn_shuffle_reset')}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
            </button>
          </div>
        </header>

        <main class="study-card-viewport" id="study-card-viewport">
          <div class="study-card-track" id="study-card-track">
            <div class="study-card-wrapper" id="study-card-wrapper">
              <article class="study-card" id="study-card">
                <!-- Front Face: Question -->
                <div class="card-face card-front">
                  <div class="card-face-header">
                    <span class="card-face-tag">Câu hỏi · Question</span>
                  </div>
                  <div class="card-scroll" id="card-front-scroll">
                    <div class="card-content-box" id="card-front-content"></div>
                  </div>
                </div>

                <!-- Back Face: Answer -->
                <div class="card-face card-back">
                  <div class="card-face-header">
                    <span class="card-face-tag">Đáp án · Answer</span>
                  </div>
                  <div class="card-scroll" id="card-back-scroll">
                    <div class="card-content-box" id="card-back-content"></div>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div id="study-live-region" class="sr-only" aria-live="polite"></div>
        </main>

        <div class="study-counter-row">
          <div class="study-chip" id="study-counter-chip">Đã xem 0 / 0</div>
        </div>

        <footer class="study-bottom-bar">
          <button type="button" class="circle-btn circle-btn-tonal" id="btn-study-back" aria-label="${t('btn_back')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>

          <button type="button" class="circle-btn circle-btn-primary study-flip-btn" id="btn-study-flip" aria-label="${t('btn_flip_to_answer')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
          </button>

          <button type="button" class="circle-btn circle-btn-tonal" id="btn-study-next" aria-label="${t('btn_next')}">
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

    // Attach horizontal swipe gestures to track element
    const track = this.container.querySelector('#study-card-track');
    if (this.swipeCleanup) this.swipeCleanup();
    this.swipeCleanup = attachSwipe(track, {
      onNext: () => this._drawNext(true),
      onBack: () => this.goBack(),
      onTap: () => this.flipCard(1)
    });
  }

  _updateCardDisplay(animationType = 'none') {
    if (!this.currentSet || !this.currentSet.cards || this.currentSet.cards.length === 0) return;
    if (this.currentIndex < 0 || this.currentIndex >= this.cardOrder.length) return;

    const actualCardIndex = this.cardOrder[this.currentIndex];
    const card = this.currentSet.cards[actualCardIndex];
    if (!card) return;

    const frontContent = this.container.querySelector('#card-front-content');
    const backContent = this.container.querySelector('#card-back-content');
    const counterChip = this.container.querySelector('#study-counter-chip');
    const backBtn = this.container.querySelector('#btn-study-back');
    const cardWrapper = this.container.querySelector('#study-card-wrapper');
    const cardEl = this.container.querySelector('#study-card');
    const flipBtn = this.container.querySelector('#btn-study-flip');

    if (counterChip) {
      counterChip.textContent = t('study_seen_chip', {
        seen: this.currentIndex + 1,
        total: this.cardOrder.length
      });
    }

    if (backBtn) {
      backBtn.disabled = this.currentIndex <= 0;
    }

    // Render HTML for front and back
    if (frontContent) frontContent.innerHTML = renderCardFaceHTML(card, 'q');
    if (backContent) backContent.innerHTML = renderCardFaceHTML(card, 'a');

    // Reset scroll positions to top
    const frontScroll = this.container.querySelector('#card-front-scroll');
    const backScroll = this.container.querySelector('#card-back-scroll');
    if (frontScroll) frontScroll.scrollTop = 0;
    if (backScroll) backScroll.scrollTop = 0;

    // Reset flipped state and button label
    this.face = 'q';
    if (cardWrapper) {
      cardWrapper.classList.remove('is-flipped');
    }
    if (flipBtn) {
      flipBtn.setAttribute('aria-label', t('btn_flip_to_answer'));
    }

    // Horizontal Slide animation
    if (animationType === 'next' && cardEl) {
      this.isAnimating = true;
      cardEl.classList.remove('slide-in-right', 'slide-in-left');
      void cardEl.offsetWidth;
      cardEl.classList.add('slide-in-right');
      setTimeout(() => {
        cardEl.classList.remove('slide-in-right');
        this.isAnimating = false;
      }, 250);
    } else if (animationType === 'back' && cardEl) {
      this.isAnimating = true;
      cardEl.classList.remove('slide-in-right', 'slide-in-left');
      void cardEl.offsetWidth;
      cardEl.classList.add('slide-in-left');
      setTimeout(() => {
        cardEl.classList.remove('slide-in-left');
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
