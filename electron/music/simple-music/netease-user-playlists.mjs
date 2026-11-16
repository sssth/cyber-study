// From Simple Music v2.7.0. See NOTICE.md and LICENSE.
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
function itemKey(item) {
  if (!item || typeof item !== "object") return "";
  const id = item.id;
  return id === void 0 || id === null ? "" : String(id);
}
async function collectNeteaseUserPlaylists(fetchPage, maxItems = 2e3) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  let offset = 0;
  for (let pageIndex = 0; pageIndex < MAX_PAGES && result.length < maxItems; pageIndex++) {
    const limit = Math.min(PAGE_SIZE, maxItems - result.length);
    let page;
    try {
      page = await fetchPage(offset, limit);
    } catch (error) {
      if (result.length === 0) throw error;
      break;
    }
    if (page.items.length === 0) break;
    let added = 0;
    for (const item of page.items) {
      const key = itemKey(item);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      result.push(item);
      added++;
      if (result.length >= maxItems) break;
    }
    if (added === 0) break;
    offset += page.items.length;
    const probeAfterLikedOnly = pageIndex === 0 && page.items.length === 1 && !page.more;
    if (!page.more && !probeAfterLikedOnly) break;
  }
  return result;
}
export {
  collectNeteaseUserPlaylists
};
