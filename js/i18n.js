/**
 * MyQuizlet - Internationalization (i18n)
 * Bi-lingual dictionary (Vietnamese & English), default Vietnamese.
 */

import { store } from './store.js';

const translations = {
  vi: {
    // App & Navigation
    app_title: 'MyQuizlet',
    tagline: 'Bộ thẻ học tập Markdown offline',
    back: 'Quay lại',
    menu: 'Menu',
    settings: 'Cài đặt',
    language: 'Ngôn ngữ (Language)',
    storage: 'Dung lượng lưu trữ',
    about: 'Giới thiệu',
    help: 'Hướng dẫn Markdown',
    close: 'Đóng',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    save: 'Lưu',
    edit: 'Sửa',
    delete: 'Xóa',
    undo: 'Hoàn tác',
    reload: 'Tải lại',

    // Library Screen
    library_title: 'Bộ thẻ của bạn',
    search_decks: 'Tìm kiếm bộ thẻ...',
    empty_library_title: 'Chưa có bộ thẻ nào',
    empty_library_desc: 'Nhập từ file Markdown hoặc tạo mới để bắt đầu học tập ngay trên thiết bị của bạn.',
    import_cards_btn: 'Nhập bộ thẻ',
    create_deck_fab: 'Tạo hoặc nhập bộ thẻ',
    deck_card_count: '{count} thẻ',
    last_studied: 'Học lần cuối: {time}',
    last_studied_never: 'Chưa học',
    last_studied_just_now: 'Vừa xong',
    last_studied_today: 'Hôm nay',
    last_studied_yesterday: 'Hôm qua',
    last_studied_days_ago: '{days} ngày trước',
    lock_badge_tooltip: 'Bộ thẻ đang khóa xem đáp án',

    // Deck actions
    action_study: 'Học ngay',
    action_rename: 'Đổi tên',
    action_reimport: 'Re-import',
    action_edit_markdown: 'Sửa Markdown',
    action_toggle_answers: 'Cho phép xem đáp án',
    action_answers_allowed: 'Đang cho phép xem đáp án',
    action_answers_hidden: 'Đang ẩn đáp án',
    action_export: 'Xuất file Markdown',
    action_delete: 'Xóa bộ thẻ',

    // Re-import
    reimport_sheet_title: 'Re-import: Cập nhật bộ thẻ',
    reimport_sheet_desc: 'Chọn file .md mới hoặc dán nội dung để cập nhật lại toàn bộ thẻ trong bộ này.',
    reimport_load_current: 'Nạp Markdown hiện tại',
    reimport_preview_title: 'Xác nhận Re-import',
    reimport_cards_diff: 'Số thẻ: {oldCount} thẻ ➔ {newCount} thẻ',
    reimport_confirm_msg: 'Thao tác này sẽ ghi đè và cập nhật lại toàn bộ thẻ trong "{title}".',
    reimport_confirm_btn: 'Cập nhật bộ thẻ',

    // Create / Import Bottom Sheet
    sheet_title: 'Tạo hoặc Nhập bộ thẻ',
    sheet_tab_file: 'Tệp Markdown (.md)',
    sheet_tab_paste: 'Dán văn bản',
    sheet_tab_empty: 'Tạo bộ thẻ trống',
    drop_files_here: 'Kéo thả file .md vào đây hoặc',
    browse_files_btn: 'Chọn file từ thiết bị',
    paste_textarea_placeholder: 'Dán nội dung Markdown vào đây...\n---\n# Tên bộ thẻ\n---\n## Câu hỏi 1\nĐáp án 1\n---',
    live_card_count: 'Đã tìm thấy {count} thẻ',
    live_card_count_zero: 'Chưa nhận diện được thẻ nào',
    new_empty_title_label: 'Tiêu đề bộ thẻ:',
    new_empty_title_placeholder: 'Ví dụ: Ôn tập Thuật toán',
    create_empty_btn: 'Tạo bộ thẻ trống',
    preview_btn: 'Xem trước',

    // Preview Dialog
    preview_dialog_title: 'Bản xem trước khi Import',
    preview_deck_title: 'Tiêu đề:',
    preview_total_cards: 'Số lượng thẻ:',
    preview_warnings: 'Cảnh báo ({count}):',
    preview_sample_questions: '3 câu hỏi đầu tiên:',
    preview_confirm_import: 'Tiến hành Import',
    conflict_detected: 'Đã có bộ thẻ trùng tên "{title}". Bạn muốn:',
    conflict_keep_both: 'Giữ cả hai (thêm số)',
    conflict_replace: 'Thay thế bộ thẻ cũ',

    // Set Detail Screen
    deck_detail_title: 'Chi tiết bộ thẻ',
    rename_placeholder: 'Nhập tên bộ thẻ...',
    allow_answers_toggle: 'Cho phép xem đáp án khi học',
    search_questions_placeholder: 'Tìm kiếm câu hỏi trong bộ thẻ...',
    questions_count_label: 'Hiển thị {shown} / {total} câu hỏi',
    empty_deck_hint: 'Bộ thẻ này hiện chưa có thẻ nào. Hãy xuất file hoặc dán Markdown để thêm thẻ.',
    empty_search_questions: 'Không tìm thấy câu hỏi nào phù hợp với "{query}".',
    question_no_answer: '(Không có đáp án)',
    answer_hidden_in_detail: '(Đáp án đang bị ẩn cho bộ thẻ này)',

    // Study Screen
    study_seen_chip: 'Đã xem {seen} / {total}',
    btn_flip: 'Lật thẻ',
    btn_flip_to_answer: 'Xem đáp án',
    btn_flip_to_question: 'Xem câu hỏi',
    btn_next: 'Thẻ tiếp',
    btn_back: 'Thẻ trước',
    btn_shuffle_reset: 'Trộn lại',
    study_hint_overlay: 'Vuốt trái / phải: đổi câu hỏi · Cuộn dọc: đọc nội dung dài',
    study_hint_tap: 'Bấm nút "Xem đáp án" hoặc chạm thẻ để lật',
    single_card_hint: 'Bộ thẻ chỉ có 1 thẻ duy nhất',
    empty_deck_cannot_study: 'Bộ thẻ chưa có thẻ nào để học.',
    hidden_answer_shake_msg: 'Đáp án đã bị ẩn cho bộ thẻ này',
    cycle_complete_msg: 'Đã học xong 1 vòng! Đang tự động trộn lại bộ thẻ...',

    // Dialogs & Feedback
    delete_confirm_title: 'Xóa bộ thẻ',
    delete_confirm_msg: 'Bạn có chắc chắn muốn xóa bộ thẻ "{title}"? Bạn sẽ có 6 giây để hoàn tác.',
    delete_confirm_btn: 'Xóa',
    toast_deleted: 'Đã xóa bộ thẻ · ',
    toast_undo_btn: 'Hoàn tác',
    toast_quota_error: 'Bộ nhớ trình duyệt đã đầy! Hãy xuất bớt bộ thẻ ra Markdown và xóa bớt.',
    toast_update_available: 'Có bản cập nhật mới · ',
    toast_update_reload_btn: 'Tải lại ngay',
    toast_renamed: 'Đã cập nhật tên bộ thẻ',
    toast_imported: 'Đã nhập thành công {count} thẻ',
    toast_exported: 'Đã xuất file {fileName}',
    toast_reimported: 'Đã cập nhật lại toàn bộ bộ thẻ ({count} thẻ)',
    toast_markdown_saved: 'Đã cập nhật bộ thẻ thành công ({count} thẻ)',

    // Edit Markdown Dialog
    edit_markdown_title: 'Sửa Markdown bộ thẻ',
    edit_markdown_help: 'Chỉnh sửa toàn bộ nội dung Markdown của bộ thẻ. Dòng đầu "# Tiêu đề", mỗi thẻ gồm "## Câu hỏi" và phần đáp án bên dưới, ngăn cách bằng "---".',
    edit_markdown_cards_count: 'Đã nhận diện: {count} thẻ',
    edit_markdown_save_btn: 'Lưu thay đổi',

    // Help Dialog
    help_dialog_title: 'Hướng dẫn định dạng Markdown',
    help_dialog_intro: 'MyQuizlet phân tích file Markdown đơn giản thành các thẻ học:',
    help_code_sample: `---
# Tên bộ thẻ
---
## Câu hỏi 1 (viết trên một dòng)

Đáp án 1, hỗ trợ Markdown đầy đủ, ảnh, bảng, trích dẫn.

\`\`\`swift
let message = "Xin chào"
\`\`\`
---
## Câu hỏi 2

- Dòng đáp án thứ nhất
- Dòng đáp án thứ hai
---`,
    help_rule_1: 'Dòng "# ..." đầu tiên là tên của bộ thẻ.',
    help_rule_2: 'Mỗi thẻ bắt đầu bằng "## " cho câu hỏi, theo sau là phần đáp án.',
    help_rule_3: 'Dòng "---" bên ngoài code block là đường phân cách giữa các thẻ.',
    help_rule_4: 'Nếu muốn vẽ đường kẻ ngang bên trong đáp án, hãy dùng "***" hoặc "___" thay vì "---".',
    help_rule_5: 'Code block có chứa "---" hoặc "##" sẽ không bị chia cắt thẻ.',

    // Storage Dialog
    storage_dialog_title: 'Dung lượng lưu trữ',
    storage_persist_label: 'Trạng thái lưu trữ bền vững:',
    storage_persisted_yes: 'Đã kích hoạt (An toàn)',
    storage_persisted_no: 'Tiêu chuẩn (Có thể bị dọn dẹp nếu ổ đĩa đầy)',
    storage_request_persist: 'Kích hoạt lưu trữ bền vững',
    storage_usage_label: 'Bộ nhớ đang sử dụng:',
    storage_decks_count: 'Tổng số bộ thẻ: {decks}',
    storage_cards_count: 'Tổng số thẻ: {cards}',
    storage_note: 'Dữ liệu được lưu trữ hoàn toàn cục bộ trên thiết bị này. Hãy định kỳ xuất file Markdown để sao lưu.',

    // About Dialog
    about_dialog_title: 'Giới thiệu MyQuizlet',
    about_desc: 'MyQuizlet là ứng dụng PWA học flashcard độc lập, không cần tài khoản, hoạt động 100% offline và không gửi dữ liệu ra bên ngoài.',
    about_features: 'Tối ưu cho Markdown, hiển thị code block với syntax highlighting phong cách GitHub, hỗ trợ cử chỉ vuốt mượt mà 60fps.',
    about_version: 'Phiên bản 1.0.0 (Offline PWA)'
  },

  en: {
    // App & Navigation
    app_title: 'MyQuizlet',
    tagline: 'Offline Markdown Flashcard App',
    back: 'Back',
    menu: 'Menu',
    settings: 'Settings',
    language: 'Language (Ngôn ngữ)',
    storage: 'Storage Usage',
    about: 'About',
    help: 'Markdown Guide',
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    undo: 'Undo',
    reload: 'Reload',

    // Library Screen
    library_title: 'Your Decks',
    search_decks: 'Search decks...',
    empty_library_title: 'No decks yet',
    empty_library_desc: 'Import from a Markdown file or create a new deck to start studying locally on your device.',
    import_cards_btn: 'Import Deck',
    create_deck_fab: 'Create or import deck',
    deck_card_count: '{count} cards',
    last_studied: 'Last studied: {time}',
    last_studied_never: 'Never',
    last_studied_just_now: 'Just now',
    last_studied_today: 'Today',
    last_studied_yesterday: 'Yesterday',
    last_studied_days_ago: '{days} days ago',
    lock_badge_tooltip: 'Answers are hidden for this deck',

    // Deck actions
    action_study: 'Study',
    action_rename: 'Rename',
    action_reimport: 'Re-import',
    action_edit_markdown: 'Edit Markdown',
    action_toggle_answers: 'Allow viewing answers',
    action_answers_allowed: 'Answers visible',
    action_answers_hidden: 'Answers hidden',
    action_export: 'Export Markdown',
    action_delete: 'Delete Deck',

    // Re-import
    reimport_sheet_title: 'Re-import: Update Deck',
    reimport_sheet_desc: 'Select a new .md file or paste Markdown to replace and update all cards in this deck.',
    reimport_load_current: 'Load current Markdown',
    reimport_preview_title: 'Confirm Re-import',
    reimport_cards_diff: 'Cards: {oldCount} cards ➔ {newCount} cards',
    reimport_confirm_msg: 'This will overwrite and update all cards in "{title}".',
    reimport_confirm_btn: 'Update Deck',

    // Create / Import Bottom Sheet
    sheet_title: 'Create or Import Deck',
    sheet_tab_file: 'Markdown File (.md)',
    sheet_tab_paste: 'Paste Text',
    sheet_tab_empty: 'New Empty Deck',
    drop_files_here: 'Drag and drop .md files here or',
    browse_files_btn: 'Browse device files',
    paste_textarea_placeholder: 'Paste Markdown notes here...\n---\n# Deck Title\n---\n## Question 1\nAnswer 1\n---',
    live_card_count: '{count} cards found',
    live_card_count_zero: 'No cards detected',
    new_empty_title_label: 'New deck title:',
    new_empty_title_placeholder: 'e.g., Algorithms Interview Prep',
    create_empty_btn: 'Create Empty Deck',
    preview_btn: 'Preview',

    // Preview Dialog
    preview_dialog_title: 'Import Preview',
    preview_deck_title: 'Title:',
    preview_total_cards: 'Card count:',
    preview_warnings: 'Warnings ({count}):',
    preview_sample_questions: 'First 3 questions:',
    preview_confirm_import: 'Confirm Import',
    conflict_detected: 'A deck titled "{title}" already exists. Do you want to:',
    conflict_keep_both: 'Keep both (append number)',
    conflict_replace: 'Replace existing deck',

    // Set Detail Screen
    deck_detail_title: 'Deck Details',
    rename_placeholder: 'Enter deck title...',
    allow_answers_toggle: 'Allow viewing answers while studying',
    search_questions_placeholder: 'Search questions in deck...',
    questions_count_label: 'Showing {shown} / {total} questions',
    empty_deck_hint: 'This deck currently has no cards. Export or paste Markdown to add cards.',
    empty_search_questions: 'No questions match "{query}".',
    question_no_answer: '(No answer)',
    answer_hidden_in_detail: '(Answers are hidden for this deck)',

    // Study Screen
    study_seen_chip: 'Seen {seen} / {total}',
    btn_flip: 'Flip',
    btn_flip_to_answer: 'Show Answer',
    btn_flip_to_question: 'Show Question',
    btn_next: 'Next',
    btn_back: 'Back',
    btn_shuffle_reset: 'Shuffle Reset',
    study_hint_overlay: 'Swipe left / right: change cards · Scroll vertically: read long content',
    study_hint_tap: 'Tap "Show Answer" or tap card to flip',
    single_card_hint: 'Deck has only one card',
    empty_deck_cannot_study: 'This deck has no cards to study.',
    hidden_answer_shake_msg: 'Answers are hidden for this set',
    cycle_complete_msg: 'Cycle complete! Reshuffling deck...',

    // Dialogs & Feedback
    delete_confirm_title: 'Delete Deck',
    delete_confirm_msg: 'Are you sure you want to delete deck "{title}"? You will have 6 seconds to undo.',
    delete_confirm_btn: 'Delete',
    toast_deleted: 'Deck deleted · ',
    toast_undo_btn: 'Undo',
    toast_quota_error: 'Storage quota exceeded! Please export older decks and remove them.',
    toast_update_available: 'Update available · ',
    toast_update_reload_btn: 'Reload now',
    toast_renamed: 'Deck title updated',
    toast_imported: 'Successfully imported {count} cards',
    toast_exported: 'Exported file {fileName}',
    toast_reimported: 'Deck updated successfully ({count} cards)',
    toast_markdown_saved: 'Deck updated successfully ({count} cards)',

    // Edit Markdown Dialog
    edit_markdown_title: 'Edit Deck Markdown',
    edit_markdown_help: 'Edit the complete Markdown content of this deck. First line "# Title", each card has "## Question" and answer below, separated by "---".',
    edit_markdown_cards_count: 'Recognized: {count} cards',
    edit_markdown_save_btn: 'Save Changes',

    // Help Dialog
    help_dialog_title: 'Markdown Format Guide',
    help_dialog_intro: 'MyQuizlet parses standard Markdown files into study decks:',
    help_code_sample: `---
# Deck Title
---
## Question 1 (single line)

Answer 1, full Markdown supported including tables and code:

\`\`\`swift
let greeting = "Hello"
\`\`\`
---
## Question 2

- First bullet point
- Second bullet point
---`,
    help_rule_1: 'The first "# ..." line is the deck title.',
    help_rule_2: 'Each card starts with a "## " question line, followed by the answer.',
    help_rule_3: 'A "---" line outside fenced code blocks separates cards.',
    help_rule_4: 'To draw a horizontal rule inside an answer, use "***" or "___" instead of "---".',
    help_rule_5: 'Code blocks containing "---" or "##" will not be split into cards.',

    // Storage Dialog
    storage_dialog_title: 'Storage Usage',
    storage_persist_label: 'Persistent storage:',
    storage_persisted_yes: 'Active (Safe from clearing)',
    storage_persisted_no: 'Standard (May be cleared if disk is low)',
    storage_request_persist: 'Enable persistent storage',
    storage_usage_label: 'Storage used:',
    storage_decks_count: 'Total decks: {decks}',
    storage_cards_count: 'Total cards: {cards}',
    storage_note: 'Data is stored strictly locally on this device. Export Markdown periodically to keep safe backups.',

    // About Dialog
    about_dialog_title: 'About MyQuizlet',
    about_desc: 'MyQuizlet is a standalone offline PWA flashcard app. No account required, 100% offline, with zero data sent off-device.',
    about_features: 'Engineered for Markdown notes, syntax-highlighted code blocks with GitHub themes, and smooth 60fps swipe gestures.',
    about_version: 'Version 1.0.0 (Offline PWA)'
  }
};

class I18n {
  constructor() {
    this.currentLang = 'vi';
    this.listeners = new Set();
  }

  init() {
    const prefs = store.getPrefs();
    this.currentLang = prefs.lang === 'en' ? 'en' : 'vi';
    this._applyDocumentLang();
  }

  getLang() {
    return this.currentLang;
  }

  setLang(lang) {
    if (lang !== 'vi' && lang !== 'en') return;
    this.currentLang = lang;
    store.savePrefs({ lang });
    this._applyDocumentLang();
    this._notifyListeners();
  }

  toggleLang() {
    this.setLang(this.currentLang === 'vi' ? 'en' : 'vi');
  }

  _applyDocumentLang() {
    if (typeof document !== 'undefined' && document.documentElement) {
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

    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
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
    if (!timestamp) return this.t('last_studied_never');
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 2) return this.t('last_studied_just_now');
    if (diffHours < 24) return this.t('last_studied_today');
    if (diffDays === 1) return this.t('last_studied_yesterday');
    return this.t('last_studied_days_ago', { days: diffDays });
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
        console.error('[MyQuizlet] i18n subscriber error:', e);
      }
    }
  }
}

export const i18n = new I18n();
export const t = (key, params) => i18n.t(key, params);
