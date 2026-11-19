import useContentOrder from '../ui/useContentOrder.js';
import { orderCatalog } from '../data/contentOrder.js';
import { useEffect, useMemo, useState } from 'react';
import { contentTypes } from '../data/contentRelations.js';
import { readCatalog } from '../data/readCatalog.js';
import { hasSearch, matchesCatalogItem } from '../search/searchCore.js';
import { useSearchCount, useSearchScope } from '../search/useSearchScope.jsx';
import useMapSource from '../ui/useMapSource.js';
import { FeaturePanel } from './ui.jsx';

import DisplayViewMenu from '../ui/DisplayViewMenu.jsx';
import { useNavigationState } from '../ui/useNavigationState.js';
import { loadSpaceData } from '../data/spaceStorage.js';
import { graphEdges } from '../data/entityGraph.js';
import EntityGraph from './EntityGraph.jsx';
import CatalogEditor from './CatalogEditor.jsx';
import ContentActions from './ContentActions.jsx';
import { ContentCommand } from './ContentCommands.jsx';

const createTypes = ['book', 'typing_work', 'journey', 'memory_point', 'playlist', 'movie', 'diary', 'memo', 'todo'];

export default function EntityCatalog({ books, editing, onEdit, onOpen, onCreate, onClose, ...editorProps }) {
  const [view,setView] = useNavigationState('entity-catalog','view','list');
  const [catalog, setCatalog] = useState(null);
  const [revision, setRevision] = useState(0);
  const editingOpen = Boolean(editing);
  const searchId = view === 'graph' ? 'entity-graph' : 'entity-catalog';
  const search = useSearchScope({
    id: searchId, label: view === 'graph' ? '实体关系图' : '全部实体', priority: 55,
    filters: [{ key: 'type', label: '实体类型', options: Object.entries(contentTypes) }]
  });
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('cyber-content-changed', refresh);
    return () => window.removeEventListener('cyber-content-changed', refresh);
  }, []);
  useEffect(() => {
    if (editingOpen) return;
    let active = true;
    readCatalog(books).then(result => {
      if (active) setCatalog(result);
    }).catch(error => {
      console.warn('个人知识库汇总失败', error);
      if (active) setCatalog(previous => previous ?? []);
    });
    return () => { active = false; };
  }, [books, revision, editingOpen]);
  const order = useContentOrder();
  const ordered = useMemo(() => orderCatalog(catalog ?? [], order), [catalog,order]);
  const results = useMemo(() => hasSearch(search) ? ordered.filter(item => matchesCatalogItem(item, search)) : ordered, [ordered,search]);
  const edges = useMemo(() => view === 'graph' ? graphEdges(catalog ?? [], loadSpaceData('content-relations', [])) : [], [view,catalog,revision]);
  useSearchCount(searchId, catalog ? results.length : null);
  useMapSource({ priority: 55, entities: results, loading: !catalog });

  return <FeaturePanel hasMenu wide title="个人知识库" scrollContext={view} onClose={onClose} onBack={editing ? () => window.dispatchEvent(new Event('cyber-exit-item-edit')) : onClose}>
    <DisplayViewMenu label="知识库视图" options={[['list','全部实体'],['graph','实体关系图']]} value={view} onChange={setView}/>
    {createTypes.map(type => <ContentCommand key={type} kind="create" label={type === 'playlist' ? '歌单与歌曲' : contentTypes[type]} run={() => onCreate(type)} />)}
    {view === 'graph' && catalog ? <EntityGraph editing={editing} search={search} items={ordered} matches={results} edges={edges} onOpen={onOpen} onEdit={onEdit}/> :
    <section className="entity-catalog" aria-label="实体列表">
    {!catalog ? <p role="status">正在读取实体…</p> : <>
      {results.map(item => <button type="button" data-item-open key={item.key} title={item.title} onClick={() => onOpen(item)}>
        <ContentActions surface="button" type={item.type} id={item.id} title={item.title} preview={false} sortable orderItem={item} />
        <ContentCommand label={`编辑${contentTypes[item.type]}`} run={() => onEdit(item)} />
        <strong>{item.title}</strong><small>{contentTypes[item.type]}</small>
      </button>)}
    </>}
    </section>}
    {editing && <CatalogEditor key={editing.key} item={editing} catalog={catalog ?? []} books={books} {...editorProps} onClose={() => onEdit(null)}/>}
  </FeaturePanel>;
}
