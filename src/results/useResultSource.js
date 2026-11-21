import { useLayoutEffect, useRef } from 'react';
import { registerResultSource } from './activeResults.js';
import { getSelection, validateSelection } from '../entities/entitySelection.js';
export { resultEntities } from './activeResults.js';

export default function useResultSource(source) {
  const latest = useRef(source);
  latest.current = source;
  useLayoutEffect(() => { if (getSelection()) queueMicrotask(validateSelection); });
  useLayoutEffect(() => () => { if (getSelection()) queueMicrotask(validateSelection); }, []);
  useLayoutEffect(() => registerResultSource(latest, () => latest.current), []);
}
