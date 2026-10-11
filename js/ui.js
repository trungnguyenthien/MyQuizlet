/**
 * MyQuizlet - UI Components
 * Material Design 3 modals, bottom sheet, snackbar system, preview dialog,
 * format help dialog, storage monitor, and ripple effects.
 */

import { t } from './i18n.js';
import { parseMarkdownSet } from './parser.js';
import { serializeSet } from './serializer.js';
import { renderInlineQuestionHTML } from './render.js';
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

        <p class="edit-md-help-text">${t('edit_markdown_help')}</p>

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
}

export const ui = new UIManager();
