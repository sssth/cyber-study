import { rememberFocus, restoreFocus } from './focusReturn.js';
import { entityTypes } from '../entities/registry.js';
import { useCallback, useRef, useState } from 'react';
import useEscapeBack, { blocksPageBack } from './useEscapeBack.js';
import { requestGlobeBack } from '../data/globeBack.js';
import { captureViews, restoreViews, clearRestoredViews, createReturnPoint } from '../data/viewNavigation.js';
import { getSearch, setSearch, currentScope, locateEntityInScope } from '../search/searchStore.js';
import { loadReaderState } from '../features/library/storage.js';

const targetFor = item => entityTypes[item?.type]?.target;

export default function useStudyNavigation({ audioManager, audioOn }) {
  const [readerOpen, setReaderOpen] = useState(false);
  const [returnToKnowledge, setReturnToKnowledge] = useState(false);
  const readerNavigation = useRef(null);
  const relationReturn = useRef(createReturnPoint());
  const [navigation, setNavigation] = useState({ item: null, revision: 0 });
  const updateNavigation = item => setNavigation(current => ({ item, revision: current.revision + 1 }));
  const [readerEntry, setReaderEntry] = useState('last');
  const [sceneBookIds,setSceneBookIds]=useState(null);
  const [lastBookId, setLastBookId] = useState(() => loadReaderState().lastBookId);
  const [readerJumpBlock, setReaderJumpBlock] = useState(null);
  const [readerJumpProgress, setReaderJumpProgress] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);
  const [copyRequest, setCopyRequest] = useState(null);
  const startCopy = request => {
    rememberOrigin();
    clearRestoredViews();
    setCopyRequest(request);
    setReaderOpen(false);
    setReturnToKnowledge(false);
    setActiveFeature('typewriter');
  };
  const [detailModel, setDetailModel] = useState(null);
  const [pendingCommand, setPendingCommand] = useState(null);
  const clearPendingCommand = useCallback(() => setPendingCommand(null), []);

  const openFeature = (featureId, model) => {
    relationReturn.current.clear();
    clearRestoredViews();
    updateNavigation(null);
    setDetailModel(model ?? null);
    setActiveFeature(featureId);
  };

  const openKnowledgeNote = (note) => {
    rememberOrigin();
    clearRestoredViews();
    setActiveFeature(null);
    setReturnToKnowledge(true);
    setLastBookId(note.bookId);
    openReader('last', note.blockId ? 0 : note.progress, note.blockId);
  };

  const openReader = (entry = 'last', progress = null, blockId = null) => {
    setSceneBookIds(null);
    setReaderEntry(entry);
    setReaderJumpProgress(progress);
    setReaderJumpBlock(blockId);
    setReaderOpen(true);
    if (audioOn) audioManager.playSwitchSound('open');
  };

  const closeReader = () => {
    relationReturn.current.clear();
    clearRestoredViews();
    setReaderOpen(false);
    setReturnToKnowledge(false);
    setReaderJumpProgress(null);
    setLastBookId(loadReaderState().lastBookId);
    if (audioOn) audioManager.playSwitchSound('close');
  };

  const openContent = item => {
    const target = targetFor(item);
    if (!target) return;
    setReturnToKnowledge(false);
    setCopyRequest(null);
    clearRestoredViews();
    if (target.rememberedView) restoreViews(target.rememberedView);
    updateNavigation(item);
    if (target.view === 'excerpts') {
      setActiveFeature(null);
      locateEntityInScope(target.scope, target.filter, item.id);
      openReader('library');
      return;
    }
    if (target.view === 'book') {
      setActiveFeature(null);
      setLastBookId(item.id);
      openReader();
      return;
    }
    setReaderOpen(false);
    locateEntityInScope(target.scope, target.filter, item.id);
    setActiveFeature(target.feature);
  };

  function createCatalogItem(type) {
    rememberOrigin(null);
    clearRestoredViews();
    const target = targetFor({ type });
    if (!target) return;
    if (target.view !== 'book') setSearch(target.scope, { query: '', filters: {} });
    if (target.rememberedView) restoreViews(target.rememberedView);
    updateNavigation({ type, catalogCommand: true });
    setPendingCommand({ destination: target.view === 'book' ? 'true:null' : `false:${target.feature}` });
    if (target.view === 'book') {
      setActiveFeature(null);
      openReader('library');
    } else {
      setReaderOpen(false);
      setActiveFeature(target.feature);
    }
  }

  function rememberOrigin(source = navigation.item) {
    const reader = readerOpen ? readerNavigation.current?.() : null;
    const sourceItem = !readerOpen && source && targetFor(source)?.feature === activeFeature ? source : null;
    const scope = currentScope()?.id || targetFor(sourceItem)?.scope;
    relationReturn.current.remember({
      views: captureViews(),
      focus: rememberFocus(),
      sceneBookIds,
      reader,
      feature: activeFeature,
      item: sourceItem,
      returnToKnowledge,
      copyRequest,
      scope,
      search: scope ? getSearch(scope) : null
    });
  }

  const visitRelation = (item, source) => {
    rememberOrigin(source);
    openContent(item);
  };

  useEscapeBack(() => {
    if (requestGlobeBack()) return;
    const origin = relationReturn.current.take();
    restoreViews(origin.views);
    updateNavigation(origin.item);
    if (origin.scope) setSearch(origin.scope, origin.search);
    setActiveFeature(origin.feature);
    setReturnToKnowledge(origin.returnToKnowledge);
    setCopyRequest(origin.copyRequest);
    setReaderOpen(Boolean(origin.reader));
    setSceneBookIds(origin.sceneBookIds);
    requestAnimationFrame(() => restoreFocus(origin.focus));
    if (origin.reader) {
      setLastBookId(origin.reader.bookId);
      setReaderEntry(origin.reader.view);
      setReaderJumpProgress(origin.reader.progress);
      setReaderJumpBlock(origin.reader.blockId);
    }
  }, {
    capture: true,
    stop: true,
    blocked: event => {
      const reader = document.querySelector('.reader-overlay');
      return !relationReturn.current.has() || blocksPageBack(event) ||
        Boolean(reader && !reader.closest('[inert]') && readerNavigation.current?.()?.localBack);
    }
  });

  const closeFeature = () => {
    relationReturn.current.clear();
    clearRestoredViews();
    setActiveFeature(null);
  };

  const openSceneBooks = ids => {
    if (ids.length === 1) {
      setLastBookId(ids[0]);
      openReader('last');
    } else if (ids.length) {
      openReader('library');
      setSceneBookIds(ids);
    }
  };

  const openGlobalResult = item => {
    relationReturn.current.clear();
    openContent(item);
  };

  const clearReturnPoint = () => relationReturn.current.clear();
  const closeCopy = () => {
    closeFeature();
    setCopyRequest(null);
  };

  return {
    readerOpen, returnToKnowledge, readerNavigation, navigation, readerEntry, sceneBookIds,
    lastBookId, readerJumpBlock, readerJumpProgress, activeFeature, copyRequest, detailModel,
    pendingCommand, clearPendingCommand, startCopy, closeCopy, openFeature, openKnowledgeNote,
    openReader, closeReader, createCatalogItem, visitRelation, closeFeature, openSceneBooks,
    openGlobalResult, clearReturnPoint
  };
}
