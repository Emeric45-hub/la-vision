// Tests de la lecture des menus de cantine (texte fictif, même forme que la page du prestataire).
import assert from 'node:assert/strict';
import { lireMenus, pourEnfant } from '../tache/cantine.js';
import { aFaire } from '../tache/cantine.mjs';

const page = `Nos menus
Semaine du 02/03/2030 au 06/03/2030
lundi
Potage
Poulet rôti
Nuggets de blé
Haricots verts
Yaourt
mardi
mercredi
jeudi
Carottes râpées
Boulettes végétales sauce tomate
Semoule
vendredi
Gratin de pâtes/jambon
Gratin de pâtes/emmental
Pomme
❮
❯
Semaine du 09/03/2030 au 13/03/2030
lundi
Salade
Poisson pané
Purée
Cliquer sur les éléments du menu pour consulter les informations réglementaires.
lundi
Imprimer
Label Rouge`;

const m = lireMenus(page);
assert.deepEqual(Object.keys(m), ['2030-03-02', '2030-03-05', '2030-03-06', '2030-03-09']);
assert.deepEqual(m['2030-03-09'], ['Salade', 'Poisson pané', 'Purée']);
assert.deepEqual(pourEnfant(m['2030-03-02']), ['Potage', 'Poulet rôti', 'Haricots verts', 'Yaourt']);   // alternative végé retirée
assert.deepEqual(pourEnfant(m['2030-03-05']), ['Carottes râpées', 'Boulettes végétales sauce tomate', 'Semoule']);   // jour végé gardé
assert.equal(pourEnfant(m['2030-03-06']).length, 3);   // cas ambigu : les deux gratins restent
assert.deepEqual(lireMenus(''), {});

// Une lecture par jour, à partir de 5 h à Paris
const t = s => new Date(s);
assert.equal(aFaire(null, t('2030-03-04T06:00:00Z')), true);
assert.equal(aFaire(null, t('2030-03-04T03:00:00Z')), false);                     // 4 h à Paris
assert.equal(aFaire({ lu: '2030-03-04T05:10:00Z' }, t('2030-03-04T15:00:00Z')), false);
assert.equal(aFaire({ lu: '2030-03-03T05:10:00Z' }, t('2030-03-04T05:00:00Z')), true);
console.log('cantine : tous les scénarios passent');
