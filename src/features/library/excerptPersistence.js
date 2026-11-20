import { deleteExcerpt, excerptKey, loadKnowledge, updateExcerptRange } from './knowledgeStore.js';
import { replaceExcerptUnderlines } from './excerptRange.js';
import { parseMarkdownContent, underlineMarkdown } from './markdownReader.js';

export async function persistExcerptChange(note, selection, book, blocks, onBooksChanged) {
  const desktop = globalThis.cyberStudy;
  let updated;
  if (book && note.markdownUnderline && desktop?.saveBookMarkdown) {
    const otherRanges = loadKnowledge().notes
      .filter(item => item.bookId === note.bookId && item.markdownUnderline && excerptKey(item) !== excerptKey(note))
      .flatMap(item => item.ranges || []);
    const content = replaceExcerptUnderlines(book.content, blocks, note.ranges || [], otherRanges,
      selection?.ranges || [], parseMarkdownContent, underlineMarkdown);
    if (content !== book.content) updated = await desktop.saveBookMarkdown({ ...book, content }, book.content);
  }

  let result;
  try {
    result = selection ? updateExcerptRange(note, selection) : deleteExcerpt(note);
  } catch (error) {
    if (updated) {
      try {
        await desktop.saveBookMarkdown(book, updated.content);
      } catch {
        onBooksChanged?.([updated]);
        throw Error('摘录保存失败，原文划线已更新，请重试以同步。');
      }
    }
    throw error;
  }
  if (updated) onBooksChanged?.([updated]);
  return result;
}
