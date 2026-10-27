(() => {
  // js/store.js
  var STORAGE_KEYS = {
    INDEX: "mq:v1:index",
    SET_PREFIX: "mq:v1:set:",
    PROGRESS_PREFIX: "mq:v1:progress:",
    PREFS: "mq:v1:prefs",
    SCHEMA: "mq:v1:schema"
  };
  var Store = class {
    constructor() {
      this.isMemoryOnly = false;
      this.memoryStore = /* @__PURE__ */ new Map();
      this.recentlyDeleted = null;
      this.listeners = /* @__PURE__ */ new Set();
      this._checkStorageAvailability();
    }
    /**
     * Test if localStorage is functional (handles private browsing / blocked storage)
     */
    _checkStorageAvailability() {
      try {
        if (typeof window === "undefined" || !window.localStorage) {
          this.isMemoryOnly = true;
          return;
        }
        const testKey = "__mq_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
        this.isMemoryOnly = false;
      } catch {
        this.isMemoryOnly = true;
        console.warn("[MyQuizlet] localStorage unavailable; falling back to in-memory store.");
      }
    }
    /**
     * Best-effort persistence request
     */
    async requestPersistentStorage() {
      if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
        try {
          const isPersisted = await navigator.storage.persist();
          return isPersisted;
        } catch (err) {
          console.warn("[MyQuizlet] navigator.storage.persist() error:", err);
        }
      }
      return false;
    }
    /**
     * Get storage usage estimate
     * @returns {Promise<{ quota: number, usage: number, percent: number, isPersisted: boolean }>}
     */
    async estimateStorage() {
      let quota = 0;
      let usage = 0;
      let isPersisted = false;
      if (typeof navigator !== "undefined" && navigator.storage) {
        try {
          if (navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            quota = est.quota || 0;
            usage = est.usage || 0;
          }
          if (navigator.storage.persisted) {
            isPersisted = await navigator.storage.persisted();
          }
        } catch (err) {
          console.warn("[MyQuizlet] storage.estimate error:", err);
        }
      }
      const percent = quota > 0 ? Math.round(usage / quota * 100) : 0;
      return { quota, usage, percent, isPersisted };
    }
    /**
     * Internal getter for raw string
     */
    _getItem(key) {
      if (this.isMemoryOnly) {
        return this.memoryStore.get(key) || null;
      }
      try {
        return window.localStorage.getItem(key);
      } catch {
        return this.memoryStore.get(key) || null;
      }
    }
    /**
     * Internal setter for raw string with QuotaExceeded error detection
     */
    _setItem(key, value) {
      if (this.isMemoryOnly) {
        this.memoryStore.set(key, value);
        return;
      }
      try {
        window.localStorage.setItem(key, value);
      } catch (err) {
        if (err.name === "QuotaExceededError" || err.code === 22 || err.code === 1014) {
          const quotaError = new Error("QUOTA_EXCEEDED");
          quotaError.name = "QuotaExceededError";
          throw quotaError;
        }
        this.memoryStore.set(key, value);
        throw err;
      }
    }
    /**
     * Internal remover
     */
    _removeItem(key) {
      if (this.isMemoryOnly) {
        this.memoryStore.delete(key);
        return;
      }
      try {
        window.localStorage.removeItem(key);
      } catch {
        this.memoryStore.delete(key);
      }
    }
    /**
     * Retrieve all set index items, sorted by lastStudiedAt desc, then updatedAt desc.
     * @returns {Array<{ id: string, title: string, count: number, allowAnswer: boolean, updatedAt: number, lastStudiedAt: number | null }>}
     */
    getIndex() {
      const raw = this._getItem(STORAGE_KEYS.INDEX);
      if (!raw) return [];
      try {
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return [];
        return list.sort((a, b) => {
          const aStudied = a.lastStudiedAt || 0;
          const bStudied = b.lastStudiedAt || 0;
          if (bStudied !== aStudied) return bStudied - aStudied;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      } catch (err) {
        console.error("[MyQuizlet] Corrupt index JSON, resetting index:", err);
        return [];
      }
    }
    /**
     * Save updated index array
     */
    _saveIndex(indexList) {
      this._setItem(STORAGE_KEYS.INDEX, JSON.stringify(indexList));
    }
    /**
     * Fetch full set by ID
     * @param {string} id 
     * @returns {{ id: string, title: string, allowAnswer: boolean, createdAt: number, updatedAt: number, lastStudiedAt: number | null, cards: Array<{ id: string, q: string, a: string }> } | null}
     */
    getSet(id) {
      if (!id) return null;
      const raw = this._getItem(STORAGE_KEYS.SET_PREFIX + id);
      if (!raw) return null;
      try {
        const set = JSON.parse(raw);
        return set;
      } catch (err) {
        console.error(`[MyQuizlet] Failed to parse set ${id}:`, err);
        return null;
      }
    }
    /**
     * Save a set (creates or updates) and automatically syncs the index item.
     * @param {{ id: string, title: string, allowAnswer?: boolean, createdAt?: number, updatedAt?: number, lastStudiedAt?: number | null, cards: Array<any> }} set 
     */
    saveSet(set) {
      if (!set || !set.id) throw new Error("Invalid set: ID is required");
      const now = Date.now();
      const setRecord = {
        id: set.id,
        title: (set.title || "Untitled").trim(),
        allowAnswer: set.allowAnswer !== false,
        createdAt: set.createdAt || now,
        updatedAt: now,
        lastStudiedAt: set.lastStudiedAt ?? null,
        cards: Array.isArray(set.cards) ? set.cards : []
      };
      this._setItem(STORAGE_KEYS.SET_PREFIX + setRecord.id, JSON.stringify(setRecord));
      const index = this.getIndex();
      const existingIdx = index.findIndex((item) => item.id === setRecord.id);
      const indexItem = {
        id: setRecord.id,
        title: setRecord.title,
        count: setRecord.cards.length,
        allowAnswer: setRecord.allowAnswer,
        updatedAt: setRecord.updatedAt,
        lastStudiedAt: setRecord.lastStudiedAt
      };
      if (existingIdx >= 0) {
        index[existingIdx] = indexItem;
      } else {
        index.unshift(indexItem);
      }
      this._saveIndex(index);
      this._notifyChange({ type: "save", set: setRecord });
      return setRecord;
    }
    /**
     * Soft-delete a set with 6-second undo window.
     * The set is immediately removed from index/storage, but cached in memory for undo.
     * @param {string} id 
     * @returns {{ set: any, cancelUndo: Function }}
     */
    deleteSet(id) {
      const set = this.getSet(id);
      if (!set) return null;
      this._removeItem(STORAGE_KEYS.SET_PREFIX + id);
      this.clearStudyProgress(id);
      const index = this.getIndex().filter((item) => item.id !== id);
      this._saveIndex(index);
      if (this.recentlyDeleted && this.recentlyDeleted.timer) {
        clearTimeout(this.recentlyDeleted.timer);
      }
      const timer = setTimeout(() => {
        this.recentlyDeleted = null;
      }, 6e3);
      this.recentlyDeleted = { set, timer };
      this._notifyChange({ type: "delete", id });
      return {
        set,
        cancelUndo: () => {
          if (this.recentlyDeleted) {
            clearTimeout(this.recentlyDeleted.timer);
            this.recentlyDeleted = null;
          }
        }
      };
    }
    /**
     * Undo recent deletion if within undo window.
     * @returns {any | null} Restored set
     */
    undoDelete() {
      if (!this.recentlyDeleted || !this.recentlyDeleted.set) return null;
      const set = this.recentlyDeleted.set;
      clearTimeout(this.recentlyDeleted.timer);
      this.recentlyDeleted = null;
      this.saveSet(set);
      this._notifyChange({ type: "undo", set });
      return set;
    }
    /**
     * Update lastStudiedAt timestamp for a set
     * @param {string} id 
     */
    touchLastStudied(id) {
      const set = this.getSet(id);
      if (!set) return;
      set.lastStudiedAt = Date.now();
      this.saveSet(set);
    }
    /**
     * Update allowAnswer flag
     * @param {string} id 
     * @param {boolean} allow 
     */
    setAllowAnswer(id, allow) {
      const set = this.getSet(id);
      if (!set) return null;
      set.allowAnswer = Boolean(allow);
      return this.saveSet(set);
    }
    /**
     * Rename a set
     * @param {string} id 
     * @param {string} newTitle 
     */
    renameSet(id, newTitle) {
      const trimmed = (newTitle || "").trim();
      if (!trimmed) throw new Error("Title cannot be empty");
      if (trimmed.length > 120) throw new Error("Title cannot exceed 120 characters");
      const set = this.getSet(id);
      if (!set) throw new Error("Set not found");
      set.title = trimmed;
      return this.saveSet(set);
    }
    /**
     * User preferences: language, first-run hint, etc.
     */
    getPrefs() {
      const raw = this._getItem(STORAGE_KEYS.PREFS);
      const defaults = {
        lang: "vi",
        hintSeen: false
      };
      if (!raw) return defaults;
      try {
        return { ...defaults, ...JSON.parse(raw) };
      } catch {
        return defaults;
      }
    }
    savePrefs(newPrefs) {
      const current = this.getPrefs();
      const updated = { ...current, ...newPrefs };
      this._setItem(STORAGE_KEYS.PREFS, JSON.stringify(updated));
      return updated;
    }
    /**
     * Get saved study progress for a set
     * @param {string} setId 
     * @returns {{ cardOrder: number[], currentIndex: number, totalCards: number, updatedAt: number } | null}
     */
    getStudyProgress(setId) {
      if (!setId) return null;
      const raw = this._getItem(STORAGE_KEYS.PROGRESS_PREFIX + setId);
      if (!raw) return null;
      try {
        const progress = JSON.parse(raw);
        if (!progress || !Array.isArray(progress.cardOrder) || typeof progress.currentIndex !== "number") {
          this.clearStudyProgress(setId);
          return null;
        }
        const set = this.getSet(setId);
        if (!set || !Array.isArray(set.cards) || set.cards.length === 0) {
          this.clearStudyProgress(setId);
          return null;
        }
        if (set.cards.length !== progress.totalCards || progress.cardOrder.length !== set.cards.length) {
          this.clearStudyProgress(setId);
          return null;
        }
        if (progress.currentIndex < 0 || progress.currentIndex >= progress.totalCards) {
          this.clearStudyProgress(setId);
          return null;
        }
        return progress;
      } catch (err) {
        console.warn(`[MyQuizlet] Failed to parse study progress for set ${setId}:`, err);
        this.clearStudyProgress(setId);
        return null;
      }
    }
    /**
     * Save study progress for a set
     * @param {string} setId 
     * @param {{ cardOrder: number[], currentIndex: number, totalCards: number, updatedAt?: number }} progress 
     */
    saveStudyProgress(setId, progress) {
      if (!setId || !progress) return;
      try {
        const record = {
          cardOrder: progress.cardOrder,
          currentIndex: progress.currentIndex,
          totalCards: progress.totalCards,
          updatedAt: progress.updatedAt || Date.now()
        };
        this._setItem(STORAGE_KEYS.PROGRESS_PREFIX + setId, JSON.stringify(record));
      } catch (err) {
        console.warn(`[MyQuizlet] Failed to save study progress for set ${setId}:`, err);
      }
    }
    /**
     * Clear study progress for a set
     * @param {string} setId 
     */
    clearStudyProgress(setId) {
      if (!setId) return;
      this._removeItem(STORAGE_KEYS.PROGRESS_PREFIX + setId);
    }
    /**
     * Change listener support
     */
    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    _notifyChange(event) {
      for (const fn of this.listeners) {
        try {
          fn(event);
        } catch (e) {
          console.error("[MyQuizlet] Subscriber error:", e);
        }
      }
    }
  };
  var store = new Store();

  // js/i18n.js
  var translations = {
    vi: {
      // App & Navigation
      app_title: "MyQuizlet",
      tagline: "B\u1ED9 th\u1EBB h\u1ECDc t\u1EADp Markdown offline",
      back: "Quay l\u1EA1i",
      menu: "Menu",
      settings: "C\xE0i \u0111\u1EB7t",
      language: "Ng\xF4n ng\u1EEF (Language)",
      storage: "Dung l\u01B0\u1EE3ng l\u01B0u tr\u1EEF",
      about: "Gi\u1EDBi thi\u1EC7u",
      help: "H\u01B0\u1EDBng d\u1EABn Markdown",
      close: "\u0110\xF3ng",
      cancel: "H\u1EE7y",
      confirm: "X\xE1c nh\u1EADn",
      save: "L\u01B0u",
      edit: "S\u1EEDa",
      delete: "X\xF3a",
      undo: "Ho\xE0n t\xE1c",
      reload: "T\u1EA3i l\u1EA1i",
      // Library Screen
      library_title: "B\u1ED9 th\u1EBB c\u1EE7a b\u1EA1n",
      search_decks: "T\xECm ki\u1EBFm b\u1ED9 th\u1EBB...",
      empty_library_title: "Ch\u01B0a c\xF3 b\u1ED9 th\u1EBB n\xE0o",
      empty_library_desc: "Nh\u1EADp t\u1EEB file Markdown ho\u1EB7c t\u1EA1o m\u1EDBi \u0111\u1EC3 b\u1EAFt \u0111\u1EA7u h\u1ECDc t\u1EADp ngay tr\xEAn thi\u1EBFt b\u1ECB c\u1EE7a b\u1EA1n.",
      import_cards_btn: "Nh\u1EADp b\u1ED9 th\u1EBB",
      create_deck_fab: "T\u1EA1o ho\u1EB7c nh\u1EADp b\u1ED9 th\u1EBB",
      deck_card_count: "{count} th\u1EBB",
      last_studied: "H\u1ECDc l\u1EA7n cu\u1ED1i: {time}",
      last_studied_never: "Ch\u01B0a h\u1ECDc",
      last_studied_just_now: "V\u1EEBa xong",
      last_studied_today: "H\xF4m nay",
      last_studied_yesterday: "H\xF4m qua",
      last_studied_days_ago: "{days} ng\xE0y tr\u01B0\u1EDBc",
      lock_badge_tooltip: "B\u1ED9 th\u1EBB \u0111ang kh\xF3a xem \u0111\xE1p \xE1n",
      // Deck actions
      action_study: "H\u1ECDc ngay",
      action_review: "Review",
      review_screen_title: "Review b\u1ED9 th\u1EBB",
      review_search_placeholder: "T\xECm ki\u1EBFm c\xE2u h\u1ECFi review...",
      review_empty_notice: "B\u1ED9 th\u1EBB ch\u01B0a c\xF3 c\xE2u h\u1ECFi n\xE0o \u0111\u1EC3 review.",
      review_empty_search: 'Kh\xF4ng t\xECm th\u1EA5y c\xE2u h\u1ECFi n\xE0o kh\u1EDBp v\u1EDBi "{query}".',
      review_hint: "Ch\u1EA1m v\xE0o c\xE2u h\u1ECFi \u0111\u1EC3 xem \u0111\xE1p \xE1n",
      question_label: "C\xE2u h\u1ECFi",
      answer_label: "C\xE2u tr\u1EA3 l\u1EDDi",
      view_answer_btn: "Xem \u0111\xE1p \xE1n",
      action_rename: "\u0110\u1ED5i t\xEAn",
      action_reimport: "Re-import",
      action_edit_markdown: "S\u1EEDa Markdown",
      action_toggle_answers: "Cho ph\xE9p xem \u0111\xE1p \xE1n",
      action_answers_allowed: "\u0110ang cho ph\xE9p xem \u0111\xE1p \xE1n",
      action_answers_hidden: "\u0110ang \u1EA9n \u0111\xE1p \xE1n",
      action_export: "Xu\u1EA5t file Markdown",
      action_delete: "X\xF3a b\u1ED9 th\u1EBB",
      // Re-import
      reimport_sheet_title: "Re-import: C\u1EADp nh\u1EADt b\u1ED9 th\u1EBB",
      reimport_sheet_desc: "Ch\u1ECDn file .md m\u1EDBi ho\u1EB7c d\xE1n n\u1ED9i dung \u0111\u1EC3 c\u1EADp nh\u1EADt l\u1EA1i to\xE0n b\u1ED9 th\u1EBB trong b\u1ED9 n\xE0y.",
      reimport_load_current: "N\u1EA1p Markdown hi\u1EC7n t\u1EA1i",
      reimport_preview_title: "X\xE1c nh\u1EADn Re-import",
      reimport_cards_diff: "S\u1ED1 th\u1EBB: {oldCount} th\u1EBB \u2794 {newCount} th\u1EBB",
      reimport_confirm_msg: 'Thao t\xE1c n\xE0y s\u1EBD ghi \u0111\xE8 v\xE0 c\u1EADp nh\u1EADt l\u1EA1i to\xE0n b\u1ED9 th\u1EBB trong "{title}".',
      reimport_confirm_btn: "C\u1EADp nh\u1EADt b\u1ED9 th\u1EBB",
      // Create / Import Bottom Sheet
      sheet_title: "T\u1EA1o ho\u1EB7c Nh\u1EADp b\u1ED9 th\u1EBB",
      sheet_tab_file: "T\u1EC7p Markdown (.md)",
      sheet_tab_paste: "D\xE1n v\u0103n b\u1EA3n",
      sheet_tab_empty: "T\u1EA1o b\u1ED9 th\u1EBB tr\u1ED1ng",
      drop_files_here: "K\xE9o th\u1EA3 file .md v\xE0o \u0111\xE2y ho\u1EB7c",
      browse_files_btn: "Ch\u1ECDn file t\u1EEB thi\u1EBFt b\u1ECB",
      paste_textarea_placeholder: "D\xE1n n\u1ED9i dung Markdown v\xE0o \u0111\xE2y...\n# T\xEAn b\u1ED9 th\u1EBB\n\n## C\xE2u h\u1ECFi 1\n\u0110\xE1p \xE1n 1\n\n## C\xE2u h\u1ECFi 2\n\u0110\xE1p \xE1n 2",
      live_card_count: "\u0110\xE3 t\xECm th\u1EA5y {count} th\u1EBB",
      live_card_count_zero: "Ch\u01B0a nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c th\u1EBB n\xE0o",
      new_empty_title_label: "Ti\xEAu \u0111\u1EC1 b\u1ED9 th\u1EBB:",
      new_empty_title_placeholder: "V\xED d\u1EE5: \xD4n t\u1EADp Thu\u1EADt to\xE1n",
      create_empty_btn: "T\u1EA1o b\u1ED9 th\u1EBB tr\u1ED1ng",
      preview_btn: "Xem tr\u01B0\u1EDBc",
      // Preview Dialog
      preview_dialog_title: "B\u1EA3n xem tr\u01B0\u1EDBc khi Import",
      preview_deck_title: "Ti\xEAu \u0111\u1EC1:",
      preview_total_cards: "S\u1ED1 l\u01B0\u1EE3ng th\u1EBB:",
      preview_warnings: "C\u1EA3nh b\xE1o ({count}):",
      preview_sample_questions: "3 c\xE2u h\u1ECFi \u0111\u1EA7u ti\xEAn:",
      preview_confirm_import: "Ti\u1EBFn h\xE0nh Import",
      conflict_detected: '\u0110\xE3 c\xF3 b\u1ED9 th\u1EBB tr\xF9ng t\xEAn "{title}". B\u1EA1n mu\u1ED1n:',
      conflict_keep_both: "Gi\u1EEF c\u1EA3 hai (th\xEAm s\u1ED1)",
      conflict_replace: "Thay th\u1EBF b\u1ED9 th\u1EBB c\u0169",
      // Set Detail Screen
      deck_detail_title: "Chi ti\u1EBFt b\u1ED9 th\u1EBB",
      rename_placeholder: "Nh\u1EADp t\xEAn b\u1ED9 th\u1EBB...",
      allow_answers_toggle: "Cho ph\xE9p xem \u0111\xE1p \xE1n khi h\u1ECDc",
      search_questions_placeholder: "T\xECm ki\u1EBFm c\xE2u h\u1ECFi trong b\u1ED9 th\u1EBB...",
      questions_count_label: "Hi\u1EC3n th\u1ECB {shown} / {total} c\xE2u h\u1ECFi",
      empty_deck_hint: "B\u1ED9 th\u1EBB n\xE0y hi\u1EC7n ch\u01B0a c\xF3 th\u1EBB n\xE0o. H\xE3y xu\u1EA5t file ho\u1EB7c d\xE1n Markdown \u0111\u1EC3 th\xEAm th\u1EBB.",
      empty_search_questions: 'Kh\xF4ng t\xECm th\u1EA5y c\xE2u h\u1ECFi n\xE0o ph\xF9 h\u1EE3p v\u1EDBi "{query}".',
      question_no_answer: "(Kh\xF4ng c\xF3 \u0111\xE1p \xE1n)",
      empty_answer_title: "Ch\u01B0a c\xF3 \u0111\xE1p \xE1n s\u1EB5n",
      empty_answer_desc: "Th\u1EBB n\xE0y ch\u1EC9 g\u1ED3m c\xE2u h\u1ECFi \u0111\u1EC3 b\u1EA1n t\u1EF1 ki\u1EC3m tra ho\u1EB7c g\u1EE3i nh\u1EDB ki\u1EBFn th\u1EE9c.",
      answer_hidden_in_detail: "(\u0110\xE1p \xE1n \u0111ang b\u1ECB \u1EA9n cho b\u1ED9 th\u1EBB n\xE0y)",
      // Study Screen
      study_seen_chip: "\u0110\xE3 xem {seen} / {total}",
      study_progress_label: "Ti\u1EBFn \u0111\u1ED9 h\u1ECDc",
      btn_flip: "L\u1EADt th\u1EBB",
      btn_flip_to_answer: "Xem \u0111\xE1p \xE1n",
      btn_flip_to_question: "Xem c\xE2u h\u1ECFi",
      btn_next: "Th\u1EBB ti\u1EBFp",
      btn_back: "Th\u1EBB tr\u01B0\u1EDBc",
      btn_shuffle_reset: "Tr\u1ED9n l\u1EA1i",
      study_hint_overlay: "Vu\u1ED1t tr\xE1i / ph\u1EA3i: \u0111\u1ED5i c\xE2u h\u1ECFi \xB7 Cu\u1ED9n d\u1ECDc: \u0111\u1ECDc n\u1ED9i dung d\xE0i",
      study_hint_tap: 'B\u1EA5m n\xFAt "Xem \u0111\xE1p \xE1n" ho\u1EB7c ch\u1EA1m th\u1EBB \u0111\u1EC3 l\u1EADt',
      single_card_hint: "B\u1ED9 th\u1EBB ch\u1EC9 c\xF3 1 th\u1EBB duy nh\u1EA5t",
      empty_deck_cannot_study: "B\u1ED9 th\u1EBB ch\u01B0a c\xF3 th\u1EBB n\xE0o \u0111\u1EC3 h\u1ECDc.",
      hidden_answer_shake_msg: "\u0110\xE1p \xE1n \u0111\xE3 b\u1ECB \u1EA9n cho b\u1ED9 th\u1EBB n\xE0y",
      cycle_complete_msg: "\u0110\xE3 h\u1ECDc xong 1 v\xF2ng! \u0110ang t\u1EF1 \u0111\u1ED9ng tr\u1ED9n l\u1EA1i b\u1ED9 th\u1EBB...",
      // Dialogs & Feedback
      delete_confirm_title: "X\xF3a b\u1ED9 th\u1EBB",
      delete_confirm_msg: 'B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n x\xF3a b\u1ED9 th\u1EBB "{title}"? B\u1EA1n s\u1EBD c\xF3 6 gi\xE2y \u0111\u1EC3 ho\xE0n t\xE1c.',
      delete_confirm_btn: "X\xF3a",
      toast_deleted: "\u0110\xE3 x\xF3a b\u1ED9 th\u1EBB \xB7 ",
      toast_undo_btn: "Ho\xE0n t\xE1c",
      toast_quota_error: "B\u1ED9 nh\u1EDB tr\xECnh duy\u1EC7t \u0111\xE3 \u0111\u1EA7y! H\xE3y xu\u1EA5t b\u1EDBt b\u1ED9 th\u1EBB ra Markdown v\xE0 x\xF3a b\u1EDBt.",
      toast_update_available: "C\xF3 b\u1EA3n c\u1EADp nh\u1EADt m\u1EDBi \xB7 ",
      toast_update_reload_btn: "T\u1EA3i l\u1EA1i ngay",
      toast_renamed: "\u0110\xE3 c\u1EADp nh\u1EADt t\xEAn b\u1ED9 th\u1EBB",
      toast_imported: "\u0110\xE3 nh\u1EADp th\xE0nh c\xF4ng {count} th\u1EBB",
      toast_exported: "\u0110\xE3 xu\u1EA5t file {fileName}",
      toast_reimported: "\u0110\xE3 c\u1EADp nh\u1EADt l\u1EA1i to\xE0n b\u1ED9 b\u1ED9 th\u1EBB ({count} th\u1EBB)",
      toast_markdown_saved: "\u0110\xE3 c\u1EADp nh\u1EADt b\u1ED9 th\u1EBB th\xE0nh c\xF4ng ({count} th\u1EBB)",
      toast_reshuffled: "\u0110\xE3 t\u1EA1o th\u1EE9 t\u1EF1 ng\u1EABu nhi\xEAn m\u1EDBi",
      // Edit Markdown Dialog
      edit_markdown_title: "S\u1EEDa Markdown b\u1ED9 th\u1EBB",
      edit_markdown_help: 'Ch\u1EC9nh s\u1EEDa to\xE0n b\u1ED9 n\u1ED9i dung Markdown c\u1EE7a b\u1ED9 th\u1EBB. D\xF2ng \u0111\u1EA7u "# Ti\xEAu \u0111\u1EC1", m\u1ED7i c\xE2u h\u1ECFi b\u1EAFt \u0111\u1EA7u b\u1EB1ng "## C\xE2u h\u1ECFi" v\xE0 ph\u1EA7n \u0111\xE1p \xE1n b\xEAn d\u01B0\u1EDBi.',
      edit_markdown_cards_count: "\u0110\xE3 nh\u1EADn di\u1EC7n: {count} th\u1EBB",
      edit_markdown_save_btn: "L\u01B0u thay \u0111\u1ED5i",
      edit_markdown_replace_clipboard: "Replace from clipboard",
      toast_clipboard_replaced: "\u0110\xE3 thay th\u1EBF n\u1ED9i dung t\u1EEB clipboard",
      toast_clipboard_empty: "Clipboard \u0111ang tr\u1ED1ng",
      toast_clipboard_error: "Kh\xF4ng th\u1EC3 \u0111\u1ECDc clipboard. Vui l\xF2ng c\u1EA5p quy\u1EC1n ho\u1EB7c d\xE1n th\u1EE7 c\xF4ng b\u1EB1ng Ctrl+V / Cmd+V",
      toast_clipboard_not_supported: "Tr\xECnh duy\u1EC7t kh\xF4ng h\u1ED7 tr\u1EE3 \u0111\u1ECDc clipboard t\u1EF1 \u0111\u1ED9ng. Vui l\xF2ng d\xE1n th\u1EE7 c\xF4ng b\u1EB1ng Ctrl+V / Cmd+V",
      // Study Resume Dialog
      study_resume_title: "Ti\u1EBFn tr\xECnh h\u1ECDc",
      study_resume_desc: "B\u1EA1n mu\u1ED1n ti\u1EBFp t\u1EE5c ti\u1EBFn tr\xECnh h\u1ECDc tr\u01B0\u1EDBc \u0111\xF3 hay b\u1EAFt \u0111\u1EA7u l\u1EA1i l\u01B0\u1EE3t h\u1ECDc m\u1EDBi?",
      study_resume_seen_label: "Ti\u1EBFn tr\xECnh:",
      study_resume_continue_btn: "Ti\u1EBFp t\u1EE5c ti\u1EBFn tr\xECnh c\u0169 {seen}/{total}",
      study_resume_restart_btn: "Start m\u1EDBi",
      // Help Dialog
      help_dialog_title: "H\u01B0\u1EDBng d\u1EABn \u0111\u1ECBnh d\u1EA1ng Markdown",
      help_dialog_intro: "MyQuizlet ph\xE2n t\xEDch file Markdown \u0111\u01A1n gi\u1EA3n th\xE0nh c\xE1c th\u1EBB h\u1ECDc:",
      help_code_sample: `# T\xEAn b\u1ED9 th\u1EBB

## C\xE2u h\u1ECFi 1 (vi\u1EBFt tr\xEAn m\u1ED9t d\xF2ng)
\u0110\xE1p \xE1n 1, h\u1ED7 tr\u1EE3 Markdown \u0111\u1EA7y \u0111\u1EE7, \u1EA3nh, b\u1EA3ng, tr\xEDch d\u1EABn.

\`\`\`swift
let message = "Xin ch\xE0o"
\`\`\`

## C\xE2u h\u1ECFi 2
- D\xF2ng \u0111\xE1p \xE1n th\u1EE9 nh\u1EA5t
- D\xF2ng \u0111\xE1p \xE1n th\u1EE9 hai`,
      help_rule_1: 'D\xF2ng "# ..." \u0111\u1EA7u ti\xEAn l\xE0 t\xEAn c\u1EE7a b\u1ED9 th\u1EBB.',
      help_rule_2: 'M\u1ED7i th\u1EBB b\u1EAFt \u0111\u1EA7u b\u1EB1ng "## " cho c\xE2u h\u1ECFi, theo sau l\xE0 ph\u1EA7n \u0111\xE1p \xE1n.',
      help_rule_3: 'M\u1ED7i ti\xEAu \u0111\u1EC1 "## " t\u1EF1 \u0111\u1ED9ng t\u1EA1o m\u1ED9t c\xE2u h\u1ECFi m\u1EDBi, kh\xF4ng c\u1EA7n d\xF9ng "---" \u0111\u1EC3 ph\xE2n c\xE1ch.',
      help_rule_4: 'Cho ph\xE9p th\u1EBB kh\xF4ng c\xF3 \u0111\xE1p \xE1n s\u1EB5n (ch\u1EC9 g\u1ED3m "## C\xE2u h\u1ECFi") \u0111\u1EC3 t\u1EF1 \xF4n t\u1EADp / v\u1EA5n \u0111\xE1p.',
      help_rule_5: '\u0110\u01B0\u1EDDng k\u1EBB ngang "---" ho\u1EB7c "***" b\xEAn trong n\u1ED9i dung \u0111\xE1p \xE1n hi\u1EC3n th\u1ECB b\xECnh th\u01B0\u1EDDng.',
      help_rule_6: 'Code block c\xF3 ch\u1EE9a "##" ho\u1EB7c "---" s\u1EBD kh\xF4ng b\u1ECB chia c\u1EAFt th\u1EBB.',
      // Storage Dialog
      storage_dialog_title: "Dung l\u01B0\u1EE3ng l\u01B0u tr\u1EEF",
      storage_persist_label: "Tr\u1EA1ng th\xE1i l\u01B0u tr\u1EEF b\u1EC1n v\u1EEFng:",
      storage_persisted_yes: "\u0110\xE3 k\xEDch ho\u1EA1t (An to\xE0n)",
      storage_persisted_no: "Ti\xEAu chu\u1EA9n (C\xF3 th\u1EC3 b\u1ECB d\u1ECDn d\u1EB9p n\u1EBFu \u1ED5 \u0111\u0129a \u0111\u1EA7y)",
      storage_request_persist: "K\xEDch ho\u1EA1t l\u01B0u tr\u1EEF b\u1EC1n v\u1EEFng",
      storage_usage_label: "B\u1ED9 nh\u1EDB \u0111ang s\u1EED d\u1EE5ng:",
      storage_decks_count: "T\u1ED5ng s\u1ED1 b\u1ED9 th\u1EBB: {decks}",
      storage_cards_count: "T\u1ED5ng s\u1ED1 th\u1EBB: {cards}",
      storage_note: "D\u1EEF li\u1EC7u \u0111\u01B0\u1EE3c l\u01B0u tr\u1EEF ho\xE0n to\xE0n c\u1EE5c b\u1ED9 tr\xEAn thi\u1EBFt b\u1ECB n\xE0y. H\xE3y \u0111\u1ECBnh k\u1EF3 xu\u1EA5t file Markdown \u0111\u1EC3 sao l\u01B0u.",
      // About Dialog
      about_dialog_title: "Gi\u1EDBi thi\u1EC7u MyQuizlet",
      about_desc: "MyQuizlet l\xE0 \u1EE9ng d\u1EE5ng PWA h\u1ECDc flashcard \u0111\u1ED9c l\u1EADp, kh\xF4ng c\u1EA7n t\xE0i kho\u1EA3n, ho\u1EA1t \u0111\u1ED9ng 100% offline v\xE0 kh\xF4ng g\u1EEDi d\u1EEF li\u1EC7u ra b\xEAn ngo\xE0i.",
      about_features: "T\u1ED1i \u01B0u cho Markdown, hi\u1EC3n th\u1ECB code block v\u1EDBi syntax highlighting phong c\xE1ch GitHub, h\u1ED7 tr\u1EE3 c\u1EED ch\u1EC9 vu\u1ED1t m\u01B0\u1EE3t m\xE0 60fps.",
      about_version: "Phi\xEAn b\u1EA3n 1.3.0 (Offline PWA)",
      // PWA Installation & iOS Modal
      install_btn: "C\xE0i \u0111\u1EB7t",
      install_btn_aria: "C\xE0i \u0111\u1EB7t \u1EE9ng d\u1EE5ng",
      app_installed_success: "C\xE0i \u0111\u1EB7t \u1EE9ng d\u1EE5ng th\xE0nh c\xF4ng!",
      ios_install_title: "C\xE0i \u0111\u1EB7t tr\xEAn iOS",
      ios_install_intro: "\u0110\u1EC3 c\xE0i \u0111\u1EB7t \u1EE9ng d\u1EE5ng l\xEAn iPhone ho\u1EB7c iPad:",
      ios_step_1: '1. Nh\u1EA5n n\xFAt <strong>Chia s\u1EBB (Share)</strong> <span aria-hidden="true">\u238B</span> \u1EDF thanh c\xF4ng c\u1EE5 d\u01B0\u1EDBi \u0111\xE1y Safari.',
      ios_step_2: '2. Cu\u1ED9n xu\u1ED1ng v\xE0 ch\u1ECDn <strong>Th\xEAm v\xE0o M\xE0n h\xECnh ch\xEDnh (Add to Home Screen)</strong> <span aria-hidden="true">\u2295</span>.',
      ios_step_3: "3. Nh\u1EA5n <strong>Th\xEAm (Add)</strong> \u1EDF g\xF3c tr\xEAn b\xEAn ph\u1EA3i \u0111\u1EC3 ho\xE0n t\u1EA5t.",
      ios_install_got_it: "\u0110\xE3 hi\u1EC3u"
    },
    en: {
      // App & Navigation
      app_title: "MyQuizlet",
      tagline: "Offline Markdown Flashcard App",
      back: "Back",
      menu: "Menu",
      settings: "Settings",
      language: "Language (Ng\xF4n ng\u1EEF)",
      storage: "Storage Usage",
      about: "About",
      help: "Markdown Guide",
      close: "Close",
      cancel: "Cancel",
      confirm: "Confirm",
      save: "Save",
      edit: "Edit",
      delete: "Delete",
      undo: "Undo",
      reload: "Reload",
      // Library Screen
      library_title: "Your Decks",
      search_decks: "Search decks...",
      empty_library_title: "No decks yet",
      empty_library_desc: "Import from a Markdown file or create a new deck to start studying locally on your device.",
      import_cards_btn: "Import Deck",
      create_deck_fab: "Create or import deck",
      deck_card_count: "{count} cards",
      last_studied: "Last studied: {time}",
      last_studied_never: "Never",
      last_studied_just_now: "Just now",
      last_studied_today: "Today",
      last_studied_yesterday: "Yesterday",
      last_studied_days_ago: "{days} days ago",
      lock_badge_tooltip: "Answers are hidden for this deck",
      // Deck actions
      action_study: "Study",
      action_review: "Review",
      review_screen_title: "Deck Review",
      review_search_placeholder: "Search review questions...",
      review_empty_notice: "No questions in this deck to review.",
      review_empty_search: 'No questions match "{query}".',
      review_hint: "Tap a question to view its answer",
      question_label: "Question",
      answer_label: "Answer",
      view_answer_btn: "View answer",
      action_rename: "Rename",
      action_reimport: "Re-import",
      action_edit_markdown: "Edit Markdown",
      action_toggle_answers: "Allow viewing answers",
      action_answers_allowed: "Answers visible",
      action_answers_hidden: "Answers hidden",
      action_export: "Export Markdown",
      action_delete: "Delete Deck",
      // Re-import
      reimport_sheet_title: "Re-import: Update Deck",
      reimport_sheet_desc: "Select a new .md file or paste Markdown to replace and update all cards in this deck.",
      reimport_load_current: "Load current Markdown",
      reimport_preview_title: "Confirm Re-import",
      reimport_cards_diff: "Cards: {oldCount} cards \u2794 {newCount} cards",
      reimport_confirm_msg: 'This will overwrite and update all cards in "{title}".',
      reimport_confirm_btn: "Update Deck",
      // Create / Import Bottom Sheet
      sheet_title: "Create or Import Deck",
      sheet_tab_file: "Markdown File (.md)",
      sheet_tab_paste: "Paste Text",
      sheet_tab_empty: "New Empty Deck",
      drop_files_here: "Drag and drop .md files here or",
      browse_files_btn: "Browse device files",
      paste_textarea_placeholder: "Paste Markdown notes here...\n# Deck Title\n\n## Question 1\nAnswer 1\n\n## Question 2\nAnswer 2",
      live_card_count: "{count} cards found",
      live_card_count_zero: "No cards detected",
      new_empty_title_label: "New deck title:",
      new_empty_title_placeholder: "e.g., Algorithms Interview Prep",
      create_empty_btn: "Create Empty Deck",
      preview_btn: "Preview",
      // Preview Dialog
      preview_dialog_title: "Import Preview",
      preview_deck_title: "Title:",
      preview_total_cards: "Card count:",
      preview_warnings: "Warnings ({count}):",
      preview_sample_questions: "First 3 questions:",
      preview_confirm_import: "Confirm Import",
      conflict_detected: 'A deck titled "{title}" already exists. Do you want to:',
      conflict_keep_both: "Keep both (append number)",
      conflict_replace: "Replace existing deck",
      // Set Detail Screen
      deck_detail_title: "Deck Details",
      rename_placeholder: "Enter deck title...",
      allow_answers_toggle: "Allow viewing answers while studying",
      search_questions_placeholder: "Search questions in deck...",
      questions_count_label: "Showing {shown} / {total} questions",
      empty_deck_hint: "This deck currently has no cards. Export or paste Markdown to add cards.",
      empty_search_questions: 'No questions match "{query}".',
      question_no_answer: "(No answer)",
      empty_answer_title: "No pre-existing answer",
      empty_answer_desc: "This is a prompt-only card for self-testing and active recall.",
      answer_hidden_in_detail: "(Answers are hidden for this deck)",
      // Study Screen
      study_seen_chip: "Seen {seen} / {total}",
      study_progress_label: "Study progress",
      btn_flip: "Flip",
      btn_flip_to_answer: "Show Answer",
      btn_flip_to_question: "Show Question",
      btn_next: "Next",
      btn_back: "Back",
      btn_shuffle_reset: "Shuffle Reset",
      study_hint_overlay: "Swipe left / right: change cards \xB7 Scroll vertically: read long content",
      study_hint_tap: 'Tap "Show Answer" or tap card to flip',
      single_card_hint: "Deck has only one card",
      empty_deck_cannot_study: "This deck has no cards to study.",
      hidden_answer_shake_msg: "Answers are hidden for this set",
      cycle_complete_msg: "Cycle complete! Reshuffling deck...",
      // Dialogs & Feedback
      delete_confirm_title: "Delete Deck",
      delete_confirm_msg: 'Are you sure you want to delete deck "{title}"? You will have 6 seconds to undo.',
      delete_confirm_btn: "Delete",
      toast_deleted: "Deck deleted \xB7 ",
      toast_undo_btn: "Undo",
      toast_quota_error: "Storage quota exceeded! Please export older decks and remove them.",
      toast_update_available: "Update available \xB7 ",
      toast_update_reload_btn: "Reload now",
      toast_renamed: "Deck title updated",
      toast_imported: "Successfully imported {count} cards",
      toast_exported: "Exported file {fileName}",
      toast_reimported: "Deck updated successfully ({count} cards)",
      toast_markdown_saved: "Deck updated successfully ({count} cards)",
      toast_reshuffled: "Deck order randomized",
      // Edit Markdown Dialog
      edit_markdown_title: "Edit Deck Markdown",
      edit_markdown_help: 'Edit the complete Markdown content of this deck. First line "# Title", each question starts with "## Question" followed by the answer below.',
      edit_markdown_cards_count: "Recognized: {count} cards",
      edit_markdown_save_btn: "Save Changes",
      edit_markdown_replace_clipboard: "Replace from clipboard",
      toast_clipboard_replaced: "Content replaced from clipboard",
      toast_clipboard_empty: "Clipboard is empty",
      toast_clipboard_error: "Unable to access clipboard. Please grant permission or paste manually with Ctrl+V / Cmd+V",
      toast_clipboard_not_supported: "Your browser does not support automatic clipboard reading. Please paste manually with Ctrl+V / Cmd+V",
      // Study Resume Dialog
      study_resume_title: "Study Progress",
      study_resume_desc: "Would you like to resume your previous study progress or start fresh?",
      study_resume_seen_label: "Progress:",
      study_resume_continue_btn: "Continue previous progress {seen}/{total}",
      study_resume_restart_btn: "Start new",
      // Help Dialog
      help_dialog_title: "Markdown Format Guide",
      help_dialog_intro: "MyQuizlet parses standard Markdown files into study decks:",
      help_code_sample: `# Deck Title

## Question 1 (single line)
Answer 1, full Markdown supported including tables and code:

\`\`\`swift
let greeting = "Hello"
\`\`\`

## Question 2
- First bullet point
- Second bullet point`,
      help_rule_1: 'The first "# ..." line is the deck title.',
      help_rule_2: 'Each card starts with a "## " question line, followed by the answer.',
      help_rule_3: 'Each "## " header automatically starts a new card; "---" is not required.',
      help_rule_4: 'Prompt-only cards with no answers (only "## Question") are fully supported.',
      help_rule_5: 'Horizontal rules "---" or "***" inside an answer render normally.',
      help_rule_6: 'Code blocks containing "##" or "---" will not be split into cards.',
      // Storage Dialog
      storage_dialog_title: "Storage Usage",
      storage_persist_label: "Persistent storage:",
      storage_persisted_yes: "Active (Safe from clearing)",
      storage_persisted_no: "Standard (May be cleared if disk is low)",
      storage_request_persist: "Enable persistent storage",
      storage_usage_label: "Storage used:",
      storage_decks_count: "Total decks: {decks}",
      storage_cards_count: "Total cards: {cards}",
      storage_note: "Data is stored strictly locally on this device. Export Markdown periodically to keep safe backups.",
      // About Dialog
      about_dialog_title: "About MyQuizlet",
      about_desc: "MyQuizlet is a standalone offline PWA flashcard app. No account required, 100% offline, with zero data sent off-device.",
      about_features: "Engineered for Markdown notes, syntax-highlighted code blocks with GitHub themes, and smooth 60fps swipe gestures.",
      about_version: "Version 1.3.0 (Offline PWA)",
      // PWA Installation & iOS Modal
      install_btn: "Install",
      install_btn_aria: "Install application",
      app_installed_success: "App installed successfully!",
      ios_install_title: "Install on iOS",
      ios_install_intro: "To install this app on iPhone or iPad:",
      ios_step_1: '1. Tap the <strong>Share</strong> button <span aria-hidden="true">\u238B</span> in the Safari toolbar.',
      ios_step_2: '2. Scroll down and tap <strong>Add to Home Screen</strong> <span aria-hidden="true">\u2295</span>.',
      ios_step_3: "3. Tap <strong>Add</strong> in the top-right corner to complete.",
      ios_install_got_it: "Got it"
    }
  };
  var I18n = class {
    constructor() {
      this.currentLang = "vi";
      this.listeners = /* @__PURE__ */ new Set();
    }
    init() {
      const prefs = store.getPrefs();
      this.currentLang = prefs.lang === "en" ? "en" : "vi";
      this._applyDocumentLang();
    }
    getLang() {
      return this.currentLang;
    }
    setLang(lang) {
      if (lang !== "vi" && lang !== "en") return;
      this.currentLang = lang;
      store.savePrefs({ lang });
      this._applyDocumentLang();
      this._notifyListeners();
    }
    toggleLang() {
      this.setLang(this.currentLang === "vi" ? "en" : "vi");
    }
    _applyDocumentLang() {
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.lang = this.currentLang;
      }
    }
    /**
     * Translate key with optional parameter substitution
     * @param {string} key 
     * @param {Record<string, any>} [params]
     * @returns {string}
     */
    t(key, params = {}) {
      const dict = translations[this.currentLang] || translations.vi;
      let str = dict[key] || translations.vi[key] || translations.en[key] || key;
      if (params && typeof params === "object") {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    }
    /**
     * Format relative timestamp
     * @param {number | null} timestamp 
     * @returns {string}
     */
    formatRelativeTime(timestamp) {
      if (!timestamp) return this.t("last_studied_never");
      const diffMs = Date.now() - timestamp;
      const diffSec = Math.floor(diffMs / 1e3);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);
      if (diffMin < 2) return this.t("last_studied_just_now");
      if (diffHours < 24) return this.t("last_studied_today");
      if (diffDays === 1) return this.t("last_studied_yesterday");
      return this.t("last_studied_days_ago", { days: diffDays });
    }
    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    _notifyListeners() {
      for (const fn of this.listeners) {
        try {
          fn(this.currentLang);
        } catch (e) {
          console.error("[MyQuizlet] i18n subscriber error:", e);
        }
      }
    }
  };
  var i18n = new I18n();
  var t = (key, params) => i18n.t(key, params);

  // js/parser.js
  function generateUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      try {
        return crypto.randomUUID();
      } catch {
      }
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  function trimBlankLines(str) {
    if (!str) return "";
    let result = str.replace(/^(?:[ \t]*\n)+/, "");
    result = result.replace(/(?:\n[ \t]*)+$/, "");
    if (/^\s*$/.test(result)) return "";
    return result;
  }
  function parseMarkdownSet(rawText, fileName = "Untitled") {
    if (typeof rawText !== "string") {
      throw new TypeError("Markdown input must be a string");
    }
    const byteLength = new Blob([rawText]).size;
    if (byteLength > 5 * 1024 * 1024) {
      throw new Error("Dung l\u01B0\u1EE3ng file v\u01B0\u1EE3t qu\xE1 gi\u1EDBi h\u1EA1n 5 MB / File exceeds 5 MB limit");
    }
    let text = rawText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const warnings = [];
    const lines = text.split("\n");
    let inFence = false;
    let fenceChar = "";
    let fenceLen = 0;
    const rawCards = [];
    let headerLines = [];
    let currentCard = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!inFence) {
        const fenceMatch = line.match(/^(`{3,}|~{3,})/);
        if (fenceMatch) {
          inFence = true;
          fenceChar = fenceMatch[1][0];
          fenceLen = fenceMatch[1].length;
        } else {
          const h2Match = line.match(/^##\s+(.+)$/);
          if (h2Match) {
            if (currentCard) {
              rawCards.push(currentCard);
            }
            currentCard = {
              question: h2Match[1].trim(),
              lines: []
            };
            continue;
          }
        }
      } else {
        const closeMatch = line.match(new RegExp(`^(\\${fenceChar}{${fenceLen},})\\s*$`));
        if (closeMatch) {
          inFence = false;
          fenceChar = "";
          fenceLen = 0;
        }
      }
      if (currentCard) {
        currentCard.lines.push(line);
      } else {
        headerLines.push(line);
      }
    }
    if (currentCard) {
      rawCards.push(currentCard);
    }
    let title = "";
    let headerNonTitleLines = [];
    for (let i = 0; i < headerLines.length; i++) {
      const hLine = headerLines[i];
      const titleMatch = hLine.match(/^#\s+(.+)$/);
      if (!title && titleMatch) {
        title = titleMatch[1].trim();
      } else {
        const trimmed = hLine.trim();
        if (trimmed && trimmed !== "---" && !trimmed.startsWith("#")) {
          headerNonTitleLines.push(trimmed);
        }
      }
    }
    if (headerNonTitleLines.length > 0) {
      const snippet = headerNonTitleLines.join(" ").slice(0, 35);
      warnings.push(`\u0110\xE3 b\u1ECF qua kh\u1ED1i kh\xF4ng c\xF3 c\xE2u h\u1ECFi (##): "${snippet}..." / Skipped block without question (##): "${snippet}..."`);
    }
    if (!title) {
      const baseName = fileName ? fileName.replace(/\.[^/.]+$/, "").trim() : "";
      title = baseName || "Untitled";
      warnings.push(`Thi\u1EBFu ti\xEAu \u0111\u1EC1 '# T\xEAn b\u1ED9 th\u1EBB' \u1EDF ph\u1EA7n \u0111\u1EA7u; \u0111\xE3 s\u1EED d\u1EE5ng '${title}' l\xE0m ti\xEAu \u0111\u1EC1 / Missing '# Title' header; used '${title}' instead.`);
    }
    const cards = [];
    for (let i = 0; i < rawCards.length; i++) {
      const { question, lines: cLines } = rawCards[i];
      while (cLines.length > 0 && cLines[0].trim() === "") {
        cLines.shift();
      }
      if (cLines.length > 0 && /^---\s*$/.test(cLines[0])) {
        cLines.shift();
      }
      while (cLines.length > 0 && cLines[cLines.length - 1].trim() === "") {
        cLines.pop();
      }
      if (cLines.length > 0 && /^---\s*$/.test(cLines[cLines.length - 1])) {
        cLines.pop();
      }
      let rawAnswer = trimBlankLines(cLines.join("\n"));
      if (!rawAnswer) {
        warnings.push(`Th\u1EBB "${question}" c\xF3 \u0111\xE1p \xE1n tr\u1ED1ng / Card "${question}" has an empty answer.`);
      }
      cards.push({
        id: generateUUID(),
        q: question,
        a: rawAnswer
      });
    }
    const now = Date.now();
    const set = {
      id: generateUUID(),
      title: title.trim() || "Untitled",
      allowAnswer: true,
      createdAt: now,
      updatedAt: now,
      lastStudiedAt: null,
      cards
    };
    return { set, warnings };
  }

  // js/serializer.js
  function slugify(title) {
    if (!title || typeof title !== "string") return "myquizlet-deck";
    const clean = title.trim().replace(/[\\/:*?"<>|#^]+/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
    return clean || "myquizlet-deck";
  }
  function serializeSet(set) {
    const title = (set && set.title ? set.title.trim() : "") || "Untitled";
    let markdown = `# ${title}

`;
    if (!set || !Array.isArray(set.cards) || set.cards.length === 0) {
      return markdown;
    }
    for (let i = 0; i < set.cards.length; i++) {
      const card = set.cards[i];
      const q = (card && card.q ? card.q.trim() : "") || "Untitled Question";
      const a = card && card.a ? card.a.trim() : "";
      markdown += `## ${q}
`;
      if (a) {
        markdown += `
${a}

`;
      } else {
        markdown += "\n";
      }
    }
    return markdown.trim() + "\n";
  }
  async function downloadSetAsMarkdown(set) {
    const content = serializeSet(set);
    const fileName = `${slugify(set.title)}.md`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        const file = new File([blob], fileName, { type: "text/markdown;charset=utf-8" });
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: set.title,
            text: `B\u1ED9 th\u1EBB MyQuizlet: ${set.title}`
          });
          return { shared: true, fileName };
        }
      } catch (err) {
        if (err.name === "AbortError") {
          return { shared: false, fileName };
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1500);
    return { shared: false, fileName };
  }

  // js/render.js
  var renderCache = /* @__PURE__ */ new Map();
  function ensureMarkedConfigured() {
    if (typeof window !== "undefined" && window.marked && !window.__marked_configured) {
      window.marked.use({
        gfm: true,
        breaks: false
      });
      window.__marked_configured = true;
    }
  }
  var SANITIZE_CONFIG = {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "a",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "code",
      "pre",
      "span",
      "blockquote",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "br",
      "img",
      "details",
      "summary",
      "mark",
      "del",
      "kbd",
      "sub",
      "sup",
      "div",
      "svg",
      "path"
    ],
    ALLOWED_ATTR: [
      "href",
      "title",
      "target",
      "rel",
      "class",
      "src",
      "alt",
      "width",
      "height",
      "align",
      "loading",
      "id",
      "d",
      "viewBox",
      "fill",
      "aria-hidden"
    ],
    FORBID_TAGS: ["script", "style", "iframe", "frame", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "javascript:"]
  };
  function clearRenderCache() {
    renderCache.clear();
  }
  function renderCardFaceHTML(card, face) {
    if (!card) return "";
    const cacheKey = `${card.id || "temp"}:${face}`;
    if (renderCache.has(cacheKey)) {
      return renderCache.get(cacheKey);
    }
    ensureMarkedConfigured();
    let html = "";
    if (face === "q") {
      const rawQuestion = (card.q || "").trim();
      if (window.marked && typeof window.marked.parseInline === "function") {
        html = window.marked.parseInline(rawQuestion);
      } else {
        html = rawQuestion.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
    } else {
      const rawAnswer = (card.a || "").trim();
      if (!rawAnswer) {
        html = `
        <div class="empty-answer-placeholder">
          <div class="empty-answer-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/>
            </svg>
          </div>
          <div class="empty-answer-title">${t("empty_answer_title")}</div>
          <div class="empty-answer-sub">${t("empty_answer_desc")}</div>
        </div>
      `;
      } else if (window.marked && typeof window.marked.parse === "function") {
        html = window.marked.parse(rawAnswer);
      } else {
        html = `<p>${rawAnswer.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
      }
    }
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
      html = window.DOMPurify.sanitize(html, SANITIZE_CONFIG);
    }
    const container = document.createElement("div");
    container.innerHTML = html;
    const links = container.querySelectorAll("a");
    for (const a of links) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
    const images = container.querySelectorAll("img");
    for (const img of images) {
      img.setAttribute("loading", "lazy");
      img.setAttribute("onerror", "this.classList.add('img-load-error');");
    }
    if (window.hljs) {
      const codeBlocks = container.querySelectorAll("pre code");
      for (const codeEl of codeBlocks) {
        const langMatch = codeEl.className.match(/(?:lang|language)-([a-z0-9_-]+)/i);
        const specifiedLang = langMatch ? langMatch[1].toLowerCase() : null;
        if (specifiedLang && window.hljs.getLanguage(specifiedLang)) {
          try {
            const highlighted = window.hljs.highlight(codeEl.textContent, { language: specifiedLang });
            codeEl.innerHTML = highlighted.value;
            codeEl.classList.add("hljs");
          } catch {
            window.hljs.highlightElement(codeEl);
          }
        } else {
          try {
            window.hljs.highlightElement(codeEl);
          } catch {
          }
        }
      }
    }
    const finalHtml = container.innerHTML;
    renderCache.set(cacheKey, finalHtml);
    return finalHtml;
  }
  function renderInlineQuestionHTML(rawQuestion) {
    if (!rawQuestion) return "";
    ensureMarkedConfigured();
    let html = "";
    if (window.marked && typeof window.marked.parseInline === "function") {
      html = window.marked.parseInline(rawQuestion.trim());
    } else {
      html = rawQuestion.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
      html = window.DOMPurify.sanitize(html, SANITIZE_CONFIG);
    }
    return html;
  }

  // js/ui.js
  var UIManager = class {
    constructor() {
      this.snackbarTimeout = null;
      this._initDomContainers();
    }
    _initDomContainers() {
      if (!document.getElementById("snackbar-container")) {
        const container = document.createElement("div");
        container.id = "snackbar-container";
        container.className = "snackbar-container";
        document.body.appendChild(container);
      }
    }
    /**
     * Show a Material 3 snackbar notification with optional action button
     * @param {string} message 
     * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [options]
     */
    showSnackbar(message, { actionLabel, onAction, duration = 4e3 } = {}) {
      const container = document.getElementById("snackbar-container");
      if (!container) return;
      container.innerHTML = "";
      if (this.snackbarTimeout) {
        clearTimeout(this.snackbarTimeout);
        this.snackbarTimeout = null;
      }
      const snackbar = document.createElement("div");
      snackbar.className = "snackbar";
      snackbar.setAttribute("role", "status");
      const textSpan = document.createElement("span");
      textSpan.className = "snackbar-text";
      textSpan.textContent = message;
      snackbar.appendChild(textSpan);
      if (actionLabel && onAction) {
        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "snackbar-action";
        actionBtn.textContent = actionLabel;
        actionBtn.addEventListener("click", () => {
          try {
            onAction();
          } finally {
            this.dismissSnackbar();
          }
        });
        snackbar.appendChild(actionBtn);
      }
      container.appendChild(snackbar);
      requestAnimationFrame(() => {
        snackbar.classList.add("is-visible");
      });
      if (duration > 0) {
        this.snackbarTimeout = setTimeout(() => {
          this.dismissSnackbar();
        }, duration);
      }
    }
    dismissSnackbar() {
      const container = document.getElementById("snackbar-container");
      if (!container || !container.firstElementChild) return;
      const snackbar = container.firstElementChild;
      snackbar.classList.remove("is-visible");
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
    showConfirmDialog({ title, message, confirmText = t("confirm"), cancelText = t("cancel"), isDestructive = false }) {
      return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        dialog.className = "modal-dialog";
        dialog.innerHTML = `
        <div class="dialog-content">
          <h2 class="dialog-title">${title}</h2>
          <p class="dialog-body">${message}</p>
          <div class="dialog-actions">
            <button type="button" class="btn btn-text" id="dlg-cancel">${cancelText}</button>
            <button type="button" class="btn ${isDestructive ? "btn-danger" : "btn-primary"}" id="dlg-confirm">${confirmText}</button>
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
        dialog.querySelector("#dlg-cancel").addEventListener("click", () => cleanup(false));
        dialog.querySelector("#dlg-confirm").addEventListener("click", () => cleanup(true));
        dialog.addEventListener("cancel", () => cleanup(false));
        dialog.addEventListener("click", (e) => {
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
      const existing = document.getElementById("import-bottom-sheet");
      if (existing) document.body.removeChild(existing);
      const sheet = document.createElement("div");
      sheet.id = "import-bottom-sheet";
      sheet.className = "bottom-sheet-backdrop";
      sheet.innerHTML = `
      <div class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-heading">
        <div class="sheet-handle-bar">
          <div class="sheet-handle"></div>
        </div>

        <div class="sheet-header">
          <h2 id="sheet-heading" class="sheet-title">${t("sheet_title")}</h2>
          <button type="button" class="icon-btn" id="sheet-close-btn" aria-label="${t("close")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="sheet-tabs" role="tablist">
          <button type="button" class="tab-btn is-active" id="tab-file" role="tab" aria-selected="true">${t("sheet_tab_file")}</button>
          <button type="button" class="tab-btn" id="tab-paste" role="tab" aria-selected="false">${t("sheet_tab_paste")}</button>
          <button type="button" class="tab-btn" id="tab-empty" role="tab" aria-selected="false">${t("sheet_tab_empty")}</button>
        </div>

        <div class="sheet-body">
          <!-- File Tab Panel -->
          <div class="tab-panel is-active" id="panel-file">
            <div class="file-dropzone" id="file-dropzone">
              <svg class="dropzone-icon" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
              </svg>
              <p class="dropzone-text">${t("drop_files_here")}</p>
              <label class="btn btn-primary" for="file-input-control">
                ${t("browse_files_btn")}
              </label>
              <input type="file" id="file-input-control" accept=".md,.markdown,.txt" multiple class="sr-only" />
            </div>
          </div>

          <!-- Paste Tab Panel -->
          <div class="tab-panel hidden" id="panel-paste">
            <div class="paste-form">
              <textarea id="paste-textarea" class="paste-input" rows="8" placeholder="${t("paste_textarea_placeholder")}"></textarea>
              <div class="paste-footer">
                <span class="live-counter" id="live-card-counter">${t("live_card_count_zero")}</span>
                <button type="button" class="btn btn-primary" id="btn-preview-paste" disabled>${t("preview_btn")}</button>
              </div>
            </div>
          </div>

          <!-- Empty Set Tab Panel -->
          <div class="tab-panel hidden" id="panel-empty">
            <form id="form-empty-set" class="empty-set-form">
              <label class="form-label" for="empty-set-title-input">${t("new_empty_title_label")}</label>
              <input type="text" id="empty-set-title-input" class="text-input" placeholder="${t("new_empty_title_placeholder")}" maxlength="120" required />
              <button type="submit" class="btn btn-primary btn-block">${t("create_empty_btn")}</button>
            </form>
          </div>
        </div>
      </div>
    `;
      document.body.appendChild(sheet);
      requestAnimationFrame(() => {
        sheet.classList.add("is-open");
      });
      const closeSheet = () => {
        sheet.classList.remove("is-open");
        setTimeout(() => {
          if (sheet.parentNode === document.body) {
            document.body.removeChild(sheet);
          }
        }, 300);
      };
      sheet.querySelector("#sheet-close-btn").addEventListener("click", closeSheet);
      sheet.addEventListener("click", (e) => {
        if (e.target === sheet) closeSheet();
      });
      const tabs = [
        { btn: sheet.querySelector("#tab-file"), panel: sheet.querySelector("#panel-file") },
        { btn: sheet.querySelector("#tab-paste"), panel: sheet.querySelector("#panel-paste") },
        { btn: sheet.querySelector("#tab-empty"), panel: sheet.querySelector("#panel-empty") }
      ];
      tabs.forEach(({ btn, panel }) => {
        btn.addEventListener("click", () => {
          tabs.forEach((t2) => {
            t2.btn.classList.remove("is-active");
            t2.btn.setAttribute("aria-selected", "false");
            t2.panel.classList.add("hidden");
            t2.panel.classList.remove("is-active");
          });
          btn.classList.add("is-active");
          btn.setAttribute("aria-selected", "true");
          panel.classList.remove("hidden");
          panel.classList.add("is-active");
        });
      });
      const fileInput = sheet.querySelector("#file-input-control");
      const dropzone = sheet.querySelector("#file-dropzone");
      const handleFiles = async (fileList) => {
        if (!fileList || fileList.length === 0) return;
        closeSheet();
        for (const file of Array.from(fileList)) {
          if (file.size > 5 * 1024 * 1024) {
            this.showSnackbar(`File "${file.name}" v\u01B0\u1EE3t qu\xE1 gi\u1EDBi h\u1EA1n 5 MB / File exceeds 5 MB`);
            continue;
          }
          try {
            const text = await file.text();
            const { set, warnings } = parseMarkdownSet(text, file.name);
            if (!set.cards || set.cards.length === 0) {
              this.showSnackbar(`Kh\xF4ng t\xECm th\u1EA5y th\u1EBB n\xE0o trong "${file.name}" / No cards found in file`);
              continue;
            }
            this.showPreviewDialog({
              parsedSet: set,
              warnings,
              onConfirmed: (finalSet, mode) => {
                if (onImportConfirmed) onImportConfirmed(finalSet, mode);
              }
            });
          } catch (err) {
            console.error("[MyQuizlet] File parse error:", err);
            this.showSnackbar(`L\u1ED7i \u0111\u1ECDc file "${file.name}": ${err.message}`);
          }
        }
      };
      fileInput.addEventListener("change", (e) => {
        handleFiles(e.target.files);
      });
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("is-dragover");
      });
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
        handleFiles(e.dataTransfer.files);
      });
      const pasteInput = sheet.querySelector("#paste-textarea");
      const liveCounter = sheet.querySelector("#live-card-counter");
      const previewBtn = sheet.querySelector("#btn-preview-paste");
      let pasteDebounce = null;
      let latestParsed = null;
      pasteInput.addEventListener("input", () => {
        if (pasteDebounce) clearTimeout(pasteDebounce);
        pasteDebounce = setTimeout(() => {
          const text = pasteInput.value.trim();
          if (!text) {
            liveCounter.textContent = t("live_card_count_zero");
            previewBtn.disabled = true;
            latestParsed = null;
            return;
          }
          try {
            const res = parseMarkdownSet(text, "Pasted-Deck");
            latestParsed = res;
            const count = res.set.cards.length;
            if (count > 0) {
              liveCounter.textContent = t("live_card_count", { count });
              previewBtn.disabled = false;
            } else {
              liveCounter.textContent = t("live_card_count_zero");
              previewBtn.disabled = true;
            }
          } catch {
            liveCounter.textContent = t("live_card_count_zero");
            previewBtn.disabled = true;
            latestParsed = null;
          }
        }, 250);
      });
      previewBtn.addEventListener("click", () => {
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
      const emptyForm = sheet.querySelector("#form-empty-set");
      emptyForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const titleInput = sheet.querySelector("#empty-set-title-input");
        const title = (titleInput.value || "").trim();
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
      const existing = document.getElementById("reimport-bottom-sheet");
      if (existing) document.body.removeChild(existing);
      const sheet = document.createElement("div");
      sheet.id = "reimport-bottom-sheet";
      sheet.className = "bottom-sheet-backdrop";
      sheet.innerHTML = `
      <div class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="reimport-heading">
        <div class="sheet-handle-bar">
          <div class="sheet-handle"></div>
        </div>

        <div class="sheet-header">
          <div>
            <h2 id="reimport-heading" class="sheet-title">${t("reimport_sheet_title")}</h2>
            <p class="sheet-subtitle">${t("reimport_sheet_desc")}</p>
          </div>
          <button type="button" class="icon-btn" id="reimport-close-btn" aria-label="${t("close")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="sheet-tabs" role="tablist">
          <button type="button" class="tab-btn is-active" id="reimport-tab-file" role="tab" aria-selected="true">${t("sheet_tab_file")}</button>
          <button type="button" class="tab-btn" id="reimport-tab-paste" role="tab" aria-selected="false">${t("sheet_tab_paste")}</button>
        </div>

        <div class="sheet-body">
          <!-- File Tab Panel -->
          <div class="tab-panel is-active" id="reimport-panel-file">
            <div class="file-dropzone" id="reimport-file-dropzone">
              <svg class="dropzone-icon" viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
              </svg>
              <p class="dropzone-text">${t("drop_files_here")}</p>
              <label class="btn btn-primary" for="reimport-file-input-control">
                ${t("browse_files_btn")}
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
                  <span>${t("reimport_load_current")}</span>
                </button>
              </div>
              <textarea id="reimport-paste-textarea" class="paste-input" rows="8" placeholder="${t("paste_textarea_placeholder")}"></textarea>
              <div class="paste-footer">
                <span class="live-counter" id="reimport-live-card-counter">${t("live_card_count_zero")}</span>
                <button type="button" class="btn btn-primary" id="btn-reimport-preview-paste" disabled>${t("preview_btn")}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
      document.body.appendChild(sheet);
      requestAnimationFrame(() => {
        sheet.classList.add("is-open");
      });
      const closeSheet = () => {
        sheet.classList.remove("is-open");
        setTimeout(() => {
          if (sheet.parentNode === document.body) {
            document.body.removeChild(sheet);
          }
        }, 300);
      };
      sheet.querySelector("#reimport-close-btn").addEventListener("click", closeSheet);
      sheet.addEventListener("click", (e) => {
        if (e.target === sheet) closeSheet();
      });
      const tabs = [
        { btn: sheet.querySelector("#reimport-tab-file"), panel: sheet.querySelector("#reimport-panel-file") },
        { btn: sheet.querySelector("#reimport-tab-paste"), panel: sheet.querySelector("#reimport-panel-paste") }
      ];
      tabs.forEach(({ btn, panel }) => {
        btn.addEventListener("click", () => {
          tabs.forEach((t2) => {
            t2.btn.classList.remove("is-active");
            t2.btn.setAttribute("aria-selected", "false");
            t2.panel.classList.add("hidden");
            t2.panel.classList.remove("is-active");
          });
          btn.classList.add("is-active");
          btn.setAttribute("aria-selected", "true");
          panel.classList.remove("hidden");
          panel.classList.add("is-active");
        });
      });
      const fileInput = sheet.querySelector("#reimport-file-input-control");
      const dropzone = sheet.querySelector("#reimport-file-dropzone");
      const handleFile = async (file) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          this.showSnackbar(`File "${file.name}" v\u01B0\u1EE3t qu\xE1 gi\u1EDBi h\u1EA1n 5 MB / File exceeds 5 MB`);
          return;
        }
        try {
          const text = await file.text();
          const { set, warnings } = parseMarkdownSet(text, file.name);
          if (!set.cards || set.cards.length === 0) {
            this.showSnackbar(`Kh\xF4ng t\xECm th\u1EA5y th\u1EBB n\xE0o trong "${file.name}" / No cards found in file`);
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
          this.showSnackbar(`L\u1ED7i \u0111\u1ECDc file: ${err.message}`);
        }
      };
      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
      });
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
      dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("is-dragover");
      });
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
      const pasteInput = sheet.querySelector("#reimport-paste-textarea");
      const liveCounter = sheet.querySelector("#reimport-live-card-counter");
      const previewBtn = sheet.querySelector("#btn-reimport-preview-paste");
      const loadCurrentBtn = sheet.querySelector("#btn-reimport-load-current");
      let pasteDebounce = null;
      let latestParsed = null;
      loadCurrentBtn.addEventListener("click", () => {
        pasteInput.value = serializeSet(currentSet);
        pasteInput.dispatchEvent(new Event("input"));
      });
      pasteInput.addEventListener("input", () => {
        if (pasteDebounce) clearTimeout(pasteDebounce);
        pasteDebounce = setTimeout(() => {
          const text = pasteInput.value.trim();
          if (!text) {
            liveCounter.textContent = t("live_card_count_zero");
            previewBtn.disabled = true;
            latestParsed = null;
            return;
          }
          try {
            const res = parseMarkdownSet(text, currentSet.title || "Reimported-Deck");
            latestParsed = res;
            const count = res.set.cards.length;
            if (count > 0) {
              liveCounter.textContent = t("live_card_count", { count });
              previewBtn.disabled = false;
            } else {
              liveCounter.textContent = t("live_card_count_zero");
              previewBtn.disabled = true;
            }
          } catch {
            liveCounter.textContent = t("live_card_count_zero");
            previewBtn.disabled = true;
            latestParsed = null;
          }
        }, 250);
      });
      previewBtn.addEventListener("click", () => {
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
      const dialog = document.createElement("dialog");
      dialog.className = "modal-dialog preview-dialog";
      const firstQuestions = parsedSet.cards.slice(0, 3);
      const questionsListHtml = firstQuestions.map((c, idx) => `<li><span class="preview-q-idx">${idx + 1}.</span> <span>${renderInlineQuestionHTML(c.q)}</span></li>`).join("");
      const warningsHtml = warnings && warnings.length > 0 ? `
        <div class="preview-warnings-box">
          <div class="warnings-header">\u26A0\uFE0F ${t("preview_warnings", { count: warnings.length })}</div>
          <ul class="warnings-list">
            ${warnings.map((w) => `<li>${w}</li>`).join("")}
          </ul>
        </div>
      ` : "";
      const oldCount = currentSet.cards ? currentSet.cards.length : 0;
      const newCount = parsedSet.cards ? parsedSet.cards.length : 0;
      dialog.innerHTML = `
      <div class="dialog-content">
        <h2 class="dialog-title">${t("reimport_preview_title")}</h2>

        <div class="preview-field-group">
          <label class="form-label" for="reimport-title-input">${t("preview_deck_title")}</label>
          <input type="text" id="reimport-title-input" class="text-input" value="${(parsedSet.title || currentSet.title).replace(/"/g, "&quot;")}" maxlength="120" required />
        </div>

        <div class="preview-meta-row">
          <span class="preview-count-chip">${t("reimport_cards_diff", { oldCount, newCount })}</span>
        </div>

        <div class="preview-conflict-box" style="margin-top:4px;">
          <div class="conflict-title">\u26A0\uFE0F ${t("reimport_confirm_msg", { title: currentSet.title })}</div>
        </div>

        ${warningsHtml}

        <div class="preview-samples-box">
          <span class="preview-samples-label">${t("preview_sample_questions")}</span>
          <ul class="preview-samples-list">
            ${questionsListHtml}
          </ul>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-text" id="reimport-preview-cancel">${t("cancel")}</button>
          <button type="button" class="btn btn-primary" id="reimport-preview-confirm">${t("reimport_confirm_btn")}</button>
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
      dialog.querySelector("#reimport-preview-cancel").addEventListener("click", cleanup);
      dialog.addEventListener("cancel", cleanup);
      dialog.querySelector("#reimport-preview-confirm").addEventListener("click", () => {
        const titleInput = dialog.querySelector("#reimport-title-input");
        const editedTitle = (titleInput.value || "").trim();
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
      const dialog = document.createElement("dialog");
      dialog.className = "modal-dialog preview-dialog";
      const existingIndex = store.getIndex();
      const duplicate = existingIndex.find((item) => item.title.toLowerCase() === parsedSet.title.toLowerCase());
      const firstQuestions = parsedSet.cards.slice(0, 3);
      const questionsListHtml = firstQuestions.map((c, idx) => `<li><span class="preview-q-idx">${idx + 1}.</span> <span>${renderInlineQuestionHTML(c.q)}</span></li>`).join("");
      const warningsHtml = warnings && warnings.length > 0 ? `
        <div class="preview-warnings-box">
          <div class="warnings-header">\u26A0\uFE0F ${t("preview_warnings", { count: warnings.length })}</div>
          <ul class="warnings-list">
            ${warnings.map((w) => `<li>${w}</li>`).join("")}
          </ul>
        </div>
      ` : "";
      const conflictHtml = duplicate ? `
        <div class="preview-conflict-box">
          <div class="conflict-title">\u26A0\uFE0F ${t("conflict_detected", { title: duplicate.title })}</div>
          <div class="conflict-options">
            <label class="conflict-option">
              <input type="radio" name="conflict-mode" value="duplicate" checked />
              <span>${t("conflict_keep_both")}</span>
            </label>
            <label class="conflict-option">
              <input type="radio" name="conflict-mode" value="replace" />
              <span>${t("conflict_replace")}</span>
            </label>
          </div>
        </div>
      ` : "";
      dialog.innerHTML = `
      <div class="dialog-content">
        <h2 class="dialog-title">${t("preview_dialog_title")}</h2>
        
        <div class="preview-field-group">
          <label class="form-label" for="preview-title-input">${t("preview_deck_title")}</label>
          <input type="text" id="preview-title-input" class="text-input" value="${parsedSet.title.replace(/"/g, "&quot;")}" maxlength="120" required />
        </div>

        <div class="preview-meta-row">
          <span class="preview-count-chip">${t("preview_total_cards")} <strong>${parsedSet.cards.length}</strong></span>
        </div>

        ${warningsHtml}
        ${conflictHtml}

        <div class="preview-samples-box">
          <span class="preview-samples-label">${t("preview_sample_questions")}</span>
          <ul class="preview-samples-list">
            ${questionsListHtml}
          </ul>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-text" id="preview-btn-cancel">${t("cancel")}</button>
          <button type="button" class="btn btn-primary" id="preview-btn-confirm">${t("preview_confirm_import")}</button>
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
      dialog.querySelector("#preview-btn-cancel").addEventListener("click", cleanup);
      dialog.addEventListener("cancel", cleanup);
      dialog.querySelector("#preview-btn-confirm").addEventListener("click", () => {
        const titleInput = dialog.querySelector("#preview-title-input");
        const editedTitle = (titleInput.value || "").trim() || "Untitled";
        parsedSet.title = editedTitle;
        let mode = "new";
        if (duplicate) {
          const selectedMode = dialog.querySelector('input[name="conflict-mode"]:checked');
          mode = selectedMode ? selectedMode.value : "duplicate";
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
      const dialog = document.createElement("dialog");
      dialog.className = "modal-dialog edit-markdown-dialog";
      const currentMarkdown = serializeSet(set);
      dialog.innerHTML = `
      <div class="dialog-content edit-markdown-dialog-content">
        <div class="dialog-header-with-close">
          <h2 class="dialog-title">${t("edit_markdown_title")}</h2>
          <button type="button" class="icon-btn" id="edit-md-close-btn" aria-label="${t("close")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="edit-md-top-bar">
          <p class="edit-md-help-text">${t("edit_markdown_help")}</p>
          <button type="button" class="btn btn-tonal btn-sm edit-md-btn-clipboard" id="edit-md-btn-clipboard" title="${t("edit_markdown_replace_clipboard")}">
            <svg class="icon-sm" viewBox="0 0 24 24"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>
            <span>${t("edit_markdown_replace_clipboard")}</span>
          </button>
        </div>

        <div class="edit-md-editor-wrapper">
          <textarea id="edit-md-textarea" class="edit-md-textarea" spellcheck="false" placeholder="---
# T\xEAn b\u1ED9 th\u1EBB
---
## C\xE2u h\u1ECFi 1
\u0110\xE1p \xE1n 1
---"></textarea>
        </div>

        <div class="edit-md-toolbar">
          <div class="edit-md-status">
            <span class="preview-count-chip" id="edit-md-count-chip">${t("edit_markdown_cards_count", { count: set.cards ? set.cards.length : 0 })}</span>
          </div>
          <div class="edit-md-warnings hidden" id="edit-md-warnings"></div>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-text" id="edit-md-btn-cancel">${t("cancel")}</button>
          <button type="button" class="btn btn-primary" id="edit-md-btn-save">
            <svg class="icon-sm" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
            <span>${t("edit_markdown_save_btn")}</span>
          </button>
        </div>
      </div>
    `;
      document.body.appendChild(dialog);
      dialog.showModal();
      const textarea = dialog.querySelector("#edit-md-textarea");
      textarea.value = currentMarkdown;
      const countChip = dialog.querySelector("#edit-md-count-chip");
      const warningsBox = dialog.querySelector("#edit-md-warnings");
      const saveBtn = dialog.querySelector("#edit-md-btn-save");
      const clipboardBtn = dialog.querySelector("#edit-md-btn-clipboard");
      let parseDebounce = null;
      const updateLiveValidation = () => {
        const text = textarea.value;
        try {
          const { set: parsed, warnings } = parseMarkdownSet(text, set.title || "Untitled");
          countChip.textContent = t("edit_markdown_cards_count", { count: parsed.cards.length });
          countChip.classList.remove("chip-error");
          if (warnings && warnings.length > 0) {
            warningsBox.innerHTML = `
            <div class="warnings-header">\u26A0\uFE0F ${t("preview_warnings", { count: warnings.length })}</div>
            <ul class="warnings-list">${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>
          `;
            warningsBox.classList.remove("hidden");
          } else {
            warningsBox.classList.add("hidden");
          }
        } catch (err) {
          countChip.textContent = `L\u1ED7i: ${err.message}`;
          countChip.classList.add("chip-error");
          warningsBox.classList.add("hidden");
        }
      };
      textarea.addEventListener("input", () => {
        clearTimeout(parseDebounce);
        parseDebounce = setTimeout(updateLiveValidation, 200);
      });
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + 2;
          updateLiveValidation();
        } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          saveBtn.click();
        }
      });
      if (clipboardBtn) {
        clipboardBtn.addEventListener("click", async () => {
          try {
            if (!navigator.clipboard || !navigator.clipboard.readText) {
              this.showSnackbar(t("toast_clipboard_not_supported"));
              return;
            }
            const text = await navigator.clipboard.readText();
            if (!text || text.trim() === "") {
              this.showSnackbar(t("toast_clipboard_empty"));
              return;
            }
            textarea.focus();
            textarea.select();
            let replaced = false;
            try {
              replaced = document.execCommand("insertText", false, text);
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
            this.showSnackbar(t("toast_clipboard_replaced"));
          } catch (err) {
            console.warn("Clipboard read error:", err);
            this.showSnackbar(t("toast_clipboard_error"));
          }
        });
      }
      updateLiveValidation();
      const cleanup = () => {
        clearTimeout(parseDebounce);
        dialog.close();
        if (dialog.parentNode === document.body) {
          document.body.removeChild(dialog);
        }
      };
      dialog.querySelector("#edit-md-close-btn").addEventListener("click", cleanup);
      dialog.querySelector("#edit-md-btn-cancel").addEventListener("click", cleanup);
      dialog.addEventListener("cancel", cleanup);
      saveBtn.addEventListener("click", () => {
        const text = textarea.value;
        try {
          const { set: parsed } = parseMarkdownSet(text, set.title || "Untitled");
          cleanup();
          if (onSave) onSave(parsed);
        } catch (err) {
          this.showSnackbar(`L\u1ED7i \u0111\u1ECBnh d\u1EA1ng: ${err.message}`);
        }
      });
      setTimeout(() => {
        textarea.focus();
      }, 100);
    }
    _escapeHTML(str) {
      if (!str) return "";
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    /**
     * Show Study Resume Options Dialog
     * @param {{ set: any, progress: any, onResume: Function, onRestart: Function, onCancel?: Function }} options
     */
    showStudyResumeDialog({ set, progress, onResume, onRestart, onCancel }) {
      const dialog = document.createElement("dialog");
      dialog.className = "modal-dialog study-resume-dialog";
      const seenCount = (progress.currentIndex || 0) + 1;
      const totalCount = progress.totalCards || (set.cards ? set.cards.length : 0);
      const progressPercent = totalCount > 0 ? Math.min(100, Math.max(0, Math.round(seenCount / totalCount * 100))) : 0;
      dialog.innerHTML = `
      <div class="dialog-content study-resume-dialog-content">
        <div class="dialog-header-with-close">
          <h2 class="dialog-title">${t("study_resume_title")}</h2>
          <button type="button" class="icon-btn" id="resume-close-btn" aria-label="${t("close")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="resume-deck-banner">
          <div class="resume-deck-name">${this._escapeHTML(set.title || "Untitled")}</div>
          <div class="resume-progress-info">
            <div class="resume-progress-stats">
              <span class="resume-stats-label">${t("study_resume_seen_label")}</span>
              <span class="resume-stats-val">${seenCount} / ${totalCount} (${progressPercent}%)</span>
            </div>
            <div class="resume-progress-track">
              <div class="resume-progress-bar" style="width: ${progressPercent}%;"></div>
            </div>
          </div>
        </div>

        <p class="dialog-body">${t("study_resume_desc")}</p>

        <div class="resume-options-list">
          <button type="button" class="btn btn-primary btn-block resume-btn-continue" id="resume-btn-continue">
            <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <span>${t("study_resume_continue_btn", { seen: seenCount, total: totalCount })}</span>
          </button>

          <button type="button" class="btn btn-tonal btn-block resume-btn-restart" id="resume-btn-restart">
            <svg class="icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            <span>${t("study_resume_restart_btn")}</span>
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
      dialog.querySelector("#resume-close-btn").addEventListener("click", () => {
        if (handled) return;
        handled = true;
        cleanup();
        if (onCancel) onCancel();
      });
      dialog.addEventListener("cancel", () => {
        if (handled) return;
        handled = true;
        cleanup();
        if (onCancel) onCancel();
      });
      dialog.querySelector("#resume-btn-continue").addEventListener("click", () => {
        if (handled) return;
        handled = true;
        cleanup();
        if (onResume) onResume();
      });
      dialog.querySelector("#resume-btn-restart").addEventListener("click", () => {
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
      const dialog = document.createElement("dialog");
      dialog.className = "modal-dialog help-dialog";
      dialog.innerHTML = `
      <div class="dialog-content">
        <div class="dialog-header-with-close">
          <h2 class="dialog-title">${t("help_dialog_title")}</h2>
          <button type="button" class="icon-btn" id="help-close-btn" aria-label="${t("close")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="help-scroll-body">
          <p class="help-intro">${t("help_dialog_intro")}</p>

          <pre class="help-code-sample"><code>${t("help_code_sample")}</code></pre>

          <ul class="help-rules-list">
            <li>\u{1F4CC} ${t("help_rule_1")}</li>
            <li>\u{1F4CC} ${t("help_rule_2")}</li>
            <li>\u{1F4CC} ${t("help_rule_3")}</li>
            <li>\u{1F4CC} ${t("help_rule_4")}</li>
            <li>\u{1F4CC} ${t("help_rule_5")}</li>
            <li>\u{1F4CC} ${t("help_rule_6")}</li>
          </ul>
        </div>

        <div class="dialog-actions">
          <button type="button" class="btn btn-primary" id="help-btn-ok">${t("close")}</button>
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
      dialog.querySelector("#help-close-btn").addEventListener("click", cleanup);
      dialog.querySelector("#help-btn-ok").addEventListener("click", cleanup);
      dialog.addEventListener("cancel", cleanup);
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
        if (!bytes) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
      };
      const dialog = document.createElement("dialog");
      dialog.className = "modal-dialog storage-dialog";
      dialog.innerHTML = `
      <div class="dialog-content">
        <h2 class="dialog-title">${t("storage_dialog_title")}</h2>
        
        <div class="storage-stats-grid">
          <div class="stat-card">
            <span class="stat-label">${t("storage_decks_count", { decks: index.length })}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">${t("storage_cards_count", { cards: totalCards })}</span>
          </div>
        </div>

        <div class="storage-usage-section">
          <div class="usage-label-row">
            <span>${t("storage_usage_label")}</span>
            <span><strong>${formatBytes(est.usage)}</strong> / ${formatBytes(est.quota)} (${est.percent}%)</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width: ${Math.min(est.percent, 100)}%;"></div>
          </div>
        </div>

        <div class="persist-section">
          <div class="persist-label-row">
            <span>${t("storage_persist_label")}</span>
            <span class="persist-badge ${est.isPersisted ? "is-active" : ""}">
              ${est.isPersisted ? t("storage_persisted_yes") : t("storage_persisted_no")}
            </span>
          </div>
          ${!est.isPersisted ? `<button type="button" class="btn btn-tonal btn-block" id="btn-request-persist">${t("storage_request_persist")}</button>` : ""}
        </div>

        <p class="storage-note">\u{1F4A1} ${t("storage_note")}</p>

        <div class="dialog-actions">
          <button type="button" class="btn btn-primary" id="storage-btn-ok">${t("close")}</button>
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
      const persistBtn = dialog.querySelector("#btn-request-persist");
      if (persistBtn) {
        persistBtn.addEventListener("click", async () => {
          const persisted = await store.requestPersistentStorage();
          if (persisted) {
            this.showSnackbar("\u0110\xE3 k\xEDch ho\u1EA1t l\u01B0u tr\u1EEF b\u1EC1n v\u1EEFng th\xE0nh c\xF4ng / Persistent storage enabled");
            cleanup();
          } else {
            this.showSnackbar("Tr\xECnh duy\u1EC7t ch\u01B0a cho ph\xE9p quy\u1EC1n l\u01B0u tr\u1EEF b\u1EC1n v\u1EEFng / Persistence not granted");
          }
        });
      }
      dialog.querySelector("#storage-btn-ok").addEventListener("click", cleanup);
      dialog.addEventListener("cancel", cleanup);
    }
    /**
     * Show About Dialog
     */
    showAboutDialog() {
      const dialog = document.createElement("dialog");
      dialog.className = "modal-dialog about-dialog";
      dialog.innerHTML = `
      <div class="dialog-content text-center">
        <div class="about-logo-wrapper">
          <img src="icons/icon-192.png" alt="MyQuizlet" class="about-logo" />
        </div>
        <h2 class="dialog-title">MyQuizlet</h2>
        <div class="about-version-chip">${t("about_version")}</div>
        <p class="about-desc">${t("about_desc")}</p>
        <p class="about-features">${t("about_features")}</p>
        <div class="dialog-actions justify-center">
          <button type="button" class="btn btn-primary" id="about-btn-ok">${t("close")}</button>
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
      dialog.querySelector("#about-btn-ok").addEventListener("click", cleanup);
      dialog.addEventListener("cancel", cleanup);
    }
    /**
     * Show Review Answer Modal
     * @param {{ card: { id: string, q: string, a: string }, index?: number, total?: number }} options
     */
    showReviewAnswerModal({ card, index, total }) {
      if (!card) return;
      const dialog = document.createElement("dialog");
      dialog.className = "modal-dialog review-answer-dialog";
      const aHtml = renderCardFaceHTML(card, "a");
      const indexLabel = index != null ? `${t("question_label") || "C\xE2u h\u1ECFi"} ${index + 1}` : "";
      dialog.innerHTML = `
      <div class="dialog-content review-answer-modal-content">
        <div class="review-modal-header">
          <div class="review-modal-header-info">
            <div class="review-modal-title-row">
              <h2 class="dialog-title review-modal-title">${t("answer_label") || "C\xE2u tr\u1EA3 l\u1EDDi"}</h2>
              ${indexLabel ? `<span class="review-modal-badge">${indexLabel}${total ? ` / ${total}` : ""}</span>` : ""}
            </div>
          </div>
          <button type="button" class="icon-btn" id="review-modal-x-btn" aria-label="${t("close")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="review-modal-scroll-body">
          <div class="review-modal-answer-body markdown-body">
            ${aHtml}
          </div>
        </div>

        <div class="dialog-actions review-modal-actions">
          <button type="button" class="btn btn-primary review-modal-btn-close" id="review-modal-btn-close">
            <span>${t("close")}</span>
          </button>
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
      const xBtn = dialog.querySelector("#review-modal-x-btn");
      if (xBtn) xBtn.addEventListener("click", cleanup);
      const closeBtn = dialog.querySelector("#review-modal-btn-close");
      if (closeBtn) closeBtn.addEventListener("click", cleanup);
      dialog.addEventListener("cancel", cleanup);
      dialog.addEventListener("click", (e) => {
        const rect = dialog.getBoundingClientRect();
        const isInDialog = rect.top <= e.clientY && e.clientY <= rect.top + rect.height && rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
        if (!isInDialog) cleanup();
      });
    }
  };
  var ui = new UIManager();

  // js/gestures.js
  function attachSwipe(element, { onNext, onBack, onTap, onUp, onDown } = {}) {
    if (!element) return () => {
    };
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let startTime = 0;
    let axisLocked = null;
    let isDragging = false;
    let rafId = null;
    let captured = false;
    function isInsideCodeBlock(target) {
      let node = target;
      while (node && node !== element) {
        if (node.tagName === "PRE" || node.tagName === "CODE") {
          if (node.scrollWidth > node.clientWidth) {
            return true;
          }
        }
        node = node.parentElement;
      }
      return false;
    }
    function isInteractiveElement(target) {
      if (!target) return false;
      const tag = target.tagName;
      if (tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
      }
      if (target.closest && (target.closest("button") || target.closest("a") || target.closest(".card-flip-btn"))) {
        return true;
      }
      return false;
    }
    function updateTransform() {
      if (!isDragging || axisLocked !== "h") return;
      const dx = currentX - startX;
      const rot = Math.min(Math.max(dx * 0.035, -12), 12);
      element.style.transform = `translate3d(${dx * 0.72}px, 0, 0) rotate(${rot}deg)`;
    }
    function resetTransform(animated = true) {
      if (animated) {
        element.style.transition = "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)";
        element.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
        setTimeout(() => {
          element.style.transition = "";
        }, 260);
      } else {
        element.style.transition = "";
        element.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
      }
    }
    function onPointerDown(e) {
      if (e.button !== void 0 && e.button !== 0) return;
      if (isInteractiveElement(e.target)) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      currentX = e.clientX;
      currentY = e.clientY;
      startTime = Date.now();
      axisLocked = null;
      isDragging = false;
      captured = false;
      element.style.transition = "";
      if (isInsideCodeBlock(e.target)) {
        pointerId = null;
        return;
      }
    }
    function onPointerMove(e) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      currentX = e.clientX;
      currentY = e.clientY;
      const dx = currentX - startX;
      const dy = currentY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (!axisLocked && (absX > 10 || absY > 10)) {
        if (absY >= absX) {
          axisLocked = "v";
          isDragging = false;
          return;
        } else {
          axisLocked = "h";
          isDragging = true;
          try {
            element.setPointerCapture(pointerId);
            captured = true;
          } catch {
          }
        }
      }
      if (isDragging && axisLocked === "h") {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(updateTransform);
      }
    }
    function onPointerUp(e) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      if (rafId) cancelAnimationFrame(rafId);
      const endTime = Date.now();
      const duration = Math.max(endTime - startTime, 1);
      const dx = currentX - startX;
      const dy = currentY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const velocityX = absX / duration;
      if (captured) {
        try {
          element.releasePointerCapture(pointerId);
        } catch {
        }
        captured = false;
      }
      const currentPointer = pointerId;
      pointerId = null;
      if (!axisLocked && absX < 8 && absY < 8 && duration < 320) {
        if (onTap) onTap();
        resetTransform(false);
        axisLocked = null;
        isDragging = false;
        return;
      }
      if (axisLocked === "h") {
        const reducedMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (dx < -50 || dx < -25 && velocityX > 0.35) {
          axisLocked = null;
          isDragging = false;
          if (reducedMotion) {
            resetTransform(false);
            if (onNext) onNext();
          } else {
            element.style.transition = "transform 0.12s linear, opacity 0.12s linear";
            element.style.transform = "translate3d(-105%, 0, 0) rotate(-10deg)";
            element.style.opacity = "0";
            setTimeout(() => {
              element.style.transition = "";
              element.style.opacity = "";
              resetTransform(false);
              if (onNext) onNext();
            }, 120);
          }
          return;
        } else if (dx > 50 || dx > 25 && velocityX > 0.35) {
          axisLocked = null;
          isDragging = false;
          if (reducedMotion) {
            resetTransform(false);
            if (onBack) onBack();
          } else {
            element.style.transition = "transform 0.12s linear, opacity 0.12s linear";
            element.style.transform = "translate3d(105%, 0, 0) rotate(10deg)";
            element.style.opacity = "0";
            setTimeout(() => {
              element.style.transition = "";
              element.style.opacity = "";
              resetTransform(false);
              if (onBack) onBack();
            }, 120);
          }
          return;
        }
      }
      resetTransform(true);
      isDragging = false;
      axisLocked = null;
    }
    function onPointerCancel(e) {
      if (pointerId !== null && e.pointerId === pointerId) {
        if (rafId) cancelAnimationFrame(rafId);
        if (captured) {
          try {
            element.releasePointerCapture(pointerId);
          } catch {
          }
          captured = false;
        }
        pointerId = null;
        isDragging = false;
        axisLocked = null;
        resetTransform(true);
      }
    }
    element.addEventListener("pointerdown", onPointerDown, { passive: true });
    element.addEventListener("pointermove", onPointerMove, { passive: true });
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerCancel);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (captured && pointerId !== null) {
        try {
          element.releasePointerCapture(pointerId);
        } catch {
        }
      }
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
    };
  }

  // js/study.js
  var StudyController = class {
    constructor({ container, onBack, onShowSnackbar }) {
      this.container = container;
      this.onBack = onBack;
      this.onShowSnackbar = onShowSnackbar;
      this.currentSet = null;
      this.cardOrder = [];
      this.currentIndex = 0;
      this.face = "q";
      this.swipeCleanup = null;
      this.isAnimating = false;
      this.boundKeyHandler = this.handleKeyDown.bind(this);
      this.wakeLock = null;
      this.boundVisibilityHandler = this._handleVisibilityChange.bind(this);
    }
    /**
     * Start study session for a set
     * @param {string} setId 
     * @param {{ resume?: boolean }} [options]
     */
    start(setId, { resume = false } = {}) {
      const set = store.getSet(setId);
      if (!set) {
        if (this.onShowSnackbar) this.onShowSnackbar("B\u1ED9 th\u1EBB kh\xF4ng t\u1ED3n t\u1EA1i / Set not found");
        if (this.onBack) this.onBack();
        return;
      }
      if (!set.cards || set.cards.length === 0) {
        if (this.onShowSnackbar) this.onShowSnackbar(t("empty_deck_cannot_study"));
        if (this.onBack) this.onBack();
        return;
      }
      this.currentSet = set;
      store.touchLastStudied(setId);
      const savedProgress = resume ? store.getStudyProgress(setId) : null;
      if (savedProgress && savedProgress.totalCards === set.cards.length) {
        this.cardOrder = savedProgress.cardOrder;
        this.currentIndex = savedProgress.currentIndex;
      } else {
        this._initRandomOrder(-1);
        this.currentIndex = 0;
        this._saveCurrentProgress();
      }
      this.face = "q";
      this._renderStudyLayout();
      this._updateCardDisplay("none");
      window.addEventListener("keydown", this.boundKeyHandler);
      this._checkFirstRunHint();
      this._requestWakeLock();
      document.addEventListener("visibilitychange", this.boundVisibilityHandler);
    }
    async _requestWakeLock() {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator && !this.wakeLock) {
        try {
          this.wakeLock = await navigator.wakeLock.request("screen");
          this.wakeLock.addEventListener("release", () => {
            this.wakeLock = null;
          });
        } catch (err) {
        }
      }
    }
    _releaseWakeLock() {
      if (this.wakeLock) {
        try {
          this.wakeLock.release().catch(() => {
          });
        } catch {
        }
        this.wakeLock = null;
      }
    }
    _handleVisibilityChange() {
      if (document.visibilityState === "visible" && this.currentSet) {
        this._requestWakeLock();
      }
    }
    _saveCurrentProgress() {
      if (!this.currentSet || !this.currentSet.id || !this.cardOrder || this.cardOrder.length === 0) return;
      store.saveStudyProgress(this.currentSet.id, {
        cardOrder: this.cardOrder,
        currentIndex: this.currentIndex,
        totalCards: this.cardOrder.length,
        updatedAt: Date.now()
      });
    }
    destroy() {
      this._releaseWakeLock();
      document.removeEventListener("visibilitychange", this.boundVisibilityHandler);
      if (this.swipeCleanup) {
        this.swipeCleanup();
        this.swipeCleanup = null;
      }
      window.removeEventListener("keydown", this.boundKeyHandler);
      this.container.innerHTML = "";
    }
    /**
     * Initialize a fresh randomized order of all card indices using Fisher-Yates
     * @param {number} [lastIndex=-1] Ensure the first card of a new cycle is not identical to lastIndex
     */
    _initRandomOrder(lastIndex = -1) {
      const n = this.currentSet.cards.length;
      const indices = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
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
        if (this.onShowSnackbar) this.onShowSnackbar(t("single_card_hint"));
        return;
      }
      if (this.currentIndex < total - 1) {
        this.currentIndex++;
        this._updateCardDisplay(animate ? "next" : "none");
      } else {
        const lastShown = this.cardOrder[this.currentIndex];
        this._initRandomOrder(lastShown);
        this.currentIndex = 0;
        if (this.onShowSnackbar) {
          this.onShowSnackbar(t("cycle_complete_msg"));
        }
        this._updateCardDisplay(animate ? "next" : "none");
      }
    }
    /**
     * Go back to the previous card along the randomized list
     */
    goBack() {
      if (this.isAnimating) return;
      if (this.currentIndex <= 0) return;
      this.currentIndex--;
      this._updateCardDisplay("back");
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
        this.onShowSnackbar(t("toast_reshuffled"));
      }
      this._updateCardDisplay("next");
    }
    /**
     * Flip current card (with direction hint: 1 for right, -1 for left)
     * @param {number} [direction=1] 
     */
    flipCard(direction = 1) {
      if (this.isAnimating) return;
      if (this.currentSet.allowAnswer === false) {
        this._playShakeAnimation();
        if (this.onShowSnackbar) {
          this.onShowSnackbar(t("hidden_answer_shake_msg"));
        }
        return;
      }
      this.face = this.face === "q" ? "a" : "q";
      const cardWrapper = this.container.querySelector(".study-card-wrapper");
      const liveRegion = this.container.querySelector("#study-live-region");
      const flipBtn = this.container.querySelector("#btn-study-flip");
      if (liveRegion) {
        liveRegion.textContent = this.face === "q" ? "M\u1EB7t c\xE2u h\u1ECFi / Question" : "M\u1EB7t \u0111\xE1p \xE1n / Answer";
      }
      if (flipBtn) {
        flipBtn.setAttribute("aria-label", this.face === "q" ? t("btn_flip_to_answer") : t("btn_flip_to_question"));
      }
      if (cardWrapper) {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reducedMotion) {
          cardWrapper.classList.toggle("is-flipped", this.face === "a");
        } else {
          cardWrapper.style.setProperty("--flip-dir", direction < 0 ? "-1" : "1");
          cardWrapper.classList.toggle("is-flipped", this.face === "a");
        }
      }
    }
    _playShakeAnimation() {
      const cardEl = this.container.querySelector(".study-card");
      if (cardEl) {
        cardEl.classList.remove("card-shake");
        void cardEl.offsetWidth;
        cardEl.classList.add("card-shake");
        setTimeout(() => {
          cardEl.classList.remove("card-shake");
        }, 450);
      }
    }
    /**
     * Keyboard shortcut navigation
     */
    handleKeyDown(e) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) {
        return;
      }
      switch (e.key) {
        case " ":
        case "Enter":
        case "ArrowUp":
        case "ArrowDown":
          e.preventDefault();
          this.flipCard(1);
          break;
        case "ArrowLeft":
        case "b":
        case "B":
          e.preventDefault();
          this.goBack();
          break;
        case "ArrowRight":
        case "n":
        case "N":
          e.preventDefault();
          this._drawNext(true);
          break;
      }
    }
    _renderStudyLayout() {
      this.container.innerHTML = `
      <div class="study-screen" id="study-screen">
        <header class="study-appbar">
          <button type="button" class="icon-btn" id="study-back-btn" aria-label="${t("back")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          
          <div class="study-title-group">
            <h1 class="study-deck-title" id="study-deck-title"></h1>
          </div>

          <div class="study-actions">
            <button type="button" class="icon-btn" id="study-reset-btn" title="${t("btn_shuffle_reset")}" aria-label="${t("btn_shuffle_reset")}">
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
                    <span class="card-face-tag">C\xE2u h\u1ECFi \xB7 Question</span>
                  </div>
                  <div class="card-scroll" id="card-front-scroll">
                    <div class="card-content-box" id="card-front-content"></div>
                  </div>
                </div>

                <!-- Back Face: Answer -->
                <div class="card-face card-back">
                  <div class="card-face-header">
                    <span class="card-face-tag">\u0110\xE1p \xE1n \xB7 Answer</span>
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
          <div class="study-chip" id="study-counter-chip">\u0110\xE3 xem 0 / 0</div>
        </div>

        <div class="study-progress-container">
          <div class="study-progress-bar" id="study-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${t("study_progress_label")}">
            <div class="study-progress-fill" id="study-progress-fill" style="width: 0%;"></div>
          </div>
        </div>

        <footer class="study-bottom-bar">
          <button type="button" class="circle-btn circle-btn-tonal" id="btn-study-back" aria-label="${t("btn_back")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>

          <button type="button" class="circle-btn circle-btn-primary study-flip-btn" id="btn-study-flip" aria-label="${t("btn_flip_to_answer")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
          </button>

          <button type="button" class="circle-btn circle-btn-tonal" id="btn-study-next" aria-label="${t("btn_next")}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
          </button>
        </footer>

        <!-- First-Run Hint Overlay -->
        <div class="study-hint-overlay hidden" id="study-hint-overlay">
          <div class="hint-card">
            <div class="hint-icon">\u{1F4A1}</div>
            <p class="hint-text">${t("study_hint_overlay")}</p>
            <span class="hint-sub">${t("study_hint_tap")}</span>
          </div>
        </div>
      </div>
    `;
      const titleEl = this.container.querySelector("#study-deck-title");
      if (titleEl) titleEl.textContent = this.currentSet.title;
      this.container.querySelector("#study-back-btn").addEventListener("click", () => {
        if (this.onBack) this.onBack();
      });
      this.container.querySelector("#btn-study-back").addEventListener("click", () => this.goBack());
      this.container.querySelector("#btn-study-next").addEventListener("click", () => this._drawNext(true));
      this.container.querySelector("#btn-study-flip").addEventListener("click", () => this.flipCard(1));
      this.container.querySelector("#study-reset-btn").addEventListener("click", () => this.resetShuffle());
      const track = this.container.querySelector("#study-card-track");
      if (this.swipeCleanup) this.swipeCleanup();
      this.swipeCleanup = attachSwipe(track, {
        onNext: () => this._drawNext(true),
        onBack: () => this.goBack(),
        onTap: () => this.flipCard(1)
      });
    }
    _updateCardDisplay(animationType = "none") {
      if (!this.currentSet || !this.currentSet.cards || this.currentSet.cards.length === 0) return;
      if (this.currentIndex < 0 || this.currentIndex >= this.cardOrder.length) return;
      const actualCardIndex = this.cardOrder[this.currentIndex];
      const card = this.currentSet.cards[actualCardIndex];
      if (!card) return;
      const frontContent = this.container.querySelector("#card-front-content");
      const backContent = this.container.querySelector("#card-back-content");
      const counterChip = this.container.querySelector("#study-counter-chip");
      const backBtn = this.container.querySelector("#btn-study-back");
      const cardWrapper = this.container.querySelector("#study-card-wrapper");
      const cardEl = this.container.querySelector("#study-card");
      const flipBtn = this.container.querySelector("#btn-study-flip");
      const totalCards = this.cardOrder.length;
      const currentCardNum = this.currentIndex + 1;
      const progressPercent = totalCards > 0 ? Math.min(100, Math.max(0, Math.round(currentCardNum / totalCards * 100))) : 0;
      const progressBar = this.container.querySelector("#study-progress-bar");
      const progressFill = this.container.querySelector("#study-progress-fill");
      if (counterChip) {
        counterChip.textContent = t("study_seen_chip", {
          seen: currentCardNum,
          total: totalCards
        });
      }
      if (progressBar) {
        progressBar.setAttribute("aria-valuenow", String(progressPercent));
      }
      if (progressFill) {
        progressFill.style.width = `${progressPercent}%`;
      }
      this._saveCurrentProgress();
      if (backBtn) {
        backBtn.disabled = this.currentIndex <= 0;
      }
      if (frontContent) frontContent.innerHTML = renderCardFaceHTML(card, "q");
      if (backContent) backContent.innerHTML = renderCardFaceHTML(card, "a");
      const frontScroll = this.container.querySelector("#card-front-scroll");
      const backScroll = this.container.querySelector("#card-back-scroll");
      if (frontScroll) frontScroll.scrollTop = 0;
      if (backScroll) backScroll.scrollTop = 0;
      this.face = "q";
      if (cardWrapper) {
        cardWrapper.classList.remove("is-flipped");
      }
      if (flipBtn) {
        flipBtn.setAttribute("aria-label", t("btn_flip_to_answer"));
      }
      if (animationType === "next" && cardEl) {
        this.isAnimating = true;
        cardEl.classList.remove("slide-in-right", "slide-in-left");
        void cardEl.offsetWidth;
        cardEl.classList.add("slide-in-right");
        setTimeout(() => {
          cardEl.classList.remove("slide-in-right");
          this.isAnimating = false;
        }, 250);
      } else if (animationType === "back" && cardEl) {
        this.isAnimating = true;
        cardEl.classList.remove("slide-in-right", "slide-in-left");
        void cardEl.offsetWidth;
        cardEl.classList.add("slide-in-left");
        setTimeout(() => {
          cardEl.classList.remove("slide-in-left");
          this.isAnimating = false;
        }, 250);
      }
    }
    _checkFirstRunHint() {
      const prefs = store.getPrefs();
      if (!prefs.hintSeen) {
        const hintOverlay = this.container.querySelector("#study-hint-overlay");
        if (hintOverlay) {
          hintOverlay.classList.remove("hidden");
          hintOverlay.addEventListener("click", () => {
            hintOverlay.classList.add("hidden");
            store.savePrefs({ hintSeen: true });
          }, { once: true });
        }
      }
    }
  };

  // js/main.js
  var App = class {
    constructor() {
      this.appBar = null;
      this.mainContainer = null;
      this.studyController = null;
      this.currentRoute = { path: "", param: "" };
      this.searchQuery = "";
      this.questionSearchQuery = "";
      this.reviewSearchQuery = "";
      this.expandedReviewCardId = null;
      this.deferredInstallPrompt = null;
    }
    init() {
      this.resumeStudySession = null;
      i18n.init();
      store.requestPersistentStorage();
      this.appBar = document.getElementById("app-bar");
      this.mainContainer = document.getElementById("main-content");
      this._setupGlobalListeners();
      this._registerServiceWorker();
      this._initPWAInstallation();
      this._handleRouteChange();
    }
    _setupGlobalListeners() {
      window.addEventListener("hashchange", () => this._handleRouteChange());
      store.subscribe(() => {
        if (this.currentRoute.path === "library") {
          this.renderLibrary();
        } else if (this.currentRoute.path === "set" && this.currentRoute.param) {
          this.renderSetDetail(this.currentRoute.param);
        } else if (this.currentRoute.path === "review" && this.currentRoute.param) {
          this.renderReview(this.currentRoute.param);
        }
      });
      i18n.subscribe(() => {
        this._updateAppBar();
        this._handleRouteChange();
      });
      document.addEventListener("click", (e) => {
        const openMenu = document.querySelector(".dropdown-menu.is-open");
        if (openMenu && !openMenu.contains(e.target) && !e.target.closest(".menu-trigger")) {
          openMenu.classList.remove("is-open");
        }
      });
    }
    _registerServiceWorker() {
      if ("serviceWorker" in navigator && location.protocol !== "file:") {
        navigator.serviceWorker.register("./sw.js", { scope: "./" }).then((registration) => {
          registration.update().catch(() => {
          });
          const promptUpdate = (worker) => {
            if (!worker) return;
            ui.showSnackbar(t("toast_update_available"), {
              actionLabel: t("toast_update_reload_btn"),
              onAction: () => {
                worker.postMessage({ action: "skipWaiting", type: "SKIP_WAITING" });
                window.location.reload();
              },
              duration: 15e3
            });
          };
          if (registration.waiting && navigator.serviceWorker.controller) {
            promptUpdate(registration.waiting);
          }
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                promptUpdate(newWorker);
              }
            });
          });
        }).catch((err) => {
          console.warn("[MyQuizlet] Service Worker registration failed:", err);
        });
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      }
    }
    _initPWAInstallation() {
      const btnInstall = document.getElementById("btnInstall");
      const iosInstallModal = document.getElementById("iosInstallModal");
      const btnCloseIosModal = document.getElementById("btnCloseIosModal");
      const btnGotItIos = document.getElementById("btnGotItIos");
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      if (isStandalone) {
        if (btnInstall) btnInstall.classList.add("hidden");
      } else if (isIOS && btnInstall) {
        btnInstall.classList.remove("hidden");
      }
      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        this.deferredInstallPrompt = e;
        if (!isStandalone && btnInstall) {
          btnInstall.classList.remove("hidden");
        }
      });
      window.addEventListener("appinstalled", () => {
        this.deferredInstallPrompt = null;
        if (btnInstall) btnInstall.classList.add("hidden");
        ui.showSnackbar(t("app_installed_success"));
      });
      if (btnInstall) {
        btnInstall.addEventListener("click", async () => {
          if (this.deferredInstallPrompt) {
            this.deferredInstallPrompt.prompt();
            const { outcome } = await this.deferredInstallPrompt.userChoice;
            if (outcome === "accepted") {
              btnInstall.classList.add("hidden");
            }
            this.deferredInstallPrompt = null;
          } else if (iosInstallModal) {
            iosInstallModal.classList.remove("hidden");
          }
        });
      }
      const closeIosModal = () => {
        if (iosInstallModal) iosInstallModal.classList.add("hidden");
      };
      if (btnCloseIosModal) btnCloseIosModal.addEventListener("click", closeIosModal);
      if (btnGotItIos) btnGotItIos.addEventListener("click", closeIosModal);
      if (iosInstallModal) {
        iosInstallModal.addEventListener("click", (e) => {
          if (e.target === iosInstallModal) closeIosModal();
        });
        window.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && !iosInstallModal.classList.contains("hidden")) {
            closeIosModal();
          }
        });
      }
    }
    _parseHash() {
      const hash = window.location.hash || "#/";
      const clean = hash.replace(/^#\/?/, "");
      const parts = clean.split("/");
      if (!parts[0] || parts[0] === "") {
        return { path: "library", param: "" };
      }
      if (parts[0] === "set" && parts[1]) {
        return { path: "set", param: parts[1] };
      }
      if (parts[0] === "review" && parts[1]) {
        return { path: "review", param: parts[1] };
      }
      if (parts[0] === "study" && parts[1]) {
        return { path: "study", param: parts[1] };
      }
      if (parts[0] === "import") {
        return { path: "import", param: "" };
      }
      return { path: "library", param: "" };
    }
    _handleRouteChange() {
      const route = this._parseHash();
      this.currentRoute = route;
      if (this.studyController && route.path !== "study") {
        this.studyController.destroy();
        this.studyController = null;
      }
      this._updateAppBar();
      switch (route.path) {
        case "library":
          this.renderLibrary();
          break;
        case "set":
          this.renderSetDetail(route.param);
          break;
        case "review":
          this.renderReview(route.param);
          break;
        case "study":
          this.renderStudy(route.param);
          break;
        case "import":
          this.renderLibrary();
          this._openImportSheet();
          break;
        default:
          this.renderLibrary();
      }
    }
    _updateAppBar() {
      const isStudy = this.currentRoute.path === "study";
      if (isStudy) {
        this.appBar.classList.add("hidden");
        return;
      }
      this.appBar.classList.remove("hidden");
      const isSubScreen = this.currentRoute.path === "set" || this.currentRoute.path === "review";
      const backBtn = this.appBar.querySelector("#app-back-btn");
      const titleEl = this.appBar.querySelector("#app-title");
      if (backBtn) {
        backBtn.classList.toggle("hidden", !isSubScreen);
        backBtn.onclick = () => {
          if (this.currentRoute.path === "review") {
            window.location.hash = `#/set/${this.currentRoute.param}`;
          } else {
            window.location.hash = "#/";
          }
        };
      }
      if (titleEl) {
        if (this.currentRoute.path === "review") {
          const set = store.getSet(this.currentRoute.param);
          titleEl.textContent = set ? `${t("action_review")} \u2014 ${set.title}` : t("action_review");
        } else if (this.currentRoute.path === "set") {
          titleEl.textContent = t("deck_detail_title");
        } else {
          titleEl.textContent = t("app_title");
        }
      }
      const menuBtn = this.appBar.querySelector("#app-menu-btn");
      const menuDropdown = this.appBar.querySelector("#app-menu-dropdown");
      if (menuBtn && menuDropdown) {
        menuBtn.onclick = (e) => {
          e.stopPropagation();
          menuDropdown.classList.toggle("is-open");
        };
        const langSpan = menuDropdown.querySelector("#menu-lang-text");
        if (langSpan) {
          langSpan.innerHTML = `${t("language")}: <strong>${i18n.getLang() === "vi" ? "Ti\u1EBFng Vi\u1EC7t" : "English"}</strong>`;
        }
        const storageSpan = menuDropdown.querySelector("#menu-storage-text");
        if (storageSpan) storageSpan.textContent = t("storage");
        const helpSpan = menuDropdown.querySelector("#menu-help-text");
        if (helpSpan) helpSpan.textContent = t("help");
        const aboutSpan = menuDropdown.querySelector("#menu-about-text");
        if (aboutSpan) aboutSpan.textContent = t("about");
        const optLang = menuDropdown.querySelector("#menu-opt-lang");
        if (optLang) {
          optLang.onclick = (e) => {
            e.stopPropagation();
            menuDropdown.classList.remove("is-open");
            i18n.toggleLang();
          };
        }
        const optStorage = menuDropdown.querySelector("#menu-opt-storage");
        if (optStorage) {
          optStorage.onclick = (e) => {
            e.stopPropagation();
            menuDropdown.classList.remove("is-open");
            ui.showStorageDialog();
          };
        }
        const optHelp = menuDropdown.querySelector("#menu-opt-help");
        if (optHelp) {
          optHelp.onclick = (e) => {
            e.stopPropagation();
            menuDropdown.classList.remove("is-open");
            ui.showHelpDialog();
          };
        }
        const optAbout = menuDropdown.querySelector("#menu-opt-about");
        if (optAbout) {
          optAbout.onclick = (e) => {
            e.stopPropagation();
            menuDropdown.classList.remove("is-open");
            ui.showAboutDialog();
          };
        }
      }
      const installText = this.appBar.querySelector("#btn-install-text");
      if (installText) installText.textContent = t("install_btn");
      const btnInstall = this.appBar.querySelector("#btnInstall");
      if (btnInstall) btnInstall.setAttribute("aria-label", t("install_btn_aria"));
      const iosModalTitle = document.getElementById("iosModalTitle");
      if (iosModalTitle) iosModalTitle.textContent = t("ios_install_title");
      const iosIntro = document.getElementById("ios-install-intro");
      if (iosIntro) iosIntro.textContent = t("ios_install_intro");
      const iosStep1 = document.getElementById("ios-step-1");
      if (iosStep1) iosStep1.innerHTML = t("ios_step_1");
      const iosStep2 = document.getElementById("ios-step-2");
      if (iosStep2) iosStep2.innerHTML = t("ios_step_2");
      const iosStep3 = document.getElementById("ios-step-3");
      if (iosStep3) iosStep3.innerHTML = t("ios_step_3");
      const btnGotItIos = document.getElementById("btnGotItIos");
      if (btnGotItIos) btnGotItIos.textContent = t("ios_install_got_it");
    }
    /**
     * Screen 1: Library Screen (A5)
     */
    renderLibrary() {
      const index = store.getIndex();
      const filtered = this.searchQuery ? index.filter((item) => item.title.toLowerCase().includes(this.searchQuery.toLowerCase())) : index;
      const showSearch = index.length > 8 || this.searchQuery.length > 0;
      let searchHtml = "";
      if (showSearch) {
        searchHtml = `
        <div class="search-bar-wrapper">
          <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input type="search" id="library-search-input" class="search-input" placeholder="${t("search_decks")}" value="${this.searchQuery}" />
          ${this.searchQuery ? '<button type="button" id="clear-search-btn" class="icon-btn-sm">\u2715</button>' : ""}
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
            <h2 class="empty-title">${t("empty_library_title")}</h2>
            <p class="empty-desc">${t("empty_library_desc")}</p>
            <button type="button" class="btn btn-primary btn-lg" id="empty-import-btn">
              <svg class="icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              <span>${t("import_cards_btn")}</span>
            </button>
          </div>
        </div>
      `;
        this.mainContainer.querySelector("#empty-import-btn").addEventListener("click", () => {
          this._openImportSheet();
        });
        return;
      }
      let cardsHtml = "";
      filtered.forEach((set) => {
        const lockBadge = set.allowAnswer === false ? `<span class="card-lock-badge" title="${t("lock_badge_tooltip")}">\u{1F512}</span>` : "";
        const relativeTime = i18n.formatRelativeTime(set.lastStudiedAt);
        cardsHtml += `
        <article class="deck-card" data-set-id="${set.id}">
          <div class="deck-card-main">
            <div class="deck-card-header">
              <h2 class="deck-title">${this._escapeHTML(set.title)}</h2>
              ${lockBadge}
            </div>
            
            <div class="deck-meta">
              <span class="chip-count">${t("deck_card_count", { count: set.count })}</span>
              <span class="meta-time">${t("last_studied", { time: relativeTime })}</span>
            </div>
          </div>

          <div class="deck-card-actions">
            <div class="deck-card-btn-group">
              <button type="button" class="btn btn-tonal btn-study-card" data-set-id="${set.id}">
                <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>${t("action_study")}</span>
              </button>
              <button type="button" class="btn btn-tonal btn-review-card" data-set-id="${set.id}" ${set.count === 0 ? "disabled" : ""}>
                <svg class="icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                <span>${t("action_review")}</span>
              </button>
            </div>

            <div class="card-menu-container">
              <button type="button" class="icon-btn menu-trigger card-menu-btn" data-set-id="${set.id}" aria-label="${t("menu")}">
                <svg class="icon" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
              </button>
              <div class="dropdown-menu card-menu-dropdown" id="menu-${set.id}">
                <button type="button" class="menu-item action-study-item" data-set-id="${set.id}">
                  <span>${t("action_study")}</span>
                </button>
                <button type="button" class="menu-item action-review-item" data-set-id="${set.id}">
                  <span>${t("action_review")}</span>
                </button>
                <button type="button" class="menu-item action-detail-item" data-set-id="${set.id}">
                  <span>${t("deck_detail_title")}</span>
                </button>
                <button type="button" class="menu-item action-rename-item" data-set-id="${set.id}">
                  <span>${t("action_rename")}</span>
                </button>
                <button type="button" class="menu-item action-reimport-item" data-set-id="${set.id}">
                  <span>${t("action_reimport")}</span>
                </button>
                <button type="button" class="menu-item action-edit-md-item" data-set-id="${set.id}">
                  <span>${t("action_edit_markdown")}</span>
                </button>
                <button type="button" class="menu-item action-toggle-item" data-set-id="${set.id}">
                  <span>${set.allowAnswer === false ? t("action_answers_allowed") : t("action_answers_hidden")}</span>
                </button>
                <button type="button" class="menu-item action-export-item" data-set-id="${set.id}">
                  <span>${t("action_export")}</span>
                </button>
                <div class="menu-divider"></div>
                <button type="button" class="menu-item menu-item-danger action-delete-item" data-set-id="${set.id}">
                  <span>${t("action_delete")}</span>
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
        <button type="button" class="fab" id="fab-create" aria-label="${t("create_deck_fab")}">
          <svg class="icon-fab" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>
    `;
      if (showSearch) {
        const searchInput = this.mainContainer.querySelector("#library-search-input");
        searchInput.addEventListener("input", (e) => {
          this.searchQuery = e.target.value;
          this.renderLibrary();
        });
        const clearBtn = this.mainContainer.querySelector("#clear-search-btn");
        if (clearBtn) {
          clearBtn.addEventListener("click", () => {
            this.searchQuery = "";
            this.renderLibrary();
          });
        }
      }
      this.mainContainer.querySelectorAll(".deck-card-main").forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.closest(".deck-card").dataset.setId;
          window.location.hash = `#/set/${id}`;
        });
      });
      this.mainContainer.querySelectorAll(".btn-study-card, .action-study-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          this.startStudyFlow(id);
        });
      });
      this.mainContainer.querySelectorAll(".btn-review-card, .action-review-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          window.location.hash = `#/review/${id}`;
        });
      });
      this.mainContainer.querySelectorAll(".action-detail-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          window.location.hash = `#/set/${id}`;
        });
      });
      this.mainContainer.querySelectorAll(".card-menu-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          const menu = this.mainContainer.querySelector(`#menu-${id}`);
          this.mainContainer.querySelectorAll(".card-menu-dropdown.is-open").forEach((m) => {
            if (m !== menu) m.classList.remove("is-open");
          });
          if (menu) menu.classList.toggle("is-open");
        });
      });
      this.mainContainer.querySelectorAll(".action-rename-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          this._promptRenameSet(id);
        });
      });
      this.mainContainer.querySelectorAll(".action-edit-md-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          const menu = this.mainContainer.querySelector(`#menu-${id}`);
          if (menu) menu.classList.remove("is-open");
          this._openEditMarkdown(id);
        });
      });
      this.mainContainer.querySelectorAll(".action-reimport-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          const menu = this.mainContainer.querySelector(`#menu-${id}`);
          if (menu) menu.classList.remove("is-open");
          this._openReimportSet(id);
        });
      });
      this.mainContainer.querySelectorAll(".action-toggle-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          const set = store.getSet(id);
          if (set) {
            store.setAllowAnswer(id, !set.allowAnswer);
            ui.showSnackbar(set.allowAnswer ? t("action_answers_hidden") : t("action_answers_allowed"));
            this.renderLibrary();
          }
        });
      });
      this.mainContainer.querySelectorAll(".action-export-item").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          const set = store.getSet(id);
          if (set) {
            const res = await downloadSetAsMarkdown(set);
            ui.showSnackbar(t("toast_exported", { fileName: res.fileName }));
          }
        });
      });
      this.mainContainer.querySelectorAll(".action-delete-item").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = btn.dataset.setId;
          await this._handleDeleteSet(id);
        });
      });
      this.mainContainer.querySelector("#fab-create").addEventListener("click", () => {
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
        ui.showSnackbar("B\u1ED9 th\u1EBB kh\xF4ng t\u1ED3n t\u1EA1i / Deck not found");
        window.location.hash = "#/";
        return;
      }
      const cards = set.cards || [];
      const filteredCards = this.questionSearchQuery ? cards.filter((c) => (c.q || "").toLowerCase().includes(this.questionSearchQuery.toLowerCase())) : cards;
      let questionsListHtml = "";
      if (cards.length === 0) {
        questionsListHtml = `
        <div class="empty-deck-notice-box">
          <p class="empty-deck-notice">${t("empty_deck_hint")}</p>
          <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; align-items:center;">
            <button type="button" class="circle-btn circle-btn-primary" id="empty-deck-reimport-btn" title="${t("action_reimport")}" aria-label="${t("action_reimport")}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
            <button type="button" class="circle-btn circle-btn-tonal" id="empty-deck-edit-md-btn" title="${t("action_edit_markdown")}" aria-label="${t("action_edit_markdown")}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          </div>
        </div>
      `;
      } else if (filteredCards.length === 0) {
        questionsListHtml = `<p class="empty-deck-notice">${t("empty_search_questions", { query: this.questionSearchQuery })}</p>`;
      } else {
        questionsListHtml = filteredCards.map((c, idx) => {
          const qHtml = renderInlineQuestionHTML(c.q);
          return `
            <div class="question-list-item">
              <div class="q-item-num">${idx + 1}</div>
              <div class="q-item-body">
                <div class="q-item-title">${qHtml}</div>
              </div>
            </div>
          `;
        }).join("");
      }
      this.mainContainer.innerHTML = `
      <div class="detail-container">
        <header class="detail-header-card">
          <div class="detail-title-row">
            <h1 class="detail-title" id="detail-title-display">${this._escapeHTML(set.title)}</h1>
            <button type="button" class="icon-btn-sm" id="detail-edit-title-btn" title="${t("action_rename")}">
              <svg class="icon-sm" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          </div>

          <div class="detail-toggle-row">
            <label class="switch-container" for="switch-allow-answer">
              <span class="switch-label">${t("allow_answers_toggle")}</span>
              <input type="checkbox" id="switch-allow-answer" class="switch-input" ${set.allowAnswer !== false ? "checked" : ""} />
              <span class="switch-track"></span>
            </label>
          </div>

          <div class="detail-actions-row">
            <button type="button" class="circle-btn circle-btn-primary" id="detail-study-btn" title="${t("action_study")}" aria-label="${t("action_study")}" ${cards.length === 0 ? "disabled" : ""}>
              <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-tonal" id="detail-review-btn" title="${t("action_review")}" aria-label="${t("action_review")}" ${cards.length === 0 ? "disabled" : ""}>
              <svg class="icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-tonal" id="detail-reimport-btn" title="${t("action_reimport")}" aria-label="${t("action_reimport")}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-tonal" id="detail-edit-md-btn" title="${t("action_edit_markdown")}" aria-label="${t("action_edit_markdown")}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-tonal" id="detail-export-btn" title="${t("action_export")}" aria-label="${t("action_export")}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
            </button>

            <button type="button" class="circle-btn circle-btn-danger" id="detail-delete-btn" title="${t("action_delete")}" aria-label="${t("action_delete")}">
              <svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </header>

        <section class="detail-questions-section">
          <div class="section-heading-row">
            <span class="questions-count">${t("questions_count_label", { shown: filteredCards.length, total: cards.length })}</span>
          </div>

          ${cards.length > 5 || this.questionSearchQuery ? `
                <div class="search-bar-wrapper">
                  <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                  <input type="search" id="question-search-input" class="search-input" placeholder="${t("search_questions_placeholder")}" value="${this.questionSearchQuery}" />
                </div>
              ` : ""}

          <div class="questions-list">
            ${questionsListHtml}
          </div>
        </section>
      </div>
    `;
      const titleDisplay = this.mainContainer.querySelector("#detail-title-display");
      const editBtn = this.mainContainer.querySelector("#detail-edit-title-btn");
      const startEditing = () => {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "inline-title-input";
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
              ui.showSnackbar(t("toast_renamed"));
            } catch (e) {
              ui.showSnackbar(e.message);
            }
          }
          this.renderSetDetail(setId);
        };
        input.addEventListener("blur", () => finish(true));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        });
      };
      titleDisplay.addEventListener("click", startEditing);
      editBtn.addEventListener("click", startEditing);
      const switchEl = this.mainContainer.querySelector("#switch-allow-answer");
      switchEl.addEventListener("change", (e) => {
        store.setAllowAnswer(setId, e.target.checked);
        ui.showSnackbar(e.target.checked ? t("action_answers_allowed") : t("action_answers_hidden"));
        this.renderSetDetail(setId);
      });
      this.mainContainer.querySelector("#detail-study-btn").addEventListener("click", () => {
        this.startStudyFlow(setId);
      });
      const detailReviewBtn = this.mainContainer.querySelector("#detail-review-btn");
      if (detailReviewBtn) {
        detailReviewBtn.addEventListener("click", () => {
          window.location.hash = `#/review/${setId}`;
        });
      }
      const openEditMd = () => {
        this._openEditMarkdown(setId);
      };
      const editMdBtn = this.mainContainer.querySelector("#detail-edit-md-btn");
      if (editMdBtn) editMdBtn.addEventListener("click", openEditMd);
      const emptyEditMdBtn = this.mainContainer.querySelector("#empty-deck-edit-md-btn");
      if (emptyEditMdBtn) emptyEditMdBtn.addEventListener("click", openEditMd);
      const openReimport = () => {
        this._openReimportSet(setId);
      };
      const reimportBtn = this.mainContainer.querySelector("#detail-reimport-btn");
      if (reimportBtn) reimportBtn.addEventListener("click", openReimport);
      const emptyReimportBtn = this.mainContainer.querySelector("#empty-deck-reimport-btn");
      if (emptyReimportBtn) emptyReimportBtn.addEventListener("click", openReimport);
      this.mainContainer.querySelector("#detail-export-btn").addEventListener("click", async () => {
        const res = await downloadSetAsMarkdown(set);
        ui.showSnackbar(t("toast_exported", { fileName: res.fileName }));
      });
      this.mainContainer.querySelector("#detail-delete-btn").addEventListener("click", async () => {
        await this._handleDeleteSet(setId);
      });
      const qSearch = this.mainContainer.querySelector("#question-search-input");
      if (qSearch) {
        qSearch.addEventListener("input", (e) => {
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
        ui.showSnackbar("B\u1ED9 th\u1EBB kh\xF4ng t\u1ED3n t\u1EA1i / Deck not found");
        window.location.hash = "#/";
        return;
      }
      const cards = set.cards || [];
      const term = (this.reviewSearchQuery || "").trim().toLowerCase();
      const filteredCards = term ? cards.filter((c) => (c.q || "").toLowerCase().includes(term) || (c.a || "").toLowerCase().includes(term)) : cards;
      let contentHtml = "";
      if (cards.length === 0) {
        contentHtml = `
        <div class="review-empty-state">
          <p class="empty-deck-notice">${t("review_empty_notice")}</p>
          <div style="margin-top: var(--space-4); display: flex; justify-content: center; gap: var(--space-3);">
            <button type="button" class="btn btn-tonal" id="review-back-detail-btn">
              <span>${t("deck_detail_title")}</span>
            </button>
          </div>
        </div>
      `;
      } else if (filteredCards.length === 0) {
        contentHtml = `
        <div class="review-empty-state">
          <p class="empty-deck-notice">${t("review_empty_search", { query: this._escapeHTML(this.reviewSearchQuery) })}</p>
        </div>
      `;
      } else {
        contentHtml = `
        <div class="review-question-list" id="review-question-list" role="list" aria-label="${t("review_screen_title")}">
          ${filteredCards.map((card, idx) => {
          const qHtml = renderInlineQuestionHTML(card.q);
          return `
                <div class="review-question-item" data-card-id="${card.id}" data-card-index="${idx}" role="listitem" tabindex="0" aria-label="${this._escapeHTML(card.q)}">
                  <div class="review-q-title">${qHtml}</div>
                </div>
              `;
        }).join("")}
        </div>
      `;
      }
      this.mainContainer.innerHTML = `
      <div class="review-container">
        <header class="review-header-card">
          <div class="review-header-top">
            <h1 class="review-title">${this._escapeHTML(set.title)}</h1>
            ${cards.length > 0 ? `
                  <button type="button" class="btn btn-primary btn-sm" id="review-study-btn">
                    <svg class="icon-sm" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span>${t("action_study")}</span>
                  </button>
                ` : ""}
          </div>

          <div class="review-header-meta">
            <span class="chip-count">${t("deck_card_count", { count: cards.length })}</span>
            <span class="review-hint-badge">
              <svg class="icon-sm" viewBox="0 0 24 24"><path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/></svg>
              ${t("review_hint")}
            </span>
          </div>

          ${cards.length > 3 || this.reviewSearchQuery ? `
                <div class="search-bar-wrapper" style="margin-top: var(--space-4);">
                  <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                  <input type="search" id="review-search-input" class="search-input" placeholder="${t("review_search_placeholder")}" value="${this._escapeHTML(this.reviewSearchQuery || "")}" />
                </div>
              ` : ""}
        </header>

        ${contentHtml}
      </div>
    `;
      const qList = this.mainContainer.querySelector("#review-question-list");
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
        qList.addEventListener("click", (e) => {
          const item = e.target.closest(".review-question-item");
          openCardModal(item);
        });
        qList.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            const item = e.target.closest(".review-question-item");
            if (item) {
              e.preventDefault();
              openCardModal(item);
            }
          }
        });
      }
      const searchInput = this.mainContainer.querySelector("#review-search-input");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          this.reviewSearchQuery = e.target.value;
          this.renderReview(setId);
          const newInput = this.mainContainer.querySelector("#review-search-input");
          if (newInput) {
            newInput.focus();
            newInput.setSelectionRange(newInput.value.length, newInput.value.length);
          }
        });
      }
      const studyBtn = this.mainContainer.querySelector("#review-study-btn");
      if (studyBtn) {
        studyBtn.addEventListener("click", () => {
          this.startStudyFlow(setId);
        });
      }
      const emptyBackBtn = this.mainContainer.querySelector("#review-back-detail-btn");
      if (emptyBackBtn) {
        emptyBackBtn.addEventListener("click", () => {
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
        ui.showSnackbar("B\u1ED9 th\u1EBB kh\xF4ng t\u1ED3n t\u1EA1i / Deck not found");
        return;
      }
      if (!set.cards || set.cards.length === 0) {
        ui.showSnackbar(t("empty_deck_cannot_study"));
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
        ui.showSnackbar("B\u1ED9 th\u1EBB kh\xF4ng t\u1ED3n t\u1EA1i / Deck not found");
        return;
      }
      ui.openReimportSheet({
        currentSet,
        onReimported: (newParsedSet) => {
          try {
            currentSet.cards = newParsedSet.cards || [];
            if (newParsedSet.title && newParsedSet.title !== "Untitled" && newParsedSet.title !== "Pasted-Deck" && newParsedSet.title !== "Reimported-Deck") {
              currentSet.title = newParsedSet.title;
            }
            currentSet.updatedAt = Date.now();
            clearRenderCache();
            store.saveSet(currentSet);
            ui.showSnackbar(t("toast_reimported", { count: currentSet.cards.length }));
            if (this.currentRoute.path === "set" && this.currentRoute.param === setId) {
              this.renderSetDetail(setId);
            } else if (this.currentRoute.path === "library") {
              this.renderLibrary();
            }
          } catch (err) {
            if (err.name === "QuotaExceededError") {
              ui.showSnackbar(t("toast_quota_error"));
            } else {
              ui.showSnackbar(`L\u1ED7i c\u1EADp nh\u1EADt b\u1ED9 th\u1EBB: ${err.message}`);
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
            ui.showSnackbar(t("toast_markdown_saved", { count: set.cards.length }));
            if (this.currentRoute.path === "set" && this.currentRoute.param === setId) {
              this.renderSetDetail(setId);
            } else if (this.currentRoute.path === "library") {
              this.renderLibrary();
            }
          } catch (err) {
            if (err.name === "QuotaExceededError") {
              ui.showSnackbar(t("toast_quota_error"));
            } else {
              ui.showSnackbar(`L\u1ED7i l\u01B0u b\u1ED9 th\u1EBB: ${err.message}`);
            }
          }
        }
      });
    }
    _openImportSheet() {
      ui.openImportSheet({
        onImportConfirmed: (parsedSet, mode) => {
          try {
            if (mode === "replace") {
              const existing = store.getIndex().find((s) => s.title.toLowerCase() === parsedSet.title.toLowerCase());
              if (existing) {
                parsedSet.id = existing.id;
              }
            } else if (mode === "duplicate") {
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
            ui.showSnackbar(t("toast_imported", { count: parsedSet.cards.length }));
            window.location.hash = `#/set/${parsedSet.id}`;
          } catch (err) {
            if (err.name === "QuotaExceededError") {
              ui.showSnackbar(t("toast_quota_error"));
            } else {
              ui.showSnackbar(`L\u1ED7i l\u01B0u b\u1ED9 th\u1EBB: ${err.message}`);
            }
          }
        },
        onCreateEmpty: (title) => {
          try {
            const newSet = {
              id: crypto.randomUUID ? crypto.randomUUID() : "set_" + Date.now(),
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
            ui.showSnackbar(`L\u1ED7i t\u1EA1o b\u1ED9 th\u1EBB: ${err.message}`);
          }
        }
      });
    }
    async _handleDeleteSet(setId) {
      const set = store.getSet(setId);
      if (!set) return;
      const confirmed = await ui.showConfirmDialog({
        title: t("delete_confirm_title"),
        message: t("delete_confirm_msg", { title: set.title }),
        confirmText: t("delete_confirm_btn"),
        cancelText: t("cancel"),
        isDestructive: true
      });
      if (!confirmed) return;
      store.deleteSet(setId);
      ui.showSnackbar(t("toast_deleted"), {
        actionLabel: t("toast_undo_btn"),
        onAction: () => {
          const restored = store.undoDelete();
          if (restored) {
            window.location.hash = `#/set/${restored.id}`;
          }
        },
        duration: 6e3
      });
      window.location.hash = "#/";
    }
    async _promptRenameSet(setId) {
      const set = store.getSet(setId);
      if (!set) return;
      const newTitle = window.prompt(t("rename_placeholder"), set.title);
      if (newTitle !== null) {
        const trimmed = newTitle.trim();
        if (!trimmed) {
          ui.showSnackbar("T\xEAn b\u1ED9 th\u1EBB kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng / Title cannot be empty");
          return;
        }
        try {
          store.renameSet(setId, trimmed);
          ui.showSnackbar(t("toast_renamed"));
          this.renderLibrary();
        } catch (e) {
          ui.showSnackbar(e.message);
        }
      }
    }
    _escapeHTML(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    const app = new App();
    app.init();
  });
})();
