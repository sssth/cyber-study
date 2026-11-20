import { useEffect, useState } from 'react';
import '../../../shared/contentAssets.js';

export const bookCoverAssets = globalThis.ContentAssets.repository('cyber-study-content-assets-v1');
export function useBookCover(book) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true, revision = 0, current;
    async function refresh() {
      const version = ++revision;
      try {
        const record = await bookCoverAssets.get(`book:${book.id}`);
        const asset = record.imageAssetIds?.at(-1) && await bookCoverAssets.asset(record.imageAssetIds.at(-1));
        const next = asset ? URL.createObjectURL(asset.blob) : null;
        if (!alive || version !== revision) { if (next) URL.revokeObjectURL(next); return; }
        if (current) URL.revokeObjectURL(current);
        current = next; setUrl(next);
      } catch { /* Keep the title cover available. */ }
    }
    refresh(); window.addEventListener('cyber-content-changed', refresh);
    return () => { alive = false; if (current) URL.revokeObjectURL(current); window.removeEventListener('cyber-content-changed', refresh); };
  }, [book.id]);
  return url || book.cover || null;
}
export function coverHue(book) { return [...book.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 100 + 160; }
