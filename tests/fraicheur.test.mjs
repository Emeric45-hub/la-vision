// Tests des seuils de fraîcheur.
import assert from 'node:assert/strict';
import { niveau, depuis, estNuit } from '../js/fraicheur.js';

const m = new Date('2030-01-10T12:00:00Z');
const il = min => new Date(m - min * 60000);
assert.equal(niveau('agendas', il(30), m, '13:00').niveau, 'ok');
assert.equal(niveau('agendas', il(61), m, '13:00').niveau, 'orange');
assert.equal(niveau('agendas', il(181), m, '13:00').niveau, 'rouge');
assert.equal(niveau('agendas', il(130), m, '02:00').niveau, 'ok');      // nuit : passages toutes les 2 h
assert.equal(niveau('agendas', il(200), m, '02:00').niveau, 'orange');
assert.equal(niveau('agendas', null, m, '13:00').niveau, 'rouge');
assert.equal(niveau('rappels', il(300), m, '13:00').niveau, 'ok');
assert.equal(niveau('rappels', il(400), m, '13:00').niveau, 'orange');
assert.equal(niveau('agendas', il(30), m, '13:00').minutes, 30);
assert.equal(estNuit('23:10'), true); assert.equal(estNuit('05:59'), true); assert.equal(estNuit('06:00'), false);
assert.equal(depuis(45), '45 min'); assert.equal(depuis(200), '3 h 20'); assert.equal(depuis(120), '2 h'); assert.equal(depuis(3000), '2 j');
assert.equal(depuis(null), 'jamais');
console.log('fraîcheur : tous les scénarios passent');
