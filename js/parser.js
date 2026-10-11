/**
 * MyQuizlet - Markdown Parser
 * Parses plain Markdown flashcard sets according to MyQuizlet specification.
 * 
 * Rules:
 * 1. Normalize BOM and \r\n -> \n.
 * 2. Track fenced code blocks (``` or ~~~) line by line.
 * 3. Line exactly '---' outside code fence is a card/header separator.
 * 4. Header block contains '# Title'. Falls back to fileName with warning.
 * 5. Card blocks contain '## Question' outside fence; everything after is answer.
 * 6. Empty answer allowed with warning. Empty block without question skipped with warning.
 * 7. Max file size: 5 MB.
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
  // Trim leading blank lines
  let result = str.replace(/^(?:[ \t]*\n)+/, '');
  // Trim trailing blank lines
  result = result.replace(/(?:\n[ \t]*)+$/, '');
  // If result is only whitespace, return empty string
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

  // 1. Check size limit: 5 MB (5 * 1024 * 1024 bytes)
  const byteLength = new Blob([rawText]).size;
  if (byteLength > 5 * 1024 * 1024) {
    throw new Error('Dung lượng file vượt quá giới hạn 5 MB / File exceeds 5 MB limit');
  }

  // 2. Normalize: strip UTF-8 BOM, normalize CRLF to LF
  let text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  const warnings = [];
  const lines = text.split('\n');
  const blocks = [];
  let currentBlockLines = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  // 3. Partition text into blocks by separator line '---' outside code fences
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inFence) {
      // Check for opening fence: 3 or more backticks or tildes
      const fenceMatch = line.match(/^(`{3,}|~{3,})/);
      if (fenceMatch) {
        inFence = true;
        fenceChar = fenceMatch[1][0];
        fenceLen = fenceMatch[1].length;
      } else if (/^---\s*$/.test(line)) {
        // Separator line found outside fence!
        blocks.push(currentBlockLines.join('\n'));
        currentBlockLines = [];
        continue;
      }
    } else {
      // Inside code fence: only closing fence matching same char and >= fenceLen ends fence
      const closeMatch = line.match(new RegExp(`^(\\${fenceChar}{${fenceLen},})\\s*$`));
      if (closeMatch) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
    }

    currentBlockLines.push(line);
  }

  // Push the final block
  blocks.push(currentBlockLines.join('\n'));

  // 4. Extract Set Title from Block 0 or 1
  let title = '';
  let cardBlockStartIndex = 0;

  for (let i = 0; i < Math.min(blocks.length, 3); i++) {
    const block = blocks[i];
    // Check if this block contains '# Title' outside a fence
    const titleMatch = block.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
      cardBlockStartIndex = i + 1;
      break;
    }
    // If block is not empty and already starts cards with '## '
    if (block.trim().length > 0 && /^##\s+/m.test(block)) {
      cardBlockStartIndex = i;
      break;
    }
  }

  // Fallback to filename if title is missing
  if (!title) {
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '').trim() : '';
    title = baseName || 'Untitled';
    warnings.push(`Thiếu tiêu đề '# Tên bộ thẻ' ở phần đầu; đã sử dụng '${title}' làm tiêu đề / Missing '# Title' header; used '${title}' instead.`);
  }

  // 5. Parse Cards
  const cards = [];
  for (let i = cardBlockStartIndex; i < blocks.length; i++) {
    const block = blocks[i];
    // Trailing/leading purely whitespace blocks are skipped
    if (!block.trim()) continue;

    const blockLines = block.split('\n');
    let inBFence = false;
    let bFenceChar = '';
    let bFenceLen = 0;
    let qLineIndex = -1;
    let question = '';

    for (let j = 0; j < blockLines.length; j++) {
      const line = blockLines[j];

      if (!inBFence) {
        const fm = line.match(/^(`{3,}|~{3,})/);
        if (fm) {
          inBFence = true;
          bFenceChar = fm[1][0];
          bFenceLen = fm[1].length;
        } else if (/^##\s+(.+)$/.test(line)) {
          qLineIndex = j;
          question = line.replace(/^##\s+/, '').trim();
          break; // First ## outside fence is the question
        }
      } else {
        const cm = line.match(new RegExp(`^(\\${bFenceChar}{${bFenceLen},})\\s*$`));
        if (cm) {
          inBFence = false;
          bFenceChar = '';
          bFenceLen = 0;
        }
      }
    }

    if (qLineIndex === -1) {
      const snippet = block.trim().slice(0, 35).replace(/\n/g, ' ');
      warnings.push(`Đã bỏ qua khối không có câu hỏi (##): "${snippet}..." / Skipped block without question (##): "${snippet}..."`);
      continue;
    }

    // Answer is everything after question line
    const answerLines = blockLines.slice(qLineIndex + 1);
    let rawAnswer = trimBlankLines(answerLines.join('\n'));

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
