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


// Troisième mise en page : pas de colonne « Jour » ni « Pour », une colonne « Source » en plus, le nom
// du plat en plusieurs morceaux, un autre tableau plus bas, des titres de recette « REPAS n · … »
const p1c = [
  m(54, 734, 'PLAN REPAS FICTIF'), m(215, 702, 'Semaine 03'), m(137, 685, 'Semaine du 16 mars 2030 · 3 dîners'), m(54, 626, 'Les trois repas'),
  m(55, 604, 'Repas'), m(275, 604, 'Protéine'), m(355, 604, 'Temps'), m(414, 604, 'Source'),
  m(55, 579, 'Pâtes aux boulettes de'), m(55, 567, 'viande'), m(92, 567, ', salade verte'), m(275, 573, 'Porc'), m(355, 573, '15 min'), m(414, 579, 'Livre fictif, « 5'), m(414, 567, 'ingrédients »'),
  m(55, 542, 'Papillotes de poisson et'), m(55, 529, 'légumes'), m(275, 536, 'Poisson gras'), m(355, 536, '30 min'), m(414, 536, 'Site fictif r123'),
  m(55, 505, 'Mijoté de lentilles'), m(275, 498, 'Végétarien'), m(355, 504, '1 h 30'), m(355, 492, '(20 actives)'), m(414, 498, 'Site fictif r456'),
  m(54, 462, 'Tableau nutritionnel'), m(55, 441, 'Par portion adulte'), m(295, 441, 'kcal'), m(360, 441, 'Protéines'),
  m(55, 419, 'Pâtes (plat seul)'), m(295, 419, '633'), m(360, 419, '34 g')
];
const pagesC = [p1c, [m(54, 760, 'AVANT DE CUISINER'), m(54, 740, 'Liste des courses')],
  [m(54, 760, 'REPAS 1 · PORC · LE SOIR CHARGÉ'), m(54, 735, 'Pâtes aux boulettes de'), m(54, 712, 'viande, salade verte')],
  [m(54, 760, 'REPAS 2 · POISSON GRAS'), m(54, 735, 'Papillotes de poisson et'), m(54, 712, 'légumes')],
  [m(54, 760, 'REPAS 3 · VÉGÉTARIEN'), m(54, 735, 'Un nom différent du tableau')]];
const rc = lirePlan(pagesC);
assert.equal(rc.titre, 'Semaine du 16 mars 2030 · 3 dîners');
assert.deepEqual(rc.plats.map(p => [p.jour, p.repas, p.proteine, p.temps, p.page]), [
  ['Repas 1', 'Pâtes aux boulettes de viande, salade verte', 'Porc', '15 min', 3],
  ['Repas 2', 'Papillotes de poisson et légumes', 'Poisson gras', '30 min', 4],
  ['Repas 3', 'Mijoté de lentilles', 'Végétarien', '1 h 30 (20 actives)', 5]]);   // page trouvée par « Repas 3 »
// Sans durée lisible : les protéines ouvrent les lignes
const sansDuree = [p1c.filter(x => x.x !== 355 || x.y === 604), ...pagesC.slice(1)];
assert.deepEqual(lirePlan(sansDuree).plats.map(p => p.repas), rc.plats.map(p => p.repas));
// Pas de tableau de repas : seulement le tableau nutritionnel
assert.equal(lirePlan([[m(55, 441, 'Par portion adulte'), m(295, 441, 'kcal'), m(360, 441, 'Protéines'), m(55, 419, 'Pâtes'), m(360, 419, '34 g')]]), null);
assert.equal(lirePlan([[m(55, 441, 'Repas'), m(55, 419, 'Un mot seul ne fait pas un tableau')]]), null);

console.log('plan repas : tous les scénarios passent');
