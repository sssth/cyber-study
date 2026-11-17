import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, Color, DirectionalLight, DoubleSide, FogExp2,
  LinearFilter, Matrix4, Group, HemisphereLight, Mesh, MeshBasicMaterial, PMREMGenerator, PlaneGeometry,
  NormalBlending, PointLight, RepeatWrapping, Scene, SpotLight, SRGBColorSpace, TextureLoader
} from 'three';
import { isSceneTexture, materialFields, sceneAssets } from '../packages/presentation.js';
import { createAssetLifetime } from './assetLifetime.js';
import RegionalPanorama from './RegionalPanorama.jsx';

const TextureContext = createContext({});

const textureLifetime = createAssetLifetime((_id, texture) => {
  texture.dispose();
  // Texture objects can be shared by providers; dispose after the final user.
});
const textureGroups = createAssetLifetime(key => useLoader.clear(TextureLoader, JSON.parse(key)));
const environmentCache = new WeakMap();
const environmentLifetime = createAssetLifetime((key, entry) => {
  entry.map?.delete(key);
  entry.result.dispose();
});

export function SceneTextures({ scene, theme, materialsOnly = false, children }) {
  const gl = useThree(state => state.gl);
  const paths = useMemo(() => {
    const allThemes = scene.appearance?.themes;
    if (allThemes && !materialsOnly) {
      return [...sceneAssets({ models: [], appearance: { themes: allThemes } })].filter(isSceneTexture);
    }
    if (!theme) return [];
    const current = materialsOnly ? { materials: theme.materials } : theme;
    return [...sceneAssets({ models: [], appearance: { themes: { current } } })].filter(isSceneTexture);
  }, [scene.appearance?.themes, theme, materialsOnly]);
  const panoramaPaths = useMemo(() => {
    const set = new Set();
    const list = scene.appearance?.themes && !materialsOnly
      ? Object.values(scene.appearance.themes)
      : (theme ? [theme] : []);
    for (const item of list) {
      if (item.panorama?.file) set.add(item.panorama.file);
      for (const file of Object.values(item.panorama?.regions ?? {})) set.add(file);
      if (item.panorama?.front?.file) set.add(item.panorama.front.file);
      if (item.panorama?.skyRepair) set.add(item.panorama.skyRepair);
      if (item.panorama?.original) set.add(item.panorama.original);
    }
    return set;
  }, [scene.appearance?.themes, theme, materialsOnly]);
  const urls = useMemo(() => paths.map(file => scene.assetUrl(file)), [paths, scene.assetUrl]);
  const textures = useLoader(TextureLoader, urls);
  const groupKey = JSON.stringify(urls);
  useEffect(() => {
    const releaseGroup = textureGroups.retain(groupKey, textures);
    const releases = textures.map(texture => textureLifetime.retain(texture.uuid, texture));
    return () => { releaseGroup(); releases.forEach(release=>release()); };
  }, [groupKey, textures]);
  useLayoutEffect(() => {
    for (let i = 0; i < paths.length; i++) {
      const texture = textures[i];
      if (!texture) continue;
      texture.colorSpace = SRGBColorSpace;
      if (panoramaPaths.has(paths[i])) {
        texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = LinearFilter;
      }
      if (!texture.userData?.gpuPrewarmed) {
        texture.needsUpdate = true;
        texture.userData = { ...texture.userData, gpuPrewarmed: true };
        gl.initTexture?.(texture);
      }
    }
  }, [gl, paths, panoramaPaths, textures]);
  const byFile = useMemo(() => Object.fromEntries(paths.map((path, index) => [path, textures[index]])), [paths, textures]);
  return <TextureContext.Provider value={byFile}>{children}</TextureContext.Provider>;
}

export function ThemePanorama({ config }) {
  const textures = useContext(TextureContext);
  return config?.regions ? <RegionalPanorama config={config} textures={textures} /> : <EquirectangularPanorama config={config} />;
}

