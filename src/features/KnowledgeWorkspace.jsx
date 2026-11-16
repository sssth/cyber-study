import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FeaturePanel, EmptyState } from './ui.jsx';
import ExcerptAnnotations from '../reader/ExcerptAnnotations.jsx';
import { sampleBooks } from '../reader/sampleBooks.js';
import { parseMarkdownContent } from '../reader/markdownReader.js';
import { highlightRanges, indexChapters } from '../reader/readerPosition.js';
import { loadKnowledge, groupExcerpts } from '../data/knowledgeStore.js';

function KnowledgeWorkspace({ onClose, version = 0, importedBooks = [], onOpenNote, suspended = false }) {
  const [query, setQuery] = useState('');
  const [bookId, setBookId] = useState('');
  const [detailKey, setDetailKey] = useState(null);
  const [revision, setRevision] = useState(0);
  const notes = useMemo(() => loadKnowledge().notes, [version, revision]);
  const groups = useMemo(() => groupExcerpts(notes), [notes]);
  const sources = useMemo(() => {
    const books = new Map([...sampleBooks, ...importedBooks].map((book) => [book.id, book]));
    const result = new Map();
    for (const id of new Set(notes.map((note) => note.bookId))) {
      const book = books.get(id);
      if (!book) continue;
      const blocks = parseMarkdownContent(book.content);
      result.set(id, { blocks, ...indexChapters(blocks) });
    }
    return result;
  }, [importedBooks, notes]);
  const entries = [...groups].map(([key, items]) => {
    const [note] = items;
    const source = sources.get(note.bookId);
    const blockId = note.blockId ?? note.ranges?.[0]?.blockId ??
      source?.blocks.find((block) => block.text.includes(note.quote))?.id;
    const chapterId = source?.chapterByBlock.get(blockId);
    const chapter = source?.chapters.find((item) => item.id === chapterId)?.text ?? note.chapterTitle ?? '';
    return { key, items, note, source, blockId, chapterId, chapter };
  });
  const books = new Map(notes.map((note) => [note.bookId, note.bookTitle]));
  const term = query.trim().toLocaleLowerCase();
  const filtered = entries.filter(({ note, items, chapter }) =>
    (!bookId || note.bookId === bookId) &&
    [note.bookTitle, chapter, note.quote, ...items.flatMap((item) => [item.annotation, item.summary, ...(item.tags ?? [])])]
      .some((value) => value?.toLocaleLowerCase().includes(term)));
  const detail = entries.find((entry) => entry.key === detailKey);

  if (suspended) return null;
  if (detail) return createPortal(<ExcerptDetail entry={detail} onClose={() => setDetailKey(null)}
    onOpenNote={onOpenNote} onChange={() => setRevision((value) => value + 1)} />, document.body);

  return <FeaturePanel wide title="知识库" onClose={onClose}>
    <div className="knowledge-browser">
      <aside className="knowledge-filters" aria-label="筛选摘录">
        <input aria-label="检索知识库" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="检索摘录、批注、书名…" />
        <nav aria-label="按书筛选">
          <button type="button" aria-pressed={!bookId} onClick={() => setBookId('')}>全部书籍</button>
          {[...books].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN')).map(([id, title]) =>
            <button key={id} type="button" aria-pressed={bookId === id} onClick={() => setBookId(id)}>{title}</button>)}
        </nav>
        <button type="button" disabled={!filtered.length}
          onClick={() => exportMarkdown(filtered, books.get(bookId) ?? '知识库摘录')}>导出 Markdown</button>
      </aside>
      <section className="knowledge-results" aria-label="摘录列表">
        {!filtered.length && <EmptyState>暂无匹配的摘录。</EmptyState>}
        {filtered.map(({ key, items, note, chapter }) => {
          const characters = Array.from(note.quote);
          const preview = characters.length > 120 ? characters.slice(0, 120).join('').trimEnd() + '…' : note.quote;
          return <button key={key} type="button" className="knowledge-result" onClick={() => setDetailKey(key)}>
            <span>
              <span className="card-kicker">{[note.bookTitle, chapter].filter(Boolean).join(' · ')}</span>
              <span className="knowledge-preview">“{preview}”</span>
            </span>
            <span className="knowledge-note-count">{items.filter((item) => item.annotation).length} 条批注</span>
          </button>;
        })}
      </section>
    </div>
  </FeaturePanel>;
}

