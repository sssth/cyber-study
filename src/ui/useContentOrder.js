import {useEffect, useState} from 'react';
import {readOrderState} from '../data/contentOrder.js';

export default function useContentOrder() {
  const [state, setState] = useState(readOrderState);
  useEffect(() => {
    const refresh = () => setState(readOrderState());
    window.addEventListener('cyber-order-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('cyber-order-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return state;
}