// Retain support for scene packages using one equirectangular image.
function EquirectangularPanorama({ config }) {
  const textures = useContext(TextureContext);
  const texture = textures[config?.file];
  const front = textures[config?.front?.file];
  const original = textures[config?.original];
  const uniforms = useMemo(() => ({
    panorama: { value: null },
    frontImage: { value: null },
    originalImage: { value: null },
    hasOriginal: { value: false },
    hasFront: { value: false },
    isOutpaint: { value: false },
    frontTanHalfFov: { value: 1 },
    frontAspect: { value: 1 },
    frontBlend: { value: 0.035 },
    inverseProjection: { value: new Matrix4() },
    cameraRotation: { value: new Matrix4() }
  }), []);
  useLayoutEffect(() => {
    if (!texture) return;
    uniforms.panorama.value = texture;
    uniforms.frontImage.value = front ?? texture;
    uniforms.originalImage.value = original ?? front ?? texture;
    uniforms.hasOriginal.value = Boolean(original);
    uniforms.hasFront.value = Boolean(front);
    uniforms.isOutpaint.value = Boolean(config?.outpaint);
    uniforms.frontTanHalfFov.value = config?.front?.tanHalfFov ?? 1;
    uniforms.frontAspect.value = config?.front?.aspect ?? 1;
    uniforms.frontBlend.value = config?.front?.blend ?? 0.035;
    for (const image of [texture, front, original].filter(Boolean)) {
      const wrapS = image === texture && !front ? RepeatWrapping : image.wrapS;
      if (image.userData?.equirectConfigured && image.wrapS === wrapS) continue;
      image.colorSpace = SRGBColorSpace;
      // Avoid undefined implicit mip derivatives at the projection boundary.
      if (image === texture && !front) image.wrapS = RepeatWrapping;
      image.generateMipmaps = false;
      image.minFilter = image.magFilter = LinearFilter;
      image.needsUpdate = true;
      image.userData = { ...image.userData, equirectConfigured: true };
    }
  }, [texture, front, original, config, uniforms]);
  if (!texture) return null;
  return <mesh name="room-panorama" frustumCulled={false} renderOrder={1000}
    onBeforeRender={(_renderer, _scene, camera) => {
      uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      uniforms.cameraRotation.value.copy(camera.matrixWorld);
    }}>
    <planeGeometry args={[2, 2]} />
    <shaderMaterial uniforms={uniforms} depthTest depthWrite={false} toneMapped={false}
      vertexShader={`
        varying vec2 screenPosition;
        void main() {
          screenPosition = position.xy;
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }
      `}
      fragmentShader={`
        uniform sampler2D panorama;
        uniform sampler2D frontImage;
        uniform sampler2D originalImage;
        uniform bool hasOriginal;
        uniform bool hasFront;
        uniform bool isOutpaint;
        uniform float frontTanHalfFov;
        uniform float frontAspect;
        uniform float frontBlend;
        uniform mat4 inverseProjection;
        uniform mat4 cameraRotation;
        varying vec2 screenPosition;
        void main() {
          vec4 viewRay = inverseProjection * vec4(screenPosition, 1.0, 1.0);
          vec3 ray = normalize(mat3(cameraRotation) * viewRay.xyz);
          vec2 uv = vec2(atan(ray.x, -ray.z) / 6.28318530718 + 0.5,
                         asin(clamp(ray.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
          if (isOutpaint && hasFront) {
            // The original photo is the untouched central half of the expanded canvas.
            // Keep its rectilinear projection exact; bend only the generated outer margin.
            float longitude = atan(ray.x, -ray.z);
            float a = abs(longitude);
            float boundary = atan(frontTanHalfFov);
            float x;
            if (a <= boundary) {
              x = tan(a) / (4.0 * frontTanHalfFov);
            } else {
              // Reserve image columns throughout the full side hemisphere: no edge plateau.
              float t = (a - boundary) / (3.14159265359 - boundary);
              x = 0.25 + 0.25 * t;
            }
            float elevation = atan(ray.y, length(ray.xz));
            float y = tan(elevation) * frontAspect /
              (4.0 * frontTanHalfFov * cos(min(a, boundary)));
            float ay = abs(y);
            if (ay > 0.25) {
              float verticalBoundary = atan(frontTanHalfFov * cos(min(a, boundary)) / frontAspect);
              y = sign(y) * (0.25 + 0.25 * (abs(elevation) - verticalBoundary) / (1.57079632679 - verticalBoundary));
            }
            vec2 extendedUV = vec2(0.5 + sign(longitude) * x, 0.5 + y);
            // Always sample the full-resolution image, including side/rear views.
            vec4 expandedColor = texture2D(frontImage, extendedUV);
            vec2 originalUV = (extendedUV - 0.25) * 2.0;
            // Unconditional sampling avoids GPU derivative artifacts (dashed seam lines).
            vec4 originalColor = texture2D(originalImage, clamp(originalUV, 0.0, 1.0));
            vec2 edgeDistance = min(originalUV, 1.0 - originalUV);
            float originalWeight = hasOriginal ? smoothstep(0.0, 0.004, min(edgeDistance.x, edgeDistance.y)) : 0.0;
            gl_FragColor = mix(expandedColor, originalColor, originalWeight);
          } else {
          gl_FragColor = texture2D(panorama, uv);
          // Preserve the original perspective photo, rather than stretching it around a sphere.
          // A direction-based projection stays complete when walking up to any window.
          if (hasFront && ray.z < -0.0001) {
            vec2 frontUV = vec2(ray.x, ray.y * frontAspect) / (-ray.z * 2.0 * frontTanHalfFov) + 0.5;
            vec2 edge = min(frontUV, 1.0 - frontUV);
            float weight = smoothstep(0.0, frontBlend, min(edge.x, edge.y));
            gl_FragColor = mix(gl_FragColor, texture2D(frontImage, clamp(frontUV, 0.0, 1.0)), weight);
          }
          }
          #include <colorspace_fragment>
        }
      `} />
  </mesh>;
}

