/**
 * MyQuizlet - Main Application Bootstrap & Router
 * Hash router, screen controllers, library view, set detail view,
 * inline renaming, PWA service worker lifecycle management.
 */

import { store } from './store.js';
import { i18n, t } from './i18n.js';
import { ui } from './ui.js';
import { renderInlineQuestionHTML } from './render.js';
import { downloadSetAsMarkdown } from './serializer.js';
import { StudyController } from './study.js';

class App {
  constructor() {
    this.appBar = null;
    this.mainContainer = null;
    this.studyController = null;
    this.currentRoute = { path: '', param: '' };
    this.searchQuery = '';
    this.questionSearchQuery = '';
  }

  init() {
    // 1. Initialize i18n and store
    i18n.init();
    store.requestPersistentStorage();

    // 2. Cache main DOM elements
    this.appBar = document.getElementById('app-bar');
    this.mainContainer = document.getElementById('main-content');

    // 3. Setup event listeners
    this._setupGlobalListeners();

    // 4. Register Service Worker
    this._registerServiceWorker();

    // 5. Initial route dispatch
    this._handleRouteChange();
  }

  _setupGlobalListeners() {
    window.addEventListener('hashchange', () => this._handleRouteChange());

    // Listen to store updates
    store.subscribe(() => {
      if (this.currentRoute.path === 'library') {
        this.renderLibrary();
      } else if (this.currentRoute.path === 'set' && this.currentRoute.param) {
        this.renderSetDetail(this.currentRoute.param);
      }
    });

    // Listen to language changes
    i18n.subscribe(() => {
      this._updateAppBar();
      this._handleRouteChange();
    });

    // Close any open menu on outside click
    document.addEventListener('click', (e) => {
      const openMenu = document.querySelector('.dropdown-menu.is-open');
      if (openMenu && !openMenu.contains(e.target) && !e.target.closest('.menu-trigger')) {
        openMenu.classList.remove('is-open');
      }
    });
  }

