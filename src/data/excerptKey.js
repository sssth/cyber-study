export function excerptKey(note) {
  return JSON.stringify([note.bookId, note.blockId ?? note.progress, note.quote, note.ranges?.[0]?.start ?? null]);
}
