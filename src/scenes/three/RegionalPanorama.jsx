import { useLayoutEffect, useMemo } from 'react';
import { ClampToEdgeWrapping, LinearFilter, Matrix4, SRGBColorSpace } from 'three';
import { regionalPanoramaFragment, regionalPanoramaVertex } from './regionalPanoramaShader.js';

const faceNames = ['front', 'right', 'back', 'left', 'up', 'down'];

export default function RegionalPanorama({ config, textures }) {
  const images = useMemo(() => faceNames.map(face => textures[config.regions[face]]), [config, textures]);
  const photo = textures[config.front.file];
  const sky = config.skyRepair ? textures[config.skyRepair] : photo;
  const uniforms = useMemo(() => ({
    ...Object.fromEntries(faceNames.map((face) => [`face${face[0].toUpperCase()}${face.slice(1)}`, { value: null }])),
    frontImage: { value: null },
    skyRepair: { value: null },
    hasSkyRepair: { value: 0 },
    faceTanHalfFov: { value: 1 },
    faceAspect: { value: 1 },
    frontTanHalfFov: { value: 1 },
    frontAspect: { value: 1 },
    frontBlend: { value: 0.006 },
    inverseProjection: { value: new Matrix4() },
    cameraRotation: { value: new Matrix4() }
  }), []);
  useLayoutEffect(() => {
    for (let i = 0; i < faceNames.length; i++) {
      const face = faceNames[i];
      uniforms[`face${face[0].toUpperCase()}${face.slice(1)}`].value = images[i];
    }
    uniforms.frontImage.value = photo;
    uniforms.skyRepair.value = sky;
    uniforms.hasSkyRepair.value = config.skyRepair ? 1 : 0;
    uniforms.faceTanHalfFov.value = config.tanHalfFov;
    uniforms.faceAspect.value = config.aspect;
    uniforms.frontTanHalfFov.value = config.front.tanHalfFov;
    uniforms.frontAspect.value = config.front.aspect;
    uniforms.frontBlend.value = config.front.blend;
    for (const image of [...images, photo, sky]) {
      if (!image || image.userData?.panoramaConfigured) continue;
      image.colorSpace = SRGBColorSpace;
      image.wrapS = image.wrapT = ClampToEdgeWrapping;
      // Direct native sampling avoids an additional cubemap conversion/downscale.
      image.generateMipmaps = false;
      image.minFilter = image.magFilter = LinearFilter;
      image.needsUpdate = true;
      image.userData = { ...image.userData, panoramaConfigured: true };
    }
  }, [config, images, photo, sky, uniforms]);
  return <mesh name="regional-panorama" frustumCulled={false} renderOrder={1000}
    onBeforeRender={(_renderer, _scene, camera) => {
      uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      uniforms.cameraRotation.value.copy(camera.matrixWorld);
    }}>
    <planeGeometry args={[2, 2]} />
    <shaderMaterial uniforms={uniforms} depthTest depthWrite={false} toneMapped={false}
      vertexShader={regionalPanoramaVertex} fragmentShader={regionalPanoramaFragment} />
  </mesh>;
}
