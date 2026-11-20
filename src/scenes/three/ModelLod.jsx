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

export default function ModelLod({ object, item, forceOriginal = false, motion }) {
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
  const bounds = useMemo(() => ({ box: new Box3(), center: new Vector3(), diameter: 0 }), []);
  const eye = useMemo(() => new Vector3(), []);
  const level = useRef(0);
  const last = useMemo(() => ({
    object: new Matrix4(), distance: -1, lensScale: 0, moving: false, original: null
  }), []);
  useLayoutEffect(() => {
    level.current = 0; last.original = null;
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
      const target = targets[0];
      target.mesh.updateWorldMatrix(true, false);
      const matrix = target.mesh.matrixWorld;
      if (last.original === null || !last.object.equals(matrix)) {
        last.object.copy(matrix);
        bounds.box.copy(target.base.boundingBox).applyMatrix4(matrix);
        bounds.box.getCenter(bounds.center);
        bounds.diameter = bounds.box.min.distanceTo(bounds.box.max);
        last.distance = -1;
      }
      const moving = motion.current;
      const original = forceOriginal || scene.userData.lodDisabled === true;
      const distance = eye.setFromMatrixPosition(camera.matrixWorld).distanceToSquared(bounds.center);
      const lensScale = size.height * gl.getPixelRatio() * camera.projectionMatrix.elements[5] / 2;
      if (last.distance === distance && last.lensScale === lensScale && last.moving === moving && last.original === original) return;
      last.distance = distance;
      last.lensScale = lensScale;
      last.moving = moving;
      last.original = original;

      const nearest = Math.max(0.001, Math.sqrt(distance) - bounds.diameter / 2);
      const pixels = bounds.diameter * lensScale / nearest;
      const next = original ? 0 : chooseLod(pixels, item.lodQuality, item.lod.levels, level.current, moving);
      if (next === level.current) return;
      const active = next ? retainLodGeometry(target.base, buffers[next - 1], item.lod, next - 1) : null;
      target.mesh.geometry = active?.geometry ?? target.base;
      target.active?.release();
      target.active = active;
      target.mesh.userData.displayLod = next;
      level.current = next;
    });
  });
  return null;
}
