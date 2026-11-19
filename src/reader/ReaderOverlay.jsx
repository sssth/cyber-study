import { contentElements } from '../data/contentRelations.js';
import { persistExcerptChange } from './excerptPersistence.js';
import useEditSession from '../ui/useEditSession.js';
import useEscapeBack, { blocksPageBack } from '../ui/useEscapeBack.js';
import KnowledgeWorkspace from '../features/KnowledgeWorkspace.jsx';
import { DisplayMenuToggle, DisplayCloseButton } from '../ui/DisplayControls.jsx';
import useMapSource, {mapEntities} from '../ui/useMapSource.js';
import { readingMatches, retainedReadingRanges, contiguousReadingRanges, nearestReadingMatch } from './readingSearch.js';
import { useNavigationState, useNavigationScroll } from '../ui/useNavigationState.js';
import ExcerptCard from './ExcerptCard.jsx';
import useDismissDisplayMenu from '../ui/useDismissDisplayMenu.js';
import { ContentCommand } from '../features/ContentCommands.jsx';
import LibraryShelf, { shelfViews } from './LibraryShelf.jsx';
import DisplayViewMenu from '../ui/DisplayViewMenu.jsx';
import { ActionWorkspace } from '../features/ui.jsx';
import {useSearchCount,useSearchScope,SearchStatus,dateFilters} from '../search/useSearchScope.jsx';
import {matchesItem,textMatches,hasSearch} from '../search/searchCore.js';
import ContentActions from '../features/ContentActions.jsx';
import { useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { formatProgress, parseMarkdownContent } from './markdownReader.js';
import { chapterMarkdown, goToReaderBlock, readingAnchor, goToReadingAnchor, highlightRanges, indexChapters, readerPosition } from './readerPosition.js';
import { bookReaderSettings, loadReaderState, saveReaderState } from '../data/storage.js';
import ExcerptAnnotations from './ExcerptAnnotations.jsx';
import { addKnowledgeNote, defaultExcerptColor, excerptAppearance, excerptColors, creatableExcerptTypes, groupExcerpts, loadKnowledge, updateExcerptAppearance } from '../data/knowledgeStore.js';

import { matchesShortcut, typingTarget } from '../data/shortcuts.js';


const readerFonts = {
  serif: { label: '宋体', family: '"Songti SC", "Noto Serif SC", Georgia, serif' },
  sans: { label: '黑体', family: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif' },
  kai: { label: '楷体', family: '"Kaiti SC", KaiTi, "Songti SC", serif' },
  mono: { label: '等宽', family: '"SF Mono", Consolas, "PingFang SC", monospace' }
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
  bookLoadError = '',
  onNoteCreated = () => {}
}) {
  const [readerState, setReaderState] = useState(() => loadReaderState());
  const [mode, setMode] = useState('library');
  const [libraryView,setLibraryView] = useNavigationState('reader','libraryView',['excerpt','annotation'].includes(navigationItem?.type)?'excerpts':'all', { preferInitial:Boolean(navigationItem) });
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
  const saveTimerRef = useRef(null);
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
  const scopeId=mode==='reading'?`book:${activeBookId}`:'library';
  const search=useSearchScope({id:scopeId,label:mode==='reading'?`当前书籍 · ${allBooks.find(b=>b.id===activeBookId)?.title||''}`:'书库 · 跨书全文',priority:30,enabled:mode==='reading'||libraryView!=='excerpts',exactCount:mode==='reading',autoFocus:!(mode==='reading'&&paged),searchHost:()=>mode==='reading'&&paged?overlayRef.current?.querySelector('.reader-search-slot'):null,filters:mode==='reading'?[{key:'context',label:'保留范围',defaultLabel:'一段',options:[['paragraph','一段'],['sentence','一句话'],['chapter','一章']]}]:[{key:'author',label:'作者',options:[...new Set(allBooks.map(b=>b.author).filter(Boolean))].map(v=>[v,v])},{key:'format',label:'导入格式',options:[...new Set(allBooks.map(b=>b.originalFormat||b.format).filter(Boolean))].map(v=>[v,v])}]});
  const query=search.query;
  const bookIndex=useMemo(()=>allBooks.map(book=>({book,blocks:parseMarkdownContent(book.content)})),[allBooks]);
  const hits = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    return bookIndex.filter(({book})=>(mode==='reading'||!initialLibraryBookIds||initialLibraryBookIds.includes(book.id))&&(mode!=='reading'||book.id===activeBookId)&&matchesItem('book',book,{query:'',filters:search.filters})).flatMap(({book,blocks}) => {
      const matches = blocks.flatMap((block) => {
        const index = block.text.toLocaleLowerCase().indexOf(term);
        if (!textMatches([block.text],query)) return [];
        const start = Math.max(0, index - 36);
        return [{ ...block, snippet: block.text.slice(start, index + term.length + 50) }];
      });
      return matches.length ? [{ book, matches }] : [];
    });
  }, [bookIndex, search, mode, activeBookId, initialLibraryBookIds]);
  const visibleBooks=allBooks.filter(book=>(!initialLibraryBookIds||initialLibraryBookIds.includes(book.id))&&(!hasSearch(search)||matchesItem('book',book,search)||hits.some(h=>h.book.id===book.id)));
  const readingHighlights=useMemo(()=>new Map((mode==='reading'?bookIndex.find(item=>item.book.id===activeBookId)?.blocks||[]:[]).map(block=>[block.id,readingMatches(block.text,query)])),[mode,bookIndex,activeBookId,query]);
  const readingHitCount=[...readingHighlights.values()].reduce((sum,ranges)=>sum+ranges.length,0);
  useSearchCount(scopeId,mode==='reading'?readingHitCount:visibleBooks.length);
  const activeBook = useMemo(
    () => allBooks.find((book) => book.id === activeBookId) ?? null,
    [activeBookId, allBooks]
  );
  const {
    fontSize, lineHeight, font = 'serif', excerptColor = defaultExcerptColor, theme = 'night', eyeComfort = false
  } = bookReaderSettings(readerState, activeBookId);
  const fontId = Object.hasOwn(readerFonts, font) ? font : 'serif';
  const fontFamily = readerFonts[fontId].family;
  const readingSnapshot = useRef(readerState);
  readingSnapshot.current=readerState;
  useEffect(() => {
    if (mode !== 'reading' || !activeBook) return;
    const bookId = activeBook.id;
    let last = Date.now();
    let active = document.visibilityState === 'visible' && document.hasFocus();
    let sessionSeconds = 0;
    const flush = () => {
      const now = Date.now();
      const seconds = active ? Math.min(15, Math.max(0, (now - last) / 1000)) : 0;
      last = now;
      if (seconds > 0) { sessionSeconds += seconds;
        const state=readingSnapshot.current,old=state.books[bookId]||{};const next={...state,books:{...state.books,[bookId]:{...old,totalReadingSeconds:(old.totalReadingSeconds||0)+seconds,lastSessionSeconds:sessionSeconds,lastReadAt:new Date(now).toISOString()}}};readingSnapshot.current=next;saveReaderState(next);setReaderState(next);
      }
    };
    const visibility = () => { flush(); active = document.visibilityState === 'visible' && document.hasFocus(); };
    const timer = setInterval(flush, 10000);
    window.addEventListener('focus', visibility); window.addEventListener('blur', visibility);document.addEventListener('visibilitychange', visibility);
    return () => { flush(); clearInterval(timer);window.removeEventListener('focus', visibility);window.removeEventListener('blur', visibility);document.removeEventListener('visibilitychange', visibility); };
  }, [mode, activeBook?.id]);
  const blocks = useMemo(
    () => (activeBook ? parseMarkdownContent(activeBook.content) : []),
    [activeBook]
  );
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
  const activeExcerptColor = selectedNote ? excerptAppearance(selectedNote).color : excerptColor;
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

  useEffect(() => () => globalThis.clearTimeout(saveTimerRef.current), []);

  useEffect(() => {
    if (mode === 'library' && (initialView === 'library' || !initialBookId || restoredInitialBook.current && !activeBookId)) {
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

  useEscapeBack(event => {
    if (event.repeat) return;
    if (selectionQuote || selectedExcerpt) dismissNote();
    else if (paged) changeReadingMode(false);
    else if (mode === 'reading') showLibrary();
    else onClose();
  }, {
    matches: event => matchesShortcut(event, shortcuts.readerBack),
    blocked: event => (mode === 'library' && libraryView === 'excerpts') || savingNote || blocksPageBack(event) ||
      (event.key !== 'Escape' && typingTarget(event.target))
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
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

  useEffect(() => {
    saveReaderState(readerState);
  }, [readerState]);

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
            finished: state.books[activeBook.id]?.finished || state.books[activeBook.id]?.progress >= 1 || nextProgress >= 1,
            chapterProgress: localProgress,
            blockId,
            updatedAt: new Date().toISOString()
          }
        }
      }));
    }, 220);
  };

  const updateReaderSettings = (adjust) => {
    if (!activeBookId) return;
    setReaderState(state => {
      const book = state.books[activeBookId];
      const current = bookReaderSettings(state, activeBookId);
      return {
        ...state,
        books: { ...state.books, [activeBookId]: { ...book, settings: { ...book?.settings, ...adjust(current) } } }
      };
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
    if (selectedExcerpt) return false;
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
      const kept=retainedRanges?.get(item.id)??[{start:0,end:item.text.length}];
      return kept.flatMap(part=>{
        const left=Math.max(start,part.start),right=Math.min(end,part.end);
        if(right<=left)return [];
        const text=item.text.slice(left,right);if(!text.trim())return [];
        return [{blockId:item.id,start:left+text.length-text.trimStart().length,end:right-text.length+text.trimEnd().length,text:text.trim()}];
      });
    });
    if (!ranges.length) return false;
    if (selectionQuote && JSON.stringify(selectionRange.current) === JSON.stringify(ranges)) return true;
    selectionRange.current = ranges;
    setSelectedExcerpt(null);
    setNoteAnchor(anchorFor(range.getBoundingClientRect()));
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
      setNoteMessage('请先在正文中选中要摘录的文字。');
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
    if (!selectedNote || savingNote || !window.confirm('删除这条摘录及其全部批注？')) return;
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
      setImportError('无法启动导入。请重新打开桌面应用后重试。');
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
      setDeleteStatus({ error: true, message: `无法删除《${book.title}》，请重试。` });
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
  const chapterTitle = chapters.find(chapter => chapter.id === displayedChapter)?.text;
  const snapshotEntities = useMemo(() => activeBook ? [
    ...mapEntities('book', [{
      id: activeBook.id, title: activeBook.title, author: activeBook.author, source: activeBook.source,
      chapterTitle, content: chapterMarkdown(activeBook.content, blocks, chapters, displayedChapter)
    }]),
    ...mapEntities('excerpt', chapterNotes.map(([, notes]) => ({ ...notes[0], chapterTitle, notes })))
  ] : [], [activeBook, blocks, chapters, displayedChapter, chapterTitle, chapterNotes]);
  useMapSource({
    priority: 30, detail: true, label: '书籍阅读', position: chapterTitle, enabled: mode === 'reading',
    entities: mapEntities('book', [activeBook]), snapshotEntities
  });

  if (mode === 'library' && libraryView === 'excerpts') {
    return <KnowledgeWorkspace onClose={onClose} shelfMenu={<DisplayViewMenu label="书架视图" options={shelfViews} value="excerpts" onChange={setLibraryView}/>} navigationItem={navigationItem} importedBooks={importedBooks} onBooksChanged={onBooksChanged} version={excerptVersion} onStartCopy={onStartCopy} onOpenNote={onOpenNote} />;
  }

  return (
    <section data-menu-open={displayMenuOpen} ref={overlayRef} className={`reader-overlay${paged ? " reader-immersive" : ""}`} role="dialog" aria-modal="true" aria-label="本地阅读器"
      onDoubleClick={event => {
        if (!selectedExcerpt || savingNote || event.defaultPrevented ||
            event.target.closest('button, input, select, textarea, a, [contenteditable]')) return;
        event.preventDefault();
        dismissNote();
      }}>
      <div className={`reader-shell ${mode === 'library' ? 'library-mode' : 'reading-mode'}`}
        data-reader-theme={mode === 'reading' ? theme : undefined}
        data-reader-eye-comfort={mode === 'reading' && eyeComfort ? '' : undefined}>
        {mode === 'library' && <DisplayMenuToggle label="展开书架菜单" open={displayMenuOpen} onToggle={() => setDisplayMenuOpen(value => !value)} />}
        {!paged&&<DisplayCloseButton label="关闭" disabled={savingNote} onClose={onClose} />}
        <header className="reader-topbar" onPointerLeave={event=>{if(paged&&event.currentTarget.contains(document.activeElement))document.activeElement.blur();}}>
          <div data-edit-item={mode === 'reading' ? '' : undefined}>

            {mode === 'reading' && activeBook && <>
              <h2>{activeBook.title}</h2>
              <ContentActions surface=".reader-shell" preview={false} type="book" id={activeBook.id} title={activeBook.title}/>
              {activeBook &&
                <ContentCommand label={`修改书名 · ${activeBook.title}`} value={activeBook.title}
                  disabled={deleting || importing || savingNote} run={title => renameBook(activeBook, title)} />}
              {desktop?.deleteBook && !activeBook.id.startsWith('sample:') &&
                <ContentCommand label={`删除《${activeBook.title}》`} disabled={deleting || importing || savingNote}
                  run={async () => { if (await removeBook(activeBook)) showLibrary(); }} />}
            </>}
          </div>
          {paged&&<div className="reader-search-slot"/>}
          <div className="reader-top-actions">
            {mode === 'reading' && <>
              <button type="button" disabled={savingNote} aria-pressed={paged} onClick={() => changeReadingMode(!paged)}>{paged ? '退出全屏阅读' : '全屏阅读'}</button>
              {paged&&<button type="button" className="reader-fullscreen-close" aria-label="关闭" disabled={savingNote} onClick={onClose}>×</button>}
              <button type="button" onClick={showLibrary}>书架</button>
            </>}

          </div>
          {mode === 'reading' && <div className="reader-toolbar">
            {chapters.length > 1 && <label className="reader-chapter-select">
              章节
              <select disabled={!selectableChapters.length} value={selectableChapters.some(chapter=>chapter.id===displayedChapter)?displayedChapter:selectableChapters[0]?.id??''} onChange={(event) => {
                const id = event.target.value;
                openBook(activeBook, 0, id || null);
              }}>
                {!selectableChapters.length&&<option value=""></option>}
                {selectableChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>
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
                <span>字号 {fontSize}px</span>
                <button type="button" aria-label="减小字号" onClick={() => adjustFontSize(-1)}>−</button>
                <button type="button" aria-label="增大字号" onClick={() => adjustFontSize(1)}>+</button>
              </div>
              <div className="reader-setting" role="group" aria-label="行距">
                <span>行距 {lineHeight.toFixed(1)}</span>
                <button type="button" aria-label="减少行距" onClick={() => adjustLineHeight(-1)}>−</button>
                <button type="button" aria-label="增加行距" onClick={() => adjustLineHeight(1)}>+</button>
              </div>
              <label className="reader-setting">
                字体
                <select value={fontId}
                  onChange={event => {
                    const font = event.target.value;
                    updateReaderSettings(() => ({ font }));
                  }}>
                  {Object.entries(readerFonts).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
                </select>
              </label>
              <div className="reader-setting" role="group" aria-label="阅读主题">
                <button type="button" className="reader-eye-comfort" aria-pressed={eyeComfort}
                  onClick={() => updateReaderSettings(settings => ({ eyeComfort: !settings.eyeComfort }))}>
                  护眼
                </button>
                <button type="button" aria-label={`当前主题：${theme === 'day' ? '白天' : '夜间'}，点击切换主题`}
                  onClick={() => updateReaderSettings(settings => ({ theme: settings.theme === 'day' ? 'night' : 'day' }))}>
                  {theme === 'day' ? '白天主题' : '夜间主题'}
                </button>
              </div>
              <div className="reader-setting reader-color-palette" data-reader-color role="group" aria-label="摘录颜色">
                {Object.entries(excerptColors).map(([color, label]) => (
                  <button key={color} type="button" aria-label={label} title={label}
                    aria-pressed={activeExcerptColor === color} style={{ '--swatch-color': color }} disabled={savingNote}
                    onClick={() => {
                      if (!selectedNote) {
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
              <span>全书进度</span>
              <b>{formatProgress(progress)}</b>
              <div className="progress-track"><div style={{ width: formatProgress(progress) }} /></div>
            </div>
          </div>}
        </header>

        {mode === 'library' ? (
          <div className="reader-library" data-scroll-memory={`library-${libraryView}`}>
            <ActionWorkspace command={libraryView==='all'} showTrigger={false} disabled={deleting} label="添加书籍" title="导入书籍"><div className="library-intro">

              <div className="book-import-actions edit-actions">
                <button type="button" className="import-button" disabled={!desktop?.importBooks || importing || deleting} onClick={() => handleImport(false)}>导入文件</button>
                <button type="button" className="import-button" disabled={!desktop?.importBooks || importing || deleting} onClick={() => handleImport(true)}>导入文件夹</button>
              </div>
              {!desktop?.importBooks && <p>请在桌面应用中导入。</p>}
              {bookLoadError && <p role="alert">{bookLoadError}</p>}
              {(importing || importError || (!importState.restored && importState.revision > dismissedImportRevision)) &&
                <ImportStatus state={importState} error={importError} />}
            </div>
            </ActionWorkspace>
            <SearchStatus id={scopeId} label="书库"/>
            {deleteStatus && <p role={deleteStatus.error ? "alert" : "status"}>{deleteStatus.message}</p>}
            <LibraryShelf initialShelfView={libraryView} searchActive={hasSearch(search)} searchQuery={query} searchHits={hits} onViewChange={setLibraryView} books={allBooks} visibleBooks={visibleBooks} readerState={readerState} openBook={openBook} renameBook={renameBook} removeBook={removeBook} canDelete={Boolean(desktop?.deleteBook)} busy={deleting || importing}/>

          </div>
        ) : (<>
          {selectionQuote && <ContentCommand kind="cancel-create" label="取消新建摘录" disabled={savingNote} run={dismissNote} />}
          {!selectedExcerpt && <ContentCommand kind="create" label="新建摘录（先选中正文）"
            disabled={savingNote || Boolean(selectionQuote)} run={() => {
              if (!captureSelection()) setNoteMessage('请先在正文中选中要摘录的文字。');
            }} />}
          <SearchStatus id={scopeId} label="当前书籍"/>
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
                  {renderBlockParts(block, highlights.get(block.id) ?? [], excerpts, openExcerpt, readingHighlights.get(block.id) ?? [], fragment?[fragment]:null)}
                </Element>);
              })}
              {paged&&<div data-reader-padding hidden aria-hidden="true"/>}
            </article>
            {paged && <nav className="reader-page-nav" aria-label="翻页">
              <button type="button" disabled={atFirstSpread || savingNote} onClick={() => turnPages(-1)}>← 上一页</button>
              <button type="button" disabled={atLastSpread || savingNote} onClick={() => turnPages(1)}>下一页 →</button>
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
          {excerptChoices.length > 1 && <select aria-label="选择重叠摘录" value={selectedExcerpt}
            onChange={(event) => setSelectedExcerpt(event.target.value)}>
            {excerptChoices.map((key) => <option key={key} value={key}>{excerpts.get(key)?.[0]?.quote}</option>)}
          </select>}
          <blockquote>{excerpts.get(selectedExcerpt)?.[0]?.quote}</blockquote><ContentActions surface=".reader-inline-note" type="excerpt" id={excerpts.get(selectedExcerpt)?.[0]?.id} title={excerpts.get(selectedExcerpt)?.[0]?.quote?.slice(0,40)}/>
          <ExcerptAnnotations key={selectedExcerpt} notes={excerpts.get(selectedExcerpt)} onChange={refreshNotes}
            onHide={dismissNote}
            onDeleteExcerpt={removeSelectedExcerpt} saving={savingNote} />
          {noteMessage && <p role="alert">{noteMessage}</p>}
        </> : <form aria-label="保存摘录" onSubmit={(event) => { event.preventDefault(); saveNote(event.nativeEvent.submitter?.value || 'excerpt'); }}>
          <blockquote>{selectionQuote}</blockquote>
          <textarea aria-label="批注（选填）" placeholder="批注（选填）" rows="3"
            value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
          {noteMessage && <p role="status">{noteMessage}</p>}
          <div className="reader-inline-actions" role="group" aria-label="选文操作">
            {Object.entries(creatableExcerptTypes).map(([type, label]) => <button key={type} type="submit" value={type} disabled={savingNote}>
              {label}
            </button>)}
            <button type="button" disabled={savingNote} onClick={() => onStartCopy?.({bookId:activeBook.id,bookTitle:activeBook.title,chapterTitle:chapters.find(c=>c.id===displayedChapter)?.text || '全文',text:selectionQuote})}>抄写</button>
          </div>
        </form>}
      </div>}
      {!selectionQuote && !selectedExcerpt && noteMessage && <p className="reader-note-status" role="status">{noteMessage}</p>}
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
    {counts && <p>找到 {total} 个支持的文件（Markdown {counts.markdown}、TXT {counts.txt}、PDF {counts.pdf}、EPUB {counts.epub ?? 0}），跳过其他文件 {skipped} 个。</p>}
    {phase === 'processing' && <p>已处理 {processed}/{total}{current && `，正在处理 ${current}`}。</p>}
    {phase === 'complete' && (total === 0
      ? <p>{issues.length ? '在可读取的位置未找到支持的文件。' : '未找到支持的文件。'}支持 Markdown（.md、.markdown）、TXT、PDF 和 EPUB。</p>
      : <p>成功 {results.filter((item) => item.status === 'imported').length}，重复 {results.filter((item) => item.status === 'duplicate').length}，失败 {failures.length}。</p>)}
    {[...issues, ...failures].map(({ source, error: message }, index) =>
      <p className="import-error" key={index}>{source}：{message}</p>
    )}
  </div>;
}

function loadReaderNotes() {
  return loadKnowledge().notes;
}

function renderBlockParts(block, ranges, excerpts, onOpen, searchRanges = [], retained = null) {
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
        className={searched?'reader-search-hit':undefined} role="button" tabIndex={0} aria-label="编辑摘录与批注"
        onDoubleClick={(event) => {
          event.preventDefault();
          onOpen(keys, event);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'F2') {
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
