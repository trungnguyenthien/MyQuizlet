/**
 * MyQuizlet - Main Application Bootstrap & Router
 * Hash router, screen controllers, library view, set detail view,
 * inline renaming, PWA service worker lifecycle management.
 */

import { store } from './store.js';
import { i18n, t } from './i18n.js';
import { ui } from './ui.js';
import { renderInlineQuestionHTML, renderCardFaceHTML, clearRenderCache } from './render.js';
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
    this.reviewSearchQuery = '';
    this.expandedReviewCardId = null;
    this.deferredInstallPrompt = null;
  }

  init() {
    this.resumeStudySession = null;

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

    // 5. Initialize PWA Installation Flow (PWA Standard 6)
    this._initPWAInstallation();

    // 6. Initial route dispatch
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
      } else if (this.currentRoute.path === 'review' && this.currentRoute.param) {
        this.renderReview(this.currentRoute.param);
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
    const btnUpdateApp = document.getElementById('btnUpdateApp');
    const btnUpdateText = document.getElementById('btn-update-text');

    const setUpdateReadyState = (worker) => {
      if (btnUpdateApp) {
        btnUpdateApp.classList.remove('hidden');
        btnUpdateApp.classList.add('is-ready');
        if (btnUpdateText) {
          btnUpdateText.textContent = t('update_ready_btn') || 'Bản mới';
        }
      }
      ui.showSnackbar(t('toast_update_ready_notice') || t('toast_update_available'), {
        actionLabel: t('toast_update_reload_btn'),
        onAction: () => {
          if (worker) {
            worker.postMessage({ action: 'skipWaiting', type: 'SKIP_WAITING' });
          }
          window.location.reload();
        },
        duration: 15000
      });
    };

    // Handle Force Update Button click (PWA Standard 6.D)
    if (btnUpdateApp) {
      btnUpdateApp.addEventListener('click', async () => {
        // 1. Check network status
        if (!navigator.onLine) {
          ui.showSnackbar(t('toast_offline_cannot_update') || 'Không thể cập nhật khi đang offline');
          return;
        }

        if (location.protocol === 'file:') {
          ui.showSnackbar('Ứng dụng đang chạy qua file://. Vui lòng mở qua web/localhost để cập nhật.');
          return;
        }

        // 2. Set updating UI state (spinner, disable, change label)
        btnUpdateApp.classList.add('is-updating');
        btnUpdateApp.disabled = true;
        if (btnUpdateText) {
          btnUpdateText.textContent = t('updating_btn') || 'Đang tải...';
        }

        try {
          // 3. Trigger registration update
          if (this.swRegistration) {
            await this.swRegistration.update().catch(() => {});
            if (this.swRegistration.waiting) {
              this.swRegistration.waiting.postMessage({ action: 'skipWaiting', type: 'SKIP_WAITING' });
            }
          }

          // 4. Clear all caches
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }

          // 5. Unregister old service workers to guarantee fresh fetch
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const r of registrations) {
              await r.unregister();
            }
          }

          // 6. Force reload with cache-bust timestamp
          const targetUrl = window.location.pathname + window.location.hash;
          const sep = targetUrl.includes('?') ? '&' : '?';
          window.location.href = targetUrl + sep + 'forceUpdate=' + Date.now();
        } catch (err) {
          console.error('[MyQuizlet] Force update error:', err);
          window.location.reload();
        }
      });
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).then((registration) => {
        this.swRegistration = registration;

        // Immediately check for updates
        registration.update().catch(() => {});

        // If there is already a waiting worker
        if (registration.waiting && navigator.serviceWorker.controller) {
          setUpdateReadyState(registration.waiting);
        }

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReadyState(newWorker);
            }
          });
        });
      }).catch((err) => {
        console.warn('[MyQuizlet] Service Worker registration failed:', err);
      });

      // Reload when the waiting worker takes over
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }

  _initPWAInstallation() {
    const btnInstall = document.getElementById('btnInstall');
    const iosInstallModal = document.getElementById('iosInstallModal');
    const btnCloseIosModal = document.getElementById('btnCloseIosModal');
    const btnGotItIos = document.getElementById('btnGotItIos');

    // Check standalone mode (PWA Standard 6.A)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    // Detect iOS Safari
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Detect Android
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isStandalone) {
      if (btnInstall) btnInstall.classList.add('hidden');
    } else {
      // In any web browser where the app is not yet installed standalone,
      // show the Install button so users can install or view install guidance.
      if (btnInstall) btnInstall.classList.remove('hidden');
    }

    // 1. Listen for beforeinstallprompt on Chromium (Android / Desktop)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (!isStandalone && btnInstall) {
        btnInstall.classList.remove('hidden');
      }
    });

    // 2. Listen for appinstalled
    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      if (btnInstall) btnInstall.classList.add('hidden');
      ui.showSnackbar(t('app_installed_success'));
    });

    // 3. Handle install button click
    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (this.deferredInstallPrompt) {
          this.deferredInstallPrompt.prompt();
          const { outcome } = await this.deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            btnInstall.classList.add('hidden');
          }
          this.deferredInstallPrompt = null;
        } else if (iosInstallModal) {
          // Adapt modal text based on platform
          const modalTitle = document.getElementById('iosModalTitle');
          const modalIntro = document.getElementById('ios-install-intro');
          const step1 = document.getElementById('ios-step-1');
          const step2 = document.getElementById('ios-step-2');
          const step3 = document.getElementById('ios-step-3');

          if (isIOS) {
            if (modalTitle) modalTitle.textContent = t('ios_install_title');
            if (modalIntro) modalIntro.textContent = t('ios_install_intro');
            if (step1) step1.innerHTML = t('ios_step_1');
            if (step2) step2.innerHTML = t('ios_step_2');
            if (step3) step3.innerHTML = t('ios_step_3');
          } else if (isAndroid) {
            if (modalTitle) modalTitle.textContent = t('install_android_title') || 'Cài đặt trên Android';
            if (modalIntro) modalIntro.textContent = t('install_android_intro') || 'Để cài đặt ứng dụng lên thiết bị:';
            if (step1) step1.innerHTML = t('install_android_step1');
            if (step2) step2.innerHTML = t('install_android_step2');
            if (step3) step3.innerHTML = t('install_android_step3');
          } else {
            // Desktop (Chrome/Edge/Safari macOS)
            if (modalTitle) modalTitle.textContent = t('install_desktop_title') || 'Cài đặt trên Máy tính';
            if (modalIntro) modalIntro.textContent = t('install_desktop_intro') || 'Để cài đặt ứng dụng về máy tính và chạy độc lập:';
            if (step1) step1.innerHTML = t('install_desktop_step1');
            if (step2) step2.innerHTML = t('install_desktop_step2');
            if (step3) step3.innerHTML = t('install_desktop_step3');
          }

          iosInstallModal.classList.remove('hidden');
        }
      });
    }

    // Close modal handlers
    const closeIosModal = () => {
      if (iosInstallModal) iosInstallModal.classList.add('hidden');
    };

    if (btnCloseIosModal) btnCloseIosModal.addEventListener('click', closeIosModal);
    if (btnGotItIos) btnGotItIos.addEventListener('click', closeIosModal);

    if (iosInstallModal) {
      iosInstallModal.addEventListener('click', (e) => {
        if (e.target === iosInstallModal) closeIosModal();
      });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !iosInstallModal.classList.contains('hidden')) {
          closeIosModal();
        }
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
    if (parts[0] === 'review' && parts[1]) {
      return { path: 'review', param: parts[1] };
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
      case 'review':
        this.renderReview(route.param);
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

    const isSubScreen = this.currentRoute.path === 'set' || this.currentRoute.path === 'review';
    const backBtn = this.appBar.querySelector('#app-back-btn');
    const titleEl = this.appBar.querySelector('#app-title');

    if (backBtn) {
      backBtn.classList.toggle('hidden', !isSubScreen);
      backBtn.onclick = () => {
        if (this.currentRoute.path === 'review') {
          window.location.hash = `#/set/${this.currentRoute.param}`;
        } else {
          window.location.hash = '#/';
        }
      };
    }

    if (titleEl) {
      if (this.currentRoute.path === 'review') {
        const set = store.getSet(this.currentRoute.param);
        titleEl.textContent = set ? `${t('action_review')} — ${set.title}` : t('action_review');
      } else if (this.currentRoute.path === 'set') {
        titleEl.textContent = t('deck_detail_title');
      } else {
        titleEl.textContent = t('app_title');
      }
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

    // Update Update Button, Install Button & iOS Modal Text
    const updateText = this.appBar.querySelector('#btn-update-text');
    const btnUpdateApp = this.appBar.querySelector('#btnUpdateApp');
    if (updateText && !btnUpdateApp?.classList.contains('is-updating')) {
      updateText.textContent = btnUpdateApp?.classList.contains('is-ready') ? t('update_ready_btn') : t('update_app_btn');
    }
    if (btnUpdateApp) btnUpdateApp.setAttribute('aria-label', t('update_app_btn'));

    const installText = this.appBar.querySelector('#btn-install-text');
    if (installText) installText.textContent = t('install_btn');
    const btnInstall = this.appBar.querySelector('#btnInstall');
    if (btnInstall) btnInstall.setAttribute('aria-label', t('install_btn_aria'));

    const iosModalTitle = document.getElementById('iosModalTitle');
    if (iosModalTitle) iosModalTitle.textContent = t('ios_install_title');
    const iosIntro = document.getElementById('ios-install-intro');
    if (iosIntro) iosIntro.textContent = t('ios_install_intro');
    const iosStep1 = document.getElementById('ios-step-1');
    if (iosStep1) iosStep1.innerHTML = t('ios_step_1');
    const iosStep2 = document.getElementById('ios-step-2');
    if (iosStep2) iosStep2.innerHTML = t('ios_step_2');
    const iosStep3 = document.getElementById('ios-step-3');
    if (iosStep3) iosStep3.innerHTML = t('ios_step_3');
    const btnGotItIos = document.getElementById('btnGotItIos');
    if (btnGotItIos) btnGotItIos.textContent = t('ios_install_got_it');
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
            <div class="deck-card-btn-group">
              <button type="button" class="btn btn-tonal btn-study-card" data-set-id="${set.id}">
                <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>${t('action_study')}</span>
              </button>
              <button type="button" class="btn btn-tonal btn-review-card" data-set-id="${set.id}" ${set.count === 0 ? 'disabled' : ''}>
                <svg class="icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                <span>${t('action_review')}</span>
              </button>
            </div>

            <div class="card-menu-container">
              <button type="button" class="icon-btn menu-trigger card-menu-btn" data-set-id="${set.id}" aria-label="${t('menu')}">
                <svg class="icon" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
              </button>
              <div class="dropdown-menu card-menu-dropdown" id="menu-${set.id}">
                <button type="button" class="menu-item action-study-item" data-set-id="${set.id}">
                  <span>${t('action_study')}</span>
                </button>
                <button type="button" class="menu-item action-review-item" data-set-id="${set.id}">
                  <span>${t('action_review')}</span>
                </button>
                <button type="button" class="menu-item action-detail-item" data-set-id="${set.id}">
                  <span>${t('deck_detail_title')}</span>
                </button>
                <button type="button" class="menu-item action-rename-item" data-set-id="${set.id}">
                  <span>${t('action_rename')}</span>
                </button>
                <button type="button" class="menu-item action-reimport-item" data-set-id="${set.id}">
                  <span>${t('action_reimport')}</span>
                </button>
                <button type="button" class="menu-item action-edit-md-item" data-set-id="${set.id}">
                  <span>${t('action_edit_markdown')}</span>
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
        this.startStudyFlow(id);
      });
    });

    // Attach Review Buttons
    this.mainContainer.querySelectorAll('.btn-review-card, .action-review-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        window.location.hash = `#/review/${id}`;
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

    // Edit Markdown from library menu
    this.mainContainer.querySelectorAll('.action-edit-md-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        const menu = this.mainContainer.querySelector(`#menu-${id}`);
        if (menu) menu.classList.remove('is-open');
        this._openEditMarkdown(id);
      });
    });

    // Re-import from library menu
    this.mainContainer.querySelectorAll('.action-reimport-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.setId;
        const menu = this.mainContainer.querySelector(`#menu-${id}`);
        if (menu) menu.classList.remove('is-open');
        this._openReimportSet(id);
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
      questionsListHtml = `
        <div class="empty-deck-notice-box">
          <p class="empty-deck-notice">${t('empty_deck_hint')}</p>
          <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; align-items:center;">
            <button type="button" class="circle-btn circle-btn-primary" id="empty-deck-reimport-btn" title="${t('action_reimport')}" aria-label="${t('action_reimport')}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
            <button type="button" class="circle-btn circle-btn-tonal" id="empty-deck-edit-md-btn" title="${t('action_edit_markdown')}" aria-label="${t('action_edit_markdown')}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          </div>
        </div>
      `;
    } else if (filteredCards.length === 0) {
      questionsListHtml = `<p class="empty-deck-notice">${t('empty_search_questions', { query: this.questionSearchQuery })}</p>`;
    } else {
      questionsListHtml = filteredCards
        .map((c, idx) => {
          const qHtml = renderInlineQuestionHTML(c.q);
          return `
            <div class="question-list-item">
              <div class="q-item-num">${idx + 1}</div>
              <div class="q-item-body">
                <div class="q-item-title">${qHtml}</div>
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
            <button type="button" class="circle-btn circle-btn-primary" id="detail-study-btn" title="${t('action_study')}" aria-label="${t('action_study')}" ${cards.length === 0 ? 'disabled' : ''}>
              <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-tonal" id="detail-review-btn" title="${t('action_review')}" aria-label="${t('action_review')}" ${cards.length === 0 ? 'disabled' : ''}>
              <svg class="icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-tonal" id="detail-reimport-btn" title="${t('action_reimport')}" aria-label="${t('action_reimport')}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-tonal" id="detail-edit-md-btn" title="${t('action_edit_markdown')}" aria-label="${t('action_edit_markdown')}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-tonal" id="detail-export-btn" title="${t('action_export')}" aria-label="${t('action_export')}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-danger" id="detail-delete-btn" title="${t('action_delete')}" aria-label="${t('action_delete')}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
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
      this.startStudyFlow(setId);
    });

    const detailReviewBtn = this.mainContainer.querySelector('#detail-review-btn');
    if (detailReviewBtn) {
      detailReviewBtn.addEventListener('click', () => {
        window.location.hash = `#/review/${setId}`;
      });
    }

    const openEditMd = () => {
      this._openEditMarkdown(setId);
    };

    const editMdBtn = this.mainContainer.querySelector('#detail-edit-md-btn');
    if (editMdBtn) editMdBtn.addEventListener('click', openEditMd);

    const emptyEditMdBtn = this.mainContainer.querySelector('#empty-deck-edit-md-btn');
    if (emptyEditMdBtn) emptyEditMdBtn.addEventListener('click', openEditMd);

    const openReimport = () => {
      this._openReimportSet(setId);
    };

    const reimportBtn = this.mainContainer.querySelector('#detail-reimport-btn');
    if (reimportBtn) reimportBtn.addEventListener('click', openReimport);

    const emptyReimportBtn = this.mainContainer.querySelector('#empty-deck-reimport-btn');
    if (emptyReimportBtn) emptyReimportBtn.addEventListener('click', openReimport);

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
   * Screen: Review Screen (List of questions; tapping a question opens the answer modal)
   * @param {string} setId
   */
  renderReview(setId) {
    const set = store.getSet(setId);
    if (!set) {
      ui.showSnackbar('Bộ thẻ không tồn tại / Deck not found');
      window.location.hash = '#/';
      return;
    }

    const cards = set.cards || [];
    const term = (this.reviewSearchQuery || '').trim().toLowerCase();
    const filteredCards = term
      ? cards.filter((c) => (c.q || '').toLowerCase().includes(term) || (c.a || '').toLowerCase().includes(term))
      : cards;

    let contentHtml = '';

    if (cards.length === 0) {
      contentHtml = `
        <div class="review-empty-state">
          <p class="empty-deck-notice">${t('review_empty_notice')}</p>
          <div style="margin-top: var(--space-4); display: flex; justify-content: center; gap: var(--space-3);">
            <button type="button" class="btn btn-tonal" id="review-back-detail-btn">
              <span>${t('deck_detail_title')}</span>
            </button>
          </div>
        </div>
      `;
    } else if (filteredCards.length === 0) {
      contentHtml = `
        <div class="review-empty-state">
          <p class="empty-deck-notice">${t('review_empty_search', { query: this._escapeHTML(this.reviewSearchQuery) })}</p>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="review-question-list" id="review-question-list" role="list" aria-label="${t('review_screen_title')}">
          ${filteredCards
            .map((card, idx) => {
              const qHtml = renderInlineQuestionHTML(card.q);
              return `
                <div class="review-question-item" data-card-id="${card.id}" data-card-index="${idx}" role="listitem" tabindex="0" aria-label="${this._escapeHTML(card.q)}">
                  <div class="review-q-title">${qHtml}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    }

    this.mainContainer.innerHTML = `
      <div class="review-container">
        <header class="review-header-card">
          <div class="review-header-top">
            <h1 class="review-title">${this._escapeHTML(set.title)}</h1>
            ${
              cards.length > 0
                ? `
                  <button type="button" class="circle-btn circle-btn-primary" id="review-study-btn" title="${t('action_study')}" aria-label="${t('action_study')}">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                `
                : ''
            }
          </div>

          <div class="review-header-meta">
            <span class="chip-count">${t('deck_card_count', { count: cards.length })}</span>
            <span class="review-hint-badge">
              <svg class="icon-sm" viewBox="0 0 24 24"><path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/></svg>
              ${t('review_hint')}
            </span>
          </div>

          ${
            cards.length > 3 || this.reviewSearchQuery
              ? `
                <div class="search-bar-wrapper" style="margin-top: var(--space-4);">
                  <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                  <input type="search" id="review-search-input" class="search-input" placeholder="${t('review_search_placeholder')}" value="${this._escapeHTML(this.reviewSearchQuery || '')}" />
                </div>
              `
              : ''
          }
        </header>

        ${contentHtml}
      </div>
    `;

    // Attach Question Click Handler: opens modal with question and answer
    const qList = this.mainContainer.querySelector('#review-question-list');
    if (qList) {
      const openCardModal = (item) => {
        if (!item) return;
        const cardId = item.dataset.cardId;
        const card = cards.find((c) => c.id === cardId);
        const cardIndex = parseInt(item.dataset.cardIndex, 10);
        if (card) {
          ui.showReviewAnswerModal({
            card,
            index: cardIndex,
            total: filteredCards.length
          });
        }
      };

      qList.addEventListener('click', (e) => {
        const item = e.target.closest('.review-question-item');
        openCardModal(item);
      });

      qList.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const item = e.target.closest('.review-question-item');
          if (item) {
            e.preventDefault();
            openCardModal(item);
          }
        }
      });
    }

    // Attach Search Input
    const searchInput = this.mainContainer.querySelector('#review-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.reviewSearchQuery = e.target.value;
        this.renderReview(setId);
        const newInput = this.mainContainer.querySelector('#review-search-input');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(newInput.value.length, newInput.value.length);
        }
      });
    }

    // Quick Study button
    const studyBtn = this.mainContainer.querySelector('#review-study-btn');
    if (studyBtn) {
      studyBtn.addEventListener('click', () => {
        this.startStudyFlow(setId);
      });
    }

    // Empty back button
    const emptyBackBtn = this.mainContainer.querySelector('#review-back-detail-btn');
    if (emptyBackBtn) {
      emptyBackBtn.addEventListener('click', () => {
        window.location.hash = `#/set/${setId}`;
      });
    }
  }

  /**
   * Start Study Flow: prompts user if an ongoing study progress exists
   * @param {string} setId
   */
  startStudyFlow(setId) {
    const set = store.getSet(setId);
    if (!set) {
      ui.showSnackbar('Bộ thẻ không tồn tại / Deck not found');
      return;
    }

    if (!set.cards || set.cards.length === 0) {
      ui.showSnackbar(t('empty_deck_cannot_study'));
      return;
    }

    const progress = store.getStudyProgress(setId);
    if (progress && progress.totalCards === set.cards.length) {
      ui.showStudyResumeDialog({
        set,
        progress,
        onResume: () => {
          this.resumeStudySession = true;
          if (window.location.hash === `#/study/${setId}`) {
            this.renderStudy(setId);
          } else {
            window.location.hash = `#/study/${setId}`;
          }
        },
        onRestart: () => {
          this.resumeStudySession = false;
          store.clearStudyProgress(setId);
          if (window.location.hash === `#/study/${setId}`) {
            this.renderStudy(setId);
          } else {
            window.location.hash = `#/study/${setId}`;
          }
        }
      });
      return;
    }

    this.resumeStudySession = false;
    if (window.location.hash === `#/study/${setId}`) {
      this.renderStudy(setId);
    } else {
      window.location.hash = `#/study/${setId}`;
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

    const chosenResume = this.resumeStudySession;
    this.resumeStudySession = null;

    const progress = store.getStudyProgress(setId);
    const set = store.getSet(setId);

    // If user arrived directly (e.g. reload or link) and has saved progress
    if (chosenResume === null && progress && set && progress.totalCards === set.cards.length) {
      ui.showStudyResumeDialog({
        set,
        progress,
        onResume: () => {
          this._launchStudyController(setId, true);
        },
        onRestart: () => {
          store.clearStudyProgress(setId);
          this._launchStudyController(setId, false);
        },
        onCancel: () => {
          window.location.hash = `#/set/${setId}`;
        }
      });
      return;
    }

    this._launchStudyController(setId, Boolean(chosenResume));
  }

  _launchStudyController(setId, resume) {
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

    this.studyController.start(setId, { resume });
  }

  _openReimportSet(setId) {
    const currentSet = store.getSet(setId);
    if (!currentSet) {
      ui.showSnackbar('Bộ thẻ không tồn tại / Deck not found');
      return;
    }

    ui.openReimportSheet({
      currentSet,
      onReimported: (newParsedSet) => {
        try {
          currentSet.cards = newParsedSet.cards || [];
          if (newParsedSet.title && newParsedSet.title !== 'Untitled' && newParsedSet.title !== 'Pasted-Deck' && newParsedSet.title !== 'Reimported-Deck') {
            currentSet.title = newParsedSet.title;
          }
          currentSet.updatedAt = Date.now();

          clearRenderCache();
          store.saveSet(currentSet);

          ui.showSnackbar(t('toast_reimported', { count: currentSet.cards.length }));

          if (this.currentRoute.path === 'set' && this.currentRoute.param === setId) {
            this.renderSetDetail(setId);
          } else if (this.currentRoute.path === 'library') {
            this.renderLibrary();
          }
        } catch (err) {
          if (err.name === 'QuotaExceededError') {
            ui.showSnackbar(t('toast_quota_error'));
          } else {
            ui.showSnackbar(`Lỗi cập nhật bộ thẻ: ${err.message}`);
          }
        }
      }
    });
  }

  _openEditMarkdown(setId) {
    const set = store.getSet(setId);
    if (!set) return;

    ui.showEditMarkdownDialog({
      set,
      onSave: (parsedSet) => {
        try {
          set.title = parsedSet.title;
          set.cards = parsedSet.cards;
          set.updatedAt = Date.now();
          store.saveSet(set);
          ui.showSnackbar(t('toast_markdown_saved', { count: set.cards.length }));
          if (this.currentRoute.path === 'set' && this.currentRoute.param === setId) {
            this.renderSetDetail(setId);
          } else if (this.currentRoute.path === 'library') {
            this.renderLibrary();
          }
        } catch (err) {
          if (err.name === 'QuotaExceededError') {
            ui.showSnackbar(t('toast_quota_error'));
          } else {
            ui.showSnackbar(`Lỗi lưu bộ thẻ: ${err.message}`);
          }
        }
      }
    });
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

export { App };
