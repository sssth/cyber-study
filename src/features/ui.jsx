export function FeaturePanel({ title, kicker, description, onClose, children, wide = false }) {
  return (
    <section className={`feature-overlay ${wide ? 'feature-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="feature-shell">
        <header className="feature-header">
          <div>
            <p>{kicker}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose}>返回书房</button>
        </header>
        {description && <p className="feature-description">{description}</p>}
        <div className="feature-body">{children}</div>
      </div>
    </section>
  );
}

export function EmptyState({ children }) {
  return <p className="empty-state">{children}</p>;
}
