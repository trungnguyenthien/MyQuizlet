/**
 * MyQuizlet - Store & Storage
 * Safe localStorage wrapper with memory fallback, quota error handling,
 * index caching, migration hooks, and soft-delete undo buffer.
 */

const STORAGE_KEYS = {
  INDEX: 'mq:v1:index',
  SET_PREFIX: 'mq:v1:set:',
  PROGRESS_PREFIX: 'mq:v1:progress:',
  PREFS: 'mq:v1:prefs',
  SCHEMA: 'mq:v1:schema'
};

const CURRENT_SCHEMA_VERSION = 1;

class Store {
  constructor() {
    this.isMemoryOnly = false;
    this.memoryStore = new Map();
    this.recentlyDeleted = null; // { set, timer }
    this.listeners = new Set();
    this._checkStorageAvailability();
  }

  /**
   * Test if localStorage is functional (handles private browsing / blocked storage)
   */
  _checkStorageAvailability() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        this.isMemoryOnly = true;
        return;
      }
      const testKey = '__mq_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      this.isMemoryOnly = false;
    } catch {
      this.isMemoryOnly = true;
      console.warn('[MyQuizlet] localStorage unavailable; falling back to in-memory store.');
    }
  }

  /**
   * Best-effort persistence request
   */
  async requestPersistentStorage() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        return isPersisted;
      } catch (err) {
        console.warn('[MyQuizlet] navigator.storage.persist() error:', err);
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

    if (typeof navigator !== 'undefined' && navigator.storage) {
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
        console.warn('[MyQuizlet] storage.estimate error:', err);
      }
    }

    const percent = quota > 0 ? Math.round((usage / quota) * 100) : 0;
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
      if (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014) {
        const quotaError = new Error('QUOTA_EXCEEDED');
        quotaError.name = 'QuotaExceededError';
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
      console.error('[MyQuizlet] Corrupt index JSON, resetting index:', err);
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
    if (!set || !set.id) throw new Error('Invalid set: ID is required');

    const now = Date.now();
    const setRecord = {
      id: set.id,
      title: (set.title || 'Untitled').trim(),
      allowAnswer: set.allowAnswer !== false,
      createdAt: set.createdAt || now,
      updatedAt: now,
      lastStudiedAt: set.lastStudiedAt ?? null,
      cards: Array.isArray(set.cards) ? set.cards : []
    };

    // Save full set
    this._setItem(STORAGE_KEYS.SET_PREFIX + setRecord.id, JSON.stringify(setRecord));

    // Update index item
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
    this._notifyChange({ type: 'save', set: setRecord });
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

    // Remove from index and storage immediately
    this._removeItem(STORAGE_KEYS.SET_PREFIX + id);
    this.clearStudyProgress(id);
    const index = this.getIndex().filter((item) => item.id !== id);
    this._saveIndex(index);

    // Clear previous pending undo if any
    if (this.recentlyDeleted && this.recentlyDeleted.timer) {
      clearTimeout(this.recentlyDeleted.timer);
    }

    // Set 6-second undo timeout
    const timer = setTimeout(() => {
      this.recentlyDeleted = null;
    }, 6000);

    this.recentlyDeleted = { set, timer };

    this._notifyChange({ type: 'delete', id });
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

    // Restore set
    this.saveSet(set);
    this._notifyChange({ type: 'undo', set });
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
    const trimmed = (newTitle || '').trim();
    if (!trimmed) throw new Error('Title cannot be empty');
    if (trimmed.length > 120) throw new Error('Title cannot exceed 120 characters');

    const set = this.getSet(id);
    if (!set) throw new Error('Set not found');
    set.title = trimmed;
    return this.saveSet(set);
  }

  /**
   * User preferences: language, first-run hint, etc.
   */
  getPrefs() {
    const raw = this._getItem(STORAGE_KEYS.PREFS);
    const defaults = {
      lang: 'vi',
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
      if (!progress || !Array.isArray(progress.cardOrder) || typeof progress.currentIndex !== 'number') {
        this.clearStudyProgress(setId);
        return null;
      }

      // Cross-check against the set
      const set = this.getSet(setId);
      if (!set || !Array.isArray(set.cards) || set.cards.length === 0) {
        this.clearStudyProgress(setId);
        return null;
      }

      // If cards count changed or indices are out of sync, invalidate progress
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
        console.error('[MyQuizlet] Subscriber error:', e);
      }
    }
  }
}

export const store = new Store();
