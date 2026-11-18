import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useGLTF } from '@react-three/drei';
import Furniture3DLayer from '../../src/scenes/three/Furniture3DLayer.jsx';
import { AudioManager } from '../../src/audio/AudioManager.js';
import SceneEditor, { FieldReference } from './SceneEditor.jsx';
import { initialCameraKey } from '../../src/scenes/packages/cameraConfig.js';
import { openFolder, saveManifest, validateDraft } from './validate.js';
import './preview.css';

function usePreviewScene(result) {
  const urls = useRef(new Map());
  const [scene, setScene] = useState(null);
  useEffect(() => {
    const cache = urls.current;
    return () => {
      for (const url of cache.values()) {
        useGLTF.clear(url);
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    const cache = urls.current;
    const files = new Set(Object.values(result?.assets ?? {}));
    for (const [file, url] of cache) {
      if (files.has(file)) continue;
      useGLTF.clear(url);
      URL.revokeObjectURL(url);
      cache.delete(file);
    }
    for (const file of files) {
      if (!cache.has(file)) cache.set(file, URL.createObjectURL(file));
    }
    setScene(result ? {
      ...result.data,
      assetUrl: file => cache.get(result.assets[file]),
      models: result.data.models.map(model => ({
        ...model,
        modelUrl: cache.get(result.assets[model.file])
      }))
    } : null);
  }, [result]);
  return scene;
}

function App() {
  const [folder, setFolder] = useState(null);
  const [source, setSource] = useState('');
  const [accepted, setAccepted] = useState(null);
  const [applied, setApplied] = useState('');
  const [diskSource, setDiskSource] = useState('');
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [selection, setSelection] = useState(0);
  const [editorMode, setEditorMode] = useState('structure');
  const [view, setView] = useState('room');
  const [saved, setSaved] = useState(false);
  const scene = usePreviewScene(accepted);
  const audio = useMemo(() => new AudioManager(), []);
  const [rainOn, setRainOn] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('');
  const appearance = scene?.appearance;
  const themeId = appearance && (Object.hasOwn(appearance.themes, selectedTheme) ? selectedTheme : appearance.defaultTheme);
  const theme = appearance?.themes[themeId];
  const [lightsOn, setLightsOn] = useState(true);
  const [sound, setSound] = useState(false);
  const [soundPending, setSoundPending] = useState(false);
  const applyTheme = useCallback((id, theme) => {
    const loop = theme.audioLoop && { url: scene.assetUrl(theme.audioLoop.file), gain: theme.audioLoop.gain };
    audio.setScene(id, { mix: theme.mix, loop });
  }, [audio, scene]);

  useEffect(() => () => { void audio.dispose(); }, [audio]);
  useEffect(() => {
    if (!scene?.appearance && audio.initialized && !audio.settings.muted) {
      void audio.toggleMute();
      setSound(false);
    }
  }, [audio, scene]);

  async function toggleSound() {
    setSoundPending(true);
    try {
      if (audio.initialized) setSound(!await audio.toggleMute());
      else {
        await audio.enable();
        setSound(true);
      }
    } catch (error) {
      setErrors([error.message]);
    } finally {
      setSoundPending(false);
    }
  }

  const dirty = source !== applied;
  function selectModel(id) {
    setSelected(id);
    setSelection(value => value + 1);
    if (id) setEditorMode('structure');
  }

  function accept(result, text) {
    if (accepted && initialCameraKey(accepted.data.camera) !== initialCameraKey(result.data.camera)) {
      setView('room');
    }
    setAccepted(result);
    setApplied(text);
    setSelected(id => result.data.models.some(item => item.id === id) ? id : '');
  }

  async function choose() {
    if (typeof window.showDirectoryPicker !== 'function') {
      setErrors(['请用桌面版 Chrome 或 Edge 打开此地址，以便直接保存文件夹里的 scene.json。']);
      return;
    }
    setBusy(true);
    try {
      const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
      setFolder(null);
      setSource('');
      setApplied('');
      setDiskSource('');
      setAccepted(null);
      setErrors([]);
      setSaved(false);
      setSelected('');
      setEditorMode('structure');
      setView('room');
      setRainOn(true);
      setSelectedTheme('');
      setLightsOn(true);
      const next = await openFolder(directory);
      setFolder(next);
      const text = await (await next.manifest.getFile()).text();
      setSource(text);
      setDiskSource(text);
      const result = await validateDraft(text, next);
      if (result.errors) setErrors(result.errors);
      else accept(result, text);
    } catch (error) {
      if (error.name !== 'AbortError') setErrors([error.message]);
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    setBusy(true);
    try {
      const next = await openFolder(folder.directory);
      const text = await (await next.manifest.getFile()).text();
      const result = await validateDraft(text, next);
      setErrors(result.errors ?? []);
      if (result.errors) return;
      setFolder(next);
      setSource(text);
      setDiskSource(text);
      setSaved(false);
      accept(result, text);
    } catch (error) {
      setErrors([`重新读取场景包失败：${error.message}`]);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setSaved(false);
    try {
      const result = await validateDraft(source, folder);
      if (result.errors) {
        setErrors(result.errors);
        return;
      }
      await saveManifest(folder, source, diskSource);
      setDiskSource(source);
      setErrors([]);
      accept(result, source);
      setSaved(true);
    } catch (error) {
      setErrors([`保存 scene.json 失败：${error.message}`]);
    } finally {
      setBusy(false);
    }
  }

  return <main className="workspace">
    <header className="header">
      <div><h1>场景包预览</h1>{folder && <p>{folder.root}</p>}</div>
      <div>
        {folder && <button disabled={busy || source !== diskSource} onClick={reload}>重新读取场景包</button>}
        <button className="primary" disabled={busy} onClick={choose}>选择场景包文件夹</button>
      </div>
    </header>

    <section className="stage" aria-label="整屋预览">
      {scene ? <>
        <Furniture3DLayer key={folder?.root} scene={scene} selectedId={selected}
          onModelSelect={selectModel} previewView={view} onTheme={applyTheme}
          previewTheme={themeId} rainOn={rainOn} lightsOn={lightsOn} />
        <div className="views" role="group" aria-label="预览视角">
          <button aria-pressed={view === 'room'} onClick={() => setView('room')}>应用视角</button>
          <button aria-pressed={view === 'orbit'} onClick={() => setView('orbit')}>自由视角</button>

        </div>
        <div className="views preview-room-controls" role="group" aria-label="房间控制">
          {appearance && <select aria-label="场景主题" value={themeId} onChange={event => {
            setSelectedTheme(event.target.value);
            setRainOn(true);
          }}>
            {Object.entries(appearance.themes).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>}
          <button aria-pressed={lightsOn} onClick={() => setLightsOn(!lightsOn)}>灯光</button>
          {scene.outdoorRain && (!theme || theme.rain) &&
            <button aria-pressed={rainOn} onClick={() => setRainOn(!rainOn)}>窗外雨</button>}
          {theme && <button aria-pressed={sound} disabled={soundPending} onClick={toggleSound}>场景声音</button>}
        </div>
      </> : <div className="empty">
        <h2>{busy ? '正在检查场景包…' : errors.length ? '场景包需要修正' : '选择一个场景包'}</h2>
        <p>{errors.length ? '在右侧查看检查结果。' : '文件夹根目录应包含 scene.json 和它引用的模型。'}</p>
      </div>}
    </section>

    <aside className="sidebar" aria-label="配置与校验">
      <section className="panel"><FieldReference /></section>
      <section className="panel" id="package-check">
        <h2>场景包检查</h2>
        <div aria-live="polite" className={errors.length ? 'status invalid' : 'status'}>
          {busy ? '正在检查配置和模型…' : errors.length ? <>
            <strong>检查或保存失败</strong>
            <ul>{errors.map(error => <li key={error}>{error}</li>)}</ul>
            {accepted && <p>画面保留上一次已应用的配置。</p>}
          </> : accepted ? <span className="valid">已通过 · {accepted.data.models.length} 个物件 · {accepted.count} 个 GLB 文件</span>
            : '选择文件夹后自动检查。'}
        </div>
      </section>

      {scene && <section className="panel">
        <label htmlFor="model">查看物件</label>
        <select id="model" value={selected} onChange={event => selectModel(event.target.value)}>
          <option value="">请选择物件</option>
          {scene.models.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
        </select>
      </section>}

      <section className="panel editor" onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && dirty && !busy && accepted) {
          event.preventDefault();
          void apply();
        }
      }}>
        <h2>scene.json</h2>
        {folder && !accepted && !busy && <p className="hint">修正配置或文件后，重新选择文件夹。</p>}
        <SceneEditor source={source} onChange={setSource} mode={editorMode} setMode={setEditorMode}
          selected={selected} selection={selection} enabled={Boolean(accepted)} busy={busy} />
        <div className="editor-footer">
          <div className="actions">
            <button className="primary" disabled={!accepted || busy || !dirty} onClick={apply}>校验并保存</button>
          </div>
          {accepted && <p className="hint">{errors.length ? <a href="#package-check">检查或保存失败，查看详情</a>
            : dirty ? '修改尚未写入文件。' : saved ? '已保存到场景包里的 scene.json。' : '保存时会直接更新场景包里的 scene.json。'}</p>}
        </div>
      </section>
    </aside>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
