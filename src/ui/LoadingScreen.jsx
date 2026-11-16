import { Component, useEffect, useRef, useState } from 'react';

export function LoadingScreen({ title, percent = 0, detail, done = false, error, panel = false }) {
  return (
    <div
      className={`loading-screen${done ? ' loading-screen-done' : ''}${panel ? ' loading-screen-panel' : ''}`}
      aria-hidden={done || undefined}
    >
      <div className="loading-card">
        {error ? <p role="alert">{error}</p> : (
          <>
            <div className="loading-heading"><strong>{title}</strong><span aria-hidden="true">{percent}%</span></div>
            <progress aria-label={title} value={percent} max={100} />
            {detail && <p>{detail}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export class LoadingBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch() { this.props.onError?.(); }

  render() {
    return this.state.failed
      ? <LoadingScreen error={this.props.message} panel={this.props.panel} />
      : this.props.children;
  }
}

export function PanelLoading({ title, children }) {
  const content = useRef(null);
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0, ready: false });

  useEffect(() => {
    let disposed = false;
    let reveal;
    const delay = setTimeout(() => setShowProgress(true), 120);
    const prepare = requestAnimationFrame(async () => {
      const images = Array.from(content.current.querySelectorAll('img'));
      setProgress({ loaded: 0, total: images.length, ready: false });
      await Promise.all(images.map(async image => {
        try { await image.decode(); }
        catch { /* A failed image must not block the rest of the panel. */ }
        if (!disposed) setProgress(current => ({ ...current, loaded: current.loaded + 1 }));
      }));
      if (disposed) return;
      reveal = requestAnimationFrame(() => {
        clearTimeout(delay);
        setProgress(current => ({ ...current, ready: true }));
      });
    });
    return () => {
      disposed = true;
      clearTimeout(delay);
      cancelAnimationFrame(prepare);
      cancelAnimationFrame(reveal);
    };
  }, []);

  const percent = progress.ready ? 100 : Math.floor(99 * progress.loaded / (progress.total || 1));
  return <>
    <div ref={content} className={progress.ready ? undefined : 'loading-panel-content'} inert={!progress.ready}>
      {children}
    </div>
    {showProgress && <LoadingScreen title={title} percent={percent} done={progress.ready} panel
      detail={progress.total ? `图片 ${progress.loaded} / ${progress.total}` : undefined} />}
  </>;
}
