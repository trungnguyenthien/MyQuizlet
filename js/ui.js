/**
 * MyQuizlet - UI Components
 * Material Design 3 modals, bottom sheet, snackbar system, preview dialog,
 * format help dialog, storage monitor, and ripple effects.
 */

import { t } from './i18n.js';
import { parseMarkdownSet } from './parser.js';
import { serializeSet } from './serializer.js';
import { renderInlineQuestionHTML, renderCardFaceHTML } from './render.js';
import { store } from './store.js';

class UIManager {
  constructor() {
    this.snackbarTimeout = null;
    this._initDomContainers();
  }

  _initDomContainers() {
    // Ensure snackbar container exists
    if (!document.getElementById('snackbar-container')) {
      const container = document.createElement('div');
      container.id = 'snackbar-container';
      container.className = 'snackbar-container';
      document.body.appendChild(container);
    }
  }

  /**
   * Show a Material 3 snackbar notification with optional action button
   * @param {string} message 
   * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [options]
   */
  showSnackbar(message, { actionLabel, onAction, duration = 4000 } = {}) {
    const container = document.getElementById('snackbar-container');
    if (!container) return;

    // Remove existing snackbars
    container.innerHTML = '';
    if (this.snackbarTimeout) {
      clearTimeout(this.snackbarTimeout);
      this.snackbarTimeout = null;
    }

    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar';
    snackbar.setAttribute('role', 'status');

    const textSpan = document.createElement('span');
    textSpan.className = 'snackbar-text';
    textSpan.textContent = message;
    snackbar.appendChild(textSpan);

    if (actionLabel && onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'snackbar-action';
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener('click', () => {
        try {
          onAction();
        } finally {
          this.dismissSnackbar();
        }
      });
      snackbar.appendChild(actionBtn);
    }

    container.appendChild(snackbar);

    // Trigger enter animation
    requestAnimationFrame(() => {
      snackbar.classList.add('is-visible');
    });

    if (duration > 0) {
      this.snackbarTimeout = setTimeout(() => {
        this.dismissSnackbar();
      }, duration);
    }
  }

  dismissSnackbar() {
    const container = document.getElementById('snackbar-container');
    if (!container || !container.firstElementChild) return;
    const snackbar = container.firstElementChild;
    snackbar.classList.remove('is-visible');
    setTimeout(() => {
      if (snackbar.parentNode === container) {
        container.removeChild(snackbar);
      }
    }, 250);
  }

  /**
   * Generic confirm dialog modal
   * @param {{
   *   title: string,
   *   message: string,
   *   confirmText?: string,
   *   cancelText?: string,
   *   isDestructive?: boolean
   * }} options
   * @returns {Promise<boolean>}
   */
  showConfirmDialog({ title, message, confirmText = t('confirm'), cancelText = t('cancel'), isDestructive = false }) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'modal-dialog';

      dialog.innerHTML = `
        <div class="dialog-content">
          <h2 class="dialog-title">${title}</h2>
          <p class="dialog-body">${message}</p>
          <div class="dialog-actions">
            <button type="button" class="btn btn-text" id="dlg-cancel">${cancelText}</button>
            <button type="button" class="btn ${isDestructive ? 'btn-danger' : 'btn-primary'}" id="dlg-confirm">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);
      dialog.showModal();

      const cleanup = (result) => {
        dialog.close();
        document.body.removeChild(dialog);
        resolve(result);
      };

      dialog.querySelector('#dlg-cancel').addEventListener('click', () => cleanup(false));
      dialog.querySelector('#dlg-confirm').addEventListener('click', () => cleanup(true));
      dialog.addEventListener('cancel', () => cleanup(false));
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) cleanup(false);
      });
    });
  }

  /**
   * Open the Create / Import Bottom Sheet
   * @param {{
   *   onImportConfirmed: (parsedSet: any, mode: 'new' | 'replace' | 'duplicate') => void,
   *   onCreateEmpty: (title: string) => void
   * }} callbacks 
   */
  openImportSheet({ onImportConfirmed, onCreateEmpty }) {
    // Remove any existing sheet
    const existing = document.getElementById('import-bottom-sheet');
    if (existing) document.body.removeChild(existing);

    const sheet = document.createElement('div');
    sheet.id = 'import-bottom-sheet';
    sheet.className = 'bottom-sheet-backdrop';

    sheet.innerHTML = `
      <div class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-heading">
        <div class="sheet-handle-bar">
          <div class="sheet-handle"></div>
        </div>

        <div class="sheet-header">
          <h2 id="sheet-heading" class="sheet-title">${t('sheet_title')}</h2>
          <button type="button" class="icon-btn" id="sheet-close-btn" aria-label="${t('close')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="sheet-tabs" role="tablist">
          <button type="button" class="tab-btn is-active" id="tab-file" role="tab" aria-selected="true">${t('sheet_tab_file')}</button>
          <button type="button" class="tab-btn" id="tab-paste" role="tab" aria-selected="false">${t('sheet_tab_paste')}</button>
          <button type="button" class="tab-btn" id="tab-empty" role="tab" aria-selected="false">${t('sheet_tab_empty')}</button>
        </div>

        <div class="sheet-body">
          <!-- File Tab Panel -->
          <div class="tab-panel is-active" id="panel-file">
            <div class="file-dropzone" id="file-dropzone">
              <svg class="dropzone-icon" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
              </svg>
              <p class="dropzone-text">${t('drop_files_here')}</p>
              <label class="btn btn-primary" for="file-input-control">
                ${t('browse_files_btn')}
              </label>
              <input type="file" id="file-input-control" accept=".md,.markdown,.txt" multiple class="sr-only" />
            </div>
          </div>

          <!-- Paste Tab Panel -->
          <div class="tab-panel hidden" id="panel-paste">
            <div class="paste-form">
              <textarea id="paste-textarea" class="paste-input" rows="8" placeholder="${t('paste_textarea_placeholder')}"></textarea>
              <div class="paste-footer">
                <span class="live-counter" id="live-card-counter">${t('live_card_count_zero')}</span>
                <button type="button" class="btn btn-primary" id="btn-preview-paste" disabled>${t('preview_btn')}</button>
              </div>
            </div>
          </div>

