import { useLayoutEffect, useState } from 'react';

// The edge has no visible handle and does not intercept reading or typing.
export default function useImmersiveTools(active) {
  const [revealed, setRevealed] = useState(false);
  useLayoutEffect(() => {
    if (!active) { setRevealed(false); return; }
    const hide = () => setRevealed(false);
    const move = event => {
      if (document.querySelector('dialog:modal')) return;
      if (event.clientX >= document.documentElement.clientWidth - 10) {
        setRevealed(true);
        return;
      }
      if (!revealed) return;
      const bounds = [...document.querySelectorAll('.command-toolbar, .usage-tip')]
        .filter(node => node.checkVisibility()).map(node => node.getBoundingClientRect());
      const within = bounds.length && event.clientX >= Math.min(...bounds.map(rect => rect.left)) - 6 &&
        event.clientY >= Math.min(...bounds.map(rect => rect.top)) - 6 &&
        event.clientY <= Math.max(...bounds.map(rect => rect.bottom)) + 6;
      if (!within) hide();
    };
    document.addEventListener('pointermove', move);
    document.documentElement.addEventListener('pointerleave', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', hide);
      window.removeEventListener('blur', hide);
    };
  }, [active, revealed]);
  return active ? (revealed ? 'shown' : 'hidden') : undefined;
}
