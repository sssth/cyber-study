const READER_STORAGE_KEY = 'cyber-study.reader.v1';

const fallbackReaderState = {
  lastBookId: null,
  settings: {
    fontSize: 18,
    lineHeight: 1.9
  },
  books: {}
};

export function loadReaderState() {
  try {
    const rawValue = globalThis.localStorage?.getItem(READER_STORAGE_KEY);
    if (!rawValue) return structuredClone(fallbackReaderState);

    const parsed = JSON.parse(rawValue);
    return {
      ...structuredClone(fallbackReaderState),
      ...parsed,
      settings: {
        ...fallbackReaderState.settings,
        ...(parsed.settings ?? {})
      },
      books: parsed.books ?? {}
    };
  } catch {
    return structuredClone(fallbackReaderState);
  }
}

export function bookReaderSettings(state, bookId) {
  return { ...fallbackReaderState.settings, ...state.settings, ...state.books[bookId]?.settings };
}

export function saveReaderState(state) {
  try {
    globalThis.localStorage?.setItem(READER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 阅读进度保存失败时不打断当前阅读。
  }
}

export const readingStatusLabels = { unread: '待读', reading: '在读', finished: '已读' };

export function bookReadingStatus(record = {}) {
  if (Object.hasOwn(readingStatusLabels, record.readingStatus)) return record.readingStatus;
  if (record.finished || record.progress >= 1) return 'finished';
  return record.openedAt || record.lastReadAt || record.updatedAt || record.progress > 0 ? 'reading' : 'unread';
}

export function bookActivityTime(book, record = {}) {
  return Math.max(
    Date.parse(book.createdAt || book.importedAt) || 0,
    Date.parse(record.openedAt || record.lastReadAt || record.updatedAt) || 0
  );
}
