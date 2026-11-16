import { useState } from 'react';

import { shortcutKey } from '../data/shortcuts.js';

export default function ShortcutSettings({ groups, bindings, onChange, onBack }) {
  const [recording, setRecording] = useState(null);
  const [message, setMessage] = useState('');

  function record(event, id, index, actions) {
    const key = shortcutKey(event);
    if (!key || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();

    const conflict = actions.find(([otherId]) => otherId !== id && bindings[otherId].includes(key));
    if (conflict) {
      setMessage(`${key} 已用于「${conflict[1]}」，请先修改该快捷键或按其他键。`);
      return;
    }

    const keys = [...bindings[id]];
    keys[index] = key;
    if (onChange({ ...bindings, [id]: [...new Set(keys)] })) setRecording(null);
  }

  return (
    <section className="interaction-list shortcut-settings" id="room-interactions" aria-labelledby="shortcut-title">
      <header>
        <h2 id="shortcut-title">快捷键设置</h2>
        <button type="button" autoFocus onClick={onBack}>返回菜单</button>
      </header>
      <p>点击键位后按下新键。清空后可用「设键」重新绑定。</p>
      {message && <p role="status">{message}</p>}
      {groups.map(([label, scope, actions]) => (
        <section key={scope} className="interaction-group" aria-labelledby={`shortcuts-${scope}`}>
          <h2 id={`shortcuts-${scope}`}>{label}</h2>
          {actions.map(([id, name]) => {
            const keys = bindings[id];
            return (
              <div className="shortcut-row" key={id}>
                <span>{name}</span>
                <div className="shortcut-keys">
                  {(keys.length ? keys : ['设键']).map((key, index) => {
                    const active = recording?.id === id && recording.index === index;
                    return (
                      <button type="button" key={index} aria-label={`${name} · ${active ? '请按键' : key}`}
                        onBlur={() => setRecording(null)}
                        onClick={() => {
                          setMessage('');
                          setRecording(active ? null : { id, index });
                        }}
                        onKeyDown={active ? event => record(event, id, index, actions) : undefined}>
                        {active ? '请按键…' : key}
                      </button>
                    );
                  })}
                  <button type="button" disabled={!keys.length} aria-label={`清空${name}`}
                    onClick={() => {
                      setMessage('');
                      onChange({ ...bindings, [id]: [] });
                    }}>清空</button>
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <button type="button" onClick={() => {
        setMessage('');
        onChange(Object.fromEntries(groups.flatMap(([, , actions]) =>
          actions.map(([id, , defaults]) => [id, defaults]))));
      }}>恢复默认快捷键</button>
    </section>
  );
}
