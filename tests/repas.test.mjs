// Tests de la lecture du tableau du plan repas (positions fictives, forme du PDF réel).
import assert from 'node:assert/strict';
import { lirePlan } from '../tache/repas.js';

const m = (x, y, s) => ({ x, y, s });
const page1 = [
  m(57, 774, 'Plan repas fictif'), m(57, 753, 'S01 — semaine du 2 mars 2030'),
  m(57, 710, 'Jour'), m(119, 710, 'Repas'), m(318, 710, 'Protéine'), m(403, 710, 'Temps'), m(460, 710, 'Pour'),
  m(57, 692, 'Week-end'), m(119, 692, 'Plat A'), m(318, 692, 'Bœuf'), m(403, 692, '45 min'), m(460, 692, '3'),
  m(57, 674, 'Lundi'), m(119, 674, 'Plat B'), m(318, 674, 'Porc'), m(403, 674, '1 h'), m(460, 674, '3'),
  m(57, 650, 'Mardi'), m(119, 656, 'Plat C sur'), m(119, 644, 'deux lignes'), m(318, 650, 'Œufs (végé)'), m(403, 650, '50 min'), m(460, 650, '3'),
  m(57, 626, 'Jeudi'), m(119, 626, 'Plat D'), m(318, 626, 'Bœuf (reste)'), m(403, 626, '15 min'), m(460, 626, '2'),
  m(57, 560, 'Synthèse nutritionnelle'), m(57, 540, 'Lundi'), m(119, 540, 'texte hors tableau')
];
const pages = [page1, [m(57, 780, 'Liste des courses')],
  [m(57, 780, 'Lundi — Plat B')], [m(57, 780, 'Mardi — Plat C sur'), m(57, 762, 'deux lignes')],
  [m(57, 780, 'Week-end + jeudi — Plat A')]];

const r = lirePlan(pages);
assert.equal(r.titre, 'S01 — semaine du 2 mars 2030');
assert.deepEqual(r.plats.map(p => p.jour), ['Week-end', 'Lundi', 'Mardi', 'Jeudi']);
assert.equal(r.plats[2].repas, 'Plat C sur deux lignes');
assert.equal(r.plats[2].proteine, 'Œufs (végé)');
assert.deepEqual(r.plats.map(p => p.page), [5, 3, 4, 5]);
assert.equal(lirePlan([[m(57, 700, 'Bonjour')]]), null);
console.log('plan repas : tous les scénarios passent');
