import { entityTypes } from './registry.js';
import { contentDataChangeEvent } from '../data/spaceStorage.js';
import { translate } from '../i18n/index.js';
import useContentOrder from '../ui/useContentOrder.js';
import { orderCatalog, orderType, reorderVisible } from '../data/contentOrder.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import StatisticsPage from './StatisticsPage.jsx';
import RecycleBin from './RecycleBin.jsx';
import CatalogEditor from './CatalogEditor.jsx';
import ContentActions from '../features/ContentActions.jsx';
import { ContentCommand } from '../features/ContentCommands.jsx';

import PagedItems from '../ui/PagedItems.jsx';

const createTypes = Object.entries(entityTypes).filter(([, definition]) => definition.create);


export default function EntityCatalog({ books, editing, onEdit, onOpen, onCreate, onClose, ...editorProps }) {
  const [view,setView] = useNavigationState('entity-catalog','view','grouped', { preferInitial: true });
  const [columnOrder, setColumnOrder] = useNavigationState('entity-catalog', 'columns', Object.keys(contentTypes));
  const [columnSlots, setColumnSlots] = useNavigationState('entity-catalog', 'columnSlots', {});
  const [dragColumn, setDragColumn] = useState(null);
  const [dropColumn, setDropColumn] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [partial, setPartial] = useState(false);
  const [revision, setRevision] = useState(0);
  const editingOpen = Boolean(editing);
  const trash = view === 'trash';
  const stats = view === 'statistics';
  const entityView = !trash && !stats;
  const searchId = stats ? 'entity-statistics' : trash ? 'entity-trash' : view === 'graph' ? 'entity-graph' : 'entity-catalog';
  const search = useSearchScope({
    id: searchId, label: stats ? translate("i18n.statistics") : trash ? translate("i18n.recycleBin") : view === 'graph' ? translate("i18n.relationshipGraph") : translate("i18n.allItems"), priority: 55,
    filters: stats ? [] : [{ key: 'type', label: translate("i18n.itemType"), options: Object.entries(contentTypes) }]
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
    readCatalog(books).then(({ items, partial }) => {
      if (active) { setCatalog(items); setPartial(partial); }
    }).catch(error => {
      console.warn('个人知识库汇总失败', error);
      if (active) { setPartial(true); setCatalog(previous => previous ?? []); }
    });
    return () => { active = false; };
  }, [books, revision, editingOpen]);
  const order = useContentOrder();
  const ordered = useMemo(() => orderCatalog(catalog ?? [], order), [catalog,order]);
  const results = useMemo(() => hasSearch(search) ? queryEntities(ordered, search) : ordered, [ordered,search]);
  const grouped = view === 'grouped';
  const layoutOrder = useMemo(() => {
    const slots = { ...order.slots };
    for (const [type, positions] of Object.entries(columnSlots)) {
      slots[type] = { ...slots[type], ...positions };
    }
    return { ...order, slots };
  }, [order, columnSlots]);
  const reorderCard = useCallback((type, siblings, source, target) => {
    const next = reorderVisible(layoutOrder, type, siblings, source, target);
    const overrides = { ...columnSlots[type] };
    for (const item of siblings) {
      const key = type + ':' + item.id;
      if (next.slots[type][key] !== layoutOrder.slots[type]?.[key]) overrides[key] = next.slots[type][key];
    }
    setColumnSlots(previous => ({ ...previous, [type]: overrides }));
  }, [layoutOrder, columnSlots, setColumnSlots]);
  const groups = useMemo(() => {
    const byType = new Map();
    if (grouped) for (const item of results) {
      if (!byType.has(item.type)) byType.set(item.type, []);
      byType.get(item.type).push(item);
    }
    for (const [type,items] of byType) {
      if (columnSlots[type]) byType.set(type, orderType(items,type,layoutOrder));
    }
    return byType;
  }, [results, grouped, columnSlots, layoutOrder]);
  const pageKey = JSON.stringify([search.query, search.filters]);
  const types = [...new Set([...columnOrder, ...Object.keys(contentTypes)])];
  function finishDrag() {
    setDragColumn(null);
    setDropColumn(null);
  }
  function moveColumn(target) {
    if (dragColumn && dragColumn !== target && document.body.hasAttribute('data-item-editing')) {
      const next = types.slice();
      next.splice(next.indexOf(dragColumn), 1);
      next.splice(types.indexOf(target), 0, dragColumn);
      setColumnOrder(next);
    }
    finishDrag();
  }
  const edges = useMemo(() => view === 'graph' ? graphEdges(catalog ?? [], loadSpaceData('content-relations', [])) : [], [view,catalog,revision]);
  useSearchCount(!entityView ? "entity-catalog" : searchId, catalog ? results.length : null);
  const resultSet = { allowGroupRelations: true, priority: 55, scopeId: searchId, matches: entityView ? results : [], blocked: !entityView, loading: !catalog };
  useResultSource(resultSet);

  function renderCard(item) {
    const source = ['excerpt','annotation'].includes(item.type) && [item.bookTitle,item.chapterTitle].filter(Boolean).join(' · ');
    return <button type="button" data-item-open key={item.key} title={item.title} onClick={() => onOpen(item)}>
        <ContentActions surface="button" type={item.type} id={item.id} title={item.title} preview={false} sortable orderItem={item} onReorder={grouped ? reorderCard : undefined} />
        <ContentCommand label={translate("i18n.edit0", translate(contentTypes[item.type]))} run={() => onEdit(item)} />
        <strong>{source || item.title}</strong>{source && <span className="catalog-note-preview">{item.title}</span>}{!grouped && <small>{translate(contentTypes[item.type])}</small>}
      </button>;
  }

  return <FeaturePanel scopeId="catalog" tipPage={entityView && view !== "graph" ? "catalog" : view} hasMenu wide title="i18n.knowledgeBase" scrollContext={view} onClose={onClose}>
    <DisplayViewMenu label={translate("i18n.knowledgeBaseView")} options={[['grouped',translate('i18n.groupByType')],['list',translate("i18n.allItems")],['graph',translate("i18n.relationshipGraph")],['trash',translate("i18n.recycleBin")],['statistics',translate("i18n.statistics")]]} value={view} onChange={setView}/>
    {entityView && createTypes.map(([type, definition]) => <ContentCommand key={type} kind="create" label={translate(definition.create === true ? definition.label : definition.create)} run={() => onCreate(type)} />)}
    {stats ? <StatisticsPage catalog={catalog} partial={partial} search={search}/> : trash ? <RecycleBin search={search} revision={revision} onBooksChanged={editorProps.onBooksChanged}/> : view === 'graph' && catalog ? <EntityGraph editing={editing} search={search} items={ordered} matches={resultSet.matches} edges={edges} onOpen={onOpen} onEdit={onEdit}/> :
    <section className={grouped ? "entity-catalog catalog-columns" : "entity-catalog"} data-scroll-memory={grouped ? "catalog-columns" : undefined} aria-label={translate("i18n.items")}>
    {!catalog ? <p role="status">{translate("i18n.loadingItems")}</p> : <>
      {grouped ? types.filter(type => groups.has(type)).map(type => (
        <section className="catalog-column" key={type} aria-labelledby={`catalog-column-${type}`}
          data-column-target={dropColumn === type || undefined}
          onDragOver={event => {
            if (dragColumn && dragColumn !== type) {
              event.preventDefault();
              setDropColumn(type);
            }
          }}
          onDrop={event => {
            if (!dragColumn) return;
            event.preventDefault();
            moveColumn(type);
          }}>
          <h3 id={`catalog-column-${type}`} draggable onDragEnd={finishDrag}
            onDragStart={event => {
              if (!document.body.hasAttribute('data-item-editing')) { event.preventDefault(); return; }
              event.dataTransfer.setData('application/x-study-catalog-column', type);
              event.dataTransfer.effectAllowed = 'move';
              setDragColumn(type);
            }}>{translate(contentTypes[type])}</h3>
          <div className="catalog-column-items" data-scroll-memory={`catalog-items-${type}`}>
            <PagedItems key={pageKey} items={groups.get(type)}>{renderCard}</PagedItems>
          </div>
        </section>
      )) : <PagedItems key={pageKey} items={results}>{renderCard}</PagedItems>}
    </>}
    </section>}
    {editing && <CatalogEditor key={editing.key} item={editing} catalog={catalog ?? []} books={books} {...editorProps} onClose={() => onEdit(null)}/>}
  </FeaturePanel>;
}
