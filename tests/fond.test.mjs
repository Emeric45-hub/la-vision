// Tests du choix du fond (météo marquée ou saison).
import assert from 'node:assert/strict';
import { ambiance, saison, estNuit } from '../js/fond.js';

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
const daily = { time: ['2030-11-10'], sunrise: ['2030-11-10T07:52'], sunset: ['2030-11-10T17:26'] };
assert.equal(estNuit(daily, '2030-11-10T07:30'), true);
assert.equal(estNuit(daily, '2030-11-10T12:00'), false);
assert.equal(estNuit(daily, '2030-11-10T17:26'), true);
assert.equal(estNuit(undefined, '2030-11-10T23:00'), false);
assert.equal(ambiance(0, '2030-11-10', true), 'nuit-claire');
assert.equal(ambiance(3, '2030-11-10', true), 'nuit-nuageuse');
assert.equal(ambiance(95, '2030-11-10', true), 'nuit-pluie');
assert.equal(ambiance(73, '2030-11-10', true), 'nuit-neige');
console.log('fond : tous les scénarios passent');
