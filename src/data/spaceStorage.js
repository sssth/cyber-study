const prefix = 'cyber-study.space.v1';

export function loadSpaceData(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(`${prefix}.${key}`);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : structuredClone(fallback);
    if (fallback && typeof fallback === 'object') {
      return { ...structuredClone(fallback), ...(parsed ?? {}) };
    }
    return parsed ?? fallback;
  } catch {
    return structuredClone(fallback);
  }
}

export function saveSpaceData(key, value) {
  try {
    globalThis.localStorage.setItem(`${prefix}.${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function createId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readImageFile(file, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('请选择图片。'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('仅支持图片文件。'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error('图片过大，请选择 2MB 以内文件。'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(file);
  });
}
