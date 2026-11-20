import { useLayoutEffect, useRef } from 'react';
import { registerResultSource } from './activeResults.js';
export { resultEntities } from './activeResults.js';

export default function useResultSource(source) {
  const latest = useRef(source);
  latest.current = source;
  useLayoutEffect(() => registerResultSource(latest, () => latest.current), []);
}
