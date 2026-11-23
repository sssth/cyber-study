import { toggleVisibleIds } from './entitySelection.js';
import { ContentCommand } from '../features/ContentCommands.jsx';
import { ActionWorkspace, WorkspaceActions, WorkspaceFields } from '../features/ui.jsx';
import useResultSource from '../results/useResultSource.js';
import { useEffect, useRef, useState } from 'react';
import { changeRecycledItem, loadSpaceData } from '../data/spaceStorage.js';
import { queryEntities } from '../search/searchCore.js';
import { useSearchCount } from '../search/useSearchScope.jsx';
import { contentTypes, entityTypes } from './registry.js';
import { translate as t } from '../i18n/index.js';

async function readBin() {
  const api = window.cyberStudy;
  const [books, globe] = await Promise.all([api?.bookTrash?.('list'), api?.globe?.('list')]);
  if (globe?.error) throw Error(globe.error);
  const rows = [...loadSpaceData('recycle', []), ...(books ?? [])];
  for (const [type, records] of [['journey', globe?.deletedJourneys], ['memory_point', globe?.photos]]) {
    for (const record of records ?? []) if (record.deletedAt) {
      rows.push({ type, record, token: type + ':' + record.id, time: Date.parse(record.deletedAt) });
    }
  }
  return rows.sort((a,b) => b.time - a.time).map(entry => ({
    ...entry.record, ...entry, deletedAt: undefined,
    title: entityTypes[entry.type]?.title?.(entry.record) || entry.record.title || entry.record.text?.slice(0,40) || t('i18n.untitled')
  }));
}

export default function RecycleBin({ search, revision, onBooksChanged }) {
  const [rows, setRows] = useState(null);
  const [selected, select] = useState([]);
  const [editorTokens, edit] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [version, reload] = useState(0);
  useEffect(() => {
    let active = true;
    readBin().then(items => { if (active) setRows(items); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [revision,version]);
  const visible = queryEntities(rows ?? [], search);
  const picked = visible.filter(row => selected.includes(row.token));
  useSearchCount('entity-trash', rows ? visible.length : null);
  const targets = visible.filter(row => editorTokens.includes(row.token));
  const editing = targets.length > 0;
  const closeEditor = () => { if (!lock.current) edit([]); };
  function openEditor(row) {
    if (lock.current) return;
    setError('');
    if (row && !picked.some(item => item.token === row.token)) {
      select([]);
      edit([row.token]);
    } else edit(picked.map(item => item.token));
  }
  useResultSource({
    scopeId: 'entity-trash', priority: 56, blocked: true, matches: [],
    selectVisible() {
      if (lock.current) return;
      edit([]);
      select(toggleVisibleIds(picked.map(row => row.token), visible.map(row => row.token)));
    },
    editSelected: picked.length && !editing ? () => openEditor() : undefined
  });
  async function apply(action) {
    if (lock.current || !targets.length) return;
    if (action === 'purge' && !window.confirm(t('i18n.confirmPurge', targets.length))) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      // Restore parents first when the selection contains both an excerpt and its annotations.
      const sorted = targets.slice().sort((a,b) => Number(a.type === 'annotation') - Number(b.type === 'annotation'));
      for (const { type, token, collection, id } of sorted) {
        if (type === 'book') {
          const result = await window.cyberStudy.bookTrash(action, token);
          if (action === 'restore') onBooksChanged([result]);
        } else if (type === 'journey' || type === 'memory_point') {
          const data = await window.cyberStudy.globe('recycle', { type, id, action });
          if (data.error) throw Error(data.error);
          window.dispatchEvent(new CustomEvent('cyber-bulk-globe', { detail: data }));
        } else changeRecycledItem(token, action, collection);
        select(previous => previous.filter(value => value !== token));
        edit(previous => previous.filter(value => value !== token));
      }
    } catch (e) { setError(e.message); }
    finally {
      lock.current = false; setBusy(false); reload(value => value + 1);
      window.dispatchEvent(new Event('cyber-content-changed'));
    }
  }
  return <>
    {error && !editing && <p role="alert">{error}</p>}
    <section className="entity-catalog" data-recycle-bin data-local-selection={picked.length > 0 || undefined} aria-label={t('i18n.recycleBin')}>
      {visible.map(row => <button key={row.token} type="button" data-edit-item disabled={busy}
        data-bulk-selected={selected.includes(row.token) || undefined} aria-pressed={selected.includes(row.token)}>
        <ContentCommand label={t('i18n.edit')} run={() => openEditor(row)} />
        <strong>{row.title}</strong><small>{t(contentTypes[row.type])}</small>
      </button>)}
      {!error && !visible.length && <p role="status">{t(!rows ? 'i18n.loadingItems' : rows.length ? 'i18n.binNoMatches' : 'i18n.binEmpty')}</p>}
    </section>
    {editing && <ActionWorkspace kind="edit" title={targets.length > 1 ? 'i18n.bulkEdit' : 'i18n.edit'} open
      command={false} showTrigger={false} onOpenChange={open => { if (!open) closeEditor(); }}>
      <div className="stack-form">
        <WorkspaceFields>
          {targets.length > 1 && <strong>{t('i18n.selectedCount', targets.length)}</strong>}
          <ul className="bulk-entity-list">{targets.map(row => <li key={row.token}>{row.title}</li>)}</ul>
          {error && <p role="alert">{error}</p>}
        </WorkspaceFields>
        <WorkspaceActions>
          <button type="button" disabled={busy} onClick={() => apply('restore')}>{t('i18n.binRestore')}</button>
          <button type="button" disabled={busy} onClick={() => apply('purge')}>{t('i18n.binPurge')}</button>
        </WorkspaceActions>
      </div>
    </ActionWorkspace>}
  </>;
}
