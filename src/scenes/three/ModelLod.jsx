import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Box3, FileLoader, Matrix4, Vector3 } from 'three';
import { createAssetLifetime } from './assetLifetime.js';
import { chooseLod, retainLodGeometry } from './modelLod.js';
import { frameProfiler } from './frameProfiler.js';

class IndexLoader extends FileLoader {
  constructor(manager) { super(manager); this.setResponseType('arraybuffer'); }
}

const indexLifetime = createAssetLifetime(key => useLoader.clear(IndexLoader, JSON.parse(key)));

export default function ModelLod({ object, item, forceOriginal = false }) {
  const buffers = useLoader(IndexLoader, item.lodUrls);
  const bufferKey = JSON.stringify(item.lodUrls);
  useEffect(() => indexLifetime.retain(bufferKey, buffers), [bufferKey, buffers]);
  const targets = useMemo(() => {
    const meshes = [];
    object.traverse(mesh => { if (mesh.isMesh) meshes.push(mesh); });
    if (meshes.length !== 1 || meshes[0].isSkinnedMesh || meshes[0].morphTargetInfluences) return [];
    const mesh = meshes[0], base = mesh.geometry;
    return [{ mesh, base, active: null, raycast: mesh.raycast }];
  }, [object, buffers, item.lod]);
  const scratch = useMemo(() => ({ box: new Box3(), center: new Vector3(), size: new Vector3(), camera: new Vector3() }), []);
  const level = useRef(0);
  const last = useMemo(() => ({ camera: new Matrix4(), projection: new Matrix4(), object: new Matrix4(), flags: '' }), []);
  useLayoutEffect(() => {
    level.current = 0; last.flags = '';
    // Input always uses the original surface, independently of the visual LOD.
    for (const t of targets) t.mesh.raycast = function(raycaster, intersects) {
      const current = this.geometry;
      try { this.geometry = t.base; t.raycast.call(this, raycaster, intersects); }
      finally { this.geometry = current; }
    };
    return () => { for (const t of targets) { t.mesh.geometry = t.base; t.active?.release(); t.active = null; t.mesh.raycast = t.raycast; delete t.mesh.userData.displayLod; } };
  }, [targets, last]);
  useFrame(({ camera, size, gl, scene }) => {
    if (!targets.length) return;
    frameProfiler.measureZone('scene:lod', () => {
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
    object.updateWorldMatrix(true, true);
    const flags = `${forceOriginal}-${scene.userData.lodDisabled}-${size.height}-${gl.getPixelRatio()}`;
    if (flags === last.flags && last.camera.equals(camera.matrixWorld) && last.projection.equals(camera.projectionMatrix) && last.object.equals(object.matrixWorld)) return;
    last.flags = flags; last.camera.copy(camera.matrixWorld); last.projection.copy(camera.projectionMatrix); last.object.copy(object.matrixWorld);
    const { box, center, camera: eye, size: extent } = scratch;
    box.copy(targets[0].base.boundingBox).applyMatrix4(targets[0].mesh.matrixWorld);
    box.getCenter(center);box.getSize(extent);camera.getWorldPosition(eye);
    const diameter = extent.length();
    const distance = Math.max(0.001, eye.distanceTo(center) - diameter / 2);
    const pixels = diameter * size.height * gl.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360) * distance);
    const next = forceOriginal || scene.userData.lodDisabled === true ? 0 : chooseLod(pixels, item.lodQuality, item.lod.levels, level.current);
    if (next !== level.current) {
      for (const t of targets) {
        const active = next ? retainLodGeometry(t.base, buffers[next - 1], item.lod, next - 1) : null;
        t.mesh.geometry = active?.geometry ?? t.base;
        t.active?.release(); t.active = active;
      }
      level.current = next;
    }
    for (const t of targets) t.mesh.userData.displayLod = next;
    });
  });
  return null;
}
