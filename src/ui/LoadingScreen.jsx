import { translateError } from '../i18n/index.js';
import { Component } from 'react';

export function LoadingScreen({ title, percent = 0, detail, done = false, error, panel = false }) {
  return (
    <div
      className={`loading-screen${done ? ' loading-screen-done' : ''}${panel ? ' loading-screen-panel' : ''}`}
      aria-hidden={done || undefined}
    >
      <div className="loading-card">
        {error ? <p role="alert">{translateError(error)}</p> : (
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

// Render the destination shell in the same commit as navigation. Waiting for
// every image hid the entire page and briefly exposed the 3D room; slow assets
// now use their own image/model loading states without blocking the page.
export function PanelLoading({ children }) {
  return children;
}
