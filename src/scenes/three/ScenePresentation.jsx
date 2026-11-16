import { createContext, useContext, useEffect, useLayoutEffect, useMemo } from 'react';
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

export function SceneTextures({ scene, theme, materialsOnly = false, children }) {
  const paths = useMemo(() => {
    if (!theme) return [];
    const current = materialsOnly ? { materials: theme.materials } : theme;
    return [...sceneAssets({ models: [], appearance: { themes: { current } } })].filter(isSceneTexture);
  }, [theme, materialsOnly]);
  const urls = useMemo(() => paths.map(file => scene.assetUrl(file)), [paths, scene.assetUrl]);
  const textures = useLoader(TextureLoader, urls);
  const groupKey = JSON.stringify(urls);
  useEffect(() => {
    const releaseGroup = textureGroups.retain(groupKey, textures);
    const releases = textures.map(texture => textureLifetime.retain(texture.uuid, texture));
    return () => { releaseGroup(); releases.forEach(release=>release()); };
  }, [groupKey, textures]);
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
    panorama: { value: texture },
    frontImage: { value: front ?? texture },
    originalImage: { value: original ?? front ?? texture },
    hasOriginal: { value: Boolean(original) },
    hasFront: { value: Boolean(front) },
    isOutpaint: { value: Boolean(config?.outpaint) },
    frontTanHalfFov: { value: config?.front?.tanHalfFov ?? 1 },
    frontAspect: { value: config?.front?.aspect ?? 1 },
    frontBlend: { value: config?.front?.blend ?? 0.035 },
    inverseProjection: { value: new Matrix4() },
    cameraRotation: { value: new Matrix4() }
  }), [texture, front, original, config]);
  useLayoutEffect(() => {
    if (!texture) return;
    for (const image of [texture, front, original].filter(Boolean)) {
      image.colorSpace = SRGBColorSpace;
      // Avoid undefined implicit mip derivatives at the projection boundary.
      if (image === texture && !front) image.wrapS = RepeatWrapping;
      image.generateMipmaps = false;
      image.minFilter = image.magFilter = LinearFilter;
      image.needsUpdate = true;
    }
  }, [texture, front, original]);
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

  useLayoutEffect(() => {
    if (!theme) return;
    const originals = new Map();
    const materials = new Map();
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
        if (materials.has(material)) return materials.get(material);
        const values = Object.hasOwn(theme.materials ?? {}, material.name) ? theme.materials[material.name] : null;
        const copy = values ? material.clone() : material;
        if (values?.color && copy.color) copy.color.set(values.color);
        if (values?.toneMapped !== undefined) copy.toneMapped = values.toneMapped;
        // Image scenery already contains atmospheric depth and must retain its colors.
        if (material.name === 'CityPhoto') copy.fog = false;
        if (values?.additive !== undefined) {
          copy.blending = values.additive ? AdditiveBlending : NormalBlending;
          if (values.additive) {
            copy.transparent = true;
            copy.depthWrite = false;
          }
        }
        for (const field of materialFields) if (values?.[field] !== undefined) copy[field] = values[field];
        if (values?.texture) {
          const {file, repeat} = values.texture;
          const texture = textures[file].clone();
          texture.colorSpace = SRGBColorSpace;
          texture.flipY = false;
          texture.wrapS = texture.wrapT = RepeatWrapping;
          texture.repeat.fromArray(repeat);
          texture.needsUpdate = true;
          copy.map = texture;
          copies.set(copy, texture);
        }
        materials.set(material, copy);
        return copy;
      });
      mesh.material = Array.isArray(original) ? mapped : mapped[0];
    });
    gl.shadowMap.needsUpdate = true;
    return () => {
      for (const [mesh, original] of originals) mesh.material = original;
      for (const [original, copy] of materials) if (copy !== original) copy.dispose();
      for (const texture of copies.values()) texture.dispose();
    };
  }, [object, theme, textures, gl]);
}

function createLights(theme, lightsOn, shadowSize) {
  const group = new Group();
  const dim = lightsOn ? 1 : theme.dimWithRoomLights ?? 1;
  for (const spec of theme.lights) {
    const {color, ground, distance, decay, angle, penumbra, position, target, shadow} = spec;
    const intensity = spec.intensity * dim;
    let light;
    switch (spec.type) {
      case 'ambient': light = new AmbientLight(color, intensity); break;
      case 'hemisphere': light = new HemisphereLight(color, ground, intensity); break;
      case 'directional': light = new DirectionalLight(color, intensity); break;
      case 'point': light = new PointLight(color, intensity, distance, decay); break;
      case 'spot': light = new SpotLight(color, intensity, distance, angle, penumbra, decay); break;
    }
    light.position.fromArray(position);
    if (light.target) {
      light.target.position.fromArray(target);
      group.add(light.target);
    }
    if (shadow && shadowSize > 0) {
      light.castShadow = true;
      light.shadow.mapSize.setScalar(Math.min(shadow.size, shadowSize));
      light.shadow.camera.near = shadow.near;
      light.shadow.camera.far = shadow.far;
      if (shadow.bounds) {
        const [left, right, top, bottom] = shadow.bounds;
        Object.assign(light.shadow.camera, { left, right, top, bottom });
      }
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.bias = shadow.bias;
      light.shadow.normalBias = shadow.normalBias;
    }
    group.add(light);
  }
  return group;
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

export function ThemeLighting({ theme, lightsOn, shadowSize = 2048 }) {
  const { gl, scene } = useThree();
  const lamps = useMemo(() => createLights(theme, lightsOn, shadowSize), [theme, lightsOn, shadowSize]);
  const environmentKey = JSON.stringify(theme.environment ?? null);

  useLayoutEffect(() => {
    const spec = JSON.parse(environmentKey);
    if (!spec) return;
    const result = buildEnvironment(gl, spec);
    scene.environment = result.texture;
    return () => {
      scene.environment = null;
      result.dispose();
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
  }, [gl, theme, lamps]);

  useLayoutEffect(() => () => lamps.traverse(light => light.shadow?.dispose()), [lamps]);
  const fog = useMemo(() => new FogExp2(theme.fog, theme.fogDensity), [theme]);
  return <>
    {!theme.panorama && <color attach="background" args={[theme.background]} />}
    <primitive attach="fog" object={fog} />
    <primitive object={lamps} />
  </>;
}
