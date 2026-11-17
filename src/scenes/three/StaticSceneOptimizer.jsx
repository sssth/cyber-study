import { useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, DoubleSide, FrontSide, Frustum, Matrix4, Vector3 } from 'three';
import { boxCorners, boxFullyOccluded, opaqueOccluder, solidBox } from './solidBox.js';
import { frameProfiler } from './frameProfiler.js';

export default function StaticSceneOptimizer({ ready, theme, models, disabled = false }) {
  const { scene } = useThree();
  const state = useMemo(() => ({ entries: null, materials: new Map(), projection: new Matrix4(), view: new Matrix4(),
    frustum: new Frustum(), matrix: new Matrix4(), eye: new Vector3(), localEye: new Vector3(), lastFlags: '' }), []);
  useLayoutEffect(() => {
    state.entries = null; state.lastFlags = '';
    return () => {
      for (const entry of state.entries ?? []) {
        entry.object.visible = entry.originalVisible;
        for (const mesh of entry.boxes) if (mesh.node.material === mesh.front) mesh.node.material = mesh.original;
        delete entry.object.userData.visibilityReason;
      }
      for (const material of state.materials.values()) material.dispose();
      state.materials.clear(); state.entries = null;
    };
  }, [state, scene, models, ready, disabled]);

  useLayoutEffect(() => {
    state.lastFlags = '';
    if (!state.entries) return;
    let transmission = false;
    for (const entry of state.entries) {
      let visible = true;
      for (let p = entry.object; p; p = p.parent) visible &&= p.visible;
      entry.visible = visible;
      for (const box of entry.boxes) {
        const orig = box.original;
        if (!transmission && orig.transmission > 0) transmission = true;
        if (box.front && box.front !== orig) {
          if (orig.color && box.front.color) box.front.color.copy(orig.color);
          box.front.toneMapped = orig.toneMapped;
          box.front.blending = orig.blending;
          box.front.transparent = orig.transparent;
          box.front.depthWrite = orig.depthWrite;
          box.front.roughness = orig.roughness;
          box.front.metalness = orig.metalness;
          box.front.emissiveIntensity = orig.emissiveIntensity;
          box.front.envMapIntensity = orig.envMapIntensity;
          box.front.clearcoat = orig.clearcoat;
          box.front.clearcoatRoughness = orig.clearcoatRoughness;
          if (box.front.map !== orig.map) {
            box.front.map = orig.map;
            box.front.needsUpdate = true;
          }
        }
        box.solidOccluder = opaqueOccluder(orig);
      }
    }
    state.transmission = transmission;
    state.occluders = state.entries
      .filter(e => e.visible && !e.dynamic)
      .flatMap(e => e.boxes.filter(b => b.solidOccluder !== false).map(b => ({ ...b, owner: e })))
      .filter(b => b.area > 0.08)
      .sort((a, b) => b.area - a.area)
      .slice(0, 48);
  }, [state, theme]);
  useFrame(({ camera, gl, invalidate }) => {
    if (!ready || disabled) return;
    frameProfiler.measureZone('scene:cull', () => {
    if (!state.entries) {
      scene.updateMatrixWorld(true);
      const entries = [];
      scene.traverse(object => {
        if (!object.userData.performanceModel) return;
        // Explicit theme visibility lives on the outer model group.
        let visible = true; for (let p = object; p; p = p.parent) visible &&= p.visible;
        const box = new Box3().setFromObject(object), boxes = [];
        let dynamic = false;
        object.traverse(node => {
          if (node.isSkinnedMesh || node.morphTargetInfluences || [node.material].flat().some(m=>m?.displacementMap)) dynamic = true;
          if (!node.isMesh || node.isSkinnedMesh || node.morphTargetInfluences || !node.visible || !opaqueOccluder(node.material)) return;
          for (let p = node; p && p !== object; p = p.parent) if (!p.visible) return;
          const solid = solidBox(node.geometry); if (!solid) return;
          const original = node.material;
          let front = original;
          if (original.side === DoubleSide) {
            front = state.materials.get(original);
            if (!front) {
              front = original.clone(); front.side = FrontSide;
              // Preserve the original two-sided shadow depth pass.
              front.shadowSide = original.shadowSide ?? DoubleSide;
              state.materials.set(original, front);
            }
          }
          const extent = solid.getSize(new Vector3()).multiply(node.getWorldScale(new Vector3())).toArray().map(Math.abs).sort((a,b)=>b-a);
          boxes.push({ node, original, front, fullBox: solid, box: solid.clone().expandByScalar(-Math.min(...solid.getSize(new Vector3()).toArray()) * 1e-4),
            inverse: node.matrixWorld.clone().invert(), area: extent[0]*extent[1] });
        });
        entries.push({ object, originalVisible: object.visible, visible, dynamic, box, corners: boxCorners(box), boxes });
      });
      state.entries = entries;
      state.transmission = false;
      scene.traverse(node => { if ([node.material].flat().some(m=>m?.transmission > 0)) state.transmission = true; });
      // Bound CPU work. Small trim pieces are poor occluders.
      state.occluders = entries.filter(e=>e.visible && !e.dynamic).flatMap(e=>e.boxes.map(b=>({...b, owner:e}))).filter(b=>b.area > 0.08).sort((a,b)=>b.area-a.area).slice(0,48);
    }
    camera.updateMatrixWorld();
    const shadow = gl.shadowMap.enabled && gl.shadowMap.needsUpdate;
    const off = scene.userData.renderOptimizationsDisabled === true;
    const noCull = off || state.transmission || scene.userData.occlusionDisabled === true || shadow;
    const noSide = off || scene.userData.singleSideDisabled === true;
    const flags = `${noCull}-${noSide}`;
    if (flags === state.lastFlags && state.projection.equals(camera.projectionMatrix) && state.view.equals(camera.matrixWorldInverse)) return;
    state.lastFlags = flags; state.projection.copy(camera.projectionMatrix); state.view.copy(camera.matrixWorldInverse);
    state.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse); state.frustum.setFromProjectionMatrix(state.matrix);
    camera.getWorldPosition(state.eye);
    let hidden = 0, outside = 0, singleSided = 0;
    for (const entry of state.entries) {
      let reason = '';
      if (!noCull && !entry.dynamic && entry.visible && !state.frustum.intersectsBox(entry.box)) reason = 'outside';
      if (!noCull && !entry.dynamic && entry.visible && !reason && camera.isPerspectiveCamera) {
        for (const blocker of state.occluders) {
          if (blocker.owner === entry) continue;
          if (boxFullyOccluded(state.eye,entry.corners,blocker)) { reason = 'occluded'; break; }
        }
      }
      entry.object.visible = entry.originalVisible && !reason;
      entry.object.userData.visibilityReason = reason;
      hidden += reason === 'occluded'; outside += reason === 'outside';
      for (const box of entry.boxes) {
        state.localEye.copy(state.eye).applyMatrix4(box.inverse);
        box.node.material = noSide || box.fullBox.containsPoint(state.localEye) ? box.original : box.front;
        singleSided += box.node.material !== box.original;
      }
    }
    scene.userData.renderOptimizationStats = { occluded: hidden, outside, singleSided, occluders: state.occluders.length };
    if (shadow) invalidate();
    });
  }, -0.5);
  return null;
}
