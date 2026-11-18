export default function DisplayViewMenu({ label, options, value, onChange, children }) {
  return <div className="shelf-view-bar"><div role="group" aria-label={label}>{options.map(([id, text]) => <button key={id} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>{children}</div>;
}
