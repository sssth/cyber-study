import StaticSceneOptimizer from './StaticSceneOptimizer.jsx';
import { useSceneGLTF } from './useSceneGLTF.js';
import ModelLod from './ModelLod.jsx';
import { prepareStaticModel } from './staticModel.js';
import { modelsForQuality } from '../packages/modelQuality.js';
import { normalizeGraphics } from '../../data/graphics.js';
import GraphicsMonitor, { LiveGraphicsMonitor } from './GraphicsMonitor.jsx';
import '../../styles/scene-package.css';

import { Suspense, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Box3, Vector3, Raycaster } from 'three';
import { SceneTextures, ThemePanorama, ThemeGlows, ThemeLighting, useThemeMaterials } from './ScenePresentation.jsx';
import PackageCamera from './PackageCamera.jsx';
import { matchesShortcut, shortcutGroups, typingTarget, viewShortcut } from '../../data/shortcuts.js';
import OutdoorRain from './OutdoorRain.jsx';
import { clampCameraValue, initialCameraKey } from '../packages/cameraConfig.js';
import { featureCatalog } from '../featureBindings.js';
import { LoadingBoundary, LoadingScreen } from '../../ui/LoadingScreen.jsx';

function TrackModelLoad({ url, onLoaded }) {
  useSceneGLTF(url);
  useEffect(() => { onLoaded(url); }, [url, onLoaded]);
  return null;
}

function FirstSceneFrame({ onReady }) {
  const frame = useRef(null);
  useFrame(() => {
    // The current frame renders after useFrame, before the next animation frame.
    if (frame.current === null) frame.current = requestAnimationFrame(onReady);
  });
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  return null;
}

function Model({ item, models, onSelect, onCare, selected, onModelSelect, onHover, onLeave, theme, hidden }) {
  const supportItem = models.find(model => model.id === item.support) || item;
  const { scene: supportScene } = useSceneGLTF(supportItem.modelUrl);
  const { scene } = useSceneGLTF(item.modelUrl);
  const interactive = Boolean(item.feature || onModelSelect);
  const prepared = useMemo(() => {
    const object = scene.clone(true);
    object.rotation.fromArray(item.rotation ?? [0, 0, 0]);
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = item.width / Math.max(size.x, 0.001);
    const position = [...item.position];
    if (item.support) {
      const support = supportScene.clone(true);
      support.rotation.fromArray(supportItem.rotation ?? [0, 0, 0]);
      support.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(support);
      const supportScale = supportItem.width / bounds.getSize(new Vector3()).x;
      const midpoint = bounds.getCenter(new Vector3());
      support.scale.setScalar(supportScale);
      support.position.set(supportItem.position[0] - midpoint.x * supportScale,
        supportItem.position[1] - bounds.min.y * supportScale,
        supportItem.position[2] - midpoint.z * supportScale);
      support.updateMatrixWorld(true);
      const ray = new Raycaster(new Vector3(position[0], item.surfaceCeiling ?? 10, position[2]), new Vector3(0, -1, 0));
      const hits = ray.intersectObject(support, true);
      const surface = hits.find(hit => hit.face && hit.face.normal.y > 0.35);
      if (surface) position[1] = surface.point.y + 0.005;
    }
    prepareStaticModel(object, interactive);
    object.userData.performanceModel = item.id;
    return { object, scale, position, size: size.toArray(), offset: [-center.x, -box.min.y, -center.z] };
  }, [scene, item, supportScene, supportItem, interactive]);

  useThemeMaterials(prepared.object, theme);

  return <group visible={!hidden} position={prepared.position} scale={prepared.scale}
    onPointerMove={onHover && !hidden ? (event) => {
      if (event.buttons !== 0 || event.pointerType === 'touch') return;
      event.stopPropagation();
      onHover(item.id);
    } : undefined}
    onPointerOut={onLeave && !hidden ? () => onLeave(item.id) : undefined}
    onClick={!hidden && (onModelSelect || item.feature) ? (event) => {
      if (event.delta > 4) return;
      event.stopPropagation();
      if (onModelSelect) onModelSelect(item.id);
      else onSelect?.(item.feature, item);
    } : undefined}
    onContextMenu={onCare && !hidden ? (event) => {
      if (event.button !== 2 || event.delta > 4) return;
      event.nativeEvent.preventDefault();
      event.stopPropagation();
      onCare(item.feature);
    } : undefined}>
    <group position={prepared.offset}><primitive object={prepared.object} />
      {item.lodUrls && !onModelSelect && <Suspense fallback={null}><ModelLod object={prepared.object} item={item} forceOriginal={Boolean(selected)} /></Suspense>}
    </group>
    {selected && <>
      <mesh position={[0, prepared.size[1] / 2, 0]} raycast={() => {}}>
        <boxGeometry args={prepared.size} />
        <meshBasicMaterial color="#8feaff" wireframe depthTest={false} transparent opacity={0.55} />
      </mesh>
      <axesHelper args={[0.4 / prepared.scale]} raycast={() => {}} />
      <Html position={[0, prepared.size[1], 0]} center style={{ pointerEvents: 'none' }}>
        <span className="model-marker">{item.id} · 实际位置 [{prepared.position.map(value => Number(value.toFixed(3))).join(', ')}]</span>
      </Html>
    </>}
  </group>;
}
// Rotate the viewing direction while keeping the viewer inside the room.
function CameraRange({ far }) {
  const camera = useThree(state => state.camera);
  useEffect(() => {
    camera.far = far;
    camera.updateProjectionMatrix();
  }, [camera, far]);
  return null;
}

