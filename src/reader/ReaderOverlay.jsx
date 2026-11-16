import { useEffect, useMemo, useRef, useState } from 'react';
import { formatProgress, parseMarkdownContent, underlineMarkdown } from './markdownReader.js';
import { goToReaderBlock, highlightRanges, indexChapters, readerPosition } from './readerPosition.js';
import { sampleBooks } from './sampleBooks.js';
import { loadReaderState, saveReaderState } from '../data/storage.js';
import ExcerptAnnotations from './ExcerptAnnotations.jsx';
import { addKnowledgeNote, groupExcerpts, loadKnowledge } from '../data/knowledgeStore.js';

import { matchesShortcut, typingTarget } from '../data/shortcuts.js';

let importIntroSeen = false;

const minFontSize = 15;
const maxFontSize = 26;

function ReaderOverlay({
  onClose,
  returnToKnowledge = false,
  shortcuts,
  importedBooks = [],
  onBooksChanged,
  onBookDeleted,
  initialBookId = null,
  initialView = 'last',
  initialProgress = null,
  initialBlockId = null,
  bookLoadError = '',
  onNoteCreated = () => {}
}) {
  const [readerState, setReaderState] = useState(() => loadReaderState());
  const [mode, setMode] = useState('library');
  const [paged, setPaged] = useState(initialView === 'paged');
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteAnchor, setNoteAnchor] = useState(null);
  const [selectedExcerpt, setSelectedExcerpt] = useState(null);
  const [excerptChoices, setExcerptChoices] = useState([]);
  const overlayRef = useRef(null);
  const [atFirstSpread, setAtFirstSpread] = useState(true);
  const [atLastSpread, setAtLastSpread] = useState(true);
  const [activeBookId, setActiveBookId] = useState(null);
  const [progress, setProgress] = useState(0);
  const chapterProgress = useRef(0);
  const [importState, setImportState] = useState({ phase: 'idle', revision: -1 });
  const [importError, setImportError] = useState('');
  const [showImportIntro, setShowImportIntro] = useState(() => !importIntroSeen);
  const [dismissedImportRevision, setDismissedImportRevision] = useState(-1);
  const [deleteStatus, setDeleteStatus] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const importRequest = useRef(false);
  const [savingNote, setSavingNote] = useState(false);
  const selectionRange = useRef(null);
  const desktop = globalThis.cyberStudy;
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);
  const [selectionBlock, setSelectionBlock] = useState(null);
  const [selectionQuote, setSelectionQuote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteMessage, setNoteMessage] = useState(null);
  const [knowledgeVersion, setKnowledgeVersion] = useState(0);
  const contentRef = useRef(null);
  const saveTimerRef = useRef(null);
  const restoredInitialBook = useRef(false);

  const allBooks = useMemo(() => {
    const books = new Map(sampleBooks.map((book) => [book.id, book]));
    importedBooks.forEach((book) => books.set(book.id, book));
    return [...books.values()];
  }, [importedBooks]);
  const importing = ['selecting', 'scanning', 'processing'].includes(importState.phase);
  useEffect(() => {
    if (!desktop?.getBookImportState) return;
    let active = true;
    const update = (state, restored = false) => {
      if (active) setImportState((current) => state.revision > current.revision ? { ...state, restored } : current);
    };
    const unsubscribe = desktop.onBookImportProgress((state) => update(state));
    desktop.getBookImportState().then((state) => update(state, true)).catch(() => {
      if (active) setImportError('暂时无法读取导入进度。');
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [desktop]);

  useEffect(() => {
    if (importState.phase !== 'complete' || !importState.results.some(({ status }) => status === 'imported')) return;
    let active = true;
    desktop.listBooks().then((books) => {
      if (active) onBooksChanged(books);
    }).catch(() => {
      if (active) setImportError('已完成导入，但书架刷新失败。请重新打开书库。');
    });
    return () => { active = false; };
  }, [desktop, importState, onBooksChanged]);
  const hits = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    return allBooks.flatMap((book) => {
      const matches = parseMarkdownContent(book.content).flatMap((block) => {
        const index = block.text.toLocaleLowerCase().indexOf(term);
        if (index < 0) return [];
        const start = Math.max(0, index - 36);
        return [{ ...block, snippet: block.text.slice(start, index + term.length + 50) }];
      });
      return matches.length ? [{ book, matches }] : [];
    });
  }, [allBooks, query]);
  const activeBook = useMemo(
    () => allBooks.find((book) => book.id === activeBookId) ?? null,
    [activeBookId, allBooks]
  );
  const blocks = useMemo(
    () => (activeBook ? parseMarkdownContent(activeBook.content) : []),
    [activeBook]
  );
  const { chapters, chapterByBlock } = useMemo(() => indexChapters(blocks), [blocks]);
  const savedPosition = readerState.books?.[activeBookId];
  const destination = target ?? { progress: initialProgress, blockId: initialBlockId };
  const destinationBlock = destination.blockId ?? (destination.progress == null ? savedPosition?.blockId : null);
  const displayedChapter = chapterByBlock.get(destinationBlock) ?? destination.chapterId ?? chapters[0]?.id ?? '';
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === displayedChapter);
  const visibleBlocks = blocks.filter((block) => chapterByBlock.get(block.id) === displayedChapter);
  const activeNotes = useMemo(
    () => loadReaderNotes().filter((note) => note.bookId === activeBookId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBookId, knowledgeVersion]
  );

  const excerpts = useMemo(() => groupExcerpts(activeNotes), [activeNotes]);
  const highlights = useMemo(() => highlightRanges(blocks, excerpts), [blocks, excerpts]);

  useEffect(() => {
    if (restoredInitialBook.current || initialView === 'library') return;
    const initialBook = allBooks.find((book) => book.id === initialBookId);
    if (!initialBook) return;
    restoredInitialBook.current = true;
    setActiveBookId(initialBook.id);
    setMode('reading');
    setProgress(readerState.books?.[initialBook.id]?.progress ?? 0);
  }, [allBooks, initialView, initialBookId, readerState.books]);

  useEffect(() => () => globalThis.clearTimeout(saveTimerRef.current), []);

  useEffect(() => {
    if (mode === 'library' && (initialView === 'library' || !initialBookId || restoredInitialBook.current && !activeBookId)) {
      importIntroSeen = true;
    }
  }, [mode, initialView, initialBookId, activeBookId]);

  const dismissNote = () => {
    setSelectionQuote('');
    setNoteAnchor(null);
    setNoteDraft('');
    setSelectedExcerpt(null);
    setExcerptChoices([]);
    setNoteMessage(null);
  };

  const changeReadingMode = (enabled) => {
    if (savingNote) return;
    const element = contentRef.current;
    const blockId = element && readerPosition(element, paged);
    dismissNote();
    setTarget({ progress: chapterProgress.current, blockId, chapterId: displayedChapter });
    setPaged(enabled);
    const overlay = overlayRef.current;
    if (enabled) overlay?.requestFullscreen?.().then(() => setTarget({ progress: chapterProgress.current, blockId, chapterId: displayedChapter })).catch(() => {});
    else if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
  };

  useEffect(() => {
    if (!noteAnchor) return;
    const closeOutside = (event) => {
      if (savingNote || event.target.closest?.('.reader-inline-note, mark[role="button"]')) return;
      dismissNote();
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [noteAnchor, savingNote]);

  const showLibrary = () => {
    if (savingNote) return;
    if (paged) changeReadingMode(false);
    setNotesOpen(false);
    dismissNote();
    setShowImportIntro(!importIntroSeen);
    importIntroSeen = true;
    setDismissedImportRevision(importState.revision);
    setImportError('');
    setMode('library');
  };

  const turnPages = (direction) => {
    const element = contentRef.current;
    if (!element?.clientWidth || savingNote) return;
    dismissNote();
    const max = element.scrollWidth - element.clientWidth;
    if (direction > 0 && element.scrollLeft >= max - 1 || direction < 0 && element.scrollLeft <= 1) {
      const next = chapters[chapterIndex + direction];
      if (next) setTarget({ chapterId: next.id, progress: direction < 0 ? 1 : 0 });
      return;
    }
    const spread = Math.ceil((element.scrollLeft - 1) / element.clientWidth);
    element.scrollLeft = (spread + direction) * element.clientWidth;
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (matchesShortcut(event, shortcuts.readerBack) && !savingNote &&
          (event.key === 'Escape' || !typingTarget(event.target))) {
        event.preventDefault();
        if (event.repeat) return;
        if (selectionQuote || selectedExcerpt) dismissNote();
        else if (paged) changeReadingMode(false);
        else if (returnToKnowledge) onClose();
        else if (mode === 'reading') showLibrary();
        else onClose();
        return;
      }
      if (!paged || typingTarget(event.target)) return;
      const direction = matchesShortcut(event, shortcuts.previousPage) ? -1
        : matchesShortcut(event, shortcuts.nextPage) ? 1 : 0;
      if (direction) {
        event.preventDefault();
        turnPages(direction);
      }
    };
    const syncFullscreen = () => {
      if (!document.fullscreenElement && paged) changeReadingMode(false);
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', syncFullscreen);
    };
  });

  useEffect(() => {
    if (mode !== 'reading' || !activeBook || !contentRef.current) return;
    const position = destination;
    const savedBook = readerState.books?.[activeBook.id];
    const savedProgress = position.progress ?? savedBook?.chapterProgress ?? (chapters.length === 1 ? savedBook?.progress : 0) ?? 0;
    const targetBlockId = position.blockId ?? (position.progress == null ? savedBook?.blockId : null);

    const frame = requestAnimationFrame(() => {
      const element = contentRef.current;
      if (!element || !element.clientWidth) return;
      if (paged) {
        const distance = element.scrollWidth - element.clientWidth;
        element.scrollLeft = savedProgress === 1 ? distance : Math.round(savedProgress * distance / element.clientWidth) * element.clientWidth;
      } else {
        element.scrollTop = Math.max(0, savedProgress * (element.scrollHeight - element.clientHeight));
      }
      const block = targetBlockId && element.querySelector(`[data-block="${CSS.escape(targetBlockId)}"]`);
      element.querySelector('[data-located]')?.removeAttribute('data-located');
      if (block) {
        block.setAttribute('data-located', '');
        goToReaderBlock(element, block, paged);
        block.focus({ preventScroll: true });
      }
      updateScrollProgress();
    });

    return () => cancelAnimationFrame(frame);
    // 每次打开书籍时恢复一次位置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBook?.id, mode, target, initialProgress, initialBlockId, paged, notesOpen]);

  useEffect(() => {
    saveReaderState(readerState);
  }, [readerState]);

  const openBook = (book, targetProgress = null, blockId = null) => {
    if (!book || savingNote) return;
    restoredInitialBook.current = true;
    setTarget({ progress: targetProgress, blockId });
    setActiveBookId(book.id);
    setMode('reading');
    dismissNote();
    const saved = targetProgress ?? readerState.books?.[book.id]?.progress ?? 0;
    setProgress(saved);
    setReaderState((state) => ({
      ...state,
      lastBookId: book.id,
      books: {
        ...state.books,
        [book.id]: {
          ...(state.books?.[book.id] ?? {}),
          title: book.title,
          progress: saved
        }
      }
    }));


  };

  const updateScrollProgress = () => {
    const element = contentRef.current;
    if (!element || !activeBook) return;

    const distance = paged ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight;
    const offset = paged ? element.scrollLeft : element.scrollTop;
    const localProgress = distance <= 0 ? (chapterIndex === chapters.length - 1 ? 1 : 0) : Math.min(1, Math.max(0, offset / distance));
    chapterProgress.current = localProgress;
    const chapterStart = blocks.findIndex((block) => block.id === visibleBlocks[0]?.id);
    const nextProgress = blocks.length
      ? (Math.max(0, chapterStart) + visibleBlocks.length * localProgress) / blocks.length
      : 0;
    const blockId = readerPosition(element, paged) ?? visibleBlocks[0]?.id;
    setAtFirstSpread(offset <= 1);
    setAtLastSpread(offset >= distance - 1);
    setProgress(nextProgress);

    if (saveTimerRef.current) globalThis.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = globalThis.setTimeout(() => {
      setReaderState((state) => ({
        ...state,
        lastBookId: activeBook.id,
        settings: state.settings,
        books: {
          ...state.books,
          [activeBook.id]: {
            ...(state.books?.[activeBook.id] ?? {}),
            title: activeBook.title,
            progress: nextProgress,
            chapterProgress: localProgress,
            blockId,
            updatedAt: new Date().toISOString()
          }
        }
      }));
    }, 220);
  };

  const updateReaderSettings = (changes) => {
    setReaderState((state) => ({
      ...state,
      settings: { ...state.settings, ...changes }
    }));
  };

  const adjustFontSize = (direction) => {
    updateReaderSettings({
      fontSize: Math.min(maxFontSize, Math.max(minFontSize, readerState.settings.fontSize + direction * 2))
    });
  };

  const adjustLineHeight = (direction) => {
    updateReaderSettings({
      lineHeight: Math.min(2.4, Math.max(1.5, Number((readerState.settings.lineHeight + direction * 0.1).toFixed(1))))
    });
  };

  const captureSelection = () => {
    const selection = globalThis.getSelection?.();
    if (savingNote || !selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const getBlock = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest('[data-block]');
    const block = getBlock(range.startContainer);
    const endBlock = getBlock(range.endContainer);
    if (!block || !endBlock || !contentRef.current?.contains(block) || !contentRef.current.contains(endBlock)) return;
    const startIndex = blocks.findIndex((item) => item.id === block.dataset.block);
    const endIndex = blocks.findIndex((item) => item.id === endBlock.dataset.block);
    if (startIndex < 0 || endIndex < startIndex) return;
    const offset = (element, node, index, prefix) => {
      const before = range.cloneRange();
      before.selectNodeContents(element);
      before.setEnd(node, index);
      return Math.max(0, before.toString().length - prefix.length);
    };
    const ranges = blocks.slice(startIndex, endIndex + 1).flatMap((item, index) => {
      const start = index === 0 ? offset(block, range.startContainer, range.startOffset, item.prefix) : 0;
      const end = item.id === endBlock.dataset.block ? offset(endBlock, range.endContainer, range.endOffset, item.prefix) : item.text.length;
      const text = item.text.slice(start, end);
      if (!text.trim()) return [];
      return [{ blockId: item.id, start: start + text.length - text.trimStart().length, end: end - text.length + text.trimEnd().length, text: text.trim() }];
    });
    if (!ranges.length) return;
    selectionRange.current = ranges;
    setSelectedExcerpt(null);
    setNoteAnchor(anchorFor(range.getBoundingClientRect()));
    setSelectionBlock(ranges[0].blockId);
    setNoteDraft('');
    setSelectionQuote(ranges.map((item) => item.text).join('\n'));
    setNoteMessage(null);
  };

  const anchorFor = (rect) => {
    const overlay = overlayRef.current.getBoundingClientRect();
    return { left: rect.left - overlay.left, top: rect.bottom - overlay.top };
  };

  const openExcerpt = (keys, event) => {
    const selection = globalThis.getSelection?.();
    if (event.type === 'click' && event.currentTarget.matches('mark') &&
        selection && !selection.isCollapsed && contentRef.current?.contains(selection.anchorNode)) return;
    dismissNote();
    setExcerptChoices(keys);
    setSelectedExcerpt(keys[0]);
    setNoteAnchor(anchorFor(event.currentTarget.getBoundingClientRect()));
  };

  const saveNote = async () => {
    if (!activeBook || savingNote) return;
    const quote = selectionQuote.trim();
    if (!quote) {
      setNoteMessage('请先在正文中选中要摘录的文字。');
      return;
    }
    setSavingNote(true);
    let savedMarkdown = false;
    try {
      const ranges = selectionRange.current ?? [];
      const existing = [...excerpts.values()].find(([note]) => note.quote === quote &&
        note.ranges?.length === ranges.length && ranges.every((range, index) => {
          const previous = note.ranges[index];
          return previous.blockId === range.blockId && previous.start === range.start && previous.end === range.end;
        }))?.[0];
      const byId = new Map(blocks.map((block) => [block.id, block]));
      if (desktop?.saveBookMarkdown && !existing) {
        let content = activeBook.content;
        for (const { blockId, start, end } of [...ranges].reverse()) {
          const block = byId.get(blockId);
          if (!block || block.code) continue;
          content = underlineMarkdown(content, block, start, end);
        }
        if (content !== activeBook.content) {
          const updated = await desktop.saveBookMarkdown({ ...activeBook, content }, activeBook.content);
          onBooksChanged([updated]);
          savedMarkdown = true;
        }
      }
      if (!existing || noteDraft.trim()) {
        addKnowledgeNote({
          bookId: activeBook.id, bookTitle: activeBook.title, quote, annotation: noteDraft.trim(),
          progress, blockId: selectionBlock, markdownUnderline: savedMarkdown || existing?.markdownUnderline,
          ranges: ranges.map(({ blockId, start, end }) => ({ blockId, start, end }))
        });
      }
      globalThis.getSelection?.()?.removeAllRanges();
      dismissNote();
      setNoteMessage('摘录已保存到本章节和知识库。');
      setKnowledgeVersion((version) => version + 1);
      onNoteCreated();
    } catch (error) {
      setNoteMessage(savedMarkdown ? `下划线已保存。知识库保存失败：${error.message}` : error.message);
    } finally {
      setSavingNote(false);
    }
  };

  const handleImport = async (folder) => {
    if (importRequest.current || importing) return;
    importRequest.current = true;
    setImportError('');
    try {
      const state = await desktop.importBooks(folder);
      setImportState((current) => state.revision > current.revision ? state : current);
    } catch {
      setImportError('无法启动导入。请重新打开桌面应用后重试。');
    } finally {
      importRequest.current = false;
    }
  };

  const removeBook = async (book) => {
    if (deleting || importing) return;
    setDeleting(true);
    setDeleteStatus(null);
    try {
      if (await desktop.deleteBook(book.id)) {
        onBookDeleted(book.id);
        setDeleteStatus({ message: `已将《${book.title}》移到废纸篓。` });
      }
    } catch {
      setDeleteStatus({ error: true, message: `无法删除《${book.title}》，请重试。` });
    } finally {
      setDeleting(false);
    }
  };

  const refreshNotes = () => {
    setKnowledgeVersion((version) => version + 1);
    onNoteCreated();
  };
  const chapterNotes = [...excerpts].filter(([, [note]]) => (chapterByBlock.get(note.blockId) ?? chapters[0]?.id ?? '') === displayedChapter);

  return (
    <section ref={overlayRef} className={`reader-overlay${paged ? " reader-immersive" : ""}`} role="dialog" aria-modal="true" aria-label="本地阅读器">
      <div className={`reader-shell ${mode === 'library' ? 'library-mode' : 'reading-mode'}`}>
        <header className="reader-topbar">
          <div>
            <p className="reader-kicker">Markdown 阅读器</p>
            <h2>{mode === 'library' ? '书房书架' : activeBook?.title ?? '阅读中'}</h2>
          </div>
          <div className="reader-top-actions">
            {mode === 'reading' && <>
              <button type="button" disabled={savingNote} aria-pressed={paged} onClick={() => changeReadingMode(!paged)}>{paged ? '退出全屏阅读' : '全屏阅读'}</button>
              <button type="button" onClick={showLibrary}>书架</button>
            </>}
            <button type="button" className="primary-button" disabled={savingNote} onClick={onClose}>{returnToKnowledge ? '返回知识库' : '返回书房'}</button>
          </div>
          {mode === 'reading' && <div className="reader-toolbar">
            {chapters.length > 1 && <label className="reader-chapter-select">
              章节
              <select value={displayedChapter} onChange={(event) => {
                const id = event.target.value;
                openBook(activeBook, 0, id || null);
              }}>
                {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>
                  {chapter.text}
                </option>)}
              </select>
            </label>}
            {paged && <button type="button" aria-expanded={notesOpen} aria-label={`本章节摘录，${chapterNotes.length} 条`} aria-controls="reader-chapter-notes"
                onClick={() => {
                  setTarget({ progress: chapterProgress.current, blockId: readerPosition(contentRef.current, paged), chapterId: displayedChapter });
                  setNotesOpen((open) => !open);
                }}>
                {chapterNotes.length}
              </button>}
            <div className="reader-settings">
              <div className="reader-setting" role="group" aria-label="字号">
                <span>字号 {readerState.settings.fontSize}px</span>
                <button type="button" aria-label="减小字号" onClick={() => adjustFontSize(-1)}>−</button>
                <button type="button" aria-label="增大字号" onClick={() => adjustFontSize(1)}>+</button>
              </div>
              <div className="reader-setting" role="group" aria-label="行距">
                <span>行距 {readerState.settings.lineHeight.toFixed(1)}</span>
                <button type="button" aria-label="减少行距" onClick={() => adjustLineHeight(-1)}>−</button>
                <button type="button" aria-label="增加行距" onClick={() => adjustLineHeight(1)}>+</button>
              </div>
            </div>
            <div className="progress-block">
              <span>全书进度</span>
              <b>{formatProgress(progress)}</b>
              <div className="progress-track"><div style={{ width: formatProgress(progress) }} /></div>
            </div>
          </div>}
        </header>

        {mode === 'library' ? (
          <div className="reader-library">
            <div className="library-intro">
              {showImportIntro && <p>导入 Markdown、TXT 或 PDF。书库保留原件，并为每本书保存一份 Markdown。</p>}
              <div className="book-import-actions">
                <button type="button" className="import-button" disabled={!desktop?.importBooks || importing || deleting} onClick={() => handleImport(false)}>导入文件</button>
                <button type="button" className="import-button" disabled={!desktop?.importBooks || importing || deleting} onClick={() => handleImport(true)}>导入文件夹</button>
              </div>
              {!desktop?.importBooks && <p>请在桌面应用中导入。</p>}
              {bookLoadError && <p role="alert">{bookLoadError}</p>}
              {(importing || importError || (!importState.restored && importState.revision > dismissedImportRevision)) &&
                <ImportStatus state={importState} error={importError} />}
            </div>
            <input className="book-search" aria-label="跨书全文检索" placeholder="跨书全文检索" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query.trim() && <section className="book-search-results">
              {!hits.length && <p>没有找到匹配正文。</p>}
              {hits.map(({ book, matches }) => <div key={book.id}>
                <h3>{book.title}</h3>
                {matches.map((block) => <button key={block.id} type="button" onClick={() => openBook(book, 0, block.id)}>{block.section && `${block.section} · `}{block.snippet}</button>)}
              </div>)}
            </section>}
            {deleteStatus && <p role={deleteStatus.error ? "alert" : "status"}>{deleteStatus.message}</p>}
            <div className="book-grid">
              {allBooks.map((book) => {
                const saved = readerState.books?.[book.id];
                const noteCount = loadReaderNotes().filter((note) => note.bookId === book.id).length;
                return (
                  <article className="book-card" key={book.id}>
                    <div>
                      <p className="book-card-kicker">{book.id.startsWith('sample:') ? '内置示例' : '本地导入'}</p>
                      <h3>{book.title}</h3>
                      <p className="book-card-meta">{book.author} · {book.source}</p>
                      <p className="book-card-meta">{saved ? `已读 ${formatProgress(saved.progress)}` : '未开始'} · 摘录 {noteCount}</p>
                    </div>
                    <div className="book-card-footer">
                      <span>{saved?.progress > 0 ? '继续上次' : '开始阅读'}</span>
                      <div className="book-card-actions">
                        {desktop?.deleteBook && !book.id.startsWith('sample:') &&
                          <button type="button" disabled={deleting || importing} aria-label={`删除《${book.title}》`} onClick={() => removeBook(book)}>删除</button>}
                        <button type="button" onClick={() => openBook(book)}>{saved?.progress > 0 ? '继续' : '阅读'}</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={`reader-workspace${notesOpen ? ' reader-notes-open' : ''}${paged ? ' reader-paged' : ''}`}>
            <aside className="reader-sidebar reader-excerpts">
              {!paged && <button type="button" aria-expanded={notesOpen} aria-label={`本章节摘录，${chapterNotes.length} 条`} aria-controls="reader-chapter-notes"
                onClick={() => {
                  setTarget({ progress: chapterProgress.current, blockId: readerPosition(contentRef.current, paged), chapterId: displayedChapter });
                  setNotesOpen((open) => !open);
                }}>
                {chapterNotes.length}
              </button>}
              {notesOpen && <div id="reader-chapter-notes" className="note-list">
                {chapterNotes.length === 0 && <p className="book-card-meta">本章还没有摘录。</p>}
                {chapterNotes.map(([key, [note]]) => <div key={key}>
                  <button type="button" onClick={() => openBook(activeBook, note.blockId ? 0 : note.progress, note.blockId)}>{note.quote}</button>
                  <button type="button" onClick={(event) => openExcerpt([key], event)}>查看批注</button>
                </div>)}
              </div>}
            </aside>

            <article
              className="reader-content"
              ref={contentRef}
              onScroll={updateScrollProgress}
              onMouseUp={captureSelection}
              onKeyUp={(event) => { if (event.shiftKey) captureSelection(); }}
              style={{ fontSize: `${readerState.settings.fontSize}px`, lineHeight: readerState.settings.lineHeight }}
              tabIndex="0"
            >
              {visibleBlocks.map((block) => {
                const Element = block.type === 'heading' ? 'h3' : 'p';
                return <Element key={block.id} data-block={block.id} tabIndex={-1}>
                  {block.prefix}
                  {renderBlockParts(block, highlights.get(block.id) ?? [], openExcerpt)}
                </Element>;
              })}

            </article>
            {paged && <nav className="reader-page-nav" aria-label="翻页">
              <button type="button" disabled={atFirstSpread && chapterIndex <= 0 || savingNote} onClick={() => turnPages(-1)}>← 上一页</button>
              <button type="button" disabled={atLastSpread && chapterIndex >= chapters.length - 1 || savingNote} onClick={() => turnPages(1)}>下一页 →</button>
            </nav>}
          </div>
        )}
      </div>
      {(selectionQuote || selectedExcerpt) && noteAnchor && <div className="reader-inline-note"
        style={{
          left: Math.max(12, Math.min(noteAnchor.left, (overlayRef.current?.clientWidth ?? 400) - 360)),
          top: Math.max(12, Math.min(noteAnchor.top + 8, (overlayRef.current?.clientHeight ?? 400) - 315))
        }}>
        {selectedExcerpt ? <>
          <button type="button" className="reader-popup-close" aria-label="收起批注" onClick={dismissNote}>×</button>
          {excerptChoices.length > 1 && <select aria-label="选择重叠摘录" value={selectedExcerpt}
            onChange={(event) => setSelectedExcerpt(event.target.value)}>
            {excerptChoices.map((key) => <option key={key} value={key}>{excerpts.get(key)?.[0]?.quote}</option>)}
          </select>}
          <blockquote>{excerpts.get(selectedExcerpt)?.[0]?.quote}</blockquote>
          <ExcerptAnnotations key={selectedExcerpt} notes={excerpts.get(selectedExcerpt)} onChange={refreshNotes} />
        </> : <form aria-label="保存摘录" onSubmit={(event) => { event.preventDefault(); saveNote(); }}>
          <blockquote>{selectionQuote}</blockquote>
          <textarea aria-label="批注（选填）" placeholder="批注（选填）" rows="3"
            value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
          {noteMessage && <p role="status">{noteMessage}</p>}
          <div className="reader-inline-actions">
            <button type="button" disabled={savingNote} onClick={dismissNote}>取消</button>
            <button type="submit" disabled={savingNote}>保存摘录</button>
          </div>
        </form>}
      </div>}
      {!selectionQuote && noteMessage && <p className="reader-note-status" role="status">{noteMessage}</p>}
    </section>
  );
}

function ImportStatus({ state, error }) {
  const { phase, total, counts, skipped, processed, current, issues = [], results = [] } = state;
  if (phase === 'idle' && !error) return null;
  const failures = results.filter((item) => item.status === 'failed');
  return <div className="book-import-status" role="status">
    {error && <p className="import-error">{error}</p>}
    {phase === 'error' && <p className="import-error">{state.error}</p>}
    {phase === 'selecting' && <p>请在系统窗口选择要导入的文件或文件夹。</p>}
    {phase === 'scanning' && <p>正在扫描文件及子文件夹…</p>}
    {counts && <p>找到 {total} 个支持的文件（Markdown {counts.markdown}、TXT {counts.txt}、PDF {counts.pdf}），跳过其他文件 {skipped} 个。</p>}
    {phase === 'processing' && <p>已处理 {processed}/{total}{current && `，正在处理 ${current}`}。</p>}
    {phase === 'complete' && (total === 0
      ? <p>{issues.length ? '在可读取的位置未找到支持的文件。' : '未找到支持的文件。'}支持 Markdown（.md、.markdown）、TXT 和 PDF。</p>
      : <p>成功 {results.filter((item) => item.status === 'imported').length}，重复 {results.filter((item) => item.status === 'duplicate').length}，失败 {failures.length}。</p>)}
    {[...issues, ...failures].map(({ source, error: message }, index) =>
      <p className="import-error" key={index}>{source}：{message}</p>
    )}
  </div>;
}

function loadReaderNotes() {
  return loadKnowledge().notes;
}

function renderBlockParts(block, ranges, onOpen) {
  let offset = 0;
  return block.parts.map((part, index) => {
    const start = offset;
    const end = start + part.text.length;
    offset = end;
    const Inline = part.kind ?? 'span';
    const matching = ranges.filter((range) => range.start < end && range.end > start);
    const boundaries = [...new Set([start, end, ...matching.flatMap((range) => [
      Math.max(start, range.start), Math.min(end, range.end)
    ])])].sort((a, b) => a - b);
    const content = boundaries.slice(0, -1).map((left, i) => {
      const right = boundaries[i + 1];
      const text = part.text.slice(left - start, right - start);
      const covering = matching.filter((range) => range.start <= left && range.end >= right);
      if (!covering.length) return text;
      const keys = [...new Set(covering.map((range) => range.key))];
      return <mark key={left} role="button" tabIndex={0} aria-label="查看摘录批注"
        onClick={(event) => onOpen(keys, event)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(keys, event);
          }
        }}>{text}</mark>;
    });
    return <Inline key={index}>{part.underline ? <u>{content}</u> : content}</Inline>;
  });
}

export default ReaderOverlay;
