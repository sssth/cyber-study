import {encodeCollection} from './knowledgeRecords.js';
import { storeCollection, changeArchived, archivePlaylists } from './recycleStorage.js';
const prefix = 'cyber-study.space.v1';

export function loadSpaceData(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(`${prefix}.${key}`);
    if (!raw) return structuredClone(fallback);
    let parsed = JSON.parse(raw);
    // Upgrade in one localStorage write. A quota failure still leaves the old data readable.
    const migrated=encodeCollection(key,parsed);
    if(migrated!==parsed){
      parsed=migrated;
      try { if(globalThis.localStorage.getItem(prefix+'.'+key)===raw)globalThis.localStorage.setItem(prefix+'.'+key,JSON.stringify(parsed)); } catch { /* Retry on the next load. */ }
    }
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
    storeCollection(globalThis.localStorage, prefix, key, value);
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

export const contentDataChangeEvent = 'cyber-content-data-changed';

export function saveContentData(key, value) {
  try {
    const storageKey = `${prefix}.${key}`;
    const data = JSON.stringify(value);
    if (globalThis.localStorage.getItem(storageKey) === data) return true;
    storeCollection(globalThis.localStorage, prefix, key, value);
  } catch {
    return false;
  }
  globalThis.window?.dispatchEvent(new CustomEvent(contentDataChangeEvent, { detail: key }));
  return true;
}

export function changeRecycledItem(token, action, collection) {
  changeArchived(globalThis.localStorage, prefix, token, action);
  window.dispatchEvent(new CustomEvent(contentDataChangeEvent, { detail: collection }));
  if (action === 'restore' && collection === 'playlists') window.dispatchEvent(new CustomEvent('cyber-bulk-updated', { detail: 'music' }));
  if (action === 'restore') window.dispatchEvent(new CustomEvent('cyber-bulk-updated', { detail: collection }));
}

export function recyclePlaylists(ids) {
  archivePlaylists(globalThis.localStorage, prefix, ids);
  for (const detail of ['music', 'playlists']) {
    window.dispatchEvent(new CustomEvent('cyber-bulk-updated', { detail }));
  }
  window.dispatchEvent(new CustomEvent(contentDataChangeEvent, { detail: 'playlists' }));
}
