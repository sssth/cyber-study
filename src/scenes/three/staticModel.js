import { Mesh } from 'three';
import { MeshBVH, acceleratedRaycast, CENTER } from 'three-mesh-bvh';

// GLTF furniture is static; keep its authored transforms and bounds reusable.
// Outer React groups remain dynamic for placement and editor changes.
export function prepareStaticModel(object, interactive = false) {
  object.traverse(node => {
    if (!node.isBone && !node.isSkinnedMesh) {
      node.updateMatrix();
      node.matrixAutoUpdate = false;
    }
    if (node.isMesh && !node.isSkinnedMesh && !node.morphTargetInfluences) {
      const geometry = node.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      // Keep triangle/index order intact, including multi-material GLTF groups.
      // Build once per shared geometry, only for meshes that receive input.
      if (interactive && node.raycast === Mesh.prototype.raycast) {
        if (!geometry.boundsTree) geometry.boundsTree = new MeshBVH(geometry, {
          strategy: CENTER, maxLeafTris: 16, indirect: true
        });
        node.raycast = acceleratedRaycast;
      }
    }
  });
  return object;
}
