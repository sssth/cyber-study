import { entityTypes } from './registry.js';
import { contentDataChangeEvent } from '../data/spaceStorage.js';
import { translate } from '../i18n/index.js';
import useContentOrder from '../ui/useContentOrder.js';
import { orderCatalog } from '../data/contentOrder.js';
import { useEffect, useMemo, useState } from 'react';
import { contentTypes } from './registry.js';
import { readCatalog } from './readCatalog.js';
import { hasSearch, queryEntities } from '../search/searchCore.js';
import { useSearchCount, useSearchScope } from '../search/useSearchScope.jsx';
import useResultSource from '../results/useResultSource.js';
import { FeaturePanel } from '../features/ui.jsx';

import DisplayViewMenu from '../ui/DisplayViewMenu.jsx';
import { useNavigationState } from '../ui/useNavigationState.js';
import { loadSpaceData } from '../data/spaceStorage.js';
import { graphEdges } from './edges.js';
import EntityGraph from '../resultApplications/EntityGraph.jsx';
import CatalogEditor from './CatalogEditor.jsx';
import ContentActions from '../features/ContentActions.jsx';
import { ContentCommand } from '../features/ContentCommands.jsx';

const createTypes = Object.entries(entityTypes).filter(([, definition]) => definition.create);


export default function EntityCatalog({ books, editing, onEdit, onOpen, onCreate, onClose, ...editorProps }) {
  const [view,setView] = useNavigationState('entity-catalog','view','list');
  const [catalog, setCatalog] = useState(null);
  const [revision, setRevision] = useState(0);
  const editingOpen = Boolean(editing);
  const searchId = view === 'graph' ? 'entity-graph' : 'entity-catalog';
  const search = useSearchScope({
    id: searchId, label: view === 'graph' ? translate("i18n.relationshipGraph") : translate("i18n.allItems"), priority: 55,
    filters: [{ key: 'type', label: translate("i18n.itemType"), options: Object.entries(contentTypes) }]
  });
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('cyber-content-changed', refresh);
    window.addEventListener(contentDataChangeEvent, refresh);
    return () => {
      window.removeEventListener('cyber-content-changed', refresh);
      window.removeEventListener(contentDataChangeEvent, refresh);
    };
  }, []);
  useEffect(() => {
    if (editingOpen) return;
    let active = true;
    readCatalog(books).then(({ items }) => {
      if (active) setCatalog(items);
    }).catch(error => {
      console.warn('个人知识库汇总失败', error);
      if (active) setCatalog(previous => previous ?? []);
    });
    return () => { active = false; };
  }, [books, revision, editingOpen]);
  const order = useContentOrder();
  const ordered = useMemo(() => orderCatalog(catalog ?? [], order), [catalog,order]);
  const results = useMemo(() => hasSearch(search) ? queryEntities(ordered, search) : ordered, [ordered,search]);
  const edges = useMemo(() => view === 'graph' ? graphEdges(catalog ?? [], loadSpaceData('content-relations', [])) : [], [view,catalog,revision]);
  useSearchCount(searchId, catalog ? results.length : null);
  const resultSet = { priority: 55, scopeId: searchId, matches: results, loading: !catalog };
  useResultSource(resultSet);

  return <FeaturePanel scopeId="catalog" hasMenu wide title="i18n.personalKnowledgeBase" scrollContext={view} onClose={onClose} onBack={editing ? () => window.dispatchEvent(new Event('cyber-exit-item-edit')) : onClose}>
    <DisplayViewMenu label={translate("i18n.knowledgeBaseView")} options={[['list',translate("i18n.allItems")],['graph',translate("i18n.relationshipGraph")]]} value={view} onChange={setView}/>
    {createTypes.map(([type, definition]) => <ContentCommand key={type} kind="create" label={translate(definition.create === true ? definition.label : definition.create)} run={() => onCreate(type)} />)}
    {view === 'graph' && catalog ? <EntityGraph editing={editing} search={search} items={ordered} matches={resultSet.matches} edges={edges} onOpen={onOpen} onEdit={onEdit}/> :
    <section className="entity-catalog" aria-label={translate("i18n.items")}>
    {!catalog ? <p role="status">{translate("i18n.loadingItems")}</p> : <>
      {results.map(item => <button type="button" data-item-open key={item.key} title={item.title} onClick={() => onOpen(item)}>
        <ContentActions surface="button" type={item.type} id={item.id} title={item.title} preview={false} sortable orderItem={item} />
        <ContentCommand label={translate("i18n.edit0", translate(contentTypes[item.type]))} run={() => onEdit(item)} />
        <strong>{item.title}</strong><small>{translate(contentTypes[item.type])}</small>
      </button>)}
    </>}
    </section>}
    {editing && <CatalogEditor key={editing.key} item={editing} catalog={catalog ?? []} books={books} {...editorProps} onClose={() => onEdit(null)}/>}
  </FeaturePanel>;
}
