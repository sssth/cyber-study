import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { extendSceneLoader } from './geometryRanges.js';
import { createAssetLifetime, disposeModel, releaseParser } from './assetLifetime.js';

const lifetime = createAssetLifetime((url, gltf) => {
  useGLTF.clear(url);
  disposeModel(gltf);
});
export function useSceneGLTF(url, keepAliveMs = 0) {
  const gltf = useGLTF(url, true, true, extendSceneLoader);
  useEffect(() => {
    releaseParser(gltf);
    return lifetime.retain(url, gltf, keepAliveMs);
  }, [url, gltf, keepAliveMs]);
  return gltf;
}

// Start independent URL-keyed loads together. An array-keyed useGLTF request
// would create different objects for ornaments shared by both shelf sets.
export function preloadSceneGLTFs(urls) {
  for (const url of new Set(urls)) useGLTF.preload(url, true, true, extendSceneLoader);
}
