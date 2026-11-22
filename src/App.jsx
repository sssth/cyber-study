import { initializeActivity } from './data/activityTime.js';
import { featureViews, persistentFeatureViews } from './features/views.js';
import { entityTypes } from './entities/registry.js';
import useStudyNavigation from './ui/useStudyNavigation.js';
import { translate, translateError, useLanguage } from './i18n/index.js';
import { blocksPageBack, PageBackKeys, usePageBackMatcher } from './ui/useEscapeBack.js';
import CrystalChat from './features/CrystalChat.jsx';
import ResultApplications from './resultApplications/ResultApplications.jsx';
import BulkEntityCommands from './entities/BulkEntityCommands.jsx';
import CommandToolbar from './features/CommandToolbar.jsx';
import ContentCommands, { ContentCommand } from './features/ContentCommands.jsx';
import UnifiedSearch from './search/UnifiedSearch.jsx';
import GlobalSearch from './search/GlobalSearch.jsx';
import ContentRelationshipPanel from './entities/ContentRelationshipPanel.jsx';
import GraphicsSettings from './features/GraphicsSettings.jsx';
import { loadGraphics, needsGraphicsCalibration, calibrationDecision, presetSettings } from './data/graphics.js';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import StudyScene, { hasOutdoorRain } from './scenes/StudyScene.jsx';
import { PanelLoading } from './ui/LoadingScreen.jsx';
import { defaultPackage } from './scenes/packages/scenePackage.js';
import { AudioManager } from './audio/AudioManager.js';
import { defaultSettings } from './data/defaultSettings.js';
import useBookLibrary from './features/library/useBookLibrary.js';
import { initializePlantClock, waterPlant } from './data/plantStore.js';
import { petCat } from './data/petStore.js';
import { hotspots } from './scenes/sceneConfig.js';
import { dispatchSceneFeature, featureCatalog } from './scenes/featureBindings.js';
import EntityCatalog from './entities/EntityCatalog.jsx';
import { PetPanel, PlantPanel } from './features/SpaceLife.jsx';

import ManualOperations from './features/ManualOperations.jsx';
import ManualOverview from './features/ManualOverview.jsx';
import { DisplayCloseButton } from './ui/DisplayControls.jsx';
import LanguageSelect from './features/LanguageSelect.jsx';
import ShortcutSettings from './features/ShortcutSettings.jsx';
import { loadShortcuts, saveShortcuts, shortcutGroups } from './data/shortcuts.js';
import ProfilerHud from './ui/ProfilerHud.jsx';

const ReaderOverlay = featureViews.shelf.reader;
const groups = shortcutGroups(defaultPackage);
const lightsOn = defaultSettings.scene.lightsOn;
const rainOn = hasOutdoorRain && !defaultPackage.appearance?.nightTheme;
const audioOn = false;


function formatCareChange(label, before, after) {
  const from = Math.round(before);
  const to = Math.round(after);
  return translate("i18n.careChange", label, from, to, to - from);
}

function App() {
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts(groups));
  return <PageBackKeys.Provider value={shortcuts.back}>
    <Study shortcuts={shortcuts} setShortcuts={setShortcuts} />
  </PageBackKeys.Provider>;
}