export function ThemeGlows({ config }) {
  const textures = useContext(TextureContext);
  return config.sprites.map((sprite, index) => <sprite key={index}
    position={sprite.position} scale={[...sprite.size, 1]}>
    <spriteMaterial map={textures[config.file]} color={sprite.color} opacity={sprite.opacity}
      transparent blending={AdditiveBlending} depthWrite={false} />
  </sprite>);
}

export function useThemeMaterials(object, theme) {
  const textures = useContext(TextureContext);
  const gl = useThree(state => state.gl);
  const stateRef = useRef(null);

  useLayoutEffect(() => {
    const originals = new Map();
    const instances = new Map();
    const defaults = new Map();
    const copies = new Map();
    object.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      const list = Array.isArray(original) ? original : [original];
      originals.set(mesh, original);
      const solid = !list.some(mat => mat.transparent || mat.isMeshBasicMaterial);
      mesh.castShadow = mesh.userData.castShadow ?? solid;
      mesh.receiveShadow = mesh.userData.receiveShadow ?? solid;
      const mapped = list.map(material => {
        if (instances.has(material)) return instances.get(material);
        const copy = material.clone();
        if (material.name === 'CityPhoto') copy.fog = false;
        instances.set(material, copy);
        defaults.set(copy, {
          color: copy.color?.clone() ?? null,
          toneMapped: copy.toneMapped,
          blending: copy.blending,
          transparent: copy.transparent,
          depthWrite: copy.depthWrite,
          map: copy.map ?? null,
          fields: Object.fromEntries(materialFields.map(field => [field, copy[field]]))
        });
        return copy;
      });
      mesh.material = Array.isArray(original) ? mapped : mapped[0];
    });
    stateRef.current = { originals, instances, defaults, copies };
    return () => {
      for (const [mesh, original] of originals) mesh.material = original;
      for (const copy of instances.values()) copy.dispose();
      for (const entry of copies.values()) entry.texture.dispose();
      stateRef.current = null;
    };
  }, [object]);

  useLayoutEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const { instances, defaults, copies } = state;
    for (const [original, copy] of instances) {
      const base = defaults.get(copy);
      const values = theme && Object.hasOwn(theme.materials ?? {}, original.name) ? theme.materials[original.name] : null;
      if (copy.color && base.color) {
        if (values?.color) copy.color.set(values.color);
        else copy.color.copy(base.color);
      }
      copy.toneMapped = values?.toneMapped !== undefined ? values.toneMapped : base.toneMapped;
      const nextBlending = values?.additive !== undefined
        ? (values.additive ? AdditiveBlending : NormalBlending)
        : base.blending;
      const nextTransparent = values?.additive ? true : base.transparent;
      const nextDepthWrite = values?.additive ? false : base.depthWrite;
      const shaderChanged = copy.blending !== nextBlending || copy.transparent !== nextTransparent;
      copy.blending = nextBlending;
      copy.transparent = nextTransparent;
      copy.depthWrite = nextDepthWrite;
      for (const field of materialFields) {
        if (base.fields[field] !== undefined || values?.[field] !== undefined) {
          copy[field] = values?.[field] !== undefined ? values[field] : base.fields[field];
        }
      }
      let nextMap = base.map;
      if (values?.texture && textures[values.texture.file]) {
        const { file, repeat } = values.texture;
        let cached = copies.get(copy);
        if (!cached || cached.file !== file) {
          cached?.texture.dispose();
          const texture = textures[file].clone();
          texture.colorSpace = SRGBColorSpace;
          texture.flipY = false;
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.needsUpdate = true;
          cached = { file, texture };
          copies.set(copy, cached);
        }
        cached.texture.repeat.fromArray(repeat);
        nextMap = cached.texture;
      }
      const mapKindChanged = Boolean(copy.map) !== Boolean(nextMap);
      copy.map = nextMap;
      if (shaderChanged || mapKindChanged) copy.needsUpdate = true;
    }
    gl.shadowMap.needsUpdate = true;
  }, [object, theme, textures, gl]);
}

