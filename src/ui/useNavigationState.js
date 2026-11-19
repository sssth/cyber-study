import { useLayoutEffect, useRef, useState } from 'react';
import { hasRestoredView, registerView, rememberView, rememberedView, restoredView } from '../data/viewNavigation.js';

export function useNavigationState(scope, name, initial, { remember = true, preferInitial = false } = {}) {
  const key = `${scope}.${name}`;
  const [value, setValue] = useState(() => {
    if (hasRestoredView(key)) return restoredView(key);
    const fallback = typeof initial === 'function' ? initial() : initial;
    return remember && !preferInitial ? rememberedView(key, fallback) : fallback;
  });
  const current = useRef(value);
  current.current = value;
  useLayoutEffect(() => {
    if (remember) rememberView(key, value);
  }, [key, remember, value]);
  useLayoutEffect(() => registerView(key, () => current.current, setValue), [key]);
  return [value, setValue];
}

export function useNavigationScroll(key, root, selector) {
  // Keep each scroll region separate, including lists that swap DOM nodes.
  useLayoutEffect(() => {
    if (!key) return;
    const attached = new Map();
    const positions = { ...rememberedView(key, {}), ...restoredView(key, {}) };
    const save = (node, entry) => {
      if (entry.pending || !node.clientHeight) return;
      positions[entry.id] = { top: node.scrollTop, left: node.scrollLeft };
      rememberView(key, positions);
    };
    const restore = (node, entry) => {
      const position = positions[entry.id];
      if (!entry.pending || !position || !node.clientHeight) return;
      node.scrollTop = position.top;
      node.scrollLeft = position.left;
      entry.pending = Math.abs(node.scrollTop - position.top) > 1 || Math.abs(node.scrollLeft - position.left) > 1;
    };
    const reconcile = () => {
      const nodes = new Map();
      const counts = new Map();
      for (const node of root.current?.querySelectorAll(selector) ?? []) {
        const region = node.dataset.scrollMemory || node.classList[0] || node.tagName;
        const index = counts.get(region) ?? 0;
        counts.set(region, index + 1);
        nodes.set(node, `${region}:${index}`);
      }
      for (const [node, entry] of attached) {
        if (nodes.get(node) === entry.id) continue;
        if (!nodes.has(node)) save(node, entry);
        else if (!positions[nodes.get(node)]) {
          node.scrollTop = 0;
          node.scrollLeft = 0;
        }
        node.removeEventListener('scroll', entry.onScroll);
        attached.delete(node);
      }
      for (const [node, id] of nodes) {
        if (!attached.has(node)) {
          const entry = { id, pending: Boolean(positions[id]) };
          entry.onScroll = () => save(node, entry);
          node.addEventListener('scroll', entry.onScroll, { passive: true });
          attached.set(node, entry);
        }
        restore(node, attached.get(node));
      }
    };
    const cancelPending = event => {
      for (const [node, entry] of attached) {
        if (node.contains(event.target)) entry.pending = false;
      }
    };
    let observedRoot = root.current;
    const observer = new MutationObserver(records => {
      const currentRoot = root.current;
      if (currentRoot !== observedRoot || records.some(record => currentRoot?.contains(record.target))) {
        observedRoot = currentRoot;
        reconcile();
      }
    });
    // Observe the document so a conditional panel can replace the root itself.
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-scroll-memory'] });
    document.addEventListener('wheel', cancelPending, true);
    document.addEventListener('pointerdown', cancelPending, true);
    reconcile();
    const unregister = registerView(key, () => {
      for (const [node, entry] of attached) save(node, entry);
      return { ...positions };
    }, snapshot => {
      Object.assign(positions, snapshot);
      for (const entry of attached.values()) entry.pending = true;
      reconcile();
    });
    return () => {
      observer.disconnect();
      unregister();
      document.removeEventListener('wheel', cancelPending, true);
      document.removeEventListener('pointerdown', cancelPending, true);
      for (const [node, entry] of attached) {
        save(node, entry);
        node.removeEventListener('scroll', entry.onScroll);
      }
    };
  }, [key, root, selector]);
}
