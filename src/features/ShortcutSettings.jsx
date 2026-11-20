import { translate } from '../i18n/index.js';
import { useState } from 'react';

import { shortcutKey, translateShortcutLabel } from '../data/shortcuts.js';

export default function ShortcutSettings({ groups, bindings, onChange, onBack }) {
  const [recording, setRecording] = useState(null);
  const [message, setMessage] = useState(null);

  function record(event, id, index, actions) {
    const key = shortcutKey(event);
    if (!key || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();

    if (id === 'search' && key === 'Esc') {
      setMessage(["i18n.escGoesBackAndCannotBeAssigned"]);
      return;
    }

    const globalActions = groups.find(([, scope]) => scope === 'global')[2];
    const isGlobal = action => globalActions.some(([actionId]) => actionId === action);
    const conflict = groups.flatMap(([, , rows]) => rows).find(([otherId]) =>
      otherId !== id && bindings[otherId].includes(key) &&
      (isGlobal(id) || isGlobal(otherId) || actions.some(([actionId]) => actionId === otherId))
    );
    if (conflict) {
      setMessage(["i18n.0IsAssignedTo1ChangeThat", key, conflict[1]]);
      return;
    }

    const keys = [...bindings[id]];
    keys[index] = key;
    if (onChange({ ...bindings, [id]: [...new Set(keys)] })) setRecording(null);
  }

  return (
    <section className="interaction-list shortcut-settings" id="room-interactions" aria-labelledby="shortcut-title">
      <header>
        <h2 id="shortcut-title">{translate("i18n.keyboardShortcuts")}</h2>
        <button type="button" autoFocus onClick={onBack}>{translate("i18n.backToMenu")}</button>
      </header>

      {message && <p role="status">{translate(message[0], ...message.slice(1).map(translateShortcutLabel))}</p>}
      {groups.map(([label, scope, actions]) => (
        <section key={scope} className="interaction-group" aria-labelledby={`shortcuts-${scope}`}>
          <h2 id={`shortcuts-${scope}`}>{translate(label)}</h2>
          {actions.map(([id, label]) => {
            const name = translateShortcutLabel(label);
            const keys = bindings[id];
            return (
              <div className="shortcut-row" key={id}>
                <span>{name}</span>
                <div className="shortcut-keys">
                  {(keys.length ? keys : [translate("i18n.assignKey")]).map((key, index) => {
                    const active = recording?.id === id && recording.index === index;
                    return (
                      <button type="button" key={index} aria-label={`${name} · ${active ? translate("i18n.pressAKey") : key}`}
                        onBlur={() => setRecording(null)}
                        onClick={() => {
                          setMessage(null);
                          setRecording(active ? null : { id, index });
                        }}
                        onKeyDown={active ? event => record(event, id, index, actions) : undefined}>
                        {active ? translate("i18n.pressAKey2") : key}
                      </button>
                    );
                  })}
                  <button type="button" disabled={!keys.length} aria-label={translate("i18n.clear0", name)}
                    onClick={() => {
                      setMessage(null);
                      onChange({ ...bindings, [id]: [] });
                    }}>{translate("i18n.clear")}</button>
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <button type="button" onClick={() => {
        setMessage(null);
        onChange(Object.fromEntries(groups.flatMap(([, , actions]) =>
          actions.map(([id, , defaults]) => [id, defaults]))));
      }}>{translate("i18n.restoreDefaultShortcuts")}</button>
    </section>
  );
}
