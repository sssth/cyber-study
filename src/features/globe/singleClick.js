// Defer navigation until the shared double-click window has elapsed.
export function createSingleClick(delay = 420) {
  let timer;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  return {
    cancel,
    run(detail, action) {
      cancel();
      if (detail > 1) return;
      timer = setTimeout(() => { timer = undefined; action(); }, delay);
    }
  };
}
