import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { extendSceneLoader } from './geometryRanges.js';
import { createAssetLifetime, disposeModel, releaseParser } from './assetLifetime.js';

const lifetime = createAssetLifetime((url, gltf) => {
  useGLTF.clear(url);
  disposeModel(gltf);
});
export function useSceneGLTF(url) {
  const gltf = useGLTF(url, true, true, extendSceneLoader);
  useEffect(() => {
    releaseParser(gltf);
    return lifetime.retain(url, gltf);
  }, [url, gltf]);
  return gltf;
}
