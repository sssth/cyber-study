import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesMovie } from './movieSearch.js';

test('movie ranges include zero and endpoints and use the viewing date', () => {
  const film = {score:'8.5', personalScore:0, watchedOn:'2026-01-15', createdAt:'2025-01-01'};
  const filters = {scoreMin:'8.5', scoreMax:'8.5', personalScoreMax:'0', from:'2026-01-15', to:'2026-01-15', watchStatus:'想看'};
  const matches = item => matchesMovie(item, {query:'', filters});
  assert.ok(matches(film));
  for (const change of [{score:'8.4'}, {personalScore:''}, {watchedOn:''}, {status:'看过'}]) {
    assert.equal(matches({...film,...change}), false);
  }
});
