export function indexChapters(blocks) {
  const chapters = [{ id: '', text: '正文' }];
  const chapterByBlock = new Map();
  const levels = blocks.filter((block) => block.type === 'heading').map((block) => block.level ?? 2);
  const chapterLevel = levels.length ? Math.min(...levels) : 2;
  let chapter = chapters[0];
  for (const block of blocks) {
    if (block.type === 'heading') {
      const entry = { id: block.id, text: block.text, level: block.level ?? 2 };
      if (entry.level === chapterLevel) {
        chapter = entry;
        chapters.push(chapter);
      }
    }
    chapterByBlock.set(block.id, chapter.id);
  }
  if (blocks.length && chapterByBlock.get(blocks[0].id)) chapters.shift();
  return { chapters, chapterByBlock };
}

export function readerPosition(element, paged) {
  const bounds = element.getBoundingClientRect();
  for (const block of element.querySelectorAll('[data-block]')) {
    const visible = [...block.getClientRects()].some((rect) => paged
      ? rect.right > bounds.left + 2 && rect.left < bounds.right - 2
      : rect.bottom > bounds.top + 2 && rect.top < bounds.bottom - 2);
    if (visible) return block.dataset.block;
  }
  return null;
}

export function goToReaderBlock(element, block, paged) {
  const bounds = element.getBoundingClientRect();
  const rect = block.getClientRects()[0];
  if (!rect) return;
  if (paged) {
    const offset = element.scrollLeft + rect.left - bounds.left;
    element.scrollLeft = Math.floor(Math.max(0, offset + 1) / element.clientWidth) * element.clientWidth;
  } else {
    element.scrollTop += rect.top - bounds.top - 24;
  }
}

export function highlightRanges(blocks, groups) {
  const byBlock = new Map();
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const append = (blockId, range) => {
    if (!byBlock.has(blockId)) byBlock.set(blockId, []);
    byBlock.get(blockId).push(range);
  };
  for (const [key, [note]] of groups) {
    if (note.ranges?.length) {
      for (const { blockId, start, end } of note.ranges) append(blockId, { key, start, end });
      continue;
    }
    for (const block of note.blockId ? [byId.get(note.blockId)] : blocks) {
      if (!block || !note.quote) continue;
      const start = block.text.indexOf(note.quote);
      if (start >= 0) append(block.id, { key, start, end: start + note.quote.length });
    }
  }
  return byBlock;
}