          <!-- Empty Set Tab Panel -->
          <div class="tab-panel hidden" id="panel-empty">
            <form id="form-empty-set" class="empty-set-form">
              <label class="form-label" for="empty-set-title-input">${t('new_empty_title_label')}</label>
              <input type="text" id="empty-set-title-input" class="text-input" placeholder="${t('new_empty_title_placeholder')}" maxlength="120" required />
              <button type="submit" class="btn btn-primary btn-block">${t('create_empty_btn')}</button>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(sheet);

    // Animate open
    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
    });

    const closeSheet = () => {
      sheet.classList.remove('is-open');
      setTimeout(() => {
        if (sheet.parentNode === document.body) {
          document.body.removeChild(sheet);
        }
      }, 300);
    };

    // Close handlers
    sheet.querySelector('#sheet-close-btn').addEventListener('click', closeSheet);
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) closeSheet();
    });

    // Tab switching
    const tabs = [
      { btn: sheet.querySelector('#tab-file'), panel: sheet.querySelector('#panel-file') },
      { btn: sheet.querySelector('#tab-paste'), panel: sheet.querySelector('#panel-paste') },
      { btn: sheet.querySelector('#tab-empty'), panel: sheet.querySelector('#panel-empty') }
    ];

    tabs.forEach(({ btn, panel }) => {
      btn.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.btn.classList.remove('is-active');
          t.btn.setAttribute('aria-selected', 'false');
          t.panel.classList.add('hidden');
          t.panel.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
        panel.classList.remove('hidden');
        panel.classList.add('is-active');
      });
    });

    // File Drop & Pick handling
    const fileInput = sheet.querySelector('#file-input-control');
    const dropzone = sheet.querySelector('#file-dropzone');

    const handleFiles = async (fileList) => {
      if (!fileList || fileList.length === 0) return;
      closeSheet();

      for (const file of Array.from(fileList)) {
        if (file.size > 5 * 1024 * 1024) {
          this.showSnackbar(`File "${file.name}" vượt quá giới hạn 5 MB / File exceeds 5 MB`);
          continue;
        }

        try {
          const text = await file.text();
          const { set, warnings } = parseMarkdownSet(text, file.name);

          if (!set.cards || set.cards.length === 0) {
            this.showSnackbar(`Không tìm thấy thẻ nào trong "${file.name}" / No cards found in file`);
            continue;
          }

          // Open Preview Dialog
          this.showPreviewDialog({
            parsedSet: set,
            warnings,
            onConfirmed: (finalSet, mode) => {
              if (onImportConfirmed) onImportConfirmed(finalSet, mode);
            }
          });
        } catch (err) {
          console.error('[MyQuizlet] File parse error:', err);
          this.showSnackbar(`Lỗi đọc file "${file.name}": ${err.message}`);
        }
      }
    };

    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      handleFiles(e.dataTransfer.files);
    });

    // Paste Text handling (debounced 250ms)
    const pasteInput = sheet.querySelector('#paste-textarea');
    const liveCounter = sheet.querySelector('#live-card-counter');
    const previewBtn = sheet.querySelector('#btn-preview-paste');
    let pasteDebounce = null;
    let latestParsed = null;

    pasteInput.addEventListener('input', () => {
      if (pasteDebounce) clearTimeout(pasteDebounce);
      pasteDebounce = setTimeout(() => {
        const text = pasteInput.value.trim();
        if (!text) {
          liveCounter.textContent = t('live_card_count_zero');
          previewBtn.disabled = true;
          latestParsed = null;
          return;
        }

        try {
          const res = parseMarkdownSet(text, 'Pasted-Deck');
          latestParsed = res;
          const count = res.set.cards.length;
          if (count > 0) {
            liveCounter.textContent = t('live_card_count', { count });
            previewBtn.disabled = false;
          } else {
            liveCounter.textContent = t('live_card_count_zero');
            previewBtn.disabled = true;
          }
        } catch {
          liveCounter.textContent = t('live_card_count_zero');
          previewBtn.disabled = true;
          latestParsed = null;
        }
      }, 250);
    });

    previewBtn.addEventListener('click', () => {
      if (!latestParsed || !latestParsed.set.cards.length) return;
      closeSheet();
      this.showPreviewDialog({
        parsedSet: latestParsed.set,
        warnings: latestParsed.warnings,
        onConfirmed: (finalSet, mode) => {
          if (onImportConfirmed) onImportConfirmed(finalSet, mode);
        }
      });
    });

    // Empty Set submission
    const emptyForm = sheet.querySelector('#form-empty-set');
    emptyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = sheet.querySelector('#empty-set-title-input');
      const title = (titleInput.value || '').trim();
      if (!title) return;
      closeSheet();
      if (onCreateEmpty) onCreateEmpty(title);
    });
  }

  /**
   * Open the Re-import Bottom Sheet for an existing deck
   * @param {{
   *   currentSet: any,
   *   onReimported: (parsedSet: any) => void
   * }} options
   */
  openReimportSheet({ currentSet, onReimported }) {
    const existing = document.getElementById('reimport-bottom-sheet');
    if (existing) document.body.removeChild(existing);

    const sheet = document.createElement('div');
    sheet.id = 'reimport-bottom-sheet';
    sheet.className = 'bottom-sheet-backdrop';

    sheet.innerHTML = `
      <div class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="reimport-heading">
        <div class="sheet-handle-bar">
          <div class="sheet-handle"></div>
        </div>

        <div class="sheet-header">
          <div>
            <h2 id="reimport-heading" class="sheet-title">${t('reimport_sheet_title')}</h2>
            <p class="sheet-subtitle">${t('reimport_sheet_desc')}</p>
          </div>
          <button type="button" class="icon-btn" id="reimport-close-btn" aria-label="${t('close')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="sheet-tabs" role="tablist">
          <button type="button" class="tab-btn is-active" id="reimport-tab-file" role="tab" aria-selected="true">${t('sheet_tab_file')}</button>
          <button type="button" class="tab-btn" id="reimport-tab-paste" role="tab" aria-selected="false">${t('sheet_tab_paste')}</button>
        </div>

        <div class="sheet-body">
          <!-- File Tab Panel -->
          <div class="tab-panel is-active" id="reimport-panel-file">
            <div class="file-dropzone" id="reimport-file-dropzone">
              <svg class="dropzone-icon" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
              </svg>
              <p class="dropzone-text">${t('drop_files_here')}</p>
              <label class="btn btn-primary" for="reimport-file-input-control">
                ${t('browse_files_btn')}
              </label>
              <input type="file" id="reimport-file-input-control" accept=".md,.markdown,.txt" class="sr-only" />
            </div>
          </div>

          <!-- Paste Tab Panel -->
          <div class="tab-panel hidden" id="reimport-panel-paste">
            <div class="paste-form">
              <div class="paste-top-bar" style="display:flex; justify-content:flex-end; margin-bottom:8px;">
                <button type="button" class="btn btn-tonal btn-sm" id="btn-reimport-load-current" style="font-size:0.85rem; padding:4px 12px; min-height:34px;">
                  <svg class="icon-sm" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  <span>${t('reimport_load_current')}</span>
                </button>
              </div>
              <textarea id="reimport-paste-textarea" class="paste-input" rows="8" placeholder="${t('paste_textarea_placeholder')}"></textarea>
              <div class="paste-footer">
                <span class="live-counter" id="reimport-live-card-counter">${t('live_card_count_zero')}</span>
                <button type="button" class="btn btn-primary" id="btn-reimport-preview-paste" disabled>${t('preview_btn')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(sheet);

    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
    });

    const closeSheet = () => {
      sheet.classList.remove('is-open');
      setTimeout(() => {
        if (sheet.parentNode === document.body) {
          document.body.removeChild(sheet);
        }
      }, 300);
    };

    sheet.querySelector('#reimport-close-btn').addEventListener('click', closeSheet);
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) closeSheet();
    });

    // Tab switching
    const tabs = [
      { btn: sheet.querySelector('#reimport-tab-file'), panel: sheet.querySelector('#reimport-panel-file') },
      { btn: sheet.querySelector('#reimport-tab-paste'), panel: sheet.querySelector('#reimport-panel-paste') }
    ];

    tabs.forEach(({ btn, panel }) => {
      btn.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.btn.classList.remove('is-active');
          t.btn.setAttribute('aria-selected', 'false');
          t.panel.classList.add('hidden');
          t.panel.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
        panel.classList.remove('hidden');
        panel.classList.add('is-active');
      });
    });

    const fileInput = sheet.querySelector('#reimport-file-input-control');
    const dropzone = sheet.querySelector('#reimport-file-dropzone');

    const handleFile = async (file) => {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        this.showSnackbar(`File "${file.name}" vượt quá giới hạn 5 MB / File exceeds 5 MB`);
        return;
      }

      try {
        const text = await file.text();
        const { set, warnings } = parseMarkdownSet(text, file.name);

        if (!set.cards || set.cards.length === 0) {
          this.showSnackbar(`Không tìm thấy thẻ nào trong "${file.name}" / No cards found in file`);
          return;
        }

        closeSheet();
        this.showReimportPreviewDialog({
          currentSet,
          parsedSet: set,
          warnings,
          onConfirmed: (finalSet) => {
            if (onReimported) onReimported(finalSet);
          }
        });
      } catch (err) {
        this.showSnackbar(`Lỗi đọc file: ${err.message}`);
      }
    };

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    // Paste handling
    const pasteInput = sheet.querySelector('#reimport-paste-textarea');
    const liveCounter = sheet.querySelector('#reimport-live-card-counter');
    const previewBtn = sheet.querySelector('#btn-reimport-preview-paste');
    const loadCurrentBtn = sheet.querySelector('#btn-reimport-load-current');
    let pasteDebounce = null;
    let latestParsed = null;

    loadCurrentBtn.addEventListener('click', () => {
      pasteInput.value = serializeSet(currentSet);
      pasteInput.dispatchEvent(new Event('input'));
    });

    pasteInput.addEventListener('input', () => {
      if (pasteDebounce) clearTimeout(pasteDebounce);
      pasteDebounce = setTimeout(() => {
        const text = pasteInput.value.trim();
        if (!text) {
          liveCounter.textContent = t('live_card_count_zero');
          previewBtn.disabled = true;
          latestParsed = null;
          return;
        }

        try {
          const res = parseMarkdownSet(text, currentSet.title || 'Reimported-Deck');
          latestParsed = res;
          const count = res.set.cards.length;
          if (count > 0) {
            liveCounter.textContent = t('live_card_count', { count });
            previewBtn.disabled = false;
          } else {
            liveCounter.textContent = t('live_card_count_zero');
            previewBtn.disabled = true;
          }
        } catch {
          liveCounter.textContent = t('live_card_count_zero');
          previewBtn.disabled = true;
          latestParsed = null;
        }
      }, 250);
    });

    previewBtn.addEventListener('click', () => {
      if (!latestParsed || !latestParsed.set.cards.length) return;
      closeSheet();
      this.showReimportPreviewDialog({
        currentSet,
        parsedSet: latestParsed.set,
        warnings: latestParsed.warnings,
        onConfirmed: (finalSet) => {
          if (onReimported) onReimported(finalSet);
        }
      });
    });
  }

  /**
   * Show Re-import Preview Confirmation Dialog
   * @param {{
   *   currentSet: any,
   *   parsedSet: any,
   *   warnings: string[],
   *   onConfirmed: (finalSet: any) => void
   * }} options
   */
  showReimportPreviewDialog({ currentSet, parsedSet, warnings, onConfirmed }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog preview-dialog';

    const firstQuestions = parsedSet.cards.slice(0, 3);
    const questionsListHtml = firstQuestions
      .map((c, idx) => `<li><span class="preview-q-idx">${idx + 1}.</span> <span>${renderInlineQuestionHTML(c.q)}</span></li>`)
      .join('');

    const warningsHtml = warnings && warnings.length > 0
      ? `
        <div class="preview-warnings-box">
          <div class="warnings-header">⚠️ ${t('preview_warnings', { count: warnings.length })}</div>
          <ul class="warnings-list">
            ${warnings.map((w) => `<li>${w}</li>`).join('')}
          </ul>
        </div>
      `
      : '';

    const oldCount = currentSet.cards ? currentSet.cards.length : 0;
    const newCount = parsedSet.cards ? parsedSet.cards.length : 0;

    dialog.innerHTML = `
      <div class="dialog-content">
        <h2 class="dialog-title">${t('reimport_preview_title')}</h2>

        <div class="preview-field-group">
          <label class="form-label" for="reimport-title-input">${t('preview_deck_title')}</label>
          <input type="text" id="reimport-title-input" class="text-input" value="${(parsedSet.title || currentSet.title).replace(/"/g, '&quot;')}" maxlength="120" required />
        </div>

        <div class="preview-meta-row">
          <span class="preview-count-chip">${t('reimport_cards_diff', { oldCount, newCount })}</span>
        </div>

        <div class="preview-conflict-box" style="margin-top:4px;">
          <div class="conflict-title">⚠️ ${t('reimport_confirm_msg', { title: currentSet.title })}</div>
        </div>

        ${warningsHtml}

        <div class="preview-samples-box">
          <span class="preview-samples-label">${t('preview_sample_questions')}</span>
          <ul class="preview-samples-list">
            ${questionsListHtml}
          </ul>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-text" id="reimport-preview-cancel">${t('cancel')}</button>
          <button type="button" class="btn btn-primary" id="reimport-preview-confirm">${t('reimport_confirm_btn')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const cleanup = () => {
      dialog.close();
      if (dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector('#reimport-preview-cancel').addEventListener('click', cleanup);
    dialog.addEventListener('cancel', cleanup);

    dialog.querySelector('#reimport-preview-confirm').addEventListener('click', () => {
      const titleInput = dialog.querySelector('#reimport-title-input');
      const editedTitle = (titleInput.value || '').trim();
      if (editedTitle) {
        parsedSet.title = editedTitle;
      }
      cleanup();
      if (onConfirmed) onConfirmed(parsedSet);
    });
  }

  /**
   * Show Import Preview Dialog
   * @param {{
   *   parsedSet: any,
   *   warnings: string[],
   *   onConfirmed: (set: any, mode: 'new' | 'replace' | 'duplicate') => void
   * }} options
   */
  showPreviewDialog({ parsedSet, warnings, onConfirmed }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog preview-dialog';

    // Check if duplicate title exists in store
    const existingIndex = store.getIndex();
    const duplicate = existingIndex.find((item) => item.title.toLowerCase() === parsedSet.title.toLowerCase());

    const firstQuestions = parsedSet.cards.slice(0, 3);
    const questionsListHtml = firstQuestions
      .map((c, idx) => `<li><span class="preview-q-idx">${idx + 1}.</span> <span>${renderInlineQuestionHTML(c.q)}</span></li>`)
      .join('');

    const warningsHtml = warnings && warnings.length > 0
      ? `
        <div class="preview-warnings-box">
          <div class="warnings-header">⚠️ ${t('preview_warnings', { count: warnings.length })}</div>
          <ul class="warnings-list">
            ${warnings.map((w) => `<li>${w}</li>`).join('')}
          </ul>
        </div>
      `
      : '';

    const conflictHtml = duplicate
      ? `
        <div class="preview-conflict-box">
          <div class="conflict-title">⚠️ ${t('conflict_detected', { title: duplicate.title })}</div>
          <div class="conflict-options">
            <label class="conflict-option">
              <input type="radio" name="conflict-mode" value="duplicate" checked />
              <span>${t('conflict_keep_both')}</span>
            </label>
            <label class="conflict-option">
              <input type="radio" name="conflict-mode" value="replace" />
              <span>${t('conflict_replace')}</span>
            </label>
          </div>
        </div>
      `
      : '';

    dialog.innerHTML = `
      <div class="dialog-content">
        <h2 class="dialog-title">${t('preview_dialog_title')}</h2>
        
        <div class="preview-field-group">
          <label class="form-label" for="preview-title-input">${t('preview_deck_title')}</label>
          <input type="text" id="preview-title-input" class="text-input" value="${parsedSet.title.replace(/"/g, '&quot;')}" maxlength="120" required />
        </div>

        <div class="preview-meta-row">
          <span class="preview-count-chip">${t('preview_total_cards')} <strong>${parsedSet.cards.length}</strong></span>
        </div>

        ${warningsHtml}
        ${conflictHtml}

        <div class="preview-samples-box">
          <span class="preview-samples-label">${t('preview_sample_questions')}</span>
          <ul class="preview-samples-list">
            ${questionsListHtml}
          </ul>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-text" id="preview-btn-cancel">${t('cancel')}</button>
          <button type="button" class="btn btn-primary" id="preview-btn-confirm">${t('preview_confirm_import')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const cleanup = () => {
      dialog.close();
      if (dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector('#preview-btn-cancel').addEventListener('click', cleanup);
    dialog.addEventListener('cancel', cleanup);

    dialog.querySelector('#preview-btn-confirm').addEventListener('click', () => {
      const titleInput = dialog.querySelector('#preview-title-input');
      const editedTitle = (titleInput.value || '').trim() || 'Untitled';
      parsedSet.title = editedTitle;

      let mode = 'new';
      if (duplicate) {
        const selectedMode = dialog.querySelector('input[name="conflict-mode"]:checked');
        mode = selectedMode ? selectedMode.value : 'duplicate';
      }

      cleanup();
      if (onConfirmed) onConfirmed(parsedSet, mode);
    });
  }

  /**
   * Show Markdown Editor Dialog for an entire set
   * @param {{ set: any, onSave: (parsedSet: any) => void }} options
   */
  showEditMarkdownDialog({ set, onSave }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog edit-markdown-dialog';

    const currentMarkdown = serializeSet(set);

    dialog.innerHTML = `
      <div class="dialog-content edit-markdown-dialog-content">
        <div class="dialog-header-with-close">
          <h2 class="dialog-title">${t('edit_markdown_title')}</h2>
          <button type="button" class="icon-btn" id="edit-md-close-btn" aria-label="${t('close')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="edit-md-top-bar">
          <p class="edit-md-help-text">${t('edit_markdown_help')}</p>
          <button type="button" class="btn btn-tonal btn-sm edit-md-btn-clipboard" id="edit-md-btn-clipboard" title="${t('edit_markdown_replace_clipboard')}">
            <svg class="icon-sm" viewBox="0 0 24 24"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>
            <span>${t('edit_markdown_replace_clipboard')}</span>
          </button>
        </div>

        <div class="edit-md-editor-wrapper">
          <textarea id="edit-md-textarea" class="edit-md-textarea" spellcheck="false" placeholder="---\n# Tên bộ thẻ\n---\n## Câu hỏi 1\nĐáp án 1\n---"></textarea>
        </div>

        <div class="edit-md-toolbar">
          <div class="edit-md-status">
            <span class="preview-count-chip" id="edit-md-count-chip">${t('edit_markdown_cards_count', { count: set.cards ? set.cards.length : 0 })}</span>
          </div>
          <div class="edit-md-warnings hidden" id="edit-md-warnings"></div>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-text" id="edit-md-btn-cancel">${t('cancel')}</button>
          <button type="button" class="btn btn-primary" id="edit-md-btn-save">
            <svg class="icon-sm" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
            <span>${t('edit_markdown_save_btn')}</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const textarea = dialog.querySelector('#edit-md-textarea');
    textarea.value = currentMarkdown;

    const countChip = dialog.querySelector('#edit-md-count-chip');
    const warningsBox = dialog.querySelector('#edit-md-warnings');
    const saveBtn = dialog.querySelector('#edit-md-btn-save');
    const clipboardBtn = dialog.querySelector('#edit-md-btn-clipboard');

    let parseDebounce = null;

    const updateLiveValidation = () => {
      const text = textarea.value;
      try {
        const { set: parsed, warnings } = parseMarkdownSet(text, set.title || 'Untitled');
        countChip.textContent = t('edit_markdown_cards_count', { count: parsed.cards.length });
        countChip.classList.remove('chip-error');

        if (warnings && warnings.length > 0) {
          warningsBox.innerHTML = `
            <div class="warnings-header">⚠️ ${t('preview_warnings', { count: warnings.length })}</div>
            <ul class="warnings-list">${warnings.map((w) => `<li>${w}</li>`).join('')}</ul>
          `;
          warningsBox.classList.remove('hidden');
        } else {
          warningsBox.classList.add('hidden');
        }
      } catch (err) {
        countChip.textContent = `Lỗi: ${err.message}`;
        countChip.classList.add('chip-error');
        warningsBox.classList.add('hidden');
      }
    };

    textarea.addEventListener('input', () => {
      clearTimeout(parseDebounce);
      parseDebounce = setTimeout(updateLiveValidation, 200);
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        updateLiveValidation();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveBtn.click();
      }
    });

    if (clipboardBtn) {
      clipboardBtn.addEventListener('click', async () => {
        try {
          if (!navigator.clipboard || !navigator.clipboard.readText) {
            this.showSnackbar(t('toast_clipboard_not_supported'));
            return;
          }
          const text = await navigator.clipboard.readText();
          if (!text || text.trim() === '') {
            this.showSnackbar(t('toast_clipboard_empty'));
            return;
          }

          textarea.focus();
          textarea.select();
          let replaced = false;
          try {
            replaced = document.execCommand('insertText', false, text);
          } catch {
            replaced = false;
          }
          if (!replaced || textarea.value !== text) {
            textarea.value = text;
          }
          textarea.scrollTop = 0;
          textarea.selectionStart = 0;
          textarea.selectionEnd = 0;

          updateLiveValidation();
          this.showSnackbar(t('toast_clipboard_replaced'));
        } catch (err) {
          console.warn('Clipboard read error:', err);
          this.showSnackbar(t('toast_clipboard_error'));
        }
      });
    }

    // Run initial live validation
    updateLiveValidation();

    const cleanup = () => {
      clearTimeout(parseDebounce);
      dialog.close();
      if (dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector('#edit-md-close-btn').addEventListener('click', cleanup);
    dialog.querySelector('#edit-md-btn-cancel').addEventListener('click', cleanup);
    dialog.addEventListener('cancel', cleanup);

    saveBtn.addEventListener('click', () => {
      const text = textarea.value;
      try {
        const { set: parsed } = parseMarkdownSet(text, set.title || 'Untitled');
        cleanup();
        if (onSave) onSave(parsed);
      } catch (err) {
        this.showSnackbar(`Lỗi định dạng: ${err.message}`);
      }
    });

    // Auto focus textarea
    setTimeout(() => {
      textarea.focus();
    }, 100);
  }

  _escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Show Study Resume Options Dialog
   * @param {{ set: any, progress: any, onResume: Function, onRestart: Function, onCancel?: Function }} options
   */
  showStudyResumeDialog({ set, progress, onResume, onRestart, onCancel }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog study-resume-dialog';

    const seenCount = (progress.currentIndex || 0) + 1;
    const totalCount = progress.totalCards || (set.cards ? set.cards.length : 0);
    const progressPercent = totalCount > 0 ? Math.min(100, Math.max(0, Math.round((seenCount / totalCount) * 100))) : 0;

    dialog.innerHTML = `
      <div class="dialog-content study-resume-dialog-content">
        <div class="dialog-header-with-close">
          <h2 class="dialog-title">${t('study_resume_title')}</h2>
          <button type="button" class="icon-btn" id="resume-close-btn" aria-label="${t('close')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="resume-deck-banner">
          <div class="resume-deck-name">${this._escapeHTML(set.title || 'Untitled')}</div>
          <div class="resume-progress-info">
            <div class="resume-progress-stats">
              <span class="resume-stats-label">${t('study_resume_seen_label')}</span>
              <span class="resume-stats-val">${seenCount} / ${totalCount} (${progressPercent}%)</span>
            </div>
            <div class="resume-progress-track">
              <div class="resume-progress-bar" style="width: ${progressPercent}%;"></div>
            </div>
          </div>
        </div>

        <p class="dialog-body">${t('study_resume_desc')}</p>

        <div class="resume-options-list">
          <button type="button" class="btn btn-primary btn-block resume-btn-continue" id="resume-btn-continue">
            <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <span>${t('study_resume_continue_btn', { seen: seenCount, total: totalCount })}</span>
          </button>

          <button type="button" class="btn btn-tonal btn-block resume-btn-restart" id="resume-btn-restart">
            <svg class="icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            <span>${t('study_resume_restart_btn')}</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    let handled = false;
    const cleanup = () => {
      dialog.close();
      if (dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector('#resume-close-btn').addEventListener('click', () => {
      if (handled) return;
      handled = true;
      cleanup();
      if (onCancel) onCancel();
    });

    dialog.addEventListener('cancel', () => {
      if (handled) return;
      handled = true;
      cleanup();
      if (onCancel) onCancel();
    });

    dialog.querySelector('#resume-btn-continue').addEventListener('click', () => {
      if (handled) return;
      handled = true;
      cleanup();
      if (onResume) onResume();
    });

    dialog.querySelector('#resume-btn-restart').addEventListener('click', () => {
      if (handled) return;
      handled = true;
      cleanup();
      if (onRestart) onRestart();
    });
  }

  /**
   * Show Help Dialog (Markdown Specification Guide)
   */
  showHelpDialog() {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog help-dialog';

    dialog.innerHTML = `
      <div class="dialog-content">
        <div class="dialog-header-with-close">
          <h2 class="dialog-title">${t('help_dialog_title')}</h2>
          <button type="button" class="icon-btn" id="help-close-btn" aria-label="${t('close')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="help-scroll-body">
          <p class="help-intro">${t('help_dialog_intro')}</p>

          <pre class="help-code-sample"><code>${t('help_code_sample')}</code></pre>

          <ul class="help-rules-list">
            <li>📌 ${t('help_rule_1')}</li>
            <li>📌 ${t('help_rule_2')}</li>
            <li>📌 ${t('help_rule_3')}</li>
            <li>📌 ${t('help_rule_4')}</li>
            <li>📌 ${t('help_rule_5')}</li>
            <li>📌 ${t('help_rule_6')}</li>
          </ul>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-primary" id="help-btn-ok">${t('close')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const cleanup = () => {
      dialog.close();
      if (dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector('#help-close-btn').addEventListener('click', cleanup);
    dialog.querySelector('#help-btn-ok').addEventListener('click', cleanup);
    dialog.addEventListener('cancel', cleanup);
  }

  /**
   * Show Storage Usage Dialog
   */
  async showStorageDialog() {
    const est = await store.estimateStorage();
    const index = store.getIndex();
    let totalCards = 0;
    index.forEach((item) => {
      totalCards += item.count || 0;
    });

    const formatBytes = (bytes) => {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    };

    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog storage-dialog';

    dialog.innerHTML = `
      <div class="dialog-content">
        <h2 class="dialog-title">${t('storage_dialog_title')}</h2>
        
        <div class="storage-stats-grid">
          <div class="stat-card">
            <span class="stat-label">${t('storage_decks_count', { decks: index.length })}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">${t('storage_cards_count', { cards: totalCards })}</span>
          </div>
        </div>

        <div class="storage-usage-section">
          <div class="usage-label-row">
            <span>${t('storage_usage_label')}</span>
            <span><strong>${formatBytes(est.usage)}</strong> / ${formatBytes(est.quota)} (${est.percent}%)</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width: ${Math.min(est.percent, 100)}%;"></div>
          </div>
        </div>

        <div class="persist-section">
          <div class="persist-label-row">
            <span>${t('storage_persist_label')}</span>
            <span class="persist-badge ${est.isPersisted ? 'is-active' : ''}">
              ${est.isPersisted ? t('storage_persisted_yes') : t('storage_persisted_no')}
            </span>
          </div>
          ${
            !est.isPersisted
              ? `<button type="button" class="btn btn-tonal btn-block" id="btn-request-persist">${t('storage_request_persist')}</button>`
              : ''
          }
        </div>

        <p class="storage-note">💡 ${t('storage_note')}</p>

        <div class="dialog-actions">
          <button type="button" class="btn btn-primary" id="storage-btn-ok">${t('close')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const cleanup = () => {
      dialog.close();
      if (dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
      }
    };

    const persistBtn = dialog.querySelector('#btn-request-persist');
    if (persistBtn) {
      persistBtn.addEventListener('click', async () => {
        const persisted = await store.requestPersistentStorage();
        if (persisted) {
          this.showSnackbar('Đã kích hoạt lưu trữ bền vững thành công / Persistent storage enabled');
          cleanup();
        } else {
          this.showSnackbar('Trình duyệt chưa cho phép quyền lưu trữ bền vững / Persistence not granted');
        }
      });
    }

    dialog.querySelector('#storage-btn-ok').addEventListener('click', cleanup);
    dialog.addEventListener('cancel', cleanup);
  }

  /**
   * Show About Dialog
   */
  showAboutDialog() {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog about-dialog';

    dialog.innerHTML = `
      <div class="dialog-content text-center">
        <div class="about-logo-wrapper">
          <img src="icons/icon-192.png" alt="MyQuizlet" class="about-logo" />
        </div>
        <h2 class="dialog-title">MyQuizlet</h2>
        <div class="about-version-chip">${t('about_version')}</div>
        <p class="about-desc">${t('about_desc')}</p>
        <p class="about-features">${t('about_features')}</p>
        <div class="dialog-actions justify-center">
          <button type="button" class="btn btn-primary" id="about-btn-ok">${t('close')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const cleanup = () => {
      dialog.close();
      if (dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector('#about-btn-ok').addEventListener('click', cleanup);
    dialog.addEventListener('cancel', cleanup);
  }

  /**
   * Show Review Answer Modal
   * @param {{ card: { id: string, q: string, a: string }, index?: number, total?: number }} options
   */
  showReviewAnswerModal({ card, index, total }) {
    if (!card) return;

    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog review-answer-dialog';

    const aHtml = renderCardFaceHTML(card, 'a');
    const indexLabel = index != null ? `${t('question_label') || 'Câu hỏi'} ${index + 1}` : '';

    dialog.innerHTML = `
      <div class="dialog-content review-answer-modal-content">
        <div class="review-modal-header">
          <div class="review-modal-header-info">
            <div class="review-modal-title-row">
              <h2 class="dialog-title review-modal-title">${t('answer_label') || 'Câu trả lời'}</h2>
              ${indexLabel ? `<span class="review-modal-badge">${indexLabel}${total ? ` / ${total}` : ''}</span>` : ''}
            </div>
          </div>
          <button type="button" class="icon-btn" id="review-modal-x-btn" aria-label="${t('close')}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="review-modal-scroll-body markdown-body">
          ${aHtml}
        </div>

        <div class="review-speech-status" id="review-speech-status" role="status" aria-live="polite"></div>
        <div class="dialog-actions review-modal-actions">
          <button type="button" class="btn btn-tonal review-modal-btn-speech" id="review-modal-btn-speech-vn" aria-label="Speech VN" title="Phát âm tiếng Việt">
            <svg class="icon-sm speech-icon-speaker" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            <span class="speech-flag" aria-hidden="true">🇻🇳</span>
          </button>
          <button type="button" class="btn btn-primary review-modal-btn-close" id="review-modal-btn-close">
            <span>${t('close')}</span>
          </button>
          <button type="button" class="btn btn-tonal review-modal-btn-speech" id="review-modal-btn-speech-en" aria-label="Speech EN" title="Speak English">
            <svg class="icon-sm speech-icon-speaker" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            <span class="speech-flag" aria-hidden="true">🇺🇸</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    let currentSpeechLang = null;
    let speechTimer = null;
    let speechWatchdog = null;
    let currentSpeechSession = 0;
    const btnVn = dialog.querySelector('#review-modal-btn-speech-vn');
    const btnEn = dialog.querySelector('#review-modal-btn-speech-en');

    const updateSpeechBtns = () => {
      if (btnVn) {
        btnVn.classList.toggle('is-speaking', currentSpeechLang === 'vi-VN');
      }
      if (btnEn) {
        btnEn.classList.toggle('is-speaking', currentSpeechLang === 'en-US');
      }
    };

    const statusEl = dialog.querySelector('#review-speech-status');
    const setStatus = (msg, isError = false) => {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('is-error', Boolean(isError));
      statusEl.classList.toggle('is-visible', Boolean(msg));
    };

    const stopSpeech = () => {
      currentSpeechSession++;
      if (speechTimer) {
        clearTimeout(speechTimer);
        speechTimer = null;
      }
      if (speechWatchdog) {
        clearTimeout(speechWatchdog);
        speechWatchdog = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          // Only cancel when something is actually queued; an unnecessary cancel()
          // right before speak() silently drops the utterance on some Android builds.
          const synth = window.speechSynthesis;
          if (synth.speaking || synth.pending) {
            synth.cancel();
          }
        } catch (e) {}
      }
      if (typeof window !== 'undefined') {
        window._mqActiveUtterance = null;
      }
      currentSpeechLang = null;
      updateSpeechBtns();
    };

    const getAnswerText = () => {
      const scrollBody = dialog.querySelector('.review-modal-scroll-body');
      let rawText = '';
      if (scrollBody) {
        const clone = scrollBody.cloneNode(true);
        clone.querySelectorAll('button, svg, .copy-code-btn, script, style').forEach((el) => el.remove());
        clone.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, tr, br').forEach((el) => {
          el.insertAdjacentText('afterend', '\n');
        });
        rawText = (clone.textContent || clone.innerText || '').trim();
      }
      if (!rawText) {
        rawText = (card.a || '').trim();
      }
      return rawText;
    };

    // Text to Speech with auto segment detection and pause handling:
    // - Dấu phẩy (comma): ngắt 0.1s (100ms)
    // - Dấu chấm / hết câu (period, !, ?, ;, :): ngắt 0.3s (300ms)
    // - Dấu nháy "" (quote): ngắt 0.1s (100ms)
    const speak = (langCode) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        this.showSnackbar('Trình duyệt không hỗ trợ Speech Synthesis');
        return;
      }

      // If currently speaking this language, toggle off
      if (currentSpeechLang === langCode) {
        stopSpeech();
        setStatus('');
        return;
      }

      // Cancel ongoing synthesis speech before speaking
      stopSpeech();

      const text = getAnswerText();
      if (!text) {
        setStatus('Không có nội dung câu trả lời để phát âm.', true);
        return;
      }

      const segments = parseSpeechSegments(text);
      if (segments.length === 0) {
        setStatus('Không có nội dung câu trả lời để phát âm.', true);
        return;
      }

      const thisSession = ++currentSpeechSession;
      currentSpeechLang = langCode;
      updateSpeechBtns();

      // Voice selection: prioritize deeper male voices
      const langPrefix = langCode.split('-')[0].toLowerCase();
      const isMaleVoice = (v) => {
        const name = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
        // Positive male voice keywords
        if (/\b(male|man|guy|boy|nam|david|alex|daniel|george|james|reed|eddy|rocko|tom|oliver|ralph|fred|aaron|vic|minh)\b/i.test(name)) {
          return true;
        }
        // Exclude female voice keywords
        if (/\b(female|woman|girl|linh|samantha|kathy|zira|victoria|karen|susan|fiona|moira|tessa|flo|sandy|shelley|grandma)\b/i.test(name)) {
          return false;
        }
        return false;
      };

      const findVoice = (localOnly) => {
        try {
          const voices = window.speechSynthesis.getVoices() || [];
          const norm = (v) => (v.lang || '').toLowerCase().replace(/_/g, '-');
          const pool = voices.filter((v) => norm(v).startsWith(langPrefix) && (!localOnly || v.localService === true));
          
          // 1. Male voice with exact language match
          const exactMale = pool.find((v) => norm(v) === langCode.toLowerCase() && isMaleVoice(v));
          if (exactMale) return exactMale;

          // 2. Any male voice with matching language prefix
          const anyMale = pool.find((v) => isMaleVoice(v));
          if (anyMale) return anyMale;

          // 3. Exact language match (avoiding obvious female names)
          const nonFemale = pool.find((v) => norm(v) === langCode.toLowerCase() && !/\b(female|woman|girl|linh|samantha|kathy|zira)\b/i.test(v.name));
          if (nonFemale) return nonFemale;

          return pool.find((v) => norm(v) === langCode.toLowerCase()) || pool[0] || null;
        } catch (err) {
          return null;
        }
      };

      let voiceCount = 0;
      try {
        const all = window.speechSynthesis.getVoices() || [];
        voiceCount = all.length;
        if (all.length > 0 && !findVoice(false)) {
          setStatus(langPrefix === 'vi'
            ? 'Thiết bị chưa có giọng đọc tiếng Việt. Hãy cài trong Cài đặt > Text-to-speech.'
            : 'Thiết bị chưa có giọng đọc cho ngôn ngữ này.', true);
        } else {
          setStatus(`Đang chuẩn bị đọc… (${voiceCount} giọng)`);
        }
      } catch (err) {}

      let currentIndex = 0;
      let reportedError = false;

      const fail = (code) => {
        if (reportedError) return;
        reportedError = true;
        stopSpeech();
        setStatus(`Không thể phát âm thanh: ${code || 'unknown'} (${voiceCount} giọng)`, true);
        this.showSnackbar(`Không thể phát âm thanh: ${code || 'unknown'}`);
      };

      // attempt 0: preferred male voice + deep pitch 0.82
      // attempt 1: lang only + deep pitch 0.82
      // attempt 2: no lang, no voice (engine default) + deep pitch 0.82
      const playSegment = (item, attempt) => {
        if (thisSession !== currentSpeechSession) return;

        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        } catch (e) {}

        const utterance = new SpeechSynthesisUtterance(item.text);
        utterance.rate = 0.9; // Slower for clarity, matching english-practise.html
        utterance.pitch = 0.82; // Hạ cao độ xuống mức trầm ấm (deep male tone)

        if (attempt === 0) {
          const voice = findVoice(true) || findVoice(false);
          if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
          } else {
            utterance.lang = langCode;
          }
        } else if (attempt === 1) {
          utterance.lang = langCode;
        }

        // Keep reference on window to prevent V8 garbage collection
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
          if (thisSession !== currentSpeechSession) return;
          if (attempt < 2) {
            setStatus(`Thử lại (cách ${attempt + 2}/3) do: ${code || 'unknown'}`);
            try { window.speechSynthesis.cancel(); } catch (e) {}
            speechTimer = setTimeout(() => playSegment(item, attempt + 1), 80);
          } else {
            fail(code);
          }
        };

        utterance.onstart = () => {
          started = true;
          clearWatchdog();
          setStatus(`Đang phát (cách ${attempt + 1}/3)…`);
        };

        utterance.onend = () => {
          if (settled) return;
          if (thisSession !== currentSpeechSession) return;
          if (!started) {
            // Ended without ever producing audio: silent failure
            retryOrFail('ended-without-audio');
            return;
          }
          settled = true;
          clearWatchdog();
          if (window._mqActiveUtterance === utterance) {
            window._mqActiveUtterance = null;
          }
          currentIndex++;
          if (currentIndex >= segments.length) {
            stopSpeech();
            setStatus('Đã đọc xong.');
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
          if (thisSession !== currentSpeechSession) return;
          const code = e && e.error;
          // User-initiated stop
          if (code === 'canceled' || code === 'interrupted') {
            if (!started && !settled) retryOrFail(code);
            return;
          }
          retryOrFail(code);
        };

        // Watchdog: utterance never started -> engine is silently stuck
        clearWatchdog();
        speechWatchdog = setTimeout(() => {
          if (!started) retryOrFail('no-audio-start');
        }, 3000);

        window.speechSynthesis.speak(utterance);
      };

      const playCurrent = () => {
        if (thisSession !== currentSpeechSession) return;
        if (currentIndex >= segments.length) {
          stopSpeech();
          return;
        }
        playSegment(segments[currentIndex], 0);
      };

      playCurrent();
    };

    if (btnVn) {
      btnVn.addEventListener('click', () => speak('vi-VN'));
    }

    if (btnEn) {
      btnEn.addEventListener('click', () => speak('en-US'));
    }

    const cleanup = () => {
      stopSpeech();
      dialog.close();
      if (dialog.parentNode === document.body) {
        document.body.removeChild(dialog);
      }
    };

    const xBtn = dialog.querySelector('#review-modal-x-btn');
    if (xBtn) xBtn.addEventListener('click', cleanup);

    const closeBtn = dialog.querySelector('#review-modal-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', cleanup);

    dialog.addEventListener('cancel', cleanup);

    // Close when tapping outside on backdrop
    dialog.addEventListener('click', (e) => {
      const rect = dialog.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) cleanup();
    });
  }
}

export const ui = new UIManager();

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
  let s = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');
  // Markdown links: [text](url) -> text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Clean markdown list bullets and numbering at start of lines
  s = s.replace(/^[\s*+-]+\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');

  // Normalize quotes: curly double quotes, guillemets -> "
  s = s.replace(/[\u201C\u201D\u00AB\u00BB\u201E\u201F]/g, '"');

  // Protect numbers, decimals, times from being split by punctuation
  s = s.replace(/(\d+)\.([0-9]+)/g, '$1___DOT___$2');
  s = s.replace(/(\d+),([0-9]+)/g, '$1___COMMA___$2');
  s = s.replace(/(\d+):([0-9]+)/g, '$1___COLON___$2');

  // Regex to split tokens by quote boundaries, periods/sentence-enders, and commas
  const pattern = /(")|([.!?;\n\u2026:]+)|([,，、]+)|(\s+-\s+)/g;
  let lastIndex = 0;
  let inQuote = false;
  const segments = [];
  let currentBuffer = '';

  function flushBuffer(pauseAfter = 0) {
    let clean = currentBuffer
      .replace(/___DOT___/g, '.')
      .replace(/___COMMA___/g, ',')
      .replace(/___COLON___/g, ':')
      .replace(/["“”]/g, '')
      .replace(/[`#*_~>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean) {
      segments.push({ text: clean, pauseAfter });
      currentBuffer = '';
      return true;
    }
    currentBuffer = '';
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
        segments[segments.length - 1].pauseAfter = Math.max(segments[segments.length - 1].pauseAfter, 300);
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

ui.parseSpeechSegments = parseSpeechSegments;

// Preload voices cache for Web Speech API
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        try { window.speechSynthesis.getVoices(); } catch (e) {}
      };
    }
  } catch (e) {
    // ignore
  }
}
