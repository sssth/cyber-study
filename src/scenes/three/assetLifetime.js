// Assets are shared by room instances and care previews. A deferred release also
// tolerates React StrictMode's cleanup/remount cycle without destroying live data.
export function createAssetLifetime(dispose, defer = queueMicrotask) {
  const entries = new Map();
  return {
    retain(key, value) {
      let entry = entries.get(key);
      if (!entry) { entry = { value, users: 0 }; entries.set(key, entry); }
      if (entry.value !== value) throw Error('Shared asset identity changed while in use');
      entry.users++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        entry.users--;
        defer(() => {
          if (entry.users || entries.get(key) !== entry) return;
          entries.delete(key);
          dispose(key, entry.value);
        });
      };
    },
    get size() { return entries.size; }
  };
}

export function disposeModel(gltf) {
  const resources = new Set();
  for (const scene of gltf.scenes ?? [gltf.scene]) scene.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    if (node.skeleton) resources.add(node.skeleton);
    for (const material of [node.material].flat().filter(Boolean)) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) {
    if (resource.isBufferGeometry) resource.disposeBoundsTree?.();
    resource.dispose();
  }
  // Images may be shared by other GLTF loaders, so do not close ImageBitmap here.
}

// This application uses the loaded scenes/animations, never incremental parser
// dependencies. Release decoded source buffers and encoded images after loading.
export function releaseParser(gltf) {
  if (!gltf.parser) return;
  gltf.parser.cache.removeAll();
  gltf.parser = null;
}
