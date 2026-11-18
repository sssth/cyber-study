import { useEffect, useRef, useState } from 'react';

export default function RecordShelf({ records, selectedId, onSelect, title, count, children }) {
  const shelf = useRef(null);
  const touchStart = useRef(null);
  const suppressClick = useRef(false);
  const wheelUntil = useRef(0);
  const [opened, setOpened] = useState(null);
  const index = records.findIndex(record => record.id === selectedId);
  useEffect(() => { setOpened(null); }, [selectedId]);
  function move(direction) {
    const next = records[index + direction];
    if (next) onSelect(next.id);
  }
  function wheel(event) {
    if (event.ctrlKey || !records.length) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 2) return;
    const now = performance.now();
    if (now >= wheelUntil.current) move(Math.sign(delta));
    wheelUntil.current = now + 110;
  }
  return <aside className="record-shelf" aria-label="歌单唱片架">
    <div ref={shelf} className="record-shelf-stage" onWheel={wheel}
      onTouchStart={event => { touchStart.current = event.touches[0].clientX; suppressClick.current = false; }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={event => {
        if (touchStart.current === null) return;
        const distance = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(distance) > 32) { suppressClick.current = true; move(-Math.sign(distance)); }
      }}
      onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.stopPropagation(); } }}
      onPointerDown={event => { if (event.pointerType !== 'touch') suppressClick.current = false; }}
      onKeyDown={event => {
        if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        shelf.current.focus();
        move(event.key === 'ArrowRight' ? 1 : -1);
      }} tabIndex={0} aria-label="左右翻唱片">
      {records.map((record, position) => {
        const distance = position - index;
        return children(record, distance, opened === record.id, () => {
          if (distance) onSelect(record.id);
          else setOpened(opened === record.id ? null : record.id);
        });
      })}
    </div>
    <div className="record-shelf-nav">
      <button type="button" aria-label="上一张唱片" disabled={index <= 0} onClick={() => move(-1)}>‹</button>
      <div aria-live="polite"><strong>{title || '暂无歌单'}</strong>{index >= 0 && <small>{index + 1} / {records.length} 张 · {count} 首</small>}</div>
      <button type="button" aria-label="下一张唱片" disabled={index < 0 || index >= records.length - 1} onClick={() => move(1)}>›</button>
    </div>
  </aside>;
}
