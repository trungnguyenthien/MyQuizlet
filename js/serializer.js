/**
 * MyQuizlet - Serializer
 * Serializes a flashcard set object back into standard Markdown format.
 * Guarantees round-trip fidelity: parse(serialize(parse(x))) deep-equals parse(x).
 */

/**
 * Slugify a title for clean, safe filenames across platforms.
 * Preserves unicode letters and numbers, removes illegal filesystem characters.
 * @param {string} title 
 * @returns {string}
 */
export function slugify(title) {
  if (!title || typeof title !== 'string') return 'myquizlet-deck';
  const clean = title
    .trim()
    .replace(/[\\/:*?"<>|#^]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return clean || 'myquizlet-deck';
}

/**
 * Serialize a set object into standard MyQuizlet Markdown format.
 * @param {{ title: string, cards: Array<{ q: string, a: string }> }} set 
 * @returns {string}
 */
export function serializeSet(set) {
  const title = (set && set.title ? set.title.trim() : '') || 'Untitled';
  let markdown = `# ${title}\n\n`;

  if (!set || !Array.isArray(set.cards) || set.cards.length === 0) {
    return markdown;
  }

  for (let i = 0; i < set.cards.length; i++) {
    const card = set.cards[i];
    const q = (card && card.q ? card.q.trim() : '') || 'Untitled Question';
    const a = card && card.a ? card.a.trim() : '';

    markdown += `## ${q}\n`;
    if (a) {
      markdown += `\n${a}\n\n`;
    } else {
      markdown += '\n';
    }
  }

  return markdown.trim() + '\n';
}

/**
 * Export a set as a downloadable .md file, using Web Share API when possible on mobile.
 * @param {{ title: string, cards: Array<{ q: string, a: string }> }} set 
 * @returns {Promise<{ shared: boolean, fileName: string }>}
 */
export async function downloadSetAsMarkdown(set) {
  const content = serializeSet(set);
  const fileName = `${slugify(set.title)}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });

  // 1. Check if navigator.share with files is supported (e.g., Safari iOS / Android)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], fileName, { type: 'text/markdown;charset=utf-8' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: set.title,
          text: `Bộ thẻ MyQuizlet: ${set.title}`
        });
        return { shared: true, fileName };
      }
    } catch (err) {
      // If user cancelled share, don't fallback to force download unless it was an actual error
      if (err.name === 'AbortError') {
        return { shared: false, fileName };
      }
      // Otherwise fall through to classic download link
    }
  }

  // 2. Standard download trigger via anchor element
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke object URL after short delay
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);

  return { shared: false, fileName };
}
