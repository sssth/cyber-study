import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from './catalog.js';
import { graphEdges } from './edges.js';
import { registerEntities } from './registry.js';
import { features } from '../features/definitions.js';
import { matchesCatalogItem, queryEntities } from '../search/searchCore.js';
import { resultInput } from '../results/activeResults.js';

test('a source extension can supply a new entity to catalog, search, relations, and a new result application', () => {
  const researchLibrary = {
    id: 'research-library',
    entities: {
      paper: {
        label: '学术文献',
        read: () => [{ id: 'paper-a', title: '地理调查', author: '王', bookId: 'b1', createdAt: '2026-01-01' }],
        search: ['author'],
        parent: { type: 'book', id: record => record.bookId },
        create: true
      }
    }
  };
  const definitions = registerEntities([...features, researchLibrary]);
  const catalog = buildCatalog({ definitions, books: [{ id: 'b1', title: '研究资料', createdAt: '2025-01-01' }] });
  const hits = queryEntities(catalog, { query: '王', filters: {} },
    (item, state) => matchesCatalogItem(item, state, definitions));

  assert.deepEqual(hits.map(item => item.key), ['paper:paper-a']);
  assert.equal(definitions.paper.target.feature, 'research-library');
  assert.ok(graphEdges(catalog, [], definitions).some(edge => edge.from === 'book:b1' && edge.to === 'paper:paper-a'));
  const timeline = resultInput({ matches: hits }, 'timeline').entities.map(item => [item.createdAt, item.key]);
  assert.deepEqual(timeline, [['2026-01-01', 'paper:paper-a']]);
  assert.throws(() => registerEntities([researchLibrary, researchLibrary]), /Duplicate entity type/);
});
