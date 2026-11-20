import { translate } from "../i18n/index.js";

export default function DisplayViewMenu({ label, options, value, onChange, children }) {
  return <div className="shelf-view-bar"><div role="group" aria-label={label}>{options.map(([id, text]) => <button key={id} aria-pressed={value === id} onClick={() => onChange(id)}>{translate(text)}</button>)}</div>{children}</div>;
}