function buildLightPool(themes, fallbackTheme, shadowSize) {
  const group = new Group();
  const list = themes ? Object.values(themes) : (fallbackTheme ? [fallbackTheme] : []);
  const maxCounts = new Map();
  const sampleSpecs = new Map();
  for (const theme of list) {
    const counts = new Map();
    for (const spec of theme.lights ?? []) {
      const key = `${spec.type}:${Boolean(spec.shadow && shadowSize > 0)}`;
      const index = counts.get(key) ?? 0;
      counts.set(key, index + 1);
      if (index + 1 > (maxCounts.get(key) ?? 0)) maxCounts.set(key, index + 1);
      const slotKey = `${key}:${index}`;
      if (!sampleSpecs.has(slotKey)) sampleSpecs.set(slotKey, spec);
    }
  }
  const pools = new Map();
  for (const [key, count] of maxCounts) {
    const [type, hasShadowStr] = key.split(':');
    const hasShadow = hasShadowStr === 'true';
    const slots = [];
    for (let i = 0; i < count; i++) {
      const sample = sampleSpecs.get(`${key}:${i}`);
      let light;
      switch (type) {
        case 'ambient': light = new AmbientLight('#ffffff', 0); break;
        case 'hemisphere': light = new HemisphereLight('#ffffff', '#000000', 0); break;
        case 'directional': light = new DirectionalLight('#ffffff', 0); break;
        case 'point': light = new PointLight('#ffffff', 0); break;
        case 'spot': light = new SpotLight('#ffffff', 0); break;
      }
      if (light.target) group.add(light.target);
      if (hasShadow && sample?.shadow) {
        light.castShadow = true;
        light.shadow.mapSize.setScalar(Math.min(sample.shadow.size, shadowSize));
      }
      group.add(light);
      slots.push(light);
    }
    pools.set(key, slots);
  }
  return { group, pools };
}

