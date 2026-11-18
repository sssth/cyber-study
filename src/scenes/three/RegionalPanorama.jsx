import { useLayoutEffect, useMemo } from 'react';
import { ClampToEdgeWrapping, LinearFilter, Matrix4, SRGBColorSpace } from 'three';
import { regionalPanoramaFragment, regionalPanoramaVertex } from './regionalPanoramaShader.js';

const faceNames = ['front', 'right', 'back', 'left', 'up', 'down'];

export default function RegionalPanorama({ config, textures }) {
  const images = useMemo(() => faceNames.map(face => textures[config.regions[face]]), [config, textures]);
  const photo = textures[config.front.file];
  const sky = config.skyRepair ? textures[config.skyRepair] : photo;
  // 注意：uniforms 必须在 useMemo 里带实际值创建。R3F 挂载 shaderMaterial 时会克隆
  // uniforms prop，之后再闭包内改写原对象不会同步到材质上（窗外面会变成纯黑）。
  const uniforms = useMemo(() => ({
    ...Object.fromEntries(faceNames.map((face, i) => [`face${face[0].toUpperCase()}${face.slice(1)}`, { value: images[i] }])),
    frontImage: { value: photo },
    skyRepair: { value: sky },
    hasSkyRepair: { value: config.skyRepair ? 1 : 0 },
    faceTanHalfFov: { value: config.tanHalfFov },
    faceAspect: { value: config.aspect },
    frontTanHalfFov: { value: config.front.tanHalfFov },
    frontAspect: { value: config.front.aspect },
    frontBlend: { value: config.front.blend },
    inverseProjection: { value: new Matrix4() },
    cameraRotation: { value: new Matrix4() }
  }), [config, images, photo, sky]);
  useLayoutEffect(() => {
    for (const image of [...images, photo, sky]) {
      if (!image) continue;
      image.colorSpace = SRGBColorSpace;
      image.wrapS = image.wrapT = ClampToEdgeWrapping;
      // Direct native sampling avoids an additional cubemap conversion/downscale.
      image.generateMipmaps = false;
      image.minFilter = image.magFilter = LinearFilter;
      image.needsUpdate = true;
    }
  }, [images, photo, sky]);
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