function ExcerptDetail({ entry, onClose, onOpenNote, onChange }) {
  const { key, items, note, source, blockId, chapterId, chapter } = entry;
  const original = useRef(null);
  const chapterBlocks = chapterId === undefined ? [] : source.blocks.filter((block) => source.chapterByBlock.get(block.id) === chapterId);
  const highlights = highlightRanges(chapterBlocks, new Map([[key, items]]));
  useEffect(() => {
    const focus = original.current?.querySelector('mark') ?? original.current?.querySelector('[data-excerpt-focus]');
    if (focus) {
      const pane = original.current;
      pane.scrollTop += focus.getBoundingClientRect().top - pane.getBoundingClientRect().top - 28;
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [key, chapterId, blockId]);

  return <section className="knowledge-detail" role="dialog" aria-modal="true" aria-label="摘录详情">
    <header>
      <h2>{[note.bookTitle, chapter].filter(Boolean).join(' · ')}</h2>
      <div>
        {source && <button type="button" onClick={() => onOpenNote({ ...note, blockId })}>回跳原文</button>}
        <button type="button" onClick={() => exportMarkdown([entry], `${note.bookTitle}－摘录`)}>导出 Markdown</button>
        <button type="button" onClick={onClose}>返回列表</button>
      </div>
    </header>
    <article ref={original} className="knowledge-original" aria-label="章节原文" tabIndex={0}>
      {chapterBlocks.length ? chapterBlocks.map((block) => {
        const Element = block.type === 'heading' ? 'h3' : 'p';
        const ranges = highlights.get(block.id) ?? [];
        const cuts = [...new Set([0, block.text.length, ...ranges.flatMap(({ start, end }) => [start, end])])]
          .filter((cut) => cut >= 0 && cut <= block.text.length).sort((a, b) => a - b);
        return <Element key={block.id} data-excerpt-focus={block.id === blockId ? '' : undefined}>
          {block.prefix}{cuts.slice(0, -1).map((start, index) => {
            const end = cuts[index + 1];
            const text = block.text.slice(start, end);
            return ranges.some((range) => range.start <= start && range.end >= end) ? <mark key={start}>{text}</mark> : text;
          })}
        </Element>;
      }) : <>
        <p>当前书库里找不到对应章节，以下是已保存的摘录。</p>
        <blockquote><mark>{note.quote}</mark></blockquote>
      </>}
    </article>
    <aside className="knowledge-annotations" aria-label="摘录批注">
      <h3>批注</h3>
      <ExcerptAnnotations key={key} notes={items} onChange={onChange} />
    </aside>
  </section>;
}

function exportMarkdown(entries, title) {
  const quoteLines = (value) => String(value).split(/\r?\n/).map((line) => `> ${line}`).join('\n');
  const text = [`# ${title}`, ...entries.map(({ note, items, chapter }) => [
    `## ${[note.bookTitle, chapter].filter(Boolean).join(' · ')}`,
    `### 划线原文\n\n${quoteLines(note.quote)}`,
    ...new Set(items.map((item) => item.summary).filter(Boolean).map((summary) => `### 摘要\n\n${summary}`)),
    ...[...new Set(items.flatMap((item) => item.tags ?? []))].map((tag) => `- #${tag}`),
    ...items.filter((item) => item.annotation).map((item) => `### 批注 · ${new Date(item.createdAt).toLocaleString('zh-CN')}\n\n${item.annotation}`)
  ].join('\n\n'))].join('\n\n') + '\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[\\/:*?"<>|]/g, '－')}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default KnowledgeWorkspace;
