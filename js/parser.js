/**
 * MyQuizlet - Markdown Parser
 * Parses plain Markdown flashcard sets according to MyQuizlet specification.
 * 
 * Rules:
 * 1. Normalize BOM and \r\n -> \n.
 * 2. Track fenced code blocks (``` or ~~~) line by line.
 * 3. Every line starting with '## ' outside code fences marks a new card (question).
 * 4. Everything after '## Question' until the next '## ' (or EOF) is the answer.
 * 5. Text before the first '## ' contains '# Title'. Falls back to fileName with warning.
 * 6. Empty answer allowed with warning.
 * 7. Backward compatible with old files containing '---' separators.
 * 8. Max file size: 5 MB.
 */

/**
 * Generate a UUID v4 (with crypto.randomUUID or Math.random fallback)
 * @returns {string}
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if randomUUID fails in restricted context
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Trim leading and trailing blank lines while preserving inner content byte-for-byte.
 * @param {string} str 
 * @returns {string}
 */
function trimBlankLines(str) {
  if (!str) return '';
  let result = str.replace(/^(?:[ \t]*\n)+/, '');
  result = result.replace(/(?:\n[ \t]*)+$/, '');
  if (/^\s*$/.test(result)) return '';
  return result;
}

/**
 * Parse a Markdown text into a MyQuizlet set object and warnings list.
 * @param {string} rawText 
 * @param {string} [fileName='Untitled']
 * @returns {{ set: { id: string, title: string, allowAnswer: boolean, createdAt: number, updatedAt: number, lastStudiedAt: null, cards: Array<{ id: string, q: string, a: string }> }, warnings: string[] }}
 */
export function parseMarkdownSet(rawText, fileName = 'Untitled') {
  if (typeof rawText !== 'string') {
    throw new TypeError('Markdown input must be a string');
  }

  // 1. Check size limit: 5 MB
  const byteLength = new Blob([rawText]).size;
  if (byteLength > 5 * 1024 * 1024) {
    throw new Error('Dung lượng file vượt quá giới hạn 5 MB / File exceeds 5 MB limit');
  }

  // 2. Normalize BOM and CRLF
  let text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  const warnings = [];
  const lines = text.split('\n');

  let inFence = false;
  let fenceChar = '';
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
        fenceChar = '';
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

  // 3. Extract title and check header lines
  let title = '';
  let headerNonTitleLines = [];
  for (let i = 0; i < headerLines.length; i++) {
    const hLine = headerLines[i];
    const titleMatch = hLine.match(/^#\s+(.+)$/);
    if (!title && titleMatch) {
      title = titleMatch[1].trim();
    } else {
      const trimmed = hLine.trim();
      if (trimmed && trimmed !== '---' && !trimmed.startsWith('#')) {
        headerNonTitleLines.push(trimmed);
      }
    }
  }

  // Warning for skipped non-question text in header
  if (headerNonTitleLines.length > 0) {
    const snippet = headerNonTitleLines.join(' ').slice(0, 35);
    warnings.push(`Đã bỏ qua khối không có câu hỏi (##): "${snippet}..." / Skipped block without question (##): "${snippet}..."`);
  }

  // Fallback to filename if title is missing
  if (!title) {
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '').trim() : '';
    title = baseName || 'Untitled';
    warnings.push(`Thiếu tiêu đề '# Tên bộ thẻ' ở phần đầu; đã sử dụng '${title}' làm tiêu đề / Missing '# Title' header; used '${title}' instead.`);
  }

  // 4. Build cards and answers
  const cards = [];
  for (let i = 0; i < rawCards.length; i++) {
    const { question, lines: cLines } = rawCards[i];

    // Clean up optional boundary '---' used in old formats
    while (cLines.length > 0 && cLines[0].trim() === '') {
      cLines.shift();
    }
    if (cLines.length > 0 && /^---\s*$/.test(cLines[0])) {
      cLines.shift();
    }
    while (cLines.length > 0 && cLines[cLines.length - 1].trim() === '') {
      cLines.pop();
    }
    if (cLines.length > 0 && /^---\s*$/.test(cLines[cLines.length - 1])) {
      cLines.pop();
    }

    let rawAnswer = trimBlankLines(cLines.join('\n'));

    if (!rawAnswer) {
      warnings.push(`Thẻ "${question}" có đáp án trống / Card "${question}" has an empty answer.`);
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
    title: title.trim() || 'Untitled',
    allowAnswer: true,
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: null,
    cards
  };

  return { set, warnings };
}