function Study({ shortcuts, setShortcuts }) {
  useLanguage();
  const isPageBack = usePageBackMatcher();
  const [sceneSettled, setSceneSettled] = useState(false);
  const markSceneSettled = useCallback(() => setSceneSettled(true), []);
  const [mapOpen, setMapOpen] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState(null);
  const captionTimer = useRef(null);
  const audioManager = useMemo(() => new AudioManager({
    audio: { ...defaultSettings.audio }
  }), []);

  useEffect(() => () => globalThis.clearTimeout(captionTimer.current), []);

  const showCaption = (caption) => {
    globalThis.clearTimeout(captionTimer.current);
    setActiveHotspot(caption);
    captionTimer.current = globalThis.setTimeout(() => setActiveHotspot(null), 3000);
  };

  const {
    readerOpen, returnToKnowledge, readerNavigation, navigation, readerEntry, sceneBookIds,
    lastBookId, readerJumpBlock, readerJumpProgress, activeFeature, copyRequest, detailModel,
    pendingCommand, clearPendingCommand, startCopy, closeCopy, openFeature, openKnowledgeNote,
    openReader, closeReader, createCatalogItem, visitRelation, closeFeature, openSceneBooks,
    openGlobalResult, clearReturnPoint
  } = useStudyNavigation({ audioManager, audioOn });
  const { books: importedBooks, warnings: bookLoadWarnings, updateBooks, removeBook } = useBookLibrary();
  const [sceneTheme, setSceneTheme] = useState(null);
  const careSound = useRef(null);
  const [knowledgeVersion, setKnowledgeVersion] = useState(0);
  useEffect(() => {
    const refresh = event => { if (event.detail === 'knowledge') setKnowledgeVersion(version => version + 1); };
    window.addEventListener('cyber-bulk-updated', refresh);
    return () => window.removeEventListener('cyber-bulk-updated', refresh);
  }, []);
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
    catch { setGraphicsError("i18n.graphicsSettingsWereAppliedButCouldNot"); }
  }, []);
  const skipCalibration = useCallback(() => {
    setCalibration(null);
    const fallback = presetSettings('low');
    setQuality(fallback);
    try { localStorage.setItem('study-graphics', JSON.stringify(fallback)); }
    catch { setGraphicsError("i18n.graphicsSettingsWereAppliedButCouldNot"); }
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
    catch { setGraphicsError("i18n.graphicsSettingsWereAppliedButCouldNot2"); }
  };
  const [menuOpen, setMenuOpen] = useState(false);
  useLayoutEffect(() => {
    globalThis.clearTimeout(captionTimer.current);
    setActiveHotspot(null);
  }, [activeFeature, readerOpen, menuOpen, mapOpen]);

  const [catalogEditor, setCatalogEditor] = useState(null);
  useEffect(() => { if (activeFeature !== 'knowledge' || readerOpen) setCatalogEditor(null); }, [activeFeature, readerOpen]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const updateShortcuts = (bindings) => {
    try {
      saveShortcuts(bindings);
      setShortcuts(bindings);
      return true;
    } catch {
      showCaption({ label: "i18n.couldNotSaveShortcuts" });
      return false;
    }
  };
  const menuRef = useRef(null);
  const [manualTab, setManualTab] = useState(0);
  const manualPages = [translate("i18n.roomFeatures"), translate("i18n.controls")];
  const manualTitle = manualPages[manualTab];
  const manual = useRef(null);
  const [manualOpen, setManualOpen] = useState(false);
  const menuButton = useRef(null);
  const applySceneTheme = useCallback((id, theme) => {
    setSceneTheme(theme);
    const loop = theme.audioLoop && { url: defaultPackage.assetUrl(theme.audioLoop.file), gain: theme.audioLoop.gain };
    audioManager.setScene(id, { mix: theme.mix, loop });
  }, [audioManager]);

  useEffect(() => { initializePlantClock(); initializeActivity(); }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const dismiss = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setShortcutsOpen(false);
      }
    };
    const dismissOnBack = (event) => {
      if (!isPageBack(event) || blocksPageBack()) return;
      event.preventDefault();
      if (shortcutsOpen) setShortcutsOpen(false);
      else if (graphicsOpen) setGraphicsOpen(false);
      else setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnBack);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnBack);
    };
  }, [menuOpen, shortcutsOpen, graphicsOpen, isPageBack]);

  const careForModel = (feature) => {
    const plant = feature === 'plant';
    const change = plant ? waterPlant() : petCat();
    if (!change) {
      showCaption({ label: "i18n.couldNotSaveTheInteraction" });
      return;
    }
    const { before, after } = change;
    const detail = plant
      ? formatCareChange(translate("i18n.moisture"), before, after)
      : [
        formatCareChange(translate("i18n.mood"), before.mood, after.mood),
        formatCareChange(translate("i18n.bond"), before.bond, after.bond)
      ].join(' · ');
    showCaption({ label: plant ? "i18n.plantWatered" : "i18n.catPetted", detail });
    const file = defaultPackage.careSounds?.[plant ? 'plant' : 'cat'];
    if (file) {
      careSound.current?.pause();
      const sound = new Audio(defaultPackage.assetUrl(file));
      careSound.current = sound;
      sound.play().catch(() => {});
    }
  };

  useEffect(() => () => careSound.current?.pause(), []);

  const commandView = `${readerOpen}:${activeFeature}`;
  const searchView = `${commandView}:${readerEntry}:${sceneTheme}:${navigation.revision}`;
  const contentCommandsDisabled = manualOpen || activeFeature === 'crystal' || mapOpen || shortcutsOpen || calibration;
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  useEffect(() => {
    const sync = event => setGlobalSearchOpen(event.detail.id === 'global');
    window.addEventListener('cyber-search-visibility', sync);
    return () => window.removeEventListener('cyber-search-visibility', sync);
  }, []);
  const showCommandToolbar = !menuOpen && !manualOpen && !shortcutsOpen && !graphicsOpen && !calibration &&
    (mapOpen || readerOpen || globalSearchOpen || (activeFeature && activeFeature !== 'crystal'));

  const FeatureView = featureViews[activeFeature]?.panel;
  const editingFeature = entityTypes[catalogEditor?.type]?.target.feature;

  return (
    <main className="app-shell">
      {calibration && <div className="graphics-calibration" role="status">
        <div className="loading-card"><strong>{translate("i18n.choosingGraphicsSettings")}</strong><p>{translate("i18n.testingQuality", translate({ low: "i18n.low", medium: "i18n.medium", high: "i18n.high" }[calibration]))}</p>
          <button type="button" onClick={skipCalibration}>{translate("i18n.skipAndUseLowQuality")}</button>
        </div>
      </div>}
      <section className="scene-stage" aria-label={translate("i18n.studyScene")}>
        <StudyScene
          renderingPaused={activeFeature === 'knowledge'}
          books={importedBooks}
          onSceneBooks={openSceneBooks}
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
          onOpenFeature={openFeature}
          onCare={careForModel}
        />
        {readerOpen && (
          <PanelLoading key={navigation.revision} title={translate("i18n.openingReader")}>
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
              bookLoadWarnings={bookLoadWarnings}
              onNoteCreated={() => setKnowledgeVersion((version) => version + 1)}
              onBooksChanged={updateBooks}
              onBookDeleted={removeBook}
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
              setShortcutsOpen(false);
              setGraphicsOpen(false);
              setMenuOpen((value) => !value);
            }}
          >
            <span aria-hidden="true">☰</span>{' '}{translate("i18n.roomMenu")}
          </button>
          <dialog ref={manual} className="study-manual" aria-label={translate("i18n.userGuide")}
            onKeyDown={event => {
              event.stopPropagation();
              if (isPageBack(event)) {
                event.preventDefault();
                manual.current.close();
              }
            }}
            onClose={() => { setManualOpen(false); menuButton.current?.focus(); }}>
            <DisplayCloseButton label={translate("i18n.closeGuide")} onClose={() => manual.current.close()} />
            <div className="manual-layout">
              <nav className="manual-options" aria-label={translate("i18n.guideSections")}>
                {manualPages.map((title, index) => (
                  <button key={index} type="button" aria-pressed={manualTab === index}
                    aria-controls="manual-page" onClick={() => setManualTab(index)}>{title}</button>
                ))}
              </nav>
              <div id="manual-page" key={manualTab} tabIndex={0} role="region" aria-label={manualTitle}>
                {manualTab === 0 ? <ManualOverview /> : <ManualOperations shortcuts={shortcuts} />}
              </div>
            </div>
          </dialog>
          {menuOpen && shortcutsOpen && (
            <ShortcutSettings groups={groups} bindings={shortcuts} onChange={updateShortcuts} onBack={() => {
              setShortcutsOpen(false);
              menuButton.current?.focus();
            }} />
          )}
          {menuOpen && graphicsOpen && <GraphicsSettings live={graphicsLive} quality={quality} onChange={changeGraphics} test={graphicsTest} result={graphicsResult} error={graphicsError} onTest={() => { setGraphicsResult(null); setGraphicsTest(true); }} onBack={() => { setGraphicsOpen(false); menuButton.current?.focus(); }} />}
          {menuOpen && !shortcutsOpen && !graphicsOpen && (
            <nav className="interaction-list" id="room-interactions" aria-label={translate("i18n.studyInteractions")}>
              <section className="interaction-group" aria-labelledby="object-interactions">
                <h2 id="object-interactions">{translate("i18n.roomObjects")}</h2>
                <div className="interaction-buttons">
                  {featureCatalog.filter(({ id }) => !['desk', 'window', 'lamp'].includes(id)).map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => {
                      setMenuOpen(false);
                      dispatchSceneFeature(id, { onOpenReader: openReader, onOpenFeature: openFeature });
                    }}>
                      {translate(label)}
                    </button>
                  ))}
                </div>
              </section>
              <button type="button" aria-haspopup="dialog" onClick={() => { setMenuOpen(false); setManualTab(0); manual.current.showModal(); setManualOpen(true); }}>{translate("i18n.userGuide")}</button>
              <button type="button" onClick={() => setGraphicsOpen(true)}>{translate("i18n.graphicsAndPerformance")}</button>
              <div className="room-menu-preferences">
                <button type="button" onClick={() => setShortcutsOpen(true)}>{translate("i18n.keyboardShortcuts")}</button>
                <LanguageSelect />
              </div>
            </nav>
          )}
        </div>
      )}

      <CrystalChat open={activeFeature === 'crystal'} shortcuts={shortcuts} onClose={closeFeature} />
      <BulkEntityCommands shortcuts={shortcuts} projection={mapOpen} viewKey={searchView}
        disabled={manualOpen || shortcutsOpen || graphicsOpen || calibration || activeFeature === 'crystal'}
        books={importedBooks} updateBooks={updateBooks} removeBook={removeBook}/>
      <ContentCommands viewKey={commandView} targetView={searchView} shortcuts={shortcuts} disabled={contentCommandsDisabled}
        pending={pendingCommand} onPendingHandled={clearPendingCommand} />
      <ResultApplications shortcuts={shortcuts} disabled={manualOpen || shortcutsOpen || graphicsOpen || calibration}
        projection={mapOpen} onOpen={clearReturnPoint} onActiveChange={setMapOpen} />
      <UnifiedSearch viewKey={searchView} shortcuts={shortcuts} disabled={contentCommandsDisabled}/>
      {showCommandToolbar && <CommandToolbar shortcuts={shortcuts} />}
      <GlobalSearch books={importedBooks} enabled={!readerOpen&&!activeFeature&&!manualOpen&&!shortcutsOpen&&!graphicsOpen&&!calibration} onOpen={openGlobalResult}/>
      <ContentRelationshipPanel books={importedBooks} onNavigate={visitRelation} />
      {persistentFeatureViews.map(({ id, persistent: View }) => (
        <View key={id} active={activeFeature === id}
          catalogItem={activeFeature === 'knowledge' && editingFeature === id ? catalogEditor : null}
          onCatalogClose={() => setCatalogEditor(null)} navigation={navigation} shortcuts={shortcuts}
          shortcutsEnabled={!shortcutsOpen || !menuOpen} onClose={closeFeature} />
      ))}

      {activeFeature && !featureViews[activeFeature]?.persistent && activeFeature !== 'crystal' && (
        <PanelLoading key={`${activeFeature}:${navigation.revision}`} title={translate("i18n.openingPanel", translate(hotspots[activeFeature]?.label ?? "i18n.panel"))}>
          {activeFeature === 'knowledge' && (
            <EntityCatalog books={importedBooks} editing={catalogEditor} onEdit={setCatalogEditor} onBooksChanged={updateBooks} onBookDeleted={removeBook} onStartCopy={startCopy} onOpenNote={openKnowledgeNote} onCreate={createCatalogItem} onOpen={item => visitRelation(item, null)} onClose={closeFeature} />
          )}
          {FeatureView && <FeatureView navigation={navigation} shortcuts={shortcuts}
            importedBooks={importedBooks} copyRequest={copyRequest} closeCopy={closeCopy} onClose={closeFeature} />}
          {activeFeature === 'pet' && <PetPanel model={detailModel} theme={sceneTheme} onClose={closeFeature} />}
          {activeFeature === 'plant' && <PlantPanel model={detailModel} theme={sceneTheme} onClose={closeFeature} />}
        </PanelLoading>
      )}

      {activeHotspot && (
        <div className="hotspot-caption" role="status">
          <strong>{translate(activeHotspot.label)}</strong>
          {activeHotspot.detail && <span>{translateError(activeHotspot.detail)}</span>}
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