function applyLightsToPool(pool, theme, lightsOn, shadowSize) {
  const dim = lightsOn ? 1 : theme.dimWithRoomLights ?? 1;
  const usedCounts = new Map();
  for (const slots of pool.pools.values()) {
    for (const light of slots) light.intensity = 0;
  }
  for (const spec of theme.lights ?? []) {
    const key = `${spec.type}:${Boolean(spec.shadow && shadowSize > 0)}`;
    const slots = pool.pools.get(key);
    if (!slots) continue;
    const index = usedCounts.get(key) ?? 0;
    usedCounts.set(key, index + 1);
    const light = slots[index];
    if (!light) continue;
    light.color.set(spec.color);
    if (spec.ground && light.groundColor) light.groundColor.set(spec.ground);
    light.intensity = spec.intensity * dim;
    if (spec.distance !== undefined) light.distance = spec.distance;
    if (spec.decay !== undefined) light.decay = spec.decay;
    if (spec.angle !== undefined) light.angle = spec.angle;
    if (spec.penumbra !== undefined) light.penumbra = spec.penumbra;
    light.position.fromArray(spec.position);
    if (light.target && spec.target) {
      light.target.position.fromArray(spec.target);
      light.target.updateMatrixWorld();
    }
    if (spec.shadow && shadowSize > 0) {
      const s = spec.shadow;
      const targetSize = Math.min(s.size, shadowSize);
      if (light.shadow.mapSize.x !== targetSize || light.shadow.mapSize.y !== targetSize) {
        light.shadow.mapSize.setScalar(targetSize);
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
      light.shadow.camera.near = s.near;
      light.shadow.camera.far = s.far;
      if (s.bounds) {
        const [left, right, top, bottom] = s.bounds;
        Object.assign(light.shadow.camera, { left, right, top, bottom });
      }
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.bias = s.bias;
      light.shadow.normalBias = s.normalBias;
    }
  }
  pool.group.updateMatrixWorld(true);
}

function buildEnvironment(gl, spec) {
  const source = new Scene();
  source.background = new Color(spec.background);
  for (const panel of spec.panels) {
    const mesh = new Mesh(new PlaneGeometry(...panel.size), new MeshBasicMaterial({
      color: new Color(panel.color).multiplyScalar(panel.intensity), side: DoubleSide
    }));
    mesh.position.fromArray(panel.position);
    mesh.rotation.fromArray(panel.rotation);
    source.add(mesh);
  }
  const generator = new PMREMGenerator(gl);
  try {
    return generator.fromScene(source, 0.04);
  } finally {
    generator.dispose();
    for (const mesh of source.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

function acquireEnvironment(gl, key, spec) {
  let map = environmentCache.get(gl);
  if (!map) {
    map = new Map();
    environmentCache.set(gl, map);
  }
  let entry = map.get(key);
  if (!entry) {
    entry = { map, result: buildEnvironment(gl, spec) };
    map.set(key, entry);
  }
  return entry;
}

export function ThemeLighting({ theme, themes, lightsOn, shadowSize = 2048 }) {
  const { gl, scene } = useThree();
  const pool = useMemo(() => buildLightPool(themes, theme, shadowSize), [themes, shadowSize]);
  const environmentKey = JSON.stringify(theme.environment ?? null);

  useLayoutEffect(() => {
    applyLightsToPool(pool, theme, lightsOn, shadowSize);
  }, [pool, theme, lightsOn, shadowSize]);

  useEffect(() => {
    if (!themes) return;
    const retainers = [];
    for (const item of Object.values(themes)) {
      if (!item.environment) continue;
      const key = JSON.stringify(item.environment);
      const entry = acquireEnvironment(gl, key, item.environment);
      retainers.push(environmentLifetime.retain(key, entry));
    }
    return () => retainers.forEach(release => release());
  }, [gl, themes]);

  useLayoutEffect(() => {
    const spec = JSON.parse(environmentKey);
    if (!spec) return;
    const entry = acquireEnvironment(gl, environmentKey, spec);
    const release = environmentLifetime.retain(environmentKey, entry);
    scene.environment = entry.result.texture;
    return () => {
      if (scene.environment === entry.result.texture) scene.environment = null;
      release();
    };
  }, [gl, scene, environmentKey]);

  useLayoutEffect(() => {
    const previous = {mapping:gl.toneMapping, exposure:gl.toneMappingExposure, autoUpdate:gl.shadowMap.autoUpdate};
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = theme.exposure;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.toneMapping = previous.mapping;
      gl.toneMappingExposure = previous.exposure;
      gl.shadowMap.autoUpdate = previous.autoUpdate;
    };
  }, [gl, theme, lightsOn, pool]);

  useLayoutEffect(() => () => pool.group.traverse(light => light.shadow?.dispose()), [pool]);
  const fog = useMemo(() => new FogExp2(theme.fog, theme.fogDensity), [theme]);
  return <>
    {!theme.panorama && <color attach="background" args={[theme.background]} />}
    <primitive attach="fog" object={fog} />
    <primitive object={pool.group} />
  </>;
}
