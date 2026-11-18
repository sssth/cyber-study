import { useLayoutEffect, useRef, useState } from 'react';
import { registerView, restoredView } from '../data/viewNavigation.js';
export function useNavigationState(scope, name, initial) {
  const key = `${scope}.${name}`;
  const [value, setValue] = useState(() => restoredView(key, initial));
  const current = useRef(value); current.current = value;
  useLayoutEffect(() => registerView(key, () => current.current, setValue), [key]);
  return [value, setValue];
}
export function useNavigationScroll(key, root, selector) {
  useLayoutEffect(() => {
    const nodes = () => [...(root.current?.querySelectorAll(selector) || [])];
    const apply = positions => nodes().forEach((node, index) => { node.scrollTop = positions?.[index]?.top || 0; node.scrollLeft = positions?.[index]?.left || 0; });
    apply(restoredView(key, []));
    return registerView(key, () => nodes().map(node => ({ top: node.scrollTop, left: node.scrollLeft })), apply);
  }, [key, root, selector]);
}
