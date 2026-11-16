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
import KnowledgeWorkspace from './features/KnowledgeWorkspace.jsx';
import { MusicPlayer, MovieCollection } from './features/MediaCollections.jsx';
import { DiaryPanel, MemoBoard } from './features/DiaryMemo.jsx';
import { GlobePanel, TypewriterPanel, PetPanel, PlantPanel } from './features/SpaceLife.jsx';

import ShortcutSettings from './features/ShortcutSettings.jsx';
import { loadShortcuts, matchesShortcut, saveShortcuts, shortcutGroups } from './data/shortcuts.js';

const groups = shortcutGroups(defaultPackage);
const focusFeatures = new Set(['knowledge', 'typewriter', 'diary']);

function formatCareChange(label, before, after) {
  const from = Math.round(before);
  const to = Math.round(after);
  return `${label} ${from} → ${to}（+${to - from}）`;
}

function App() {
  const [sceneSettled, setSceneSettled] = useState(false);
  const markSceneSettled = useCallback(() => setSceneSettled(true), []);
  const [lightsOn, setLightsOn] = useState(defaultSettings.scene.lightsOn);
  const [rainOn, setRainOn] = useState(hasOutdoorRain && !defaultPackage.appearance?.nightTheme);
  const [readerOpen, setReaderOpen] = useState(false);
  const [returnToKnowledge, setReturnToKnowledge] = useState(false);
  const [readerEntry, setReaderEntry] = useState('last');
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
      if (event.repeat || !matchesShortcut(event, shortcuts.closeMenu)) return;
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
    setDetailModel(model ?? null);
    showCaption(hotspots[featureId]);
    setActiveFeature(featureId);
  };

  const openKnowledgeNote = (note) => {
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
    if (entry === 'library') showCaption(hotspots.shelf);
    setReaderEntry(entry);
    setReaderJumpProgress(progress);
    setReaderJumpBlock(blockId);
    setReaderOpen(true);
    if (audioOn) audioManager.playSwitchSound('open');
  };

  const closeReader = () => {
    setReaderOpen(false);
    setReturnToKnowledge(false);
    setReaderJumpProgress(null);
    setLastBookId(loadReaderState().lastBookId);
    if (audioOn) audioManager.playSwitchSound('close');
  };

  return (
    <main className="app-shell">
      {calibration && <div className="graphics-calibration" role="status">
        <div className="loading-card"><strong>正在匹配画质</strong><p>检测{({low:'低',medium:'中',high:'高'})[calibration]}画质…</p>
          <button type="button" onClick={skipCalibration}>跳过，使用低画质</button>
        </div>
      </div>}
      <section className="scene-stage" aria-label="书房场景">
        <StudyScene
          liveGraphics={menuOpen && graphicsOpen} onLiveGraphics={setGraphicsLive}
          quality={quality} graphicsTest={graphicsTest || Boolean(calibration)} onGraphicsResult={finishGraphicsTest}
          shortcuts={shortcuts}
          lightsOn={lightsOn}
          onTheme={applySceneTheme}
          inputActive={!calibration && !readerOpen && !activeFeature && !menuOpen}
          rainOn={rainOn}
          onSceneSettled={markSceneSettled}
          onOpenReader={openReader}
          onToggleLights={toggleLights}
          onToggleRain={toggleRain}
          onOpenFeature={openFeature}
          onCare={careForModel}
        />
        {readerOpen && (
          <PanelLoading title="正在打开阅读器">
            <ReaderOverlay
              shortcuts={shortcuts}
              onClose={closeReader}
              returnToKnowledge={returnToKnowledge}
              initialView={readerEntry}
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
              <button type="button" onClick={() => setGraphicsOpen(true)}>画质与流畅度</button>
              <button type="button" onClick={() => setSettingsOpen(true)}>快捷键设置</button>
            </nav>
          )}
        </div>
      )}

      <MusicPlayer shortcuts={shortcuts} shortcutsEnabled={!settingsOpen || !menuOpen} open={activeFeature === 'music'} onClose={() => setActiveFeature(null)} />

      {activeFeature && activeFeature !== 'music' && (
        <PanelLoading key={activeFeature} title={`正在打开${hotspots[activeFeature]?.label ?? '模块'}`}>
          {activeFeature === 'knowledge' && (
            <KnowledgeWorkspace suspended={returnToKnowledge} onClose={() => setActiveFeature(null)} version={knowledgeVersion} importedBooks={importedBooks} onOpenNote={openKnowledgeNote} />
          )}
          {activeFeature === 'movie' && <MovieCollection onClose={() => setActiveFeature(null)} />}
          {activeFeature === 'diary' && <DiaryPanel onClose={() => setActiveFeature(null)} />}
          {activeFeature === 'memo' && <MemoBoard shortcuts={shortcuts} onClose={() => setActiveFeature(null)} />}
          {activeFeature === 'globe' && <GlobePanel onClose={() => setActiveFeature(null)} />}
          {activeFeature === 'typewriter' && <TypewriterPanel onClose={() => setActiveFeature(null)} />}
          {activeFeature === 'pet' && <PetPanel model={detailModel} theme={sceneTheme} onClose={() => setActiveFeature(null)} />}
          {activeFeature === 'plant' && <PlantPanel model={detailModel} theme={sceneTheme} onClose={() => setActiveFeature(null)} />}
        </PanelLoading>
      )}

      {activeHotspot && (
        <div className="hotspot-caption" role="status">
          <strong>{activeHotspot.label}</strong>
          {activeHotspot.detail && <span>{activeHotspot.detail}</span>}
        </div>
      )}
    </main>
  );
}

export default App;
