import { blocksPageBack } from './ui/useEscapeBack.js';
import CrystalChat from './features/CrystalChat.jsx';
import {requestGlobeBack} from './data/globeBack.js';
import MapProjection from './features/MapProjection.jsx';
import SnapshotCommand from './features/SnapshotCommand.jsx';
import CommandToolbar from './features/CommandToolbar.jsx';
import { captureViews, restoreViews, clearRestoredViews, createReturnPoint } from './data/viewNavigation.js';
import ContentCommands, { ContentCommand } from './features/ContentCommands.jsx';
import UnifiedSearch from './search/UnifiedSearch.jsx';
import GlobalSearch from './search/GlobalSearch.jsx';
import {getSearch,setSearch,currentScope} from './search/searchStore.js';
import ContentRelationshipPanel from './features/ContentRelationshipPanel.jsx';
import GraphicsSettings from './features/GraphicsSettings.jsx';
import { loadGraphics, needsGraphicsCalibration, calibrationDecision, presetSettings } from './data/graphics.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StudyScene, { hasOutdoorRain } from './scenes/StudyScene.jsx';
import { PanelLoading } from './ui/LoadingScreen.jsx';
import ReaderOverlay from './reader/ReaderOverlay.jsx';
import { defaultPackage } from './scenes/packages/scenePackage.js';
import { AudioManager } from './audio/AudioManager.js';
import { defaultSettings } from './data/defaultSettings.js';
import { deleteLegacyBook, loadBooks } from './data/bookStore.js';
import { loadReaderState } from './data/storage.js';
import { addFocusMinute, initializePlantClock, waterPlant } from './data/plantStore.js';
import { petCat } from './data/petStore.js';
import { hotspots } from './scenes/sceneConfig.js';
import { dispatchSceneFeature, featureCatalog } from './scenes/featureBindings.js';
import EntityCatalog from './features/EntityCatalog.jsx';
import { MusicPlayer, MovieCollection } from './features/MediaCollections.jsx';
import { DiaryPanel, MemoBoard } from './features/DiaryMemo.jsx';
import { GlobePanel, TypewriterPanel, PetPanel, PlantPanel } from './features/SpaceLife.jsx';

import ManualOperations from './features/ManualOperations.jsx';
import ManualOverview from './features/ManualOverview.jsx';
import { DisplayCloseButton } from './ui/DisplayControls.jsx';
import ShortcutSettings from './features/ShortcutSettings.jsx';
import { loadShortcuts, matchesShortcut, saveShortcuts, shortcutGroups } from './data/shortcuts.js';
import ProfilerHud from './ui/ProfilerHud.jsx';

const groups = shortcutGroups(defaultPackage);
const focusFeatures = new Set(['knowledge', 'typewriter', 'diary']);

function formatCareChange(label, before, after) {
  const from = Math.round(before);
  const to = Math.round(after);
  return `${label} ${from} → ${to}（+${to - from}）`;
}

const contentFeatures = {
  excerpt: 'knowledge', annotation: 'knowledge', typing_work: 'typewriter',
  memory_point: 'globe', journey: 'globe', playlist: 'music', music: 'music',
  movie: 'movie', diary: 'diary', memo: 'memo', todo: 'memo'
};
const contentScope = item => item?.type === 'journey' ? 'journey' : contentFeatures[item?.type];

