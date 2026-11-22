import { useEffect, useMemo, useState } from 'react';
import { loadActivity } from '../data/activityTime.js';
import { saveSpaceData } from '../data/spaceStorage.js';
import { translate as t, useLanguage } from '../i18n/index.js';
import { textMatches } from '../search/searchCore.js';
import { useSearchCount } from '../search/useSearchScope.jsx';
import { ActionWorkspace, WorkspaceActions, WorkspaceFields } from '../features/ui.jsx';
import { ContentCommand } from '../features/ContentCommands.jsx';
import useEscapeBack from '../ui/useEscapeBack.js';
import { groups, groupName, itemName, activityMetric, entityMetrics, readLayout, layoutKey, newGroup } from './statistics.js';

function move(list, index, offset) {
  const next = list.slice();
  next.splice(index + offset, 0, next.splice(index, 1)[0]);
  return next;
}
export default function StatisticsPage({ catalog, partial, search }) {
  const [layout, setLayout] = useState(readLayout);
  const [drag, setDrag] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEscapeBack(() => { setEditing(null); setCreating(false); }, { blocked: () => !editing && !creating, capture: true, stop: true });
  const language = useLanguage();
  const metrics = useMemo(() => catalog && entityMetrics(catalog, now), [catalog, now, language]);
  const activity = useMemo(() => loadActivity(now), [now]);
  const visible = layout.map(group => textMatches([groupName(group.id)], search.query) ? group :
    { ...group, items: group.items.filter(id => textMatches([itemName(id)], search.query)) })
    .filter(group => group.items.length || textMatches([groupName(group.id)], search.query));
  useSearchCount('entity-statistics', visible.reduce((sum,g) => sum + g.items.length, 0));
  const group = layout.find(group => group.id === editing?.group);
  const item = editing?.item;
  const canDrag = Boolean(group) && !creating;
  const available = Object.keys(groups).filter(id => !layout.some(group => group.id === id));
  function save(next, close = false) {
    if (!saveSpaceData(layoutKey, next)) { setError(t('i18n.couldNotSaveLocalStorageMayBe')); return; }
    setLayout(next); setError('');
    if (close) { setEditing(null); setCreating(false); }
  }
  function changeItems(items, close) {
    save(layout.map(g => g === group ? { ...g, items } : g), close);
  }
  function open(group, item) {
    setCreating(false); setError(''); setEditing({ group, item });
  }
  function dragProps(parent, id) {
    const accepts = canDrag && drag?.parent === parent && drag.id !== id;
    return {
      draggable: canDrag,
      'data-drop-before': accepts && drag.target === id || undefined,
      onDragStart(event) {
        event.stopPropagation();
        if (!canDrag) { event.preventDefault(); return; }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-study-statistic', id);
        setDrag({ parent, id });
      },
      onDragOver(event) {
        if (!accepts) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        if (drag.target !== id) setDrag({ ...drag, target: id });
      },
      onDragLeave(event) {
        if (accepts && drag.target === id && !event.currentTarget.contains(event.relatedTarget)) {
          setDrag({ ...drag, target: null });
        }
      },
      onDrop(event) {
        if (!accepts) return;
        event.preventDefault();
        event.stopPropagation();
        setDrag(null);
        const shown = parent === null ? visible.map(entry => entry.id) : visible.find(entry => entry.id === parent).items;
        const from = shown.indexOf(drag.id);
        const to = shown.indexOf(id);
        if (from < 0 || to < 0) return;
        const ordered = move(shown, from, to - from);
        const slots = new Set(shown);
        let index = 0;
        if (parent === null) {
          const byId = new Map(layout.map(entry => [entry.id, entry]));
          save(layout.map(entry => slots.has(entry.id) ? byId.get(ordered[index++]) : entry));
        } else {
          save(layout.map(entry => entry.id !== parent ? entry : {
            ...entry, items: entry.items.map(key => slots.has(key) ? ordered[index++] : key)
          }));
        }
      },
      onDragEnd() { setDrag(null); }
    };
  }
  function card(group, id) {
    const value = activityMetric(id, activity, now) ?? metrics?.[id] ?? '…';
    return <button type="button" key={id} data-edit-item aria-label={itemName(id)} {...dragProps(group, id)}>
      <ContentCommand label={itemName(id)} run={() => open(group, id)} />
      <span>{itemName(id)}</span>
      <strong>{value}</strong>
    </button>;
  }
  return <>
    <ActionWorkspace label="i18n.statsAddGroup" open={creating} onOpenChange={setCreating} onCreate={() => { setEditing(null); setError(''); }}>
      <div className="stack-form">{available.map(id => <button key={id} onClick={() => save([...layout, newGroup(id)], true)}>{groupName(id)}</button>)}
        {!available.length && <p>{t('i18n.statAllAdded')}</p>}{error && <p role="alert">{error}</p>}
      </div>
    </ActionWorkspace>
    <section className="entity-catalog statistics-grid" aria-label={t('i18n.statistics')}>
      {visible.map(group => <section className="stat-group" key={group.id} data-edit-item {...dragProps(null, group.id)}>
        <ContentCommand label={groupName(group.id)} run={() => open(group.id)} />
        <h3><button type="button" data-edit-item onKeyDown={e => { if (e.key === 'Enter') open(group.id); }}>
          <ContentCommand label={groupName(group.id)} run={() => open(group.id)} />{groupName(group.id)}
        </button></h3>
        <div className="stat-items">{group.items.map(id => card(group.id,id))}</div>
        {!group.items.length && <p>{t('i18n.statsEmptyGroup')}</p>}
      </section>)}
      {!visible.length && <p role="status">{t(layout.length ? 'i18n.binNoMatches' : 'i18n.statEmpty')}</p>}
    </section>
    {error && !group && !creating && <p role="alert">{error}</p>}
    {partial && <p role="status">{t('i18n.statPartial')}</p>}
    {group && <ActionWorkspace kind="edit" title={item ? itemName(item) : groupName(group.id)} open command={false} showTrigger={false} onOpenChange={open => { if (!open) setEditing(null); }}>
      <div className="stack-form">
        <WorkspaceFields>
          {item && <strong>{itemName(item)}</strong>}
          {!item && <fieldset className="stat-add-items"><legend>{t('i18n.statsAddItem')}</legend>
            {groups[group.id].filter(id => !group.items.includes(id)).map(id => <button key={id} onClick={() => changeItems([...group.items,id])}>{itemName(id)}</button>)}
            {group.items.length === groups[group.id].length && <p>{t('i18n.statsNoMoreItems')}</p>}
          </fieldset>}
          {error && <p role="alert">{error}</p>}
        </WorkspaceFields>
        <WorkspaceActions>
          <button onClick={() => {
            if (item) changeItems(group.items.filter(id => id !== item), true);
            else if (window.confirm(t('i18n.statsRemoveGroupPrompt', groupName(group.id), group.items.length))) save(layout.filter(g => g !== group), true);
          }}>{t(item ? 'i18n.statsRemoveItem' : 'i18n.statsRemoveGroup')}</button>
        </WorkspaceActions>
      </div>
    </ActionWorkspace>}
  </>;
}
