// Tests du choix du fond (météo marquée ou saison).
import assert from 'node:assert/strict';
import { ambiance, saison } from '../js/fond.js';

assert.equal(ambiance(0, '2030-07-01'), 'soleil');
assert.equal(ambiance(3, '2030-07-01'), 'couvert');
assert.equal(ambiance(63, '2030-07-01'), 'pluie');
assert.equal(ambiance(95, '2030-07-01'), 'orage');
assert.equal(ambiance(73, '2030-01-10'), 'neige');
assert.equal(ambiance(45, '2030-01-10'), 'brouillard');
assert.equal(ambiance(2, '2030-11-10'), 'automne');      // temps ordinaire → saison
assert.equal(ambiance(53, '2030-04-10'), 'printemps');   // bruine → saison
assert.equal(ambiance(null, '2030-07-10'), 'ete');
assert.equal(saison('2030-12-21'), 'hiver'); assert.equal(saison('2030-03-20'), 'hiver');
assert.equal(saison('2030-03-21'), 'printemps'); assert.equal(saison('2030-06-21'), 'ete'); assert.equal(saison('2030-09-22'), 'automne');
console.log('fond : tous les scénarios passent');
