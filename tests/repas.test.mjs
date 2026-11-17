// Tests de la lecture du tableau du plan repas (positions fictives, forme du PDF réel).
import assert from 'node:assert/strict';
import { lirePlan, pageRecette } from '../tache/repas.js';

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

// Autre mise en page : « Repas n — Jour » en première ligne, le nom du plat sur les lignes suivantes
const p1b = [
  m(57, 774, 'Plan repas fictif'), m(57, 753, 'S02 — semaine du 9 mars 2030'),
  m(57, 710, 'Jour'), m(119, 710, 'Repas'), m(318, 710, 'Protéine'), m(403, 710, 'Temps'), m(460, 710, 'Pour'),
  m(57, 692, 'Lundi'), m(119, 698, 'Poisson pané, haricots à la'), m(119, 686, 'tomate'), m(318, 692, 'Poisson'), m(403, 692, '30 min'), m(460, 692, '3'),
  m(57, 668, 'Mardi'), m(119, 668, 'Sauté de bœuf, riz'), m(318, 668, 'Bœuf'), m(403, 668, '25 min'), m(460, 668, '3'),
  m(57, 644, 'Mardi'), m(119, 644, 'Soupe de légumes'), m(318, 644, 'Végé'), m(403, 644, '20 min'), m(460, 644, '3'),
  m(57, 620, 'Jeudi'), m(119, 620, 'Plat sans page à son nom'), m(318, 620, 'Œufs'), m(403, 620, '15 min'), m(460, 620, '3')
];
const pagesB = [p1b, [m(57, 771, 'Liste des courses'), m(57, 751, 'Pour le sauté de bœuf, riz : voir mardi')],
  [m(57, 780, 'Repas 1 — Lundi'), m(57, 751, 'Poisson pané, haricots à la'), m(57, 726, 'tomate'), m(57, 706, 'Un texte de présentation.')],
  [m(57, 780, 'Repas 2 — Mardi'), m(57, 751, 'Sauté de bœuf, riz')],
  [m(57, 780, 'Repas 3 — Mardi'), m(57, 751, 'Soupe de légumes')],
  [m(57, 780, 'Repas 4 : Jeudi'), m(57, 751, 'Un autre nom que dans le tableau')],
  [m(57, 771, 'Restes'), m(57, 751, 'Jeudi, finir la soupe de légumes')]];
// Par le nom du plat (deux plats le même jour : chacun sa page), sinon par le jour de la première ligne
assert.deepEqual(lirePlan(pagesB).plats.map(p => p.page), [3, 4, 5, 6]);
assert.equal(pageRecette(pagesB, 'Vendredi', 'Plat absent'), 1);          // introuvable : première page
assert.equal(pageRecette(pagesB, 'Mardi', ''), 4);                        // sans nom de plat : le jour
assert.equal(pageRecette(pages, 'jeudi', 'Plat D'), 5);                   // jour au milieu d'une première ligne

console.log('plan repas : tous les scénarios passent');
