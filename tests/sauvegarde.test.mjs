// Sauvegarde : périmètre et rythme, puis parcours sur une base fictive.
import assert from 'node:assert/strict';
import { exclu, aFaire, INTERVALLE_MS } from '../tache/sauvegarde.js';
import { exporter } from '../tache/sauvegarde.mjs';

// Périmètre : ce qui se recalcule est exclu, avec ses sous-collections ; le reste est gardé
assert.equal(exclu('vision/agenda'), true);
assert.equal(exclu('vision/agenda/jours/2030-01-07'), true);
assert.equal(exclu('vision/repas'), true);
assert.equal(exclu('vision/config'), false);
assert.equal(exclu('vision/planning/jours/2030-01-07'), false);
assert.equal(exclu('vision/agendas-autre'), false);

// Rythme : jamais faite, puis une fois par semaine
const t = Date.parse('2030-01-14T06:00:00Z');
assert.equal(aFaire(null, t), true);
assert.equal(aFaire({}, t), true);
assert.equal(aFaire({ le: '2030-01-13T06:00:00Z' }, t), false);
assert.equal(aFaire({ le: new Date(t - INTERVALLE_MS).toISOString() }, t), true);
assert.equal(aFaire({ le: 'illisible' }, t), true);

// Parcours : deux niveaux, documents « absents » traversés, exclusions respectées
const arbre = {
  '': ['vision', 'pointage'],
  'vision': [{ chemin: 'vision/config', champs: { a: { stringValue: 'x' } } }, { chemin: 'vision/agenda', champs: {} }, { chemin: 'vision/planning', champs: {} }],
  'vision/planning': ['jours'],
  'vision/planning/jours': [{ chemin: 'vision/planning/jours/2030-01-07', champs: { corrige: { mapValue: {} } } }],
  'vision/agenda': ['jours'],
  'vision/agenda/jours': [{ chemin: 'vision/agenda/jours/2030-01-07', champs: {} }],
  'pointage': [{ chemin: 'pointage/journal', champs: null }],
  'pointage/journal': ['sessions'],
  'pointage/journal/sessions': [{ chemin: 'pointage/journal/sessions/s1', champs: { date: { stringValue: '2030-01-07' } } }]
};
const lues = [];
const base = {
  collections: async c => (Array.isArray(arbre[c || '']) && typeof arbre[c || ''][0] === 'string') ? arbre[c || ''] : [],
  lister: async c => { lues.push(c); return arbre[c] || []; }
};
const r = await exporter(base);
assert.deepEqual(Object.keys(r.documents).sort(), ['pointage/journal/sessions/s1', 'vision/config', 'vision/planning', 'vision/planning/jours/2030-01-07']);
assert.equal(lues.includes('vision/agenda/jours'), false);

console.log('sauvegarde : tous les scénarios passent');
