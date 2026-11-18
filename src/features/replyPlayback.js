// The API can deliver several tokens in a burst. Reveal small bursts one
// character per frame, and catch up faster when the network gets ahead.
export function replyPlayback(show) {
  let pending = '', shown = '', frame = 0, deadline, done;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  function paint() {
    frame = 0;
    const count = Math.max(1, Math.ceil(pending.length / 18));
    let end = 0, i = 0;
    for (const { segment } of segmenter.segment(pending)) {
      end += segment.length;
      if (++i >= count) break;
    }
    shown += pending.slice(0, end);
    pending = pending.slice(end);
    show(shown);
    if (pending) frame = requestAnimationFrame(paint);
    else done?.();
  }
  function stop() {
    cancelAnimationFrame(frame);
    clearTimeout(deadline);
    done?.();
  }
  return {
    append(text) {
      pending += text;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    async finish(fullText) {
      // The completed response is authoritative even if a final IPC event is late.
      pending = fullText.slice(shown.length);
      if (!pending || document.hidden) return;
      if (!frame) frame = requestAnimationFrame(paint);
      await new Promise(resolve => {
        done = resolve;
        deadline = setTimeout(resolve, 250);
      });
    },
    stop
  };
}