function RoomView({ controls, config }) {
  const { camera, gl, invalidate } = useThree();
  const latestConfig = useRef(config);
  useEffect(() => { latestConfig.current = config; }, [config]);
  useEffect(() => {
    let yaw = 0, pitch = -0.08, previous = null;
    const update = () => {
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
      camera.updateProjectionMatrix();
      invalidate();
    };
    controls.current = { reset() {
      const initial = latestConfig.current;
      yaw = initial.yaw ?? 0;
      pitch = initial.pitch ?? -0.08;
      camera.position.fromArray(initial.position);
      camera.fov = initial.fov;
      update();
    } };
    controls.current.reset();
    const down = e => { if (e.button !== 0) return; previous = [e.clientX, e.clientY]; gl.domElement.setPointerCapture(e.pointerId); };
    const move = e => {
      if (!previous) return;
      yaw = clampCameraValue(latestConfig.current, 'yaw', yaw - (e.clientX - previous[0]) * 0.003);
      pitch = clampCameraValue(latestConfig.current, 'pitch', pitch - (e.clientY - previous[1]) * 0.003);
      previous = [e.clientX, e.clientY]; update();
    };
    const up = () => { previous = null; };
    const wheel = e => { e.preventDefault(); camera.fov = clampCameraValue(latestConfig.current, 'fov', camera.fov + e.deltaY * 0.025); update(); };
    const element = gl.domElement;
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      controls.current = null;
      element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
    };
  }, [camera, gl, invalidate, controls]);
  return null;
}

function FreeView({ scene }) {
  const { camera } = useThree();
  const orbit = useRef();
  const [initialScene] = useState(scene);
  useEffect(() => {
    const room = initialScene.models.find(model => ['room', 'room_shell', 'room-shell'].includes(model.id)) ?? initialScene.models[0];
    const [x, y, z] = room.position;
    const distance = Math.min(Math.max(room.width, 2), 60);
    camera.fov = initialScene.camera.fov;
    camera.position.set(x + distance * 0.65, y + distance * 0.8, z + distance * 0.85);
    camera.updateProjectionMatrix();
    orbit.current.target.set(x, y, z);
    orbit.current.update();
  }, [camera, initialScene]);
  return <OrbitControls ref={orbit} />;
}

function FeatureHint({ description }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);
  return visible ? <span className="scene-feature-hint">{description}</span> : null;
}

