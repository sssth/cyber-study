import useActivityTime from '../../ui/useActivityTime.js';
import { captureExcerptSelection } from './excerptRange.js';
import useLibrarySearch from './useLibrarySearch.js';
import useReadingSession from './useReadingSession.js';
import { translate, translateError } from '../../i18n/index.js';
import { contentElements } from '../../ui/contentTargets.js';
import { persistExcerptChange } from './excerptPersistence.js';
import useEditSession from '../../ui/useEditSession.js';
import useEscapeBack, { blocksPageBack, usePageBackMatcher } from '../../ui/useEscapeBack.js';
import KnowledgeWorkspace from './KnowledgeWorkspace.jsx';
import { DisplayMenuToggle, DisplayCloseButton } from '../../ui/DisplayControls.jsx';
import useResultSource, {resultEntities} from '../../results/useResultSource.js';
import { readingMatches, retainedReadingRanges, contiguousReadingRanges, nearestReadingMatch } from './readingSearch.js';
import { useNavigationState, useNavigationScroll } from '../../ui/useNavigationState.js';
import ExcerptCard from './ExcerptCard.jsx';
import useDismissDisplayMenu from '../../ui/useDismissDisplayMenu.js';
import { ContentCommand } from '../ContentCommands.jsx';
import LibraryShelf, { shelfViews } from './LibraryShelf.jsx';
import DisplayViewMenu from '../../ui/DisplayViewMenu.jsx';
import { ActionWorkspace } from '../ui.jsx';
import {useSearchCount,useSearchScope} from '../../search/useSearchScope.jsx';
import {hasSearch} from '../../search/searchCore.js';
import ContentActions from '../ContentActions.jsx';
import { useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { formatProgress, parseMarkdownContent } from './markdownReader.js';
import { chapterLabel, chapterMarkdown, goToReaderBlock, readingAnchor, goToReadingAnchor, highlightRanges, indexChapters, readerPosition } from './readerPosition.js';
import { applyReaderSettings, bookReaderSettings } from './storage.js';
import ExcerptAnnotations from './ExcerptAnnotations.jsx';
import { addKnowledgeNote, defaultExcerptColor, excerptAppearance, excerptColors, creatableExcerptTypes, groupExcerpts, loadKnowledge, updateExcerptAppearance } from './knowledgeStore.js';

import { matchesShortcut, typingTarget } from '../../data/shortcuts.js';


const readerFonts = {
  serif: { label: "i18n.songti", family: '"Songti SC", "Noto Serif SC", Georgia, serif' },
  sans: { label: translate("i18n.heiti"), family: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' },
  kai: { label: translate("i18n.kaiti"), family: '"Kaiti SC", KaiTi, "Songti SC", serif' },
  mono: { label: translate("i18n.monospace"), family: '"SF Mono", Consolas, "PingFang SC", monospace' }
};

const minFontSize = 15;
const maxFontSize = 26;

function ReaderOverlay({
  navigationRef,
  navigationItem,
  onOpenNote,
  excerptVersion=0,
  onClose,
  onStartCopy,
  returnToKnowledge = false,
  shortcuts,
  importedBooks = [],
  onBooksChanged,
  onBookDeleted,
  initialBookId = null,
  initialLibraryBookIds = null,
  initialView = 'last',
  initialProgress = null,
  initialBlockId = null,
  bookLoadWarnings = [],
  onNoteCreated = () => {}
}) {
  const isPageBack = usePageBackMatcher();
  const [mode, setMode] = useState('library');
  const [allBookSettings, setAllBookSettings] = useState(false);
  const [libraryView,setLibraryView] = useNavigationState('reader','libraryView',!initialLibraryBookIds?.length && ['excerpt','annotation'].includes(navigationItem?.type)?'excerpts':'all', { preferInitial:Boolean(initialLibraryBookIds?.length || navigationItem) });
  const [pagedChapter,setPagedChapter]=useState(null);
  const [paged, setPaged] = useState(initialView === 'paged');
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteAnchor, setNoteAnchor] = useState(null);
  const [selectedExcerpt, setSelectedExcerpt] = useState(null);
  const [excerptChoices, setExcerptChoices] = useState([]);
  const overlayRef = useRef(null);
  useNavigationScroll("reader.scroll", overlayRef, ".reader-library");
  const [atFirstSpread, setAtFirstSpread] = useState(true);
  const [atLastSpread, setAtLastSpread] = useState(true);
  const [activeBookId, setActiveBookId] = useState(null);
  const { state: readerState, update: setReaderState, queuePosition, flushPosition } =
    useReadingSession(mode === 'reading' ? activeBookId : null);
  const closeOverlay = () => {
    flushPosition();
    onClose();
  };
  const [progress, setProgress] = useState(0);
  const chapterProgress = useRef(0);
  const [importState, setImportState] = useState({ phase: 'idle', revision: -1 });
  const [importError, setImportError] = useState('');
  const [dismissedImportRevision, setDismissedImportRevision] = useState(-1);
  const [deleteStatus, setDeleteStatus] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const importRequest = useRef(false);
  const [savingNote, setSavingNote] = useState(false);
  const selectionStart = useRef(null);
  const selectionRange = useRef(null);
  const selectionFrame = useRef(null);
  useEffect(() => () => cancelAnimationFrame(selectionFrame.current), []);
  const desktop = globalThis.cyberStudy;

  const [target, setTarget] = useState(null);
  const [selectionBlock, setSelectionBlock] = useState(null);
  const [selectionQuote, setSelectionQuote] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteMessage, setNoteMessage] = useState(null);
  const [knowledgeVersion, setKnowledgeVersion] = useState(0);
  const contentRef = useRef(null);
  const searchAnchor=useRef(null);
  const pendingSearchAnchor=useRef(null);
  const restoredInitialBook = useRef(false);

  const allBooks = useMemo(() => {
    return importedBooks.map(book => ({ ...book, author: readerState.books?.[book.id]?.customAuthor ?? (book.author === '本地导入' ? '' : book.author), title: readerState.books?.[book.id]?.customTitle || book.title }));
  }, [importedBooks, readerState.books]);
  const importing = ['selecting', 'scanning', 'processing'].includes(importState.phase);
  useEffect(() => {
    if (!desktop?.getBookImportState) return;
    let active = true;
    const update = (state, restored = false) => {
      if (active) setImportState((current) => state.revision > current.revision ? { ...state, restored } : current);
    };
    const unsubscribe = desktop.onBookImportProgress((state) => update(state));
    desktop.getBookImportState().then((state) => update(state, true)).catch(() => {
      if (active) setImportError(translate("i18n.couldNotReadImportProgress"));
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
      if (active) setImportError(translate("i18n.importFinishedButTheShelfCouldNot"));
    });
    return () => { active = false; };
  }, [desktop, importState, onBooksChanged]);
  const scopeId=mode==='reading'?`book:${activeBookId}`:'library';
  const search=useSearchScope({id:scopeId,label:mode==='reading'?translate("i18n.currentBook0", allBooks.find(b=>b.id===activeBookId)?.title||''):translate("i18n.libraryFullTextSearch"),priority:30,enabled:mode==='reading'||libraryView!=='excerpts',exactCount:mode==='reading',hostKey:paged,autoFocus:!(mode==='reading'&&paged),searchHost:()=>mode==='reading'&&paged?overlayRef.current?.querySelector('.reader-search-slot'):null,filters:mode==='reading'?[{key:'context',label:translate("i18n.excerptRange"),defaultLabel:translate("i18n.paragraph"),options:[['paragraph',translate("i18n.paragraph")],['sentence',translate("i18n.sentence")],['chapter',translate("i18n.chapter")]]}]:[{key:'author',label:translate("i18n.author"),options:[...new Set(allBooks.map(b=>b.author).filter(Boolean))].map(v=>[v,v])},{key:'format',label:translate("i18n.importFormat"),options:[...new Set(allBooks.map(b=>b.originalFormat||b.format).filter(Boolean))].map(v=>[v,v])}]});
  const query=search.query;
  const parseBook = useMemo(() => {
    const cache = new Map();
    return content => {
      if (!cache.has(content)) cache.set(content, parseMarkdownContent(content));
      return cache.get(content);
    };
  }, [importedBooks]);
  const { hits, visibleBooks } = useLibrarySearch(allBooks, initialLibraryBookIds, search, mode === 'library', parseBook);
  const activeBook = allBooks.find(book => book.id === activeBookId) ?? null;
  useActivityTime('reading', mode === 'reading' && Boolean(activeBook));
  const activeContent = activeBook?.content;
  const blocks = useMemo(() => activeContent ? parseBook(activeContent) : [], [activeContent, parseBook]);
  const readingHighlights = useMemo(() => new Map(
    mode === 'reading' ? blocks.map(block => [block.id, readingMatches(block.text, query)]) : []
  ), [mode, blocks, query]);
  const readingHitCount = [...readingHighlights.values()].reduce((sum, ranges) => sum + ranges.length, 0);
  useSearchCount(scopeId, mode === 'reading' ? readingHitCount : visibleBooks.length);
  const {
    fontSize, lineHeight, font = 'serif', excerptColor = defaultExcerptColor, theme = 'night', eyeComfort = false
  } = bookReaderSettings(readerState, activeBookId);
  const fontId = Object.hasOwn(readerFonts, font) ? font : 'serif';
  const fontFamily = readerFonts[fontId].family;
  const { chapters, chapterByBlock } = useMemo(() => indexChapters(blocks), [blocks]);
  const openedFromShelf = useRef(false);
  useImperativeHandle(navigationRef, () => () => ({
    view: mode === 'reading' ? (paged ? 'paged' : 'last') : 'library',
    localBack: Boolean(selectionQuote || selectedExcerpt || paged || (mode === 'reading' && openedFromShelf.current)),
    bookId: activeBookId,
    progress: mode === 'reading' ? chapterProgress.current : null,
    blockId: mode === 'reading' && contentRef.current ? readerPosition(contentRef.current, paged) : null
  }));

  const savedPosition = readerState.books?.[activeBookId];
  const destination = target ?? { progress: initialProgress, blockId: initialBlockId };
  const destinationBlock = destination.blockId ?? (destination.progress == null ? savedPosition?.blockId : null);
  const destinationChapter = chapterByBlock.get(destinationBlock) ?? destination.chapterId ?? chapters[0]?.id ?? '';
  const displayedChapter = paged&&pagedChapter?.bookId===activeBookId?pagedChapter.id:destinationChapter;
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === displayedChapter);
  const retainedRanges=useMemo(()=>query.trim()?retainedReadingRanges(blocks,readingHighlights,chapterByBlock,search.filters.context||'paragraph'):null,[blocks,readingHighlights,chapterByBlock,query,search.filters.context]);
  const selectableChapters=useMemo(()=>{
    if(!query.trim())return chapters;
    const matched=new Set(blocks.filter(block=>readingHighlights.get(block.id)?.length).map(block=>chapterByBlock.get(block.id)));
    return chapters.filter(chapter=>matched.has(chapter.id));
  },[chapters,blocks,chapterByBlock,readingHighlights,query]);
  const visibleBlocks = paged?blocks:blocks.filter((block) => chapterByBlock.get(block.id) === displayedChapter);
  useLayoutEffect(()=>{
    const element=contentRef.current;if(!element)return;
    const measure=()=>{
      const filler=element.querySelector('[data-reader-padding]');
      const previousOffset=element.scrollLeft;
      if(filler){
        filler.hidden=true;
        const columns=Number.parseInt(getComputedStyle(element).columnCount,10)||2;
        const pages=Math.round(element.scrollWidth/(element.clientWidth/columns));
        filler.hidden=columns!==2||pages%2===0;
        element.scrollLeft=previousOffset;
      }
      const offset=paged?element.scrollLeft:element.scrollTop;
      const distance=paged?element.scrollWidth-element.clientWidth:element.scrollHeight-element.clientHeight;
      setAtFirstSpread(offset<=1);setAtLastSpread(offset>=distance-1);
    };
    measure();
    const observer=new ResizeObserver(measure);observer.observe(element);
    return ()=>observer.disconnect();
  },[retainedRanges,paged,mode,activeBookId,fontSize,lineHeight,fontFamily]);
  useEffect(()=>{
    if(mode!=='reading')return;
    const beforeSearch=event=>{
      if(event.detail.id!==scopeId)return;
      const next=event.detail.state;
      if(next.query===query&&next.filters?.context===search.filters.context)return;
      const element=contentRef.current;
      const saved=searchAnchor.current;
      const current=element&&(saved?.bookId===activeBookId&&saved.paged===paged&&saved.scroll===(paged?element.scrollLeft:element.scrollTop)?saved.anchor:readingAnchor(element,paged));
      const anchor=current|| (searchAnchor.current?.bookId===activeBookId?searchAnchor.current.anchor:null);
      if(!anchor)return;
      searchAnchor.current={bookId:activeBookId,anchor};
      const matches=new Map(blocks.map(block=>[block.id,readingMatches(block.text,next.query)]));
      const destination=next.query.trim()?nearestReadingMatch(blocks,matches,anchor):anchor;
      pendingSearchAnchor.current=destination;
      if(destination&&!paged&&chapterByBlock.get(destination.blockId)!==displayedChapter)setTarget({blockId:destination.blockId});
    };
    window.addEventListener('cyber-search-before-change',beforeSearch);
    return ()=>window.removeEventListener('cyber-search-before-change',beforeSearch);
  },[mode,scopeId,activeBookId,blocks,query,search.filters.context,paged,chapterByBlock,displayedChapter]);
  useLayoutEffect(()=>{
    const anchor=pendingSearchAnchor.current,element=contentRef.current;
    if(!anchor||!element)return;
    goToReadingAnchor(element,anchor,paged);
    searchAnchor.current={bookId:activeBookId,anchor,paged,scroll:paged?element.scrollLeft:element.scrollTop};
    pendingSearchAnchor.current=null;
    updateScrollProgress();
  },[query,search.filters.context,displayedChapter,paged]);
  const activeNotes = useMemo(
    () => loadReaderNotes().filter((note) => note.bookId === activeBookId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBookId, knowledgeVersion]
  );

  const excerpts = useMemo(() => groupExcerpts(activeNotes), [activeNotes]);
  const selectedNote = excerpts.get(selectedExcerpt)?.[0];
  const activeExcerptColor = selectedNote && !allBookSettings ? excerptAppearance(selectedNote).color : excerptColor;
  const highlights = useMemo(() => highlightRanges(blocks, excerpts, { maskLegacyUnderlines: true }), [blocks, excerpts]);

  useLayoutEffect(() => {
    if (restoredInitialBook.current || initialView === 'library') return;
    const initialBook = allBooks.find((book) => book.id === initialBookId);
    if (!initialBook) return;
    restoredInitialBook.current = true;
    recordBookOpen(initialBook.id);
    setActiveBookId(initialBook.id);
    setMode('reading');
    setProgress(readerState.books?.[initialBook.id]?.progress ?? 0);
  }, [allBooks, initialView, initialBookId, readerState.books]);

  const dismissNote = () => {
    setSelectionQuote('');
    setNoteAnchor(null);
    setNoteDraft('');
    setSelectedExcerpt(null);
    setExcerptChoices([]);
    setNoteMessage(null);
  };
  useEditSession(Boolean(selectedExcerpt), dismissNote, { editing: false });

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
    if (!noteAnchor || selectedExcerpt) return;
    const closeOutside = (event) => {
      if (savingNote || event.target.closest?.('.reader-inline-note, [data-reader-color], mark[role="button"]')) return;
      dismissNote();
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [noteAnchor, savingNote, selectedExcerpt]);

  const showLibrary = () => {
    if (savingNote) return;
    if (paged) changeReadingMode(false);
    setNotesOpen(false);
    dismissNote();
    setDismissedImportRevision(importState.revision);
    setImportError('');
    flushPosition();
    setAllBookSettings(false);
    setMode('library');
  };

  const turnPages = (direction) => {
    const element = contentRef.current;
    if (!element?.clientWidth || savingNote) return;
    dismissNote();
    const max = element.scrollWidth - element.clientWidth;
    const spread = Math.ceil((element.scrollLeft - 1) / element.clientWidth);
    element.scrollLeft = Math.max(0,Math.min(max,(spread + direction) * element.clientWidth));
  };

  useEscapeBack(() => {
    if (selectionQuote || selectedExcerpt) dismissNote();
    else if (paged) changeReadingMode(false);
    else if (mode === 'reading') showLibrary();
    else closeOverlay();
  }, {
    blocked: event => (mode === 'library' && libraryView === 'excerpts') || savingNote || blocksPageBack(event)
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented || isPageBack(event) || document.querySelector('dialog[open]')) return;
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
    const targetBlockId = position.blockId ?? (paged?position.chapterId:null) ?? (position.progress == null ? savedBook?.blockId : null);

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

  function recordBookOpen(id) {
    const openedAt = new Date().toISOString();
    setReaderState(state => {
      const previous = state.books[id];
      return { ...state, lastBookId: id, books: { ...state.books, [id]: {
        ...previous, openedAt, finished: previous?.finished || previous?.progress >= 1
      } } };
    });
  }

  const openBook = (book, targetProgress = null, blockId = null) => {
    if (!book || savingNote) return;
    flushPosition();
    if (mode === 'library') openedFromShelf.current = true;
    restoredInitialBook.current = true;
    setTarget({ progress: targetProgress, blockId });
    setActiveBookId(book.id);
    setMode('reading');
    dismissNote();
    const saved = targetProgress ?? readerState.books?.[book.id]?.progress ?? 0;
    setProgress(saved);
    if (mode === 'library' || activeBookId !== book.id) recordBookOpen(book.id);

  };

  const updateScrollProgress = () => {
    const element = contentRef.current;
    if (!element || !activeBook) return;

    const distance = paged ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight;
    const offset = paged ? element.scrollLeft : element.scrollTop;
    const localProgress = distance <= 0 ? (chapterIndex === chapters.length - 1 ? 1 : 0) : Math.min(1, Math.max(0, offset / distance));
    setAtFirstSpread(offset <= 1);
    setAtLastSpread(offset >= distance - 1);
    const visibleBlockId=readerPosition(element,paged);
    if(paged&&visibleBlockId)setPagedChapter({bookId:activeBook.id,id:chapterByBlock.get(visibleBlockId)});
    if(retainedRanges)return;
    chapterProgress.current = localProgress;
    const chapterStart = blocks.findIndex((block) => block.id === visibleBlocks[0]?.id);
    const nextProgress = blocks.length
      ? (Math.max(0, chapterStart) + visibleBlocks.length * localProgress) / blocks.length
      : 0;
    const blockId = visibleBlockId ?? visibleBlocks[0]?.id;
    setProgress(nextProgress);

    queuePosition(state => {
      const previous = state.books[activeBook.id] ?? {};
      return {
        ...state,
        lastBookId: activeBook.id,
        books: {
          ...state.books,
          [activeBook.id]: {
            ...previous,
            title: activeBook.title,
            progress: nextProgress,
            finished: previous.finished || previous.progress >= 1 || nextProgress >= 1,
            chapterProgress: localProgress,
            blockId,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
  };

  const updateReaderSettings = (adjust) => {
    if (!activeBookId) return;
    setReaderState(state => {
      const changes = adjust(bookReaderSettings(state, activeBookId));
      return applyReaderSettings(state, activeBookId, changes, allBookSettings);
    });
  };

  const adjustFontSize = (direction) => {
    updateReaderSettings(({ fontSize }) => ({
      fontSize: Math.min(maxFontSize, Math.max(minFontSize, fontSize + direction * 2))
    }));
  };

  const adjustLineHeight = (direction) => {
    updateReaderSettings(({ lineHeight }) => ({
      lineHeight: Math.min(2.4, Math.max(1.5, Number((lineHeight + direction * 0.1).toFixed(1))))
    }));
  };

  const captureSelection = () => {
    if (selectedExcerpt || savingNote) return false;
    const selection = captureExcerptSelection(contentRef.current, blocks, retainedRanges);
    if (!selection) return false;
    const { ranges, rect } = selection;
    if (selectionQuote && JSON.stringify(selectionRange.current) === JSON.stringify(ranges)) return true;
    selectionRange.current = ranges;
    setSelectedExcerpt(null);
    setNoteAnchor(anchorFor(rect));
    setSelectionBlock(ranges[0].blockId);
    setNoteDraft('');
    setSelectionQuote(ranges.map((item) => item.text).join('\n'));
    setNoteMessage(null);
    return true;
  };

  const autoCaptureSelection = () => {
    cancelAnimationFrame(selectionFrame.current);
    selectionFrame.current = requestAnimationFrame(() => {
      if (contentRef.current?.isConnected) captureSelection();
    });
  };

  const anchorFor = (rect) => {
    const overlay = overlayRef.current.getBoundingClientRect();
    return { left: rect.left - overlay.left, top: rect.bottom - overlay.top };
  };

  const openExcerpt = (keys, event) => {
    if (savingNote || !keys.length) return;
    cancelAnimationFrame(selectionFrame.current);
    globalThis.getSelection?.()?.removeAllRanges();
    dismissNote();
    if (selectedExcerpt) return;
    setExcerptChoices(keys);
    setSelectedExcerpt(keys[0]);
    setNoteAnchor(anchorFor(event.currentTarget.getBoundingClientRect()));
  };

  const saveNote = (excerptType) => {
    if (!activeBook || savingNote) return;
    const quote = selectionQuote.trim();
    if (!quote) {
      setNoteMessage(translate("i18n.selectTheTextYouWantToExcerpt"));
      return;
    }
    setSavingNote(true);
    try {
      addKnowledgeNote({
        bookId: activeBook.id, bookTitle: activeBook.title, quote, annotation: noteDraft.trim(),
        progress, blockId: selectionBlock, excerptType, color: excerptColor,
        ranges: (selectionRange.current ?? []).map(({ blockId, start, end }) => ({ blockId, start, end }))
      }, { updateAppearance: true });
      globalThis.getSelection?.()?.removeAllRanges();
      dismissNote();
      setNoteMessage(null);
      setKnowledgeVersion((version) => version + 1);
      onNoteCreated();
    } catch (error) {
      setNoteMessage(error.message);
    } finally {
      setSavingNote(false);
    }
  };

  const removeSelectedExcerpt = async () => {
    if (!selectedNote || savingNote || !window.confirm(translate("i18n.deleteThisExcerptAndAllItsAnnotations"))) return;
    setSavingNote(true);
    try {
      await persistExcerptChange(selectedNote, null, activeBook, blocks, onBooksChanged);
      dismissNote();
      refreshNotes();
    } catch (error) {
      setNoteMessage(error.message);
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
      setImportError(translate("i18n.couldNotStartTheImportReopenThe"));
    } finally {
      importRequest.current = false;
    }
  };

  const renameBook = async (book, values) => {
    const fields = typeof values === 'string' ? { title: values } : values;
    const { readingStatus, ...metadata } = fields;
    const storedLocally = !desktop?.renameBook || !/^(file:|local:)/.test(book.id);
    if (!storedLocally) {
      const updated = await desktop.renameBook(book.id, typeof values === 'string' ? values : metadata);
      onBooksChanged([updated]);
    }
    if (storedLocally || readingStatus !== undefined) {
      setReaderState(state => ({
        ...state,
        books: { ...state.books, [book.id]: {
          ...state.books[book.id],
          ...(storedLocally ? { customTitle: fields.title, ...('author' in fields ? { customAuthor: fields.author } : {}) } : {}),
          ...(readingStatus !== undefined ? { readingStatus } : {})
        } }
      }));
    }
  };

  const removeBook = async (book) => {
    if (deleting || importing) return;
    setDeleting(true);
    setDeleteStatus(null);
    try {
      if (await desktop.deleteBook(book.id)) {
        onBookDeleted(book.id);
        return true;
      }
    } catch {
      setDeleteStatus({ error: true, message: translate("i18n.couldNotDelete0TryAgain", book.title) });
    } finally {
      setDeleting(false);
    }
  };

  const refreshNotes = () => {
    setKnowledgeVersion((version) => version + 1);
    onNoteCreated();
  };
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  useDismissDisplayMenu(displayMenuOpen, setDisplayMenuOpen, overlayRef);
  const chapterNotes = useMemo(() => [...excerpts].filter(([, [note]]) =>
    (chapterByBlock.get(note.blockId ?? note.ranges?.[0]?.blockId) ?? chapters[0]?.id ?? '') === displayedChapter
  ), [excerpts, chapterByBlock, chapters, displayedChapter]);
  const chapterTitle = chapterLabel(chapters.find(chapter => chapter.id === displayedChapter));
  const snapshotEntities = useMemo(() => activeBook ? [
    ...resultEntities('book', [{
      id: activeBook.id, title: activeBook.title, author: activeBook.author, source: activeBook.source,
      chapterTitle, content: chapterMarkdown(activeBook.content, blocks, chapters, displayedChapter)
    }]),
    ...resultEntities('excerpt', chapterNotes.map(([, notes]) => ({ ...notes[0], chapterTitle, notes })))
  ] : [], [activeBook, blocks, chapters, displayedChapter, chapterTitle, chapterNotes]);
  useResultSource({ scopeId: scopeId, 
    priority: 30, detail: true, label: translate("i18n.readBook"), position: chapterTitle, enabled: mode === 'reading',
    selectVisible: () => setAllBookSettings(current => !current),
    matches: resultEntities('book', [activeBook]), applications: { snapshot: snapshotEntities }
  });

  if (mode === 'library' && libraryView === 'excerpts') {
    return <KnowledgeWorkspace onClose={closeOverlay} shelfMenu={<DisplayViewMenu label={translate("i18n.shelfView")} options={shelfViews} value="excerpts" onChange={setLibraryView}/>} navigationItem={navigationItem} importedBooks={importedBooks} onBooksChanged={onBooksChanged} version={excerptVersion} onStartCopy={onStartCopy} onOpenNote={onOpenNote} />;
  }

  return (
    <section data-local-selection={mode === 'reading' && allBookSettings || undefined} data-command-scope={scopeId} data-menu-open={displayMenuOpen} ref={overlayRef} className={`reader-overlay${paged ? " reader-immersive" : ""}`} role="dialog" aria-modal="true" aria-label={translate("i18n.library")}
      onDoubleClick={event => {
        if (!selectedExcerpt || savingNote || event.defaultPrevented ||
            event.target.closest('button, input, select, textarea, a, [contenteditable]')) return;
        event.preventDefault();
        dismissNote();
      }}>
      <div className={`reader-shell ${mode === 'library' ? 'library-mode' : 'reading-mode'}`}
        data-reader-theme={mode === 'reading' ? theme : undefined}
        data-reader-eye-comfort={mode === 'reading' && eyeComfort ? '' : undefined}>
        {mode === 'library' && <DisplayMenuToggle label={translate("i18n.openShelfMenu")} open={displayMenuOpen} onToggle={() => setDisplayMenuOpen(value => !value)} />}
        {!paged&&<DisplayCloseButton label={translate("i18n.close")} disabled={savingNote} onClose={closeOverlay} />}
        <header className="reader-topbar" onPointerLeave={event=>{if(paged&&event.currentTarget.contains(document.activeElement))document.activeElement.blur();}}>
          <div data-edit-item={mode === 'reading' ? '' : undefined}>

            {mode === 'reading' && activeBook && <>
              <h2>{activeBook.title}</h2>
              <ContentActions surface=".reader-shell" preview={false} type="book" id={activeBook.id} title={activeBook.title}/>
              {activeBook &&
                <ContentCommand label={translate("i18n.renameBook0", activeBook.title)} value={activeBook.title}
                  disabled={deleting || importing || savingNote} run={title => renameBook(activeBook, title)} />}
              {desktop?.deleteBook && !activeBook.id.startsWith('sample:') &&
                <ContentCommand label={translate("i18n.delete0", activeBook.title)} destructive disabled={deleting || importing || savingNote}
                  run={async () => { if (await removeBook(activeBook)) showLibrary(); }} />}
            </>}
          </div>
          {paged&&<div className="reader-search-slot"/>}
          <div className="reader-top-actions">
            {mode === 'reading' && <>
              <button type="button" disabled={savingNote} aria-pressed={paged} onClick={() => changeReadingMode(!paged)}>{paged ? translate("i18n.exitFullScreenReading") : translate("i18n.fullScreenReading")}</button>
              {paged&&<button type="button" className="reader-fullscreen-close" aria-label={translate("i18n.close")} disabled={savingNote} onClick={closeOverlay}>×</button>}
              <button type="button" onClick={showLibrary}>{translate("i18n.library")}</button>
            </>}

          </div>
          {mode === 'reading' && <div className="reader-toolbar">
            {chapters.length > 1 && <label className="reader-chapter-select">
              {translate("i18n.chapters")}
              <select disabled={!selectableChapters.length} value={selectableChapters.some(chapter=>chapter.id===displayedChapter)?displayedChapter:selectableChapters[0]?.id??''} onChange={(event) => {
                const id = event.target.value;
                openBook(activeBook, 0, id || null);
              }}>
                {!selectableChapters.length&&<option value=""></option>}
                {selectableChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>
                  {chapterLabel(chapter)}
                </option>)}
              </select>
            </label>}
            {paged && <button type="button" aria-expanded={notesOpen} aria-label={translate("i18n.chapterExcerpts0", chapterNotes.length)} aria-controls="reader-chapter-notes"
                onClick={() => {
                  setTarget({ progress: chapterProgress.current, blockId: readerPosition(contentRef.current, paged), chapterId: displayedChapter });
                  setNotesOpen((open) => !open);
                }}>
                {chapterNotes.length}
              </button>}
            <div className="reader-settings">
              <div className="reader-setting" role="group" aria-label={translate("i18n.textSize")}>
                <span>{translate("i18n.textSize")}{' '}{fontSize}px</span>
                <button type="button" aria-label={translate("i18n.decreaseTextSize")} onClick={() => adjustFontSize(-1)}>−</button>
                <button type="button" aria-label={translate("i18n.increaseTextSize")} onClick={() => adjustFontSize(1)}>+</button>
              </div>
              <div className="reader-setting" role="group" aria-label={translate("i18n.lineSpacing")}>
                <span>{translate("i18n.lineSpacing")}{' '}{lineHeight.toFixed(1)}</span>
                <button type="button" aria-label={translate("i18n.decreaseLineSpacing")} onClick={() => adjustLineHeight(-1)}>−</button>
                <button type="button" aria-label={translate("i18n.increaseLineSpacing")} onClick={() => adjustLineHeight(1)}>+</button>
              </div>
              <label className="reader-setting">
                {translate("i18n.font")}
                <select value={fontId}
                  onChange={event => {
                    const font = event.target.value;
                    updateReaderSettings(() => ({ font }));
                  }}>
                  {Object.entries(readerFonts).map(([id, option]) => <option key={id} value={id}>{translate(option.label)}</option>)}
                </select>
              </label>
              <div className="reader-setting" role="group" aria-label={translate("i18n.readingTheme")}>
                <button type="button" className="reader-eye-comfort" aria-pressed={eyeComfort}
                  onClick={() => updateReaderSettings(settings => ({ eyeComfort: !settings.eyeComfort }))}>
                  {translate("i18n.sepia")}
                </button>
                <button type="button" aria-label={translate("i18n.currentTheme", translate(theme === "day" ? "i18n.daytime" : "i18n.nighttime"))}
                  onClick={() => updateReaderSettings(settings => ({ theme: settings.theme === 'day' ? 'night' : 'day' }))}>
                  {theme === 'day' ? translate("i18n.dayTheme") : translate("i18n.nightTheme")}
                </button>
              </div>
              <div className="reader-setting reader-color-palette" data-reader-color role="group" aria-label={translate("i18n.excerptColor")}>
                {Object.entries(excerptColors).map(([color, label]) => (
                  <button key={color} type="button" aria-label={translate(label)} title={translate(label)}
                    aria-pressed={activeExcerptColor === color} style={{ '--swatch-color': color }} disabled={savingNote}
                    onClick={() => {
                      if (!selectedNote || allBookSettings) {
                        updateReaderSettings(() => ({ excerptColor: color }));
                        return;
                      }
                      try {
                        updateExcerptAppearance(selectedNote, { color });
                        refreshNotes();
                      } catch (error) {
                        setNoteMessage(error.message);
                      }
                    }} />
                ))}
              </div>
            </div>
            <div className="progress-block">
              <span>{translate("i18n.bookProgress")}</span>
              <b>{formatProgress(progress)}</b>
              <div className="progress-track"><div style={{ width: formatProgress(progress) }} /></div>
            </div>
          </div>}
        </header>

        {mode === 'library' ? (
          <div className="reader-library" data-scroll-memory={`library-${libraryView}`}>
            <ActionWorkspace command={libraryView==='all'} showTrigger={false} disabled={deleting} label={translate("i18n.addBooks")} title={translate("i18n.importBooks")}><div className="library-intro">

              <div className="book-import-actions edit-actions">
                <button type="button" className="import-button" disabled={!desktop?.importBooks || importing || deleting} onClick={() => handleImport(false)}>{translate("i18n.importFiles")}</button>
                <button type="button" className="import-button" disabled={!desktop?.importBooks || importing || deleting} onClick={() => handleImport(true)}>{translate("i18n.importFolder")}</button>
              </div>
              {!desktop?.importBooks && <p>{translate("i18n.openTheDesktopAppToImportBooks")}</p>}
              {bookLoadWarnings.map(message => <p role="alert" key={message}>{translate(message)}</p>)}
              {(importing || importError || (!importState.restored && importState.revision > dismissedImportRevision)) &&
                <ImportStatus state={importState} error={importError} />}
            </div>
            </ActionWorkspace>
            {deleteStatus && <p role={deleteStatus.error ? "alert" : "status"}>{deleteStatus.message}</p>}
            <LibraryShelf initialShelfView={libraryView} searchActive={hasSearch(search)} searchQuery={query} searchHits={hits} onViewChange={setLibraryView} books={allBooks} visibleBooks={visibleBooks} readerState={readerState} openBook={openBook} renameBook={renameBook} removeBook={removeBook} canDelete={Boolean(desktop?.deleteBook)} busy={deleting || importing}/>

          </div>
        ) : (<>
          {selectionQuote && <ContentCommand kind="cancel-create" label={translate("i18n.cancelNewExcerpt")} disabled={savingNote} run={dismissNote} />}
          {!selectedExcerpt && <ContentCommand kind="create" label={translate("i18n.newExcerptSelectTextFirst")}
            disabled={savingNote || Boolean(selectionQuote)} run={() => {
              if (!captureSelection()) setNoteMessage(translate("i18n.selectTheTextYouWantToExcerpt"));
            }} />}
          <div className={`reader-workspace${notesOpen ? ' reader-notes-open' : ''}${paged ? ' reader-paged' : ''}`}>
            <aside className="reader-sidebar reader-excerpts">
              {!paged && <button type="button" aria-expanded={notesOpen} aria-label={translate("i18n.chapterExcerpts0", chapterNotes.length)} aria-controls="reader-chapter-notes"
                onClick={() => {
                  setTarget({ progress: chapterProgress.current, blockId: readerPosition(contentRef.current, paged), chapterId: displayedChapter });
                  setNotesOpen((open) => !open);
                }}>
                {chapterNotes.length}
              </button>}
              {notesOpen && <div id="reader-chapter-notes" className="note-list">
                {chapterNotes.length === 0 && <p className="book-card-meta">{translate("i18n.noExcerptsInThisChapterYet")}</p>}
                {chapterNotes.map(([key, notes]) => <ExcerptCard key={key} notes={notes}
                  onLocate={() => openBook(activeBook, notes[0].blockId ? 0 : notes[0].progress, notes[0].blockId)}
                  onEdit={event => openExcerpt([key], event)} />)}
              </div>}
            </aside>

            <article
              className="reader-content"
              ref={contentRef}
              onScroll={updateScrollProgress}
              onMouseDown={event => { if (event.detail > 1) event.preventDefault(); }}
              onPointerDown={event => {
                if (event.button === 0) selectionStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
              }}
              onPointerCancel={() => { selectionStart.current = null; }}
              onPointerUp={event => {
                const start = selectionStart.current;
                selectionStart.current = null;
                if (event.button === 0 && start?.id === event.pointerId &&
                    (start.x !== event.clientX || start.y !== event.clientY)) autoCaptureSelection();
              }}
              onKeyUp={event => { if (event.key === 'Shift' || event.shiftKey) autoCaptureSelection(); }}
              style={{ fontFamily, fontSize: `${fontSize}px`, lineHeight }}
              tabIndex="0"
            >
              {visibleBlocks.flatMap((block) => {
                const Element = block.type === 'heading' ? 'h3' : 'p';
                const fragments=retainedRanges?contiguousReadingRanges(retainedRanges.get(block.id)||[]):[null];
                return fragments.map(fragment=><Element key={`${block.id}:${fragment?.start??0}`} data-block={block.id} data-chapter-start={block.id===chapterByBlock.get(block.id)||undefined} tabIndex={-1}>
                  {block.prefix}
                  {renderBlockParts(block, highlights.get(block.id) ?? [], excerpts, openExcerpt, readingHighlights.get(block.id) ?? [], fragment?[fragment]:null, isPageBack)}
                </Element>);
              })}
              {paged&&<div data-reader-padding hidden aria-hidden="true"/>}
            </article>
            {paged && <nav className="reader-page-nav" aria-label={translate("i18n.pageNavigation")}>
              <button type="button" disabled={atFirstSpread || savingNote} onClick={() => turnPages(-1)}>{translate("i18n.previousPage")}</button>
              <button type="button" disabled={atLastSpread || savingNote} onClick={() => turnPages(1)}>{translate("i18n.nextPage")}</button>
            </nav>}
          </div>
          </>
        )}
      </div>
      {(selectionQuote || selectedExcerpt) && noteAnchor && <div className="reader-inline-note" data-edit-active={Boolean(selectedExcerpt) || undefined} data-local-create={Boolean(selectedExcerpt) || undefined}
        style={{
          left: Math.max(12, Math.min(noteAnchor.left, (overlayRef.current?.clientWidth ?? 400) - 360)),
          top: Math.max(12, Math.min(noteAnchor.top + 8, (overlayRef.current?.clientHeight ?? 400) - 315))
        }}>
        {selectedExcerpt ? <>
          {excerptChoices.length > 1 && <select aria-label={translate("i18n.chooseAnOverlappingExcerpt")} value={selectedExcerpt}
            onChange={(event) => setSelectedExcerpt(event.target.value)}>
            {excerptChoices.map((key) => <option key={key} value={key}>{excerpts.get(key)?.[0]?.quote}</option>)}
          </select>}
          <blockquote>{excerpts.get(selectedExcerpt)?.[0]?.quote}</blockquote><ContentActions surface=".reader-inline-note" type="excerpt" id={excerpts.get(selectedExcerpt)?.[0]?.id} title={excerpts.get(selectedExcerpt)?.[0]?.quote?.slice(0,40)}/>
          <ExcerptAnnotations key={selectedExcerpt} notes={excerpts.get(selectedExcerpt)} onChange={refreshNotes}
            onHide={dismissNote}
            onDeleteExcerpt={removeSelectedExcerpt} saving={savingNote} />
          {noteMessage && <p role="alert">{translateError(noteMessage)}</p>}
        </> : <form aria-label={translate("i18n.saveExcerpt")} onSubmit={(event) => { event.preventDefault(); saveNote(event.nativeEvent.submitter?.value || 'highlight'); }}>
          <blockquote>{selectionQuote}</blockquote>
          <textarea aria-label={translate("i18n.annotationOptional")} placeholder={translate("i18n.annotationOptional")} rows="3"
            value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
          {noteMessage && <p role="status">{translateError(noteMessage)}</p>}
          <div className="reader-inline-actions reader-selection-actions" role="group" aria-label={translate("i18n.textSelectionActions")}>
            {Object.entries(creatableExcerptTypes).map(([type, label]) => <button key={type} type="submit" value={type} disabled={savingNote}>
              {translate(label)}
            </button>)}
            <button type="button" disabled={savingNote} onClick={() => onStartCopy?.({bookId:activeBook.id,bookTitle:activeBook.title,chapterTitle:chapters.find(c=>c.id===displayedChapter)?.text || '全文',text:selectionQuote})}>{translate("i18n.typingPractice")}</button>
          </div>
        </form>}
      </div>}
      {!selectionQuote && !selectedExcerpt && noteMessage && <p className="reader-note-status" role="status">{translateError(noteMessage)}</p>}
    </section>
  );
}

function ImportStatus({ state, error }) {
  const { phase, total, counts, skipped, processed, current, issues = [], results = [] } = state;
  if (phase === 'idle' && !error) return null;
  const failures = results.filter((item) => item.status === 'failed');
  return <div className="book-import-status" role="status">
    {error && <p className="import-error">{translateError(error)}</p>}
    {phase === 'error' && <p className="import-error">{state.error}</p>}
    {phase === 'selecting' && <p>{translate("i18n.chooseFilesOrAFolderInThe")}</p>}
    {phase === 'scanning' && <p>{translate("i18n.scanningFilesAndSubfolders")}</p>}
    {counts && <p>{translate("i18n.bookImportFound", total, counts.markdown, counts.txt, counts.pdf, counts.epub ?? 0, skipped)}</p>}
    {phase === 'processing' && <p>{translate("i18n.processed")}{' '}{processed}/{total}{current && translate("i18n.processing0", current)}。</p>}
    {phase === 'complete' && (total === 0
      ? <p>{issues.length ? translate("i18n.noSupportedFilesWereFoundInReadable") : translate("i18n.noSupportedFilesFound")}{translate("i18n.supportedFormatsMarkdownMdMarkdownTxtPdf")}</p>
      : <p>{translate("i18n.bookImportSummary", results.filter(item => item.status === "imported").length, results.filter(item => item.status === "duplicate").length, failures.length)}</p>)}
    {[...issues, ...failures].map(({ source, error: message }, index) =>
      <p className="import-error" key={index}>{source}：{message}</p>
    )}
  </div>;
}

function loadReaderNotes() {
  return loadKnowledge().notes;
}

function renderBlockParts(block, ranges, excerpts, onOpen, searchRanges, retained, isPageBack) {
  let offset = 0;
  return block.parts.map((part, index) => {
    const start = offset;
    const end = start + part.text.length;
    offset = end;
    const Inline = part.kind ?? 'span';
    const matching = ranges.filter((range) => range.start < end && range.end > start);
    const boundaries = [...new Set([start, end, ...[...(retained||[]).filter(range=>range.start<end&&range.end>start),...matching,...searchRanges.filter(range=>range.start<end&&range.end>start)].flatMap((range) => [
      Math.max(start, range.start), Math.min(end, range.end)
    ])])].sort((a, b) => a - b);
    const content = boundaries.slice(0, -1).map((left, i) => {
      const right = boundaries[i + 1];
      const text = part.text.slice(left - start, right - start);
      if(retained&&!retained.some(r=>r.start<=left&&r.end>=right))return <span key={left} hidden>{text}</span>;
      const atPosition = matching.filter(range => range.start <= left && range.end >= right);
      const covering = atPosition.filter(range => range.excerptType !== 'hidden');
      const searched=searchRanges.some(range=>range.start<=left&&range.end>=right);
      if (!covering.length) {
        const content = searched ? <mark className="reader-search-hit">{text}</mark> : text;
        return part.underline && !atPosition.length ? <u>{content}</u> : content;
      }
      const keys = [...new Set(covering.map((range) => range.key))];
      const appearance = covering[0];
      const note = excerpts.get(appearance.key)?.[0];
      const relationKey = note?.id ? `excerpt:${note.id}` : undefined;
      return <mark key={left} data-content-target={relationKey} ref={element => {
        if (!element || !relationKey) return;
        contentElements.set(element, {
          key: relationKey, type: 'excerpt', id: note.id, title: note.quote.slice(0, 40), element
        });
        return () => contentElements.delete(element);
      }} data-excerpt-type={appearance.excerptType} style={{ '--excerpt-color': appearance.color }}
        data-bookmark-start={appearance.excerptType === 'bookmark' && left === appearance.start ? '' : undefined}
        className={searched?'reader-search-hit':undefined} role="button" tabIndex={0} aria-label={translate("i18n.editExcerptsAndAnnotations")}
        onDoubleClick={(event) => {
          event.preventDefault();
          onOpen(keys, event);
        }}
        onKeyDown={(event) => {
          if (!isPageBack(event) && (event.key === 'Enter' || event.key === ' ' || event.key === 'F2')) {
            event.preventDefault();
            onOpen(keys, event);
          }
        }}>{text}</mark>;
    });
    const located=content.map((item,i)=><span key={boundaries[i]} data-reader-offset={boundaries[i]}>{item}</span>);
    return <Inline key={index}>{located}</Inline>;
  });
}

export default ReaderOverlay;
