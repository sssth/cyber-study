import { useState } from 'react';

export default function useMenuSwitch(key) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(key) !== 'false'; }
    catch { return true; }
  });
  return [enabled, value => {
    setEnabled(value);
    try { localStorage.setItem(key, String(value)); }
    catch { /* Keep the choice for this session. */ }
  }];
}