  _registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').then((registration) => {
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Update available!
              ui.showSnackbar(t('toast_update_available'), {
                actionLabel: t('toast_update_reload_btn'),
                onAction: () => {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                },
                duration: 10000
              });
            }
          });
        });
      }).catch((err) => {
        console.warn('[MyQuizlet] Service Worker registration failed:', err);
      });

      // Reload when the waiting worker takes over
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }

  _parseHash() {
    const hash = window.location.hash || '#/';
    const clean = hash.replace(/^#\/?/, '');
    const parts = clean.split('/');

    if (!parts[0] || parts[0] === '') {
      return { path: 'library', param: '' };
    }
    if (parts[0] === 'set' && parts[1]) {
      return { path: 'set', param: parts[1] };
    }
    if (parts[0] === 'study' && parts[1]) {
      return { path: 'study', param: parts[1] };
    }
    if (parts[0] === 'import') {
      return { path: 'import', param: '' };
    }
    return { path: 'library', param: '' };
  }

  _handleRouteChange() {
    const route = this._parseHash();
    this.currentRoute = route;

    // Cleanup active study session if leaving study route
    if (this.studyController && route.path !== 'study') {
      this.studyController.destroy();
      this.studyController = null;
    }

    this._updateAppBar();

    switch (route.path) {
      case 'library':
        this.renderLibrary();
        break;
      case 'set':
        this.renderSetDetail(route.param);
        break;
      case 'study':
        this.renderStudy(route.param);
        break;
      case 'import':
        this.renderLibrary();
        this._openImportSheet();
        break;
      default:
        this.renderLibrary();
    }
  }

  _updateAppBar() {
    const isStudy = this.currentRoute.path === 'study';
    if (isStudy) {
      this.appBar.classList.add('hidden');
      return;
    }
    this.appBar.classList.remove('hidden');

    const isSubScreen = this.currentRoute.path === 'set';
    const backBtn = this.appBar.querySelector('#app-back-btn');
    const titleEl = this.appBar.querySelector('#app-title');

    if (backBtn) {
      backBtn.classList.toggle('hidden', !isSubScreen);
      backBtn.onclick = () => {
        window.location.hash = '#/';
      };
    }

    if (titleEl) {
      titleEl.textContent = isSubScreen ? t('deck_detail_title') : t('app_title');
    }

    // Attach App Bar Menu
    const menuBtn = this.appBar.querySelector('#app-menu-btn');
    const menuDropdown = this.appBar.querySelector('#app-menu-dropdown');

    if (menuBtn && menuDropdown) {
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('is-open');
      };

      const langSpan = menuDropdown.querySelector('#menu-lang-text');
      if (langSpan) {
        langSpan.innerHTML = `${t('language')}: <strong>${i18n.getLang() === 'vi' ? 'Tiếng Việt' : 'English'}</strong>`;
      }
      const storageSpan = menuDropdown.querySelector('#menu-storage-text');
      if (storageSpan) storageSpan.textContent = t('storage');
      const helpSpan = menuDropdown.querySelector('#menu-help-text');
      if (helpSpan) helpSpan.textContent = t('help');
      const aboutSpan = menuDropdown.querySelector('#menu-about-text');
      if (aboutSpan) aboutSpan.textContent = t('about');

      const optLang = menuDropdown.querySelector('#menu-opt-lang');
      if (optLang) {
        optLang.onclick = (e) => {
          e.stopPropagation();
          menuDropdown.classList.remove('is-open');
          i18n.toggleLang();
        };
      }
      const optStorage = menuDropdown.querySelector('#menu-opt-storage');
      if (optStorage) {
        optStorage.onclick = (e) => {
          e.stopPropagation();
          menuDropdown.classList.remove('is-open');
          ui.showStorageDialog();
        };
      }
      const optHelp = menuDropdown.querySelector('#menu-opt-help');
      if (optHelp) {
        optHelp.onclick = (e) => {
          e.stopPropagation();
          menuDropdown.classList.remove('is-open');
          ui.showHelpDialog();
        };
      }
      const optAbout = menuDropdown.querySelector('#menu-opt-about');
      if (optAbout) {
        optAbout.onclick = (e) => {
          e.stopPropagation();
          menuDropdown.classList.remove('is-open');
          ui.showAboutDialog();
        };
      }
    }
  }

  /**
   * Screen 1: Library Screen (A5)
   */
  renderLibrary() {
    const index = store.getIndex();

    // Filter index if search query is active
    const filtered = this.searchQuery
      ? index.filter((item) => item.title.toLowerCase().includes(this.searchQuery.toLowerCase()))
      : index;

    const showSearch = index.length > 8 || this.searchQuery.length > 0;

    let searchHtml = '';
    if (showSearch) {
      searchHtml = `
        <div class="search-bar-wrapper">
          <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="search" id="library-search-input" class="search-input" placeholder="${t('search_decks')}" value="${this.searchQuery}" />
          ${this.searchQuery ? '<button type="button" id="clear-search-btn" class="icon-btn-sm">✕</button>' : ''}
        </div>
      `;
    }

    if (index.length === 0) {
      this.mainContainer.innerHTML = `
        <div class="library-container">
          <div class="empty-state">
            <div class="empty-illustration">
              <svg viewBox="0 0 160 160" class="empty-svg">
                <rect x="25" y="45" width="100" height="75" rx="14" fill="#3F51B5" opacity="0.12" transform="rotate(-6 75 82)"/>
                <rect x="35" y="38" width="100" height="75" rx="14" fill="#FF9800" opacity="0.2" transform="rotate(4 85 75)"/>
                <rect x="30" y="42" width="100" height="75" rx="14" fill="var(--md-sys-color-surface)" stroke="var(--md-sys-color-primary)" stroke-width="2.5"/>
                <circle cx="80" cy="72" r="14" fill="#3F51B5" opacity="0.2"/>
                <path d="M74 72l4 4 8-8" stroke="#3F51B5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <line x1="50" y1="96" x2="110" y2="96" stroke="var(--md-sys-color-outline)" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </div>
            <h2 class="empty-title">${t('empty_library_title')}</h2>
            <p class="empty-desc">${t('empty_library_desc')}</p>
            <button type="button" class="btn btn-primary btn-lg" id="empty-import-btn">
              <svg class="icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              <span>${t('import_cards_btn')}</span>
            </button>
          </div>
        </div>
      `;

      this.mainContainer.querySelector('#empty-import-btn').addEventListener('click', () => {
        this._openImportSheet();
      });
      return;
    }

    // Render Set Grid
    let cardsHtml = '';
    filtered.forEach((set) => {
      const lockBadge = set.allowAnswer === false
        ? `<span class="card-lock-badge" title="${t('lock_badge_tooltip')}">🔒</span>`
        : '';

      const relativeTime = i18n.formatRelativeTime(set.lastStudiedAt);

      cardsHtml += `
        <article class="deck-card" data-set-id="${set.id}">
          <div class="deck-card-main">
            <div class="deck-card-header">
              <h2 class="deck-title">${this._escapeHTML(set.title)}</h2>
              ${lockBadge}
            </div>
            
            <div class="deck-meta">
              <span class="chip-count">${t('deck_card_count', { count: set.count })}</span>
              <span class="meta-time">${t('last_studied', { time: relativeTime })}</span>
            </div>
          </div>

          <div class="deck-card-actions">
            <button type="button" class="btn btn-tonal btn-study-card" data-set-id="${set.id}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <span>${t('action_study')}</span>
            </button>

            <div class="card-menu-container">
              <button type="button" class="icon-btn menu-trigger card-menu-btn" data-set-id="${set.id}" aria-label="${t('menu')}">
                <svg class="icon" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
              </button>
              <div class="dropdown-menu card-menu-dropdown" id="menu-${set.id}">
                <button type="button" class="menu-item action-study-item" data-set-id="${set.id}">
                  <span>${t('action_study')}</span>
                </button>
                <button type="button" class="menu-item action-detail-item" data-set-id="${set.id}">
                  <span>${t('deck_detail_title')}</span>
                </button>
                <button type="button" class="menu-item action-rename-item" data-set-id="${set.id}">
                  <span>${t('action_rename')}</span>
                </button>
                <button type="button" class="menu-item action-toggle-item" data-set-id="${set.id}">
                  <span>${set.allowAnswer === false ? t('action_answers_allowed') : t('action_answers_hidden')}</span>
                </button>
                <button type="button" class="menu-item action-export-item" data-set-id="${set.id}">
                  <span>${t('action_export')}</span>
                </button>
                <div class="menu-divider"></div>
                <button type="button" class="menu-item menu-item-danger action-delete-item" data-set-id="${set.id}">
                  <span>${t('action_delete')}</span>
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    });

    this.mainContainer.innerHTML = `
      <div class="library-container">
        ${searchHtml}
        <div class="decks-grid">
          ${cardsHtml}
        </div>
        <button type="button" class="fab" id="fab-create" aria-label="${t('create_deck_fab')}">
          <svg class="icon-fab" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>
    `;

    // Attach search listener
    if (showSearch) {
      const searchInput = this.mainContainer.querySelector('#library-search-input');
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderLibrary();
      });

      const clearBtn = this.mainContainer.querySelector('#clear-search-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.searchQuery = '';
          this.renderLibrary();
        });
      }
    }

    // Attach Card Click -> Open Detail
    this.mainContainer.querySelectorAll('.deck-card-main').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.closest('.deck-card').dataset.setId;
        window.location.hash = `#/set/${id}`;
      });
    });

    // Attach Study Buttons
    this.mainContainer.querySelectorAll('.btn-study-card, .action-study-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        window.location.hash = `#/study/${id}`;
      });
    });

    // Attach Detail Menu Item
    this.mainContainer.querySelectorAll('.action-detail-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        window.location.hash = `#/set/${id}`;
      });
    });

    // Attach Menu Dropdowns
    this.mainContainer.querySelectorAll('.card-menu-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        const menu = this.mainContainer.querySelector(`#menu-${id}`);
        // Close all other menus
        this.mainContainer.querySelectorAll('.card-menu-dropdown.is-open').forEach((m) => {
          if (m !== menu) m.classList.remove('is-open');
        });
        if (menu) menu.classList.toggle('is-open');
      });
    });

    // Rename
    this.mainContainer.querySelectorAll('.action-rename-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        this._promptRenameSet(id);
      });
    });

    // Toggle Answers
    this.mainContainer.querySelectorAll('.action-toggle-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        const set = store.getSet(id);
        if (set) {
          store.setAllowAnswer(id, !set.allowAnswer);
          ui.showSnackbar(set.allowAnswer ? t('action_answers_hidden') : t('action_answers_allowed'));
          this.renderLibrary();
        }
      });
    });

    // Export
    this.mainContainer.querySelectorAll('.action-export-item').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        const set = store.getSet(id);
        if (set) {
          const res = await downloadSetAsMarkdown(set);
          ui.showSnackbar(t('toast_exported', { fileName: res.fileName }));
        }
      });
    });

    // Delete
    this.mainContainer.querySelectorAll('.action-delete-item').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        await this._handleDeleteSet(id);
      });
    });

    // FAB Button
    this.mainContainer.querySelector('#fab-create').addEventListener('click', () => {
      this._openImportSheet();
    });
  }

  /**
   * Screen 2: Set Detail Screen (A6)
   * @param {string} setId 
   */
  renderSetDetail(setId) {
    const set = store.getSet(setId);
    if (!set) {
      ui.showSnackbar('Bộ thẻ không tồn tại / Deck not found');
      window.location.hash = '#/';
      return;
    }

    const cards = set.cards || [];
    const filteredCards = this.questionSearchQuery
      ? cards.filter((c) => (c.q || '').toLowerCase().includes(this.questionSearchQuery.toLowerCase()))
      : cards;

    let questionsListHtml = '';
    if (cards.length === 0) {
      questionsListHtml = `<p class="empty-deck-notice">${t('empty_deck_hint')}</p>`;
    } else if (filteredCards.length === 0) {
      questionsListHtml = `<p class="empty-deck-notice">${t('empty_search_questions', { query: this.questionSearchQuery })}</p>`;
    } else {
      questionsListHtml = filteredCards
        .map((c, idx) => {
          const qHtml = renderInlineQuestionHTML(c.q);
          const answerPreview = set.allowAnswer === false
            ? `<span class="answer-hidden-label">${t('answer_hidden_in_detail')}</span>`
            : (c.a ? `<div class="detail-card-a">${this._escapeHTML(c.a.slice(0, 120))}${c.a.length > 120 ? '...' : ''}</div>` : `<span class="answer-empty-label">${t('question_no_answer')}</span>`);

          return `
            <div class="question-list-item">
              <div class="q-item-num">${idx + 1}</div>
              <div class="q-item-body">
                <div class="q-item-title">${qHtml}</div>
                ${answerPreview}
              </div>
            </div>
          `;
        })
        .join('');
    }

    this.mainContainer.innerHTML = `
      <div class="detail-container">
        <header class="detail-header-card">
          <div class="detail-title-row">
            <h1 class="detail-title" id="detail-title-display">${this._escapeHTML(set.title)}</h1>
            <button type="button" class="icon-btn-sm" id="detail-edit-title-btn" title="${t('action_rename')}">
              <svg class="icon-sm" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          </div>

          <div class="detail-toggle-row">
            <label class="switch-container" for="switch-allow-answer">
              <span class="switch-label">${t('allow_answers_toggle')}</span>
              <input type="checkbox" id="switch-allow-answer" class="switch-input" ${set.allowAnswer !== false ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>

          <div class="detail-actions-row">
            <button type="button" class="btn btn-primary" id="detail-study-btn" ${cards.length === 0 ? 'disabled' : ''}>
              <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <span>${t('action_study')}</span>
            </button>

            <button type="button" class="btn btn-tonal" id="detail-export-btn">
              <svg class="icon" viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
              <span>${t('action_export')}</span>
            </button>

            <button type="button" class="btn btn-danger-tonal" id="detail-delete-btn">
              <svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              <span>${t('action_delete')}</span>
            </button>
          </div>
        </header>

        <section class="detail-questions-section">
          <div class="section-heading-row">
            <span class="questions-count">${t('questions_count_label', { shown: filteredCards.length, total: cards.length })}</span>
          </div>

          ${
            cards.length > 5 || this.questionSearchQuery
              ? `
                <div class="search-bar-wrapper">
                  <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                  <input type="search" id="question-search-input" class="search-input" placeholder="${t('search_questions_placeholder')}" value="${this.questionSearchQuery}" />
                </div>
              `
              : ''
          }

          <div class="questions-list">
            ${questionsListHtml}
          </div>
        </section>
      </div>
    `;

    // Inline Rename Handlers
    const titleDisplay = this.mainContainer.querySelector('#detail-title-display');
    const editBtn = this.mainContainer.querySelector('#detail-edit-title-btn');

    const startEditing = () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'inline-title-input';
      input.value = set.title;
      input.maxLength = 120;
      titleDisplay.replaceWith(input);
      input.focus();
      input.select();

      const finish = (save) => {
        const val = input.value.trim();
        if (save && val && val !== set.title) {
          try {
            store.renameSet(setId, val);
            ui.showSnackbar(t('toast_renamed'));
          } catch (e) {
            ui.showSnackbar(e.message);
          }
        }
        this.renderSetDetail(setId);
      };

      input.addEventListener('blur', () => finish(true));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      });
    };

    titleDisplay.addEventListener('click', startEditing);
    editBtn.addEventListener('click', startEditing);

    // Toggle Allow Answers
    const switchEl = this.mainContainer.querySelector('#switch-allow-answer');
    switchEl.addEventListener('change', (e) => {
      store.setAllowAnswer(setId, e.target.checked);
      ui.showSnackbar(e.target.checked ? t('action_answers_allowed') : t('action_answers_hidden'));
      this.renderSetDetail(setId);
    });

    // Buttons
    this.mainContainer.querySelector('#detail-study-btn').addEventListener('click', () => {
      window.location.hash = `#/study/${setId}`;
    });

    this.mainContainer.querySelector('#detail-export-btn').addEventListener('click', async () => {
      const res = await downloadSetAsMarkdown(set);
      ui.showSnackbar(t('toast_exported', { fileName: res.fileName }));
    });

    this.mainContainer.querySelector('#detail-delete-btn').addEventListener('click', async () => {
      await this._handleDeleteSet(setId);
    });

    // Question Search
    const qSearch = this.mainContainer.querySelector('#question-search-input');
    if (qSearch) {
      qSearch.addEventListener('input', (e) => {
        this.questionSearchQuery = e.target.value;
        this.renderSetDetail(setId);
      });
    }
  }

  /**
   * Screen 3: Study Screen (A9, A10, A11, A12)
   * @param {string} setId 
   */
  renderStudy(setId) {
    if (this.studyController) {
      this.studyController.destroy();
    }

    this.studyController = new StudyController({
      container: this.mainContainer,
      onBack: () => {
        window.location.hash = `#/set/${setId}`;
      },
      onShowSnackbar: (msg) => ui.showSnackbar(msg)
    });

    this.studyController.start(setId);
  }

  _openImportSheet() {
    ui.openImportSheet({
      onImportConfirmed: (parsedSet, mode) => {
        try {
          if (mode === 'replace') {
            // Find existing set with this title and replace it
            const existing = store.getIndex().find((s) => s.title.toLowerCase() === parsedSet.title.toLowerCase());
            if (existing) {
              parsedSet.id = existing.id;
            }
          } else if (mode === 'duplicate') {
            // Append number suffix e.g., "Deck (2)"
            const existingTitles = store.getIndex().map((s) => s.title);
            let counter = 2;
            let candidate = `${parsedSet.title} (${counter})`;
            while (existingTitles.includes(candidate)) {
              counter++;
              candidate = `${parsedSet.title} (${counter})`;
            }
            parsedSet.title = candidate;
          }

          store.saveSet(parsedSet);
          ui.showSnackbar(t('toast_imported', { count: parsedSet.cards.length }));
          window.location.hash = `#/set/${parsedSet.id}`;
        } catch (err) {
          if (err.name === 'QuotaExceededError') {
            ui.showSnackbar(t('toast_quota_error'));
          } else {
            ui.showSnackbar(`Lỗi lưu bộ thẻ: ${err.message}`);
          }
        }
      },
      onCreateEmpty: (title) => {
        try {
          const newSet = {
            id: crypto.randomUUID ? crypto.randomUUID() : 'set_' + Date.now(),
            title: title.trim(),
            allowAnswer: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastStudiedAt: null,
            cards: []
          };
          store.saveSet(newSet);
          window.location.hash = `#/set/${newSet.id}`;
        } catch (err) {
          ui.showSnackbar(`Lỗi tạo bộ thẻ: ${err.message}`);
        }
      }
    });
  }

  async _handleDeleteSet(setId) {
    const set = store.getSet(setId);
    if (!set) return;

    const confirmed = await ui.showConfirmDialog({
      title: t('delete_confirm_title'),
      message: t('delete_confirm_msg', { title: set.title }),
      confirmText: t('delete_confirm_btn'),
      cancelText: t('cancel'),
      isDestructive: true
    });

    if (!confirmed) return;

    // Delete set with undo
    store.deleteSet(setId);

    // Show Undo toast for 6 seconds
    ui.showSnackbar(t('toast_deleted'), {
      actionLabel: t('toast_undo_btn'),
      onAction: () => {
        const restored = store.undoDelete();
        if (restored) {
          window.location.hash = `#/set/${restored.id}`;
        }
      },
      duration: 6000
    });

    window.location.hash = '#/';
  }

  async _promptRenameSet(setId) {
    const set = store.getSet(setId);
    if (!set) return;

    const newTitle = window.prompt(t('rename_placeholder'), set.title);
    if (newTitle !== null) {
      const trimmed = newTitle.trim();
      if (!trimmed) {
        ui.showSnackbar('Tên bộ thẻ không được để trống / Title cannot be empty');
        return;
      }
      try {
        store.renameSet(setId, trimmed);
        ui.showSnackbar(t('toast_renamed'));
        this.renderLibrary();
      } catch (e) {
        ui.showSnackbar(e.message);
      }
    }
  }

  _escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// Bootstrap on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