function App() {
  const [sceneSettled, setSceneSettled] = useState(false);
  const markSceneSettled = useCallback(() => setSceneSettled(true), []);
  const [lightsOn, setLightsOn] = useState(defaultSettings.scene.lightsOn);
  const [rainOn, setRainOn] = useState(hasOutdoorRain && !defaultPackage.appearance?.nightTheme);
  const [readerOpen, setReaderOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [returnToKnowledge, setReturnToKnowledge] = useState(false);
  const readerNavigation = useRef(null);
  const relationReturn = useRef(createReturnPoint());
  const [navigation, setNavigation] = useState({ item: null, revision: 0 });
  const updateNavigation = item => setNavigation(current => ({ item, revision: current.revision + 1 }));
  const [readerEntry, setReaderEntry] = useState('last');
  const [sceneBookIds,setSceneBookIds]=useState(null);
  const [activeHotspot, setActiveHotspot] = useState(null);
  const [audioReady, setAudioReady] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [audioPending, setAudioPending] = useState(false);
  const [importedBooks, setImportedBooks] = useState([]);
  const [bookLoadError, setBookLoadError] = useState('');
  useEffect(() => {
    async function loadLibrary() {
      const desktop = globalThis.cyberStudy;
      const legacy = await loadBooks();
      if (!desktop?.listBooks) return legacy;
      {
        const storage = {};
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          if (key?.startsWith('cyber-study')) storage[key] = localStorage.getItem(key);
        }
        const report = await desktop.migrateLegacyBooks({ books: legacy, storage });
        for (const item of report) {
          if (item.status === 'verified') await deleteLegacyBook(item.id);
        }
        if (report.some((item) => item.status === 'failed')) {
          setBookLoadError('部分旧书迁移失败，原数据与备份已保留，下次启动会重试。');
        }
      }
      const stored = await desktop.listBooks();
      return stored;
    }
    loadLibrary().then((stored) => setImportedBooks((current) => [
      ...current, ...stored.filter((book) => !current.some((item) => item.id === book.id))
    ])).catch(() => setBookLoadError('本地书库读取失败。'));
  }, []);
  const updateBooks = useCallback((incoming) => {
    setImportedBooks((books) => {
      const byId = new Map(books.map((book) => [book.id, book]));
      incoming.forEach((book) => byId.set(book.id, book));
      return [...byId.values()];
    });
  }, []);
  const initialReaderState = useMemo(() => loadReaderState(), []);
  const [lastBookId, setLastBookId] = useState(initialReaderState.lastBookId);
  const [readerJumpBlock, setReaderJumpBlock] = useState(null);
  const [readerJumpProgress, setReaderJumpProgress] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);
  const [copyRequest, setCopyRequest] = useState(null);
  const startCopy = request => {rememberOrigin();clearRestoredViews();setCopyRequest(request);setReaderOpen(false);setReturnToKnowledge(false);setActiveFeature('typewriter');};
  const [detailModel, setDetailModel] = useState(null);
  const [sceneTheme, setSceneTheme] = useState(null);
  const careSound = useRef(null);
  const [knowledgeVersion, setKnowledgeVersion] = useState(0);
  const [quality, setQuality] = useState(loadGraphics);
  const [calibration, setCalibration] = useState(() => needsGraphicsCalibration() ? 'medium' : null);
  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;
  const [graphicsOpen, setGraphicsOpen] = useState(false);
  const [graphicsTest, setGraphicsTest] = useState(false);
  const [graphicsResult, setGraphicsResult] = useState(null);
  const [graphicsLive, setGraphicsLive] = useState(null);
  const [graphicsError, setGraphicsError] = useState('');
  const [forceAlwaysRender, setForceAlwaysRender] = useState(false);
  const finishGraphicsTest = useCallback(result => {
    const tier = calibrationRef.current;
    if (!tier) { setGraphicsResult(result); setGraphicsTest(false); return; }
    const decision = calibrationDecision(tier, result);
    if (decision.next) {
      setQuality(presetSettings(decision.next));
      setCalibration(decision.next);
      return;
    }
    const selected = presetSettings(decision.selected);
    setQuality(selected);
    setCalibration(null);
    try { localStorage.setItem('study-graphics', JSON.stringify(selected)); }
    catch { setGraphicsError('画质已应用，但未能保存。'); }
  }, []);
  const skipCalibration = useCallback(() => {
    setCalibration(null);
    const fallback = presetSettings('low');
    setQuality(fallback);
    try { localStorage.setItem('study-graphics', JSON.stringify(fallback)); }
    catch { setGraphicsError('画质已应用，但未能保存。'); }
  }, []);
  useEffect(() => {
    if (!calibration) return;
    // Never leave the entrance blocked by a stalled renderer or asset load.
    const timeout = setTimeout(skipCalibration, 60000);
    return () => clearTimeout(timeout);
  }, [calibration, skipCalibration]);
  const changeGraphics = value => {
    setGraphicsLive(null); setQuality(value); setGraphicsTest(false); setGraphicsResult(null);
    try { localStorage.setItem('study-graphics', JSON.stringify(value)); setGraphicsError(''); }
    catch { setGraphicsError('已应用，但保存失败，下次启动将恢复默认画质。'); }
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [catalogEditor, setCatalogEditor] = useState(null);
  useEffect(() => { if (activeFeature !== 'knowledge' || readerOpen) setCatalogEditor(null); }, [activeFeature, readerOpen]);
  const [pendingCommand, setPendingCommand] = useState(null);
  const clearPendingCommand = useCallback(() => setPendingCommand(null), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts(groups));
  const updateShortcuts = (bindings) => {
    try {
      saveShortcuts(bindings);
      setShortcuts(bindings);
      return true;
    } catch {
      showCaption({ label: '快捷键保存失败' });
      return false;
    }
  };
  const menuRef = useRef(null);
  const [manualTab, setManualTab] = useState(0);
  const manualPages = ['功能区介绍', '操作说明'];
  const manualTitle = manualPages[manualTab];
  const manual = useRef(null);
  const [manualOpen, setManualOpen] = useState(false);
  const menuButton = useRef(null);
  const captionTimer = useRef(null);
  const audioManager = useMemo(() => new AudioManager({
    audio: { ...defaultSettings.audio }
  }), []);

  const applySceneTheme = useCallback((id, theme) => {
    setSceneTheme(theme);
    const loop = theme.audioLoop && { url: defaultPackage.assetUrl(theme.audioLoop.file), gain: theme.audioLoop.gain };
    audioManager.setScene(id, { mix: theme.mix, loop });
  }, [audioManager]);

  useEffect(() => () => globalThis.clearTimeout(captionTimer.current), []);

  const showCaption = (caption) => {
    globalThis.clearTimeout(captionTimer.current);
    setActiveHotspot(caption);
    captionTimer.current = globalThis.setTimeout(() => setActiveHotspot(null), 3000);
  };

  useEffect(() => { initializePlantClock(); }, []);

  const trackingFocus = readerOpen || focusFeatures.has(activeFeature);

  useEffect(() => {
    if (!trackingFocus) return;
    let startedAt = null;

    const flush = () => {
      if (startedAt === null) return;
      const elapsed = performance.now() - startedAt;
      startedAt = null;
      if (elapsed > 0) addFocusMinute(elapsed / 60000);
    };

    const sync = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        startedAt ??= performance.now();
      } else {
        flush();
      }
    };

    const checkpoint = () => {
      flush();
      sync();
    };

    sync();
    const timer = window.setInterval(checkpoint, 15000);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('blur', flush);
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', flush);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('pageshow', sync);
      flush();
    };
  }, [trackingFocus]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const dismiss = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setSettingsOpen(false);
      }
    };
    const dismissOnEscape = (event) => {
      if (blocksPageBack(event) || event.repeat || !matchesShortcut(event, shortcuts.closeMenu)) return;
      event.preventDefault();
      setMenuOpen(false);
      setSettingsOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [menuOpen, shortcuts.closeMenu]);

  const toggleAudio = async () => {
    setAudioPending(true);
    try {
      const muted = audioReady ? await audioManager.toggleMute() : false;
      if (!audioReady) {
        await audioManager.enable();
        setAudioReady(true);
      }
      setAudioOn(!muted);
      showCaption({ label: muted ? '声音已关闭' : '声音已开启' });
    } catch (error) {
      showCaption({ label: '无法切换声音', detail: error.message });
    } finally {
      setAudioPending(false);
    }
  };

  const careForModel = (feature) => {
    const plant = feature === 'plant';
    const change = plant ? waterPlant() : petCat();
    if (!change) {
      showCaption({ label: '互动记录保存失败' });
      return;
    }
    const { before, after } = change;
    const detail = plant
      ? formatCareChange('水分', before, after)
      : [
        formatCareChange('心情', before.mood, after.mood),
        formatCareChange('亲密度', before.bond, after.bond)
      ].join(' · ');
    showCaption({ label: plant ? '已浇水一次' : '已抚摸猫咪一次', detail });
    const file = defaultPackage.careSounds?.[plant ? 'plant' : 'cat'];
    if (file) {
      careSound.current?.pause();
      const sound = new Audio(defaultPackage.assetUrl(file));
      careSound.current = sound;
      sound.play().catch(() => {});
    }
  };

  useEffect(() => () => careSound.current?.pause(), []);

  const openFeature = (featureId, model) => {
    relationReturn.current.clear();
    clearRestoredViews();
    updateNavigation(null);
    setDetailModel(model ?? null);
    showCaption(hotspots[featureId]);
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

  const toggleRain = () => {
    if (!hasOutdoorRain) return;
    setRainOn(!rainOn);
    showCaption({ label: rainOn ? '窗外雨已关闭' : '窗外雨已开启' });
  };

  const toggleLights = () => {
    setLightsOn(!lightsOn);
    showCaption({ label: lightsOn ? '灯光已关闭' : '灯光已开启' });
    if (audioOn) audioManager.playSwitchSound('switch');
  };

  const openReader = (entry = 'last', progress = null, blockId = null) => {
    setSceneBookIds(null);
    if (entry === 'library') showCaption(hotspots.shelf);
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
    const feature = contentFeatures[item.type];
    if (item.type !== 'book' && !feature) return;
    setReturnToKnowledge(false);
    setCopyRequest(null);
    clearRestoredViews();
    if (item.type === 'memo' || item.type === 'todo') restoreViews({ 'memo.view': item.type });
    updateNavigation(item);
    if (['excerpt','annotation'].includes(item.type)) {
      setActiveFeature(null);
      setSearch('knowledge',{query:'',filters:{id:item.id}});
      openReader('library');
      return;
    }
    if (item.type === 'book') {
      setActiveFeature(null);
      setLastBookId(item.id);
      openReader();
      return;
    }
    setReaderOpen(false);
    const scope = contentScope(item);
    setSearch(scope, { query: '', filters: item.type === 'playlist' ? { playlistId: item.id } : { id: item.id } });
    setActiveFeature(feature);
  };

  function createCatalogItem(type) {
    rememberOrigin(null);
    clearRestoredViews();
    const feature = contentFeatures[type];
    const scope = contentScope({ type });
    if (scope) setSearch(scope, { query: '', filters: {} });
    if (type === 'memo' || type === 'todo') restoreViews({ 'memo.view': type });
    updateNavigation({ type, catalogCommand: true });
    setPendingCommand({ destination: type === 'book' ? 'true:null' : `false:${feature}` });
    if (type === 'book') {
      setActiveFeature(null);
      openReader('library');
    } else {
      setReaderOpen(false);
      setActiveFeature(feature);
    }
  }

  function rememberOrigin(source = navigation.item) {
    const reader = readerOpen ? readerNavigation.current?.() : null;
    const sourceItem = !readerOpen && source && contentFeatures[source.type] === activeFeature ? source : null;
    const scope = currentScope()?.id || contentScope(sourceItem);
    relationReturn.current.remember({
      views: captureViews(),
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

  useEffect(() => {
    const goBack = event => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented ||
          blocksPageBack(event) ||
          (document.querySelector('.reader-overlay:not([inert])') && !document.querySelector('.reader-overlay')?.closest('[inert]') && readerNavigation.current?.()?.localBack) || !relationReturn.current.has()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
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
      if (origin.reader) {
        setLastBookId(origin.reader.bookId);
        setReaderEntry(origin.reader.view);
        setReaderJumpProgress(origin.reader.progress);
        setReaderJumpBlock(origin.reader.blockId);
      }
    };
    window.addEventListener('keydown', goBack, true);
    return () => window.removeEventListener('keydown', goBack, true);
  }, []);

  const closeFeature = () => {
    relationReturn.current.clear();
    clearRestoredViews();
    setActiveFeature(null);
  };

  const commandView = `${readerOpen}:${activeFeature}`;
  const searchView = `${commandView}:${readerEntry}:${sceneTheme}:${navigation.revision}`;
  const contentCommandsDisabled = manualOpen || activeFeature === 'crystal' || mapOpen || settingsOpen || calibration;
  const showCommandToolbar = !menuOpen && !manualOpen && !settingsOpen && !graphicsOpen && !calibration &&
    (mapOpen || readerOpen || (activeFeature && activeFeature !== 'crystal'));
  const commandDestinations = [
    ['shelf', '书库'], ['music', '音乐播放器'], ['movie', '影架'], ['diary', '日记'],
    ['memo', 'Memo 板'], ['typewriter', '抄写'], ['globe', '地球仪']
  ];

  return (
    <main className="app-shell">
      {calibration && <div className="graphics-calibration" role="status">
        <div className="loading-card"><strong>正在匹配画质</strong><p>检测{({low:'低',medium:'中',high:'高'})[calibration]}画质…</p>
          <button type="button" onClick={skipCalibration}>跳过，使用低画质</button>
        </div>
      </div>}
      <section className="scene-stage" aria-label="书房场景">
        <StudyScene
          renderingPaused={activeFeature === 'knowledge'}
          books={importedBooks}
          onSceneBooks={ids=>{if(!ids.length)return;if(ids.length===1){setLastBookId(ids[0]);openReader('last');}else{openReader('library');setSceneBookIds(ids);}}}
          liveGraphics={menuOpen && graphicsOpen} onLiveGraphics={setGraphicsLive}
          forceAlwaysRender={forceAlwaysRender}
          quality={quality} graphicsTest={graphicsTest || Boolean(calibration)} onGraphicsResult={finishGraphicsTest}
          shortcuts={shortcuts}
          lightsOn={lightsOn}
          onTheme={applySceneTheme}
          inputActive={!mapOpen && !calibration && !readerOpen && !activeFeature && !menuOpen}
          rainOn={rainOn}
          onSceneSettled={markSceneSettled}
          onOpenReader={openReader}
          onToggleLights={toggleLights}
          onToggleRain={toggleRain}
          onOpenFeature={openFeature}
          onCare={careForModel}
        />
        {readerOpen && (
          <PanelLoading key={navigation.revision} title="正在打开阅读器">
            <ReaderOverlay
              navigationRef={readerNavigation}
              navigationItem={navigation.item}
              onOpenNote={openKnowledgeNote}
              excerptVersion={knowledgeVersion}
              onStartCopy={startCopy}
              shortcuts={shortcuts}
              onClose={closeReader}
              returnToKnowledge={returnToKnowledge}
              initialView={readerEntry}
              initialLibraryBookIds={sceneBookIds}
              importedBooks={importedBooks}
              initialBookId={lastBookId}
              initialProgress={readerJumpProgress}
              initialBlockId={readerJumpBlock}
              bookLoadError={bookLoadError}
              onNoteCreated={() => setKnowledgeVersion((version) => version + 1)}
              onBooksChanged={updateBooks}
              onBookDeleted={(id) => setImportedBooks((books) => books.filter((book) => book.id !== id))}
            />
          </PanelLoading>
        )}
      </section>

      {sceneSettled && !calibration && !readerOpen && !activeFeature && (
        <div className="interaction-menu" ref={menuRef}>
          <button
            type="button"
            ref={menuButton}
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? 'room-interactions' : undefined}
            onClick={() => {
              setSettingsOpen(false);
              setGraphicsOpen(false);
              setMenuOpen((value) => !value);
            }}
          >
            <span aria-hidden="true">☰</span> 互动菜单
          </button>
          <dialog ref={manual} className="study-manual" aria-label="使用说明书"
            onKeyDown={event => event.stopPropagation()}
            onClose={() => { setManualOpen(false); menuButton.current?.focus(); }}>
            <DisplayCloseButton label="关闭说明书" onClose={() => manual.current.close()} />
            <div className="manual-layout">
              <nav className="manual-options" aria-label="说明书栏目">
                {manualPages.map((title, index) => (
                  <button key={title} type="button" aria-pressed={manualTab === index}
                    aria-controls="manual-page" onClick={() => setManualTab(index)}>{title}</button>
                ))}
              </nav>
              <div id="manual-page" key={manualTab} tabIndex={0} role="region" aria-label={manualTitle}>
                {manualTab === 0 ? <ManualOverview /> : <ManualOperations shortcuts={shortcuts} />}
              </div>
            </div>
          </dialog>
          {menuOpen && settingsOpen && (
            <ShortcutSettings groups={groups} bindings={shortcuts} onChange={updateShortcuts} onBack={() => {
              setSettingsOpen(false);
              menuButton.current?.focus();
            }} />
          )}
          {menuOpen && graphicsOpen && <GraphicsSettings live={graphicsLive} quality={quality} onChange={changeGraphics} test={graphicsTest} result={graphicsResult} error={graphicsError} onTest={() => { setGraphicsResult(null); setGraphicsTest(true); }} onBack={() => { setGraphicsOpen(false); menuButton.current?.focus(); }} />}
          {menuOpen && !settingsOpen && !graphicsOpen && (
            <nav className="interaction-list" id="room-interactions" aria-label="书房互动">
              <section className="interaction-group" aria-labelledby="object-interactions">
                <h2 id="object-interactions">物品互动</h2>
                <div className="interaction-buttons">
                  {featureCatalog.filter(({ id }) => !['desk', 'window', 'lamp'].includes(id)).map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => {
                      setMenuOpen(false);
                      dispatchSceneFeature(id, { onOpenReader: openReader, onOpenFeature: openFeature });
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </section>
              <section className="interaction-group" aria-labelledby="room-controls">
                <h2 id="room-controls">房间控制</h2>
                <div className="interaction-buttons">
                  <button type="button" role="switch" aria-checked={lightsOn} onClick={toggleLights}>灯光</button>
                  {hasOutdoorRain && (
                    <button type="button" role="switch" aria-checked={rainOn} onClick={toggleRain}>窗外雨</button>
                  )}
                  <button type="button" role="switch" aria-checked={audioOn} disabled={audioPending} onClick={toggleAudio}>
                    声音
                  </button>
                </div>
              </section>
              <button type="button" aria-haspopup="dialog" onClick={() => { setMenuOpen(false); setManualTab(0); manual.current.showModal(); setManualOpen(true); }}>使用说明书</button>
              <button type="button" onClick={() => setGraphicsOpen(true)}>画质与流畅度</button>
              <button type="button" onClick={() => setSettingsOpen(true)}>快捷键设置</button>
            </nav>
          )}
        </div>
      )}

      <CrystalChat open={activeFeature === 'crystal'} onClose={closeFeature} />
      <ContentCommands viewKey={commandView} targetView={searchView} shortcuts={shortcuts} disabled={contentCommandsDisabled}
        pending={pendingCommand} onPendingHandled={clearPendingCommand} />
      <MapProjection shortcuts={shortcuts} disabled={manualOpen || settingsOpen || graphicsOpen || calibration} onOpen={() => relationReturn.current.clear()} onActiveChange={setMapOpen}/>
      <SnapshotCommand shortcuts={shortcuts} disabled={manualOpen || settingsOpen || graphicsOpen || calibration} projection={mapOpen}/>
      <UnifiedSearch viewKey={searchView} shortcuts={shortcuts} disabled={contentCommandsDisabled}/>
      {showCommandToolbar && <CommandToolbar shortcuts={shortcuts} />}
      <GlobalSearch books={importedBooks} enabled={!readerOpen&&!activeFeature&&!menuOpen&&!calibration} onOpen={item => {
        relationReturn.current.clear();
        openContent(item);
      }}/>
      <ContentRelationshipPanel books={importedBooks} onNavigate={visitRelation} />
      <MusicPlayer catalogItem={activeFeature === 'knowledge' && ['music','playlist'].includes(catalogEditor?.type) ? catalogEditor : null} onCatalogClose={() => setCatalogEditor(null)} navigation={navigation} shortcuts={shortcuts} shortcutsEnabled={!settingsOpen || !menuOpen} open={activeFeature === 'music'} onClose={closeFeature} />

      {activeFeature && activeFeature !== 'music' && activeFeature !== 'crystal' && (
        <PanelLoading key={`${activeFeature}:${navigation.revision}`} title={`正在打开${hotspots[activeFeature]?.label ?? '模块'}`}>
          {activeFeature === 'knowledge' && (
            <EntityCatalog books={importedBooks} editing={catalogEditor} onEdit={setCatalogEditor} onBooksChanged={updateBooks} onBookDeleted={id => setImportedBooks(current => current.filter(book => book.id !== id))} onStartCopy={startCopy} onOpenNote={openKnowledgeNote} onCreate={createCatalogItem} onOpen={item => visitRelation(item, null)} onClose={closeFeature} />
          )}
          {activeFeature === 'movie' && <MovieCollection onClose={closeFeature} />}
          {activeFeature === 'diary' && <DiaryPanel navigationItem={navigation.item} onClose={closeFeature} />}
          {activeFeature === 'memo' && <MemoBoard shortcuts={shortcuts} onClose={closeFeature} />}
          {activeFeature === 'globe' && <GlobePanel navigationItem={navigation.item} onClose={closeFeature} />}
          {activeFeature === 'typewriter' && <TypewriterPanel importedBooks={importedBooks} initialSource={copyRequest} onClose={() => {closeFeature();setCopyRequest(null);}} />}
          {activeFeature === 'pet' && <PetPanel model={detailModel} theme={sceneTheme} onClose={closeFeature} />}
          {activeFeature === 'plant' && <PlantPanel model={detailModel} theme={sceneTheme} onClose={closeFeature} />}
        </PanelLoading>
      )}

      {activeHotspot && (
        <div className="hotspot-caption" role="status">
          <strong>{activeHotspot.label}</strong>
          {activeHotspot.detail && <span>{activeHotspot.detail}</span>}
        </div>
      )}

      <ProfilerHud
        forceAlwaysRender={forceAlwaysRender}
        onToggleAlwaysRender={setForceAlwaysRender}
        quality={quality}
      />
    </main>
  );
}

export default App;