function FurnitureScene({ liveGraphics, onLiveGraphics, viewState, quality = 'medium', graphicsTest, onGraphicsResult, scene, lightsOn = true, mode, onFeature, onCare, onModelSelect, selectedId, previewView, previewTheme, rainOn = true, onSceneSettled, onTheme, inputActive = true, shortcuts }) {
  const preset = normalizeGraphics(quality);
  const controls = useRef();
  const bindings = useMemo(() => shortcuts ?? Object.fromEntries(
    (shortcutGroups(scene).find(([, scope]) => scope === 'scene')?.[2] ?? []).map(([id, , keys]) => [id, keys])
  ), [scene, shortcuts]);
  const appearance = scene.appearance;
  const { night, setNight, selectedView, setView } = viewState;
  const rainTheme = appearance?.nightTheme && Object.keys(appearance.themes).find(id => appearance.themes[id].rain);
  const themeId = previewTheme ?? (night ? (rainOn && rainTheme) || appearance?.nightTheme : appearance?.defaultTheme);
  const theme = appearance?.themes[themeId];
  const view = scene.views?.find(item => item.id === selectedView) ?? scene.views?.[0];
  const flipDay = useCallback(() => setNight(current => !current), []);

  useEffect(() => { if (theme) onTheme?.(themeId, theme); }, [theme, themeId, onTheme]);
  useEffect(() => {
    if (!inputActive || previewView === 'orbit') return;
    const press = event => {
      if (event.repeat || typingTarget(event.target)) return;
      if (!previewTheme && appearance?.nightTheme && matchesShortcut(event, bindings.dayNight)) {
        event.preventDefault();
        flipDay();
      }
      const next = scene.views?.find(item => matchesShortcut(event, bindings[viewShortcut(item.id)]));
      if (!next) return;
      event.preventDefault();
      if (next.id === view?.id) controls.current?.reset();
      else setView(next.id);
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, [appearance, flipDay, scene.views, inputActive, previewView, previewTheme, view, bindings]);
  const [initialCamera] = useState(() => ({ position: scene.camera.position, fov: scene.camera.fov, near: 0.1, far: scene.camera.far ?? 150 }));
  const [hoveredId, setHoveredId] = useState(null);
  const modelUrls = useMemo(() => [...new Set(scene.models.map(model => model.modelUrl))], [scene.models]);
  const [loadedUrls, setLoadedUrls] = useState(() => new Set());
  const [ready, setReady] = useState(false);
  const reportLoaded = useCallback(url => {
    setLoadedUrls(current => current.has(url) ? current : new Set([...current, url]));
  }, []);
  const reportReady = useCallback(() => {
    setReady(true);
    onSceneSettled?.();
  }, [onSceneSettled]);
  const loadedCount = modelUrls.filter(url => loadedUrls.has(url)).length;
  const percent = ready ? 100 : Math.floor(99 * loadedCount / (modelUrls.length || 1));
  const featureHover = Boolean(onFeature && !onModelSelect);
  const hoveredFeature = featureHover && scene.models.find(item => item.id === hoveredId)?.feature;
  const hint = featureCatalog.find(feature => feature.id === (hoveredFeature === 'pet' ? 'cat' : hoveredFeature))?.description;
  const dim = !lightsOn || mode === 'low-light';

  const careFor = feature => inputActive && onCare && ['cat', 'pet', 'plant'].includes(feature) ? onCare : undefined;
  const clearHover = () => setHoveredId(null);

  return <div className={hoveredFeature ? 'furniture-3d-layer feature-hovered' : 'furniture-3d-layer'}
    aria-label="三维书房，拖动旋转视角，滚轮缩放"
    onPointerDownCapture={featureHover ? clearHover : undefined}
    onPointerLeave={featureHover ? clearHover : undefined}
    onPointerCancel={featureHover ? clearHover : undefined}
    onPointerMoveCapture={featureHover ? (event) => {
      if (event.buttons !== 0 || event.pointerType === 'touch') return;
      const layer = event.currentTarget;
      const { left, top } = layer.getBoundingClientRect();
      layer.style.setProperty('--scene-pointer-x', `${event.clientX - left}px`);
      layer.style.setProperty('--scene-pointer-y', `${event.clientY - top}px`);
    } : undefined}>
    <LoadingBoundary message="房间加载失败，请重新打开应用。" onError={onSceneSettled}>
      <Canvas frameloop={(rainOn && preset.rain > 0 && scene.outdoorRain && (!theme || theme.rain)) || graphicsTest || liveGraphics ? 'always' : 'demand'} camera={initialCamera} shadows={Boolean(theme) && preset.shadowSize > 0} dpr={[1, preset.dpr]} gl={{ antialias: preset.antialias }}>
        {liveGraphics && ready && <LiveGraphicsMonitor onUpdate={onLiveGraphics} />}
        {graphicsTest && ready && <GraphicsMonitor onResult={onGraphicsResult} />}
        <CameraRange far={scene.camera.far ?? 150} />
        {theme ? <ThemeLighting shadowSize={preset.shadowSize} theme={theme} lightsOn={lightsOn} /> : <>
        <color attach="background" args={['#060c1b']} />
        <ambientLight intensity={dim ? 0.5 : 1.5} />
        <hemisphereLight args={['#a8dcff', '#28304b', dim ? 0.5 : 1.3]} />
        <directionalLight position={[4, 10, 8]} intensity={dim ? 0.8 : 2.5} />
        <pointLight position={[-4, 4, 1]} color="#38dfff" intensity={lightsOn ? 25 : 0} />
        <pointLight position={[4, 4, -1]} color="#ff60d6" intensity={lightsOn ? 20 : 0} />
        </>}
        {!ready && modelUrls.map(url => (
          <Suspense key={url} fallback={null}><TrackModelLoad url={url} onLoaded={reportLoaded} /></Suspense>
        ))}
        <Suspense fallback={null}>
          <SceneTextures scene={scene} theme={theme}>
          <ThemePanorama config={theme?.panorama} />
          {scene.models.map(item => <Model key={item.id} item={item} models={scene.models} onSelect={onFeature}
            onCare={careFor(item.feature)} theme={theme} hidden={theme?.hidden?.includes(item.id)}
            onModelSelect={onModelSelect} selected={item.id === selectedId}
            onHover={featureHover && item.feature ? setHoveredId : undefined}
            onLeave={featureHover && item.feature ? id => setHoveredId(current => current === id ? null : current) : undefined} />)}
            <StaticSceneOptimizer ready={ready} theme={theme} models={scene.models} disabled={Boolean(onModelSelect)} />
            {preset.glows && theme?.glows && <ThemeGlows config={theme.glows} />}
          </SceneTextures>
          {rainOn && preset.rain > 0 && scene.outdoorRain && (!theme || theme.rain) && <OutdoorRain density={preset.rain} bounds={scene.outdoorRain} />}
          {!ready && <FirstSceneFrame onReady={reportReady} />}
        </Suspense>
        {inputActive && previewView !== 'orbit' && scene.hotspots?.filter(spot => !spot.view || spot.view === view?.id).map(spot => {
          const model = scene.models.find(item => item.feature === spot.feature);
          return <Html key={spot.id} position={spot.position} center zIndexRange={[3, 2]}>
            <button type="button" className="scene-world-hotspot" onClick={() => {
              if (onModelSelect && model) onModelSelect(model.id);
              else onFeature?.(spot.feature, model);
            }} onContextMenu={careFor(spot.feature) ? (event) => {
              if (event.button !== 2) return;
              event.preventDefault();
              event.stopPropagation();
              onCare(spot.feature);
            } : undefined}>{spot.label}</button>
          </Html>;
        })}
        {previewView === 'orbit' ? <FreeView scene={scene} /> : (view || scene.roam)
          ? <PackageCamera config={scene.camera} view={view} roam={scene.roam} controls={controls} inputActive={inputActive} shortcuts={bindings} />
          : <RoomView key={initialCameraKey(scene.camera)} controls={controls} config={scene.camera} />}
      </Canvas>
      <LoadingScreen title="正在加载书房" percent={percent} done={ready}
        detail={ready ? '书房已就绪' : loadedCount < modelUrls.length ? `模型 ${loadedCount} / ${modelUrls.length}` : '正在绘制场景'} />
    </LoadingBoundary>
    {inputActive && (scene.views?.length || appearance) && <div className="scene-package-controls">
      {previewView !== 'orbit' && scene.views?.length > 0 && <div role="group" aria-label="分区视角">
        {scene.views.map(item => <button key={item.id} type="button"
          title={[
            previewView && `位置 ${item.position.join(', ')} · 落点 ${item.target.join(', ')} · 视野 ${item.fov}°`,
            bindings[viewShortcut(item.id)]?.join(' / ')
          ].filter(Boolean).join(' · ') || undefined}
          aria-pressed={view?.id === item.id} onClick={() => {
            if (view?.id === item.id) controls.current?.reset();
            else setView(item.id);
          }}>{item.label}</button>)}
      </div>}
      {!previewTheme && appearance?.nightTheme && <div className="scene-day-night" role="group" aria-label="日夜切换">
        <button type="button" title={['切换日间／夜间', bindings.dayNight?.join(' / ')].filter(Boolean).join(' · ')} aria-pressed={!night} onClick={flipDay}>
          <span aria-hidden="true">{night ? '☾' : '☀'}</span> {night ? '夜间' : '日间'}
        </button>
      </div>}
    </div>}
    {hint && <FeatureHint key={hoveredId} description={hint} />}
    {onModelSelect && <div className="scene-camera-help">{previewView === 'orbit' ? '拖动旋转 · 右键拖动平移 · 滚轮缩放'
      : <>拖动环顾 · 滚轮调整视野 <button onClick={() => controls.current?.reset()}>重置视角</button></>}</div>}
  </div>;
}

export default function Furniture3DLayer(props) {
  const [night, setNight] = useState(false);
  const [selectedView, setView] = useState(null);
  const quality = normalizeGraphics(props.quality);
  const resourceQuality = quality.textures;
  const scene = useMemo(() => ({ ...props.scene, models: modelsForQuality(props.scene, resourceQuality) }), [props.scene, resourceQuality]);
  return <FurnitureScene key={`${resourceQuality}-${quality.antialias}`} {...props} quality={quality} scene={scene} viewState={{ night, setNight, selectedView, setView }} />;
}
